import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUTH_SESSION_DEPENDENCIES,
  initializeSessionAuth,
} from './authSession.js';

test('initializes Auth with tab-scoped persistence and popup support', () => {
  const calls = [];
  const expectedAuth = { name: 'auth' };
  const result = initializeSessionAuth('app', (app, dependencies) => {
    calls.push({ app, dependencies });
    return expectedAuth;
  });

  assert.equal(result, expectedAuth);
  assert.deepEqual(calls, [{ app: 'app', dependencies: AUTH_SESSION_DEPENDENCIES }]);
  assert.ok(AUTH_SESSION_DEPENDENCIES.persistence);
  assert.ok(AUTH_SESSION_DEPENDENCIES.popupRedirectResolver);
});

test('rejects an invalid Auth initializer', () => {
  assert.throws(
    () => initializeSessionAuth('app', null),
    /initializer must be a function/,
  );
});
