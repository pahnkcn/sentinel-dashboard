import { getApps, initializeApp } from 'firebase/app';
import {
  ReCaptchaEnterpriseProvider,
  initializeAppCheck,
} from 'firebase/app-check';
import { connectAuthEmulator } from 'firebase/auth';

import { initializeSessionAuth } from '../auth/authSession.js';
import { readFirebaseEnvironment } from './firebaseEnvironment.js';

const environment = readFirebaseEnvironment(import.meta.env, { mode: import.meta.env.MODE });
export const { firebaseConfig, useEmulators } = environment;

const isNewApp = getApps().length === 0;
export const app = isNewApp ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = initializeSessionAuth(app);

if (isNewApp && useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

if (isNewApp && !useEmulators && environment.appCheckSiteKey && typeof window !== 'undefined') {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(environment.appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export const appCheckEnabled = Boolean(environment.appCheckSiteKey) && !useEmulators;
