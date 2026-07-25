import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertLocalEmulatorTarget,
  createDemoDocuments,
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
