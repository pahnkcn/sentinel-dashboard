import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MONITORING_DATA_CLASSIFICATION,
  MONITORING_SCHEMA_VERSION,
  decodeDatasetManifest,
  isSafeDatasetVersion,
} from './datasetManifest.js';

const VALID_MANIFEST = Object.freeze({
  version: '2026-07-14.release_2',
  schemaVersion: MONITORING_SCHEMA_VERSION,
  dataClassification: MONITORING_DATA_CLASSIFICATION,
  publishedAt: '2026-07-14T12:00:00.000Z',
});

test('accepts only a complete synthetic schema-v2 manifest', () => {
  assert.deepEqual(decodeDatasetManifest(VALID_MANIFEST), {
    ok: true,
    value: VALID_MANIFEST,
  });
  assert.equal(isSafeDatasetVersion('v1'), true);
});

test('rejects unsupported schemas, non-synthetic data, and malformed fields', () => {
  for (const data of [
    null,
    [],
    {},
    { ...VALID_MANIFEST, version: '../private' },
    { ...VALID_MANIFEST, schemaVersion: 1 },
    { ...VALID_MANIFEST, dataClassification: 'real' },
    { ...VALID_MANIFEST, publishedAt: 'not-a-date' },
    { ...VALID_MANIFEST, version: 'a'.repeat(129) },
  ]) {
    const result = decodeDatasetManifest(data);
    assert.equal(result.ok, false);
    assert.match(result.error.code, /^dataset-manifest-/);
    assert.doesNotMatch(JSON.stringify(result), /private|real|not-a-date/);
  }
});

test('distinguishes a missing snapshot and contains untrusted read failures', () => {
  assert.deepEqual(decodeDatasetManifest({ exists: () => false }), {
    ok: false,
    error: { code: 'dataset-manifest-missing' },
  });
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
