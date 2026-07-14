import assert from 'node:assert/strict';
import test from 'node:test';

import { readFirebaseEnvironment } from './firebaseEnvironment.js';

const VALID_ENVIRONMENT = Object.freeze({
  VITE_FIREBASE_API_KEY: 'public-web-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'sentinel-staging.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'sentinel-staging',
  VITE_FIREBASE_STORAGE_BUCKET: 'sentinel-staging.firebasestorage.app',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789012',
  VITE_FIREBASE_APP_ID: '1:123456789012:web:abcdef123456',
  VITE_FIREBASE_APPCHECK_SITE_KEY: 'public-app-check-site-key',
  VITE_FIREBASE_USE_EMULATORS: 'false',
});

test('returns a frozen coherent production configuration', () => {
  const result = readFirebaseEnvironment(VALID_ENVIRONMENT);

  assert.equal(result.firebaseConfig.projectId, 'sentinel-staging');
  assert.equal(result.useEmulators, false);
  assert.equal(Object.isFrozen(result.firebaseConfig), true);
});

test('fails on missing, placeholder, and mixed Firebase values', () => {
  assert.throws(
    () => readFirebaseEnvironment({ ...VALID_ENVIRONMENT, VITE_FIREBASE_API_KEY: '' }),
    /VITE_FIREBASE_API_KEY/,
  );
  assert.throws(
    () => readFirebaseEnvironment({
      ...VALID_ENVIRONMENT,
      VITE_FIREBASE_PROJECT_ID: 'replace-with-project-id',
    }),
    /VITE_FIREBASE_PROJECT_ID/,
  );
  assert.throws(
    () => readFirebaseEnvironment({
      ...VALID_ENVIRONMENT,
      VITE_FIREBASE_APP_ID: '1:999999999999:web:abcdef123456',
    }),
    /do not match/,
  );
});

test('forces emulators in development and forbids them in production', () => {
  assert.throws(
    () => readFirebaseEnvironment(VALID_ENVIRONMENT, { mode: 'development' }),
    /requires Firebase emulators/,
  );
  assert.throws(
    () => readFirebaseEnvironment({
      ...VALID_ENVIRONMENT,
      VITE_FIREBASE_USE_EMULATORS: 'true',
    }),
    /cannot use Firebase emulators/,
  );

  const development = readFirebaseEnvironment({
    ...VALID_ENVIRONMENT,
    VITE_FIREBASE_APPCHECK_SITE_KEY: '',
    VITE_FIREBASE_USE_EMULATORS: 'true',
  }, { mode: 'development' });
  assert.equal(development.useEmulators, true);
});

test('requires App Check configuration in production', () => {
  assert.throws(
    () => readFirebaseEnvironment({
      ...VALID_ENVIRONMENT,
      VITE_FIREBASE_APPCHECK_SITE_KEY: '',
    }),
    /VITE_FIREBASE_APPCHECK_SITE_KEY/,
  );
});
