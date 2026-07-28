import assert from 'node:assert/strict';
import test from 'node:test';

import {
  handleLogin,
  handleLogout,
  handleManifest,
  handleMonitoring,
  handleSession,
} from './apiHandlers.js';
import { createApiHandler } from './http.js';

function responseRecorder() {
  return {
    body: null,
    headers: new Map(),
    headersSent: false,
    statusCode: null,
    setHeader(name, value) {
      this.headers.set(name.toLowerCase(), value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.headersSent = true;
      return this;
    },
  };
}

function jsonRequest(body, overrides = {}) {
  return {
    method: 'POST',
    url: '/api/auth/login',
    headers: {
      'content-type': 'application/json',
      cookie: 'g_csrf_token=test-csrf-token',
    },
    body,
    ...overrides,
  };
}

const identity = Object.freeze({
  uid: 'google-subject',
  email: 'clinician@example.com',
  name: 'Clinician',
  role: 'clinician',
});

test('login validates CSRF and allowlist before setting a secure session cookie', async () => {
  let authorizedPath;
  const response = responseRecorder();
  await handleLogin(
    jsonRequest({ credential: 'google.jwt.value', csrfToken: 'test-csrf-token' }),
    response,
    {
      verifyGoogle: async () => ({
        uid: identity.uid,
        email: identity.email,
        name: identity.name,
      }),
      issueSession: value => {
        assert.equal(value.role, 'clinician');
        return 'signed.session.token';
      },
      firestore: {
        async getDocument(path) {
          authorizedPath = path;
          return { email: identity.email, enabled: true, role: 'clinician' };
        },
      },
    },
  );
  assert.match(authorizedPath, /^authorizedUsers\/[a-f0-9]{64}$/u);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    authenticated: true,
    user: {
      uid: identity.uid,
      email: identity.email,
      name: identity.name,
    },
    role: 'clinician',
  });
  assert.match(response.headers.get('set-cookie'), /^__Host-sentinel_session=/u);
  assert.match(response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict/u);
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
});

test('login rejects missing and mismatched GIS CSRF tokens', async () => {
  for (const request of [
    jsonRequest({ credential: 'google.jwt.value', csrfToken: 'other-token' }),
    jsonRequest(
      { credential: 'google.jwt.value', csrfToken: 'test-csrf-token' },
      { headers: { 'content-type': 'application/json' } },
    ),
  ]) {
    await assert.rejects(
      handleLogin(request, responseRecorder(), {}),
      error => error.status === 400 && error.code === 'invalid-csrf',
    );
  }
});

test('login rejects disabled, mismatched, and unsupported allowlist records', async () => {
  for (const authorized of [
    { email: identity.email, enabled: false, role: 'clinician' },
    { email: 'other@example.com', enabled: true, role: 'clinician' },
    { email: identity.email, enabled: true, role: 'viewer' },
  ]) {
    await assert.rejects(
      handleLogin(
        jsonRequest({ credential: 'google.jwt.value', csrfToken: 'test-csrf-token' }),
        responseRecorder(),
        {
          verifyGoogle: async () => identity,
          firestore: { getDocument: async () => authorized },
        },
      ),
      error => error.status === 403 && error.code === 'forbidden',
    );
  }
});

test('session reports authenticated identity and signed-out state', async () => {
  const authenticated = responseRecorder();
  await handleSession(
    { method: 'GET' },
    authenticated,
    { requireSession: () => identity },
  );
  assert.equal(authenticated.statusCode, 200);
  assert.deepEqual(authenticated.body, {
    authenticated: true,
    user: { uid: identity.uid, email: identity.email, name: identity.name },
    role: identity.role,
  });

  const signedOut = responseRecorder();
  await handleSession(
    { method: 'GET' },
    signedOut,
    { requireSession: () => { throw Object.assign(new Error(), { status: 401 }); } },
  );
  assert.equal(signedOut.statusCode, 401);
  assert.deepEqual(signedOut.body, { authenticated: false });
});

test('logout expires the host-only session cookie', async () => {
  const response = responseRecorder();
  await handleLogout({ method: 'POST' }, response);
  assert.equal(response.statusCode, 200);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/u);
  assert.deepEqual(response.body, { authenticated: false });
});

test('manifest requires a session and returns only schema-v2 synthetic metadata', async () => {
  const response = responseRecorder();
  await handleManifest({ method: 'GET' }, response, {
    requireSession: () => identity,
    firestore: {
      getDocument: async () => ({
        id: 'current',
        version: 'v2-demo',
        schemaVersion: 2,
        dataClassification: 'synthetic',
        publishedAt: '2026-07-28T10:00:00.000Z',
        ignored: 'server-only',
      }),
    },
  });
  assert.deepEqual(response.body, {
    version: 'v2-demo',
    schemaVersion: 2,
    dataClassification: 'synthetic',
    publishedAt: '2026-07-28T10:00:00.000Z',
  });
});

test('monitoring uses fixed stream pagination and preserves nullable log timestamps', async () => {
  const response = responseRecorder();
  let listCall;
  await handleMonitoring(
    {
      method: 'GET',
      url: '/api/monitoring?stream=logs&version=v2-demo&pageToken=next%2Fopaque',
    },
    response,
    {
      requireSession: () => identity,
      firestore: {
        getDocument: async () => ({
          version: 'v2-demo',
          schemaVersion: 2,
          dataClassification: 'synthetic',
          publishedAt: '2026-07-28T10:00:00.000Z',
        }),
        listDocuments: async (...args) => {
          listCall = args;
          return {
            records: [{
              id: 'log-1',
              self: null,
              buddy: 2,
              command: null,
              physicalInjury: null,
              selfObservedAt: '2026-07-27T02:15:00.000Z',
            }],
            nextPageToken: 'page-2',
          };
        },
      },
    },
  );
  assert.deepEqual(listCall, [
    'monitoringDatasets/v2-demo/logs',
    { pageSize: 1_000, pageToken: 'next/opaque' },
  ]);
  assert.equal(response.body.records[0].selfObservedAt, '2026-07-27T02:15:00.000Z');
  assert.equal(response.body.nextPageToken, 'page-2');
});

test('monitoring returns a sanitized 409 when the manifest rolls over', async () => {
  const response = responseRecorder();
  const handler = createApiHandler(handleMonitoring, {
    requireSession: () => identity,
    firestore: {
      getDocument: async () => ({
        version: 'v2-new',
        schemaVersion: 2,
        dataClassification: 'synthetic',
        publishedAt: '2026-07-28T10:00:00.000Z',
      }),
    },
  });
  await handler(
    { method: 'GET', url: '/api/monitoring?stream=students&version=v2-old' },
    response,
  );
  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.body, { error: { code: 'dataset-version-changed' } });
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
});
