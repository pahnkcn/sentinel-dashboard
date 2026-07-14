const FIREBASE_FIELDS = Object.freeze([
  ['VITE_FIREBASE_API_KEY', 'apiKey'],
  ['VITE_FIREBASE_AUTH_DOMAIN', 'authDomain'],
  ['VITE_FIREBASE_PROJECT_ID', 'projectId'],
  ['VITE_FIREBASE_STORAGE_BUCKET', 'storageBucket'],
  ['VITE_FIREBASE_MESSAGING_SENDER_ID', 'messagingSenderId'],
  ['VITE_FIREBASE_APP_ID', 'appId'],
]);
const PLACEHOLDER_VALUE = /^(?:change-me|changeme|example|replace-|your-)/i;
const HOSTNAME = /^[a-z0-9.-]+$/i;
const PROJECT_ID = /^[a-z][a-z0-9-]{4,29}$/;
const SENDER_ID = /^\d{6,20}$/;
const APP_ID = /^\d+:\d+:web:[a-z0-9]+$/i;

function readRequired(environment, key) {
  const value = typeof environment?.[key] === 'string' ? environment[key].trim() : '';
  if (!value || PLACEHOLDER_VALUE.test(value)) {
    throw new Error(`Missing or placeholder Firebase setting: ${key}`);
  }
  return value;
}

function readEmulatorFlag(environment) {
  const value = readRequired(environment, 'VITE_FIREBASE_USE_EMULATORS');
  if (value !== 'true' && value !== 'false') {
    throw new Error('VITE_FIREBASE_USE_EMULATORS must be true or false');
  }
  return value === 'true';
}

function validateConfig(config) {
  if (!HOSTNAME.test(config.authDomain)) {
    throw new Error('VITE_FIREBASE_AUTH_DOMAIN must be a hostname');
  }
  if (!PROJECT_ID.test(config.projectId)) {
    throw new Error('VITE_FIREBASE_PROJECT_ID has an invalid format');
  }
  if (!HOSTNAME.test(config.storageBucket)) {
    throw new Error('VITE_FIREBASE_STORAGE_BUCKET must be a hostname');
  }
  if (!SENDER_ID.test(config.messagingSenderId)) {
    throw new Error('VITE_FIREBASE_MESSAGING_SENDER_ID has an invalid format');
  }
  if (!APP_ID.test(config.appId)) {
    throw new Error('VITE_FIREBASE_APP_ID has an invalid format');
  }
  if (config.appId.split(':')[1] !== config.messagingSenderId) {
    throw new Error('Firebase app ID and messaging sender ID do not match');
  }
}

export function readFirebaseEnvironment(environment, { mode = 'production' } = {}) {
  const firebaseConfig = Object.fromEntries(
    FIREBASE_FIELDS.map(([environmentKey, configKey]) => (
      [configKey, readRequired(environment, environmentKey)]
    )),
  );
  const useEmulators = readEmulatorFlag(environment);
  const appCheckSiteKey = typeof environment?.VITE_FIREBASE_APPCHECK_SITE_KEY === 'string'
    ? environment.VITE_FIREBASE_APPCHECK_SITE_KEY.trim()
    : '';

  validateConfig(firebaseConfig);

  if (mode === 'development' && !useEmulators) {
    throw new Error('Development mode requires Firebase emulators');
  }
  if (mode === 'production' && useEmulators) {
    throw new Error('Production mode cannot use Firebase emulators');
  }
  if (mode === 'production' && (!appCheckSiteKey || PLACEHOLDER_VALUE.test(appCheckSiteKey))) {
    throw new Error('Production mode requires VITE_FIREBASE_APPCHECK_SITE_KEY');
  }

  return Object.freeze({
    firebaseConfig: Object.freeze(firebaseConfig),
    appCheckSiteKey,
    useEmulators,
  });
}
