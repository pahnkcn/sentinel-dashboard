import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertLocalEmulatorTarget,
  chunkWrites,
  createDatasetVersion,
  createDemoDocuments,
  DEFAULT_STUDENT_COUNT,
  documentWrite,
  getLocalCalendarDate,
  toFirestoreValue,
} from './seed-emulators.mjs';

test('refuses any non-demo or non-loopback emulator target', () => {
  assert.doesNotThrow(() => assertLocalEmulatorTarget(
    'demo-sentinel-dashboard',
    '127.0.0.1:8080',
  ));
  assert.throws(
    () => assertLocalEmulatorTarget('sentinel-production', '127.0.0.1:8080'),
    /must start with demo-/,
  );
  assert.throws(
    () => assertLocalEmulatorTarget('demo-sentinel-dashboard', 'firestore.example.test:8080'),
    /loopback host/,
  );
});

test('creates deterministic schema-v2 demo records with no real-looking identities', () => {
  const first = createDemoDocuments({
    studentCount: 3,
    endDate: '2026-07-26',
    seed: 'fixture-seed',
  });
  const second = createDemoDocuments({
    studentCount: 3,
    endDate: '2026-07-26',
    seed: 'fixture-seed',
  });

  assert.deepEqual(first, second);
  assert.deepEqual(first.students.map(student => student.id), [
    'demo-0001',
    'demo-0002',
    'demo-0003',
  ]);
  assert.ok(first.students.every(student => student.name.startsWith('Demo Participant ')));
  assert.ok(first.students.every(student => student.room.startsWith('Demo Room ')));
  assert.ok(first.logs.every(log => (
    [log.self, log.buddy, log.command, log.physicalInjury].some(value => value !== null)
  )));
  assert.ok(first.logs.every(log => log.physicalInjury === null));
  assert.ok(first.assessments.every(assessment => (
    assessment.dass_d >= 0 && assessment.dass_d <= 21
  )));
});

test('uses the requested shifted end date and the default bounded population', () => {
  const streams = createDemoDocuments({ endDate: '2026-07-26' });

  assert.equal(streams.students.length, DEFAULT_STUDENT_COUNT);
  assert.equal(streams.assessments.length, DEFAULT_STUDENT_COUNT * 4);
  assert.equal(streams.logs.at(-1).date, '2026-07-26');
  assert.deepEqual(
    [...new Set(streams.assessments.map(assessment => assessment.week))],
    [0, 4, 8, 16],
  );
});

test('uses the local current date and rejects invalid fixture end dates', () => {
  const localMidnight = new Date(2026, 6, 26).getTime();
  assert.equal(getLocalCalendarDate(() => localMidnight), '2026-07-26');
  assert.throws(
    () => createDemoDocuments({ studentCount: 1, endDate: '2026-02-30' }),
    /valid calendar date/,
  );
});

test('uses a fresh safe dataset version and bounded commit batches', () => {
  assert.equal(createDatasetVersion(() => 1_000), 'demo-local-v2-rs');
  const writes = Array.from({ length: 1_001 }, (_, index) => index);
  assert.deepEqual(chunkWrites(writes, 450).map(batch => batch.length), [450, 450, 101]);
  assert.throws(() => chunkWrites(writes, 501), /between 1 and 500/);
});

test('encodes nested fixture values and immutable document writes', () => {
  assert.deepEqual(toFirestoreValue({
    count: 2,
    ratio: 1.5,
    active: true,
    tags: ['demo', null],
  }), {
    mapValue: {
      fields: {
        count: { integerValue: '2' },
        ratio: { doubleValue: 1.5 },
        active: { booleanValue: true },
        tags: {
          arrayValue: {
            values: [{ stringValue: 'demo' }, { nullValue: null }],
          },
        },
      },
    },
  });

  const write = documentWrite(
    'demo-project',
    'collection/document',
    { value: 1 },
    { exists: false },
  );
  assert.equal(
    write.update.name,
    'projects/demo-project/databases/(default)/documents/collection/document',
  );
  assert.deepEqual(write.currentDocument, { exists: false });
});
