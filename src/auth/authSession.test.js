import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGoogleIdentityConfigurator,
  createLoginCsrfToken,
  destroyAuthSession,
  exchangeGoogleCredential,
  fetchAuthSession,
  getGoogleClientId,
} from './authSession.js';

function response(status, body = null) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

const SESSION = {
  authenticated: true,
  user: { uid: 'google-1', email: 'staff@example.test', name: 'Staff' },
  role: 'clinician',
};

test('reads a same-origin server session and treats 401 as signed out', async () => {
  const calls = [];
  const fetchImplementation = async (...args) => {
    calls.push(args);
    return response(200, SESSION);
  };

  assert.deepEqual(await fetchAuthSession({ fetchImplementation }), {
    user: {
      uid: 'google-1',
      email: 'staff@example.test',
      name: 'Staff',
      picture: '',
    },
    role: 'clinician',
  });
  assert.equal(calls[0][0], '/api/auth/session');
  assert.equal(calls[0][1].credentials, 'same-origin');
  assert.equal(calls[0][1].cache, 'no-store');
  assert.equal(await fetchAuthSession({ fetchImplementation: async () => response(401) }), null);
});

test('exchanges a GIS credential with a matching double-submit CSRF token', async () => {
  const documentReference = { cookie: '' };
  const cryptoImplementation = {
    getRandomValues(bytes) {
      bytes.fill(7);
      return bytes;
    },
  };
  let request;
  const result = await exchangeGoogleCredential('google.jwt', {
    documentReference,
    locationReference: { protocol: 'https:' },
    cryptoImplementation,
    fetchImplementation: async (url, options) => {
      request = { url, options };
      return response(200, SESSION);
    },
  });

  const body = JSON.parse(request.options.body);
  assert.equal(request.url, '/api/auth/login');
  assert.equal(request.options.credentials, 'same-origin');
  assert.equal(body.credential, 'google.jwt');
  assert.match(body.csrfToken, /^[a-f0-9]{64}$/);
  assert.match(documentReference.cookie, new RegExp(`^g_csrf_token=${body.csrfToken};`));
  assert.match(documentReference.cookie, /SameSite=Strict; Secure$/);
  assert.equal(result.role, 'clinician');
});

test('rejects invalid server session shapes and preserves only public codes', async () => {
  await assert.rejects(
    fetchAuthSession({
      fetchImplementation: async () => response(200, {
        authenticated: true,
        user: { email: 'staff@example.test' },
        role: 'viewer',
      }),
    }),
    error => error.code === 'auth/session-invalid',
  );
  await assert.rejects(
    exchangeGoogleCredential('token', {
      documentReference: { cookie: '' },
      cryptoImplementation: { getRandomValues: bytes => bytes.fill(1) },
      fetchImplementation: async () => response(403, {
        error: { code: 'forbidden', detail: 'private@example.test' },
      }),
    }),
    error => error.code === 'auth/forbidden' && !error.message.includes('private'),
  );
});

test('logs out through the session API and validates browser configuration', async () => {
  let request;
  await destroyAuthSession({
    fetchImplementation: async (url, options) => {
      request = { url, options };
      return response(204);
    },
  });
  assert.equal(request.url, '/api/auth/logout');
  assert.equal(request.options.credentials, 'same-origin');
  assert.equal(getGoogleClientId({ VITE_GOOGLE_CLIENT_ID: ' client-id ' }), 'client-id');
  assert.match(createLoginCsrfToken({ getRandomValues: bytes => bytes.fill(2) }), /^[a-f0-9]{64}$/);
});

test('configures GIS once while replacing the active credential handler', () => {
  const initializeCalls = [];
  const identity = {
    initialize(options) {
      initializeCalls.push(options);
    },
    renderButton() {},
  };
  const configurator = createGoogleIdentityConfigurator();
  const received = [];
  const releaseFirst = configurator.configure(identity, {
    clientId: 'client.apps.googleusercontent.com',
    onCredential: credential => received.push(`first:${credential}`),
  });
  releaseFirst();
  configurator.configure(identity, {
    clientId: 'client.apps.googleusercontent.com',
    onCredential: credential => received.push(`second:${credential}`),
  });

  assert.equal(initializeCalls.length, 1);
  initializeCalls[0].callback({ credential: 'google.jwt' });
  assert.deepEqual(received, ['second:google.jwt']);
});
