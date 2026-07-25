import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertLocalEmulatorTarget,
  chunkWrites,
  commitBatch,
  createDatasetVersion,
  createDemoDocuments,
  DEFAULT_STUDENT_COUNT,
  documentWrite,
  toFirestoreValue,
} from './seed-emulators.mjs';
import { decodeAssessment, decodeLog, decodeStudent } from '../src/domain/records.js';

test('refuses any non-demo or non-loopback seed target', () => {
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

test('creates only records accepted by the production decoders', () => {
  const streams = createDemoDocuments();
  const decoders = {
    students: decodeStudent,
    logs: decodeLog,
    assessments: decodeAssessment,
  };

  for (const [stream, documents] of Object.entries(streams)) {
    assert.ok(documents.length > 0);
    for (const document of documents) {
      const decoded = decoders[stream]({ documentId: document.id, data: document });
      assert.equal(decoded.ok, true, `${stream}/${document.id}: ${JSON.stringify(decoded.issues)}`);
    }
  }
});

test('creates a large complete development dataset at the dashboard limits', () => {
  const streams = createDemoDocuments();

  assert.equal(streams.students.length, DEFAULT_STUDENT_COUNT);
  assert.equal(streams.logs.length, DEFAULT_STUDENT_COUNT * 16);
  assert.equal(streams.assessments.length, DEFAULT_STUDENT_COUNT * 4);
  assert.equal(
    streams.students.length + streams.logs.length + streams.assessments.length,
    5_250,
  );
  assert.equal(new Set(streams.students.map(student => student.room)).size, 25);
  assert.deepEqual(
    [...new Set(streams.assessments.map(assessment => assessment.week))],
    [0, 4, 8, 16],
  );
});

test('uses a fresh safe dataset version and bounded commit batches', () => {
  assert.equal(createDatasetVersion(() => 1_000), 'local-large-v2-rs');

  const writes = Array.from({ length: 1_001 }, (_, index) => index);
  const batches = chunkWrites(writes, 450);
  assert.deepEqual(batches.map(batch => batch.length), [450, 450, 101]);
  assert.throws(() => chunkWrites(writes, 501), /between 1 and 500/);
});

test('explains how to recover when the Firestore emulator is offline', async () => {
  await assert.rejects(
    () => commitBatch({
      host: '127.0.0.1:8080',
      projectId: 'demo-project',
      writes: [],
      request: async () => {
        throw new TypeError('fetch failed');
      },
    }),
    /Run "npm\.cmd run emulators" in another terminal and leave it running/,
  );
});

test('encodes nested fixture values for Firestore REST commits', () => {
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

  const write = documentWrite('demo-project', 'collection/document', { value: 1 });
  assert.equal(
    write.update.name,
    'projects/demo-project/databases/(default)/documents/collection/document',
  );
});
