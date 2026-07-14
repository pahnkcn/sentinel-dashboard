import { getApps, initializeApp } from 'firebase/app';
import {
  ReCaptchaEnterpriseProvider,
  initializeAppCheck,
} from 'firebase/app-check';
import { getAuth } from 'firebase/auth';

const defaultFirebaseConfig = {
  apiKey: 'AIzaSyBNNcFjfkIko-mN9zpATT_lD0FQuX5wDdA',
  authDomain: 'sentinel-dashboard-9a05c.firebaseapp.com',
  projectId: 'sentinel-dashboard-9a05c',
  storageBucket: 'sentinel-dashboard-9a05c.firebasestorage.app',
  messagingSenderId: '659194434716',
  appId: '1:659194434716:web:5a683e788742760ebf8959',
};

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || defaultFirebaseConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || defaultFirebaseConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || defaultFirebaseConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || defaultFirebaseConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || defaultFirebaseConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || defaultFirebaseConfig.appId,
};

const isNewApp = getApps().length === 0;
export const app = isNewApp ? initializeApp(firebaseConfig) : getApps()[0];
const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY;

if (isNewApp && appCheckSiteKey && typeof window !== 'undefined') {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export const appCheckEnabled = Boolean(appCheckSiteKey);
export const auth = getAuth(app);
