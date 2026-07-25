import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SERVER_MONITORING_LIMITS,
  clearMonitoringDatasetCache,
  getVerifiedMonitoringDataset,
} from './monitoringRepository.js';

function studentRecord(id = 'student-1') {
  return {
    id,
    data: {
      name: `Student ${id}`,
      room: 'A-101',
    },
  };
}

function logRecord({
  id = 'log-1',
  studentId = 'student-1',
} = {}) {
  return {
    id,
    data: {
      studentId,
      date: '2026-07-01',
      week: 1,
      self: 2,
      buddy: null,
      command: null,
      physicalInjury: 1,
    },
  };
}

function assessmentRecord({
  id = 'assessment-1',
  studentId = 'student-1',
} = {}) {
  return {
    id,
    data: {
      studentId,
      week: 0,
      dass_d: 1,
      dass_a: 2,
      dass_s: 3,
      cd_risc: 30,
      grit: 20,
      drawing_note: '',
    },
  };
}

function completeDataset(overrides = {}) {
  return {
    students: [studentRecord()],
    logs: [logRecord()],
    assessments: [assessmentRecord()],
    ...overrides,
  };
}

function createFakeFirestore({
  manifestVersions = ['release-1', 'release-1'],
  datasets = { 'release-1': completeDataset() },
  manifestErrors = {},
  streamErrors = {},
} = {}) {
  const state = {
    manifestReads: 0,
    streamReads: [],
    orderByCalls: [],
    limitCalls: [],
  };

  const firestore = {
    collection(collectionName) {
      if (collectionName === 'monitoringManifests') {
        return {
          doc(documentId) {
            assert.equal(documentId, 'current');
            return {
              async get() {
                const readIndex = state.manifestReads;
                state.manifestReads += 1;
                if (manifestErrors[readIndex]) throw manifestErrors[readIndex];

                const version = manifestVersions[
                  Math.min(readIndex, manifestVersions.length - 1)
                ];
                return {
                  exists: version !== null && version !== undefined,
                  data: () => (
                    version !== null && version !== undefined
                      ? { version }
                      : undefined
                  ),
                };
              },
            };
          },
        };
      }

      assert.equal(collectionName, 'monitoringDatasets');
      return {
        doc(version) {
          return {
            collection(streamName) {
              let requestedLimit = Infinity;
              return {
                orderBy(fieldPath) {
                  state.orderByCalls.push({ version, streamName, fieldPath });
                  return this;
                },
                limit(value) {
                  requestedLimit = value;
                  state.limitCalls.push({ version, streamName, value });
                  return this;
                },
                async get() {
                  state.streamReads.push({ version, streamName });
                  if (streamErrors[streamName]) throw streamErrors[streamName];

                  const records = datasets[version]?.[streamName] ?? [];
                  const selected = records.slice(0, requestedLimit);
                  return {
                    size: selected.length,
                    docs: selected.map(record => ({
                      id: record.id,
                      data: () => record.data,
                    })),
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  return { firestore, state };
}

async function expectRepositoryError(promise, message) {
  await assert.rejects(promise, error => {
    assert.equal(error.message, message);
    assert.equal(error.publicCode, 'chat-data-unavailable');
    assert.equal(error.stage, 'retrieval');
    return true;
  });
}

test('pins every stream to the first manifest version and verifies the manifest twice', async () => {
  clearMonitoringDatasetCache();
  const { firestore, state } = createFakeFirestore();

  const dataset = await getVerifiedMonitoringDataset({
    firestore,
    clock: () => 1234,
  });

  assert.equal(dataset.version, 'release-1');
  assert.equal(dataset.verifiedAt, 1234);
  assert.equal(state.manifestReads, 2);
  assert.deepEqual(
    state.streamReads.map(read => [read.version, read.streamName]).sort(),
    [
      ['release-1', 'assessments'],
      ['release-1', 'logs'],
      ['release-1', 'students'],
    ],
  );
  assert.deepEqual(
    Object.fromEntries(state.limitCalls.map(call => [call.streamName, call.value])),
    {
      students: SERVER_MONITORING_LIMITS.students + 1,
      logs: SERVER_MONITORING_LIMITS.logs + 1,
      assessments: SERVER_MONITORING_LIMITS.assessments + 1,
    },
  );
  assert.equal(state.orderByCalls.length, 3);
});

test('fails closed when the manifest changes while the pinned version is loading', async () => {
  clearMonitoringDatasetCache();
  const { firestore, state } = createFakeFirestore({
    manifestVersions: ['release-1', 'release-2'],
  });

  await expectRepositoryError(
    getVerifiedMonitoringDataset({ firestore }),
    'dataset-changed-during-read',
  );

  assert.equal(state.manifestReads, 2);
  assert.ok(state.streamReads.every(read => read.version === 'release-1'));
});

test('rejects a stream that exceeds its hard limit by one record', async () => {
  clearMonitoringDatasetCache();
  const students = Array.from(
    { length: SERVER_MONITORING_LIMITS.students + 1 },
    (_, index) => studentRecord(`student-${index + 1}`),
  );
  const { firestore } = createFakeFirestore({
    datasets: {
      'release-1': completeDataset({
        students,
        logs: [],
        assessments: [],
      }),
    },
  });

  await expectRepositoryError(
    getVerifiedMonitoringDataset({ firestore }),
    'truncated-students',
  );
});

test('rejects orphan monitoring records without exposing their contents', async () => {
  clearMonitoringDatasetCache();
  const { firestore } = createFakeFirestore({
    datasets: {
      'release-1': completeDataset({
        logs: [logRecord({ studentId: 'missing-student' })],
      }),
    },
  });

  await expectRepositoryError(
    getVerifiedMonitoringDataset({ firestore }),
    'orphan-monitoring-record',
  );
});

test('normalizes unexpected Firestore failures to a fixed retrieval error', async () => {
  clearMonitoringDatasetCache();
  const { firestore } = createFakeFirestore({
    streamErrors: {
      logs: new Error('secret backend detail'),
    },
  });

  await expectRepositoryError(
    getVerifiedMonitoringDataset({ firestore }),
    'monitoring-read-failed',
  );
});

test('reuses an opted-in raw cache but injected Firestore is uncached by default', async () => {
  clearMonitoringDatasetCache();
  const cachedFake = createFakeFirestore({
    manifestVersions: ['release-1', 'release-1', 'release-1'],
  });

  try {
    const first = await getVerifiedMonitoringDataset({
      firestore: cachedFake.firestore,
      clock: () => 1,
      useCache: true,
    });
    const second = await getVerifiedMonitoringDataset({
      firestore: cachedFake.firestore,
      clock: () => 2,
      useCache: true,
    });

    assert.strictEqual(second, first);
    assert.equal(second.verifiedAt, 1);
    assert.equal(cachedFake.state.manifestReads, 3);
    assert.equal(cachedFake.state.streamReads.length, 3);
  } finally {
    clearMonitoringDatasetCache();
  }

  const uncachedFake = createFakeFirestore({
    manifestVersions: ['release-1', 'release-1', 'release-1', 'release-1'],
  });
  const first = await getVerifiedMonitoringDataset({
    firestore: uncachedFake.firestore,
    clock: () => 10,
  });
  const second = await getVerifiedMonitoringDataset({
    firestore: uncachedFake.firestore,
    clock: () => 20,
  });

  assert.notStrictEqual(second, first);
  assert.equal(second.verifiedAt, 20);
  assert.equal(uncachedFake.state.manifestReads, 4);
  assert.equal(uncachedFake.state.streamReads.length, 6);
});
