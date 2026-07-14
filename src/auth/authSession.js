import {
  browserPopupRedirectResolver,
  browserSessionPersistence,
  initializeAuth,
} from 'firebase/auth';

export const AUTH_SESSION_DEPENDENCIES = Object.freeze({
  persistence: browserSessionPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});

export function initializeSessionAuth(app, initializer = initializeAuth) {
  if (typeof initializer !== 'function') {
    throw new TypeError('auth initializer must be a function');
  }
  return initializer(app, AUTH_SESSION_DEPENDENCIES);
}
