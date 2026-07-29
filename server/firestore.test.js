import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFirestoreRestClient,
  firestoreDocumentToJson,
  validateFirestoreEmulator,
} from './firestore.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test('Firestore value decoding preserves nested values, timestamps, nulls and large integers', () => {
  assert.deepEqual(firestoreDocumentToJson({
    name: 'projects/demo/databases/(default)/documents/logs/log-1',
    fields: {
      self: { nullValue: null },
      buddy: { integerValue: '2' },
      selfObservedAt: { timestampValue: '2026-07-28T10:00:00.000Z' },
      large: { integerValue: '9007199254740993' },
      nested: { mapValue: { fields: { enabled: { booleanValue: true } } } },
    },
  }), {
    id: 'log-1',
    self: null,
    buddy: 2,
    selfObservedAt: '2026-07-28T10:00:00.000Z',
    large: '9007199254740993',
    nested: { enabled: true },
  });
});

test('Firestore Emulator is allowed only on loopback with an explicit demo project', () => {
  assert.deepEqual(validateFirestoreEmulator({
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    GCP_PROJECT_ID: 'demo-sentinel',
  }), {
    origin: 'http://127.0.0.1:8080',
    projectId: 'demo-sentinel',
  });
  for (const env of [
    { FIRESTORE_EMULATOR_HOST: 'remote.example:8080', GCP_PROJECT_ID: 'demo-sentinel' },
    { FIRESTORE_EMULATOR_HOST: 'localhost:8080', GCP_PROJECT_ID: 'production-project' },
    { FIRESTORE_EMULATOR_HOST: 'localhost', GCP_PROJECT_ID: 'demo-sentinel' },
  ]) {
    assert.throws(
      () => validateFirestoreEmulator(env),
      error => error.code === 'unsafe-firestore-emulator',
    );
  }
});

test('Firestore REST list is read-only, paginated, ordered and uses local admin on emulator', async () => {
  let call;
  const client = createFirestoreRestClient({
    env: {
      FIRESTORE_EMULATOR_HOST: 'localhost:8080',
      GCP_PROJECT_ID: 'demo-sentinel',
    },
    fetchImpl: async (url, options) => {
      call = { url: String(url), options };
      return jsonResponse(200, {
        documents: [{
          name: 'projects/demo-sentinel/databases/(default)/documents/monitoringDatasets/v2-demo/logs/log-1',
          fields: { self: { nullValue: null }, buddy: { integerValue: '3' } },
        }],
        nextPageToken: 'opaque/page',
      });
    },
    getAccessToken: async () => {
      throw new Error('emulator must not request a cloud token');
    },
  });
  const page = await client.listDocuments('monitoringDatasets/v2-demo/logs', {
    pageSize: 1_000,
    pageToken: 'first/page',
  });
  const url = new URL(call.url);
  assert.equal(call.options.method, 'GET');
  assert.equal(call.options.headers.Authorization, 'Bearer owner');
  assert.equal(url.searchParams.get('pageSize'), '1000');
  assert.equal(url.searchParams.get('pageToken'), 'first/page');
  assert.equal(url.searchParams.get('orderBy'), '__name__');
  assert.deepEqual(page, {
    records: [{ id: 'log-1', self: null, buddy: 3 }],
    nextPageToken: 'opaque/page',
  });
});

test('production Firestore is disabled in Vercel Preview without an emulator', () => {
  assert.throws(
    () => createFirestoreRestClient({
      env: {
        GCP_PROJECT_ID: 'sentinel-project',
        VERCEL: '1',
        VERCEL_ENV: 'preview',
      },
    }),
    error => error.status === 503 && error.code === 'firestore-preview-disabled',
  );
});
