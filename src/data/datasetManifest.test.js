import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeDatasetManifest, isSafeDatasetVersion } from './datasetManifest.js';

function snapshot(data, { exists = true } = {}) {
  return {
    exists: () => exists,
    data: () => data,
  };
}

test('accepts a bounded safe dataset version', () => {
  assert.deepEqual(decodeDatasetManifest(snapshot({ version: '2026-07-14.release_2' })), {
    ok: true,
    value: { version: '2026-07-14.release_2' },
  });
  assert.equal(isSafeDatasetVersion('v1'), true);
});

test('rejects a missing or malformed manifest without reflecting its data', () => {
  assert.deepEqual(decodeDatasetManifest(snapshot(null, { exists: false })), {
    ok: false,
    error: { code: 'dataset-manifest-missing' },
  });

  for (const data of [null, [], {}, { version: '../private' }, { version: 'a'.repeat(129) }]) {
    const result = decodeDatasetManifest(snapshot(data));
    assert.deepEqual(result, {
      ok: false,
      error: { code: 'dataset-manifest-invalid' },
    });
    assert.doesNotMatch(JSON.stringify(result), /private/);
  }
});

test('contains exceptions thrown while reading an untrusted manifest', () => {
  const result = decodeDatasetManifest({
    exists: () => true,
    data() {
      throw new Error('sensitive document detail');
    },
  });

  assert.deepEqual(result, {
    ok: false,
    error: { code: 'dataset-manifest-invalid' },
  });
  assert.doesNotMatch(JSON.stringify(result), /sensitive/);
});
