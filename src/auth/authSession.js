import { AUTHORIZED_ROLES } from './roles.js';

export const AUTH_SESSION_INVALID_EVENT = 'sentinel:session-invalid';
export const GOOGLE_IDENTITY_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

const CSRF_COOKIE_NAME = 'g_csrf_token';
const SAFE_AUTH_CODE = /^[a-z0-9/_-]{1,80}$/i;
let googleIdentityPromise = null;

function authError(code, status = 0) {
  const error = new Error(code);
  error.code = code.startsWith('auth/') ? code : `auth/${code}`;
  error.status = status;
  return error;
}

function publicCode(body, fallback) {
  const candidate = body?.error?.code;
  return typeof candidate === 'string' && SAFE_AUTH_CODE.test(candidate)
    ? candidate
    : fallback;
}

async function readJson(response) {
  return response.json().catch(() => null);
}

function normalizeSession(body) {
  if (
    body?.authenticated !== true
    || !AUTHORIZED_ROLES.includes(body.role)
    || body.user === null
    || typeof body.user !== 'object'
    || typeof body.user.email !== 'string'
  ) {
    throw authError('session-invalid');
  }

  const uid = typeof body.user.uid === 'string'
    ? body.user.uid
    : (typeof body.user.id === 'string' ? body.user.id : body.user.email);
  return {
    user: {
      uid,
      email: body.user.email,
      name: typeof body.user.name === 'string' ? body.user.name : '',
      picture: typeof body.user.picture === 'string' ? body.user.picture : '',
    },
    role: body.role,
  };
}

export function getGoogleClientId(environment) {
  const clientId = environment === undefined
    ? import.meta.env.VITE_GOOGLE_CLIENT_ID
    : environment?.VITE_GOOGLE_CLIENT_ID;
  return typeof clientId === 'string' ? clientId.trim() : '';
}

export function createLoginCsrfToken(cryptoImplementation = globalThis.crypto) {
  if (typeof cryptoImplementation?.getRandomValues !== 'function') {
    throw authError('csrf-unavailable');
  }
  const bytes = cryptoImplementation.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function setLoginCsrfCookie(
  csrfToken,
  {
    documentReference = globalThis.document,
    locationReference = globalThis.location,
  } = {},
) {
  if (!/^[a-f0-9]{64}$/.test(csrfToken) || !documentReference) {
    throw authError('csrf-invalid');
  }
  const secure = locationReference?.protocol === 'https:' ? '; Secure' : '';
  documentReference.cookie = `${CSRF_COOKIE_NAME}=${csrfToken}; Path=/api/auth/login; SameSite=Strict${secure}`;
}

export async function fetchAuthSession({ fetchImplementation = globalThis.fetch, signal } = {}) {
  const response = await fetchImplementation('/api/auth/session', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  });
  const body = await readJson(response);
  if (response.status === 401) return null;
  if (!response.ok) throw authError(publicCode(body, 'session-unavailable'), response.status);
  return normalizeSession(body);
}

export async function exchangeGoogleCredential(
  credential,
  {
    fetchImplementation = globalThis.fetch,
    cryptoImplementation = globalThis.crypto,
    documentReference = globalThis.document,
    locationReference = globalThis.location,
    signal,
  } = {},
) {
  if (typeof credential !== 'string' || credential.length === 0) {
    throw authError('credential-missing');
  }
  const csrfToken = createLoginCsrfToken(cryptoImplementation);
  setLoginCsrfCookie(csrfToken, { documentReference, locationReference });

  const response = await fetchImplementation('/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ credential, csrfToken }),
    signal,
  });
  const body = await readJson(response);
  if (!response.ok) throw authError(publicCode(body, 'sign-in-failed'), response.status);
  return normalizeSession(body);
}

export async function destroyAuthSession({ fetchImplementation = globalThis.fetch, signal } = {}) {
  const response = await fetchImplementation('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    const body = await readJson(response);
    throw authError(publicCode(body, 'sign-out-failed'), response.status);
  }
}

export function notifyInvalidAuthSession(windowReference = globalThis.window) {
  if (typeof windowReference?.dispatchEvent !== 'function') return;
  windowReference.dispatchEvent(new Event(AUTH_SESSION_INVALID_EVENT));
}

export function loadGoogleIdentity({
  documentReference = globalThis.document,
  windowReference = globalThis.window,
} = {}) {
  if (windowReference?.google?.accounts?.id) return Promise.resolve(windowReference.google.accounts.id);
  if (!documentReference?.head) return Promise.reject(authError('gis-unavailable'));
  if (googleIdentityPromise) return googleIdentityPromise;

  googleIdentityPromise = new Promise((resolve, reject) => {
    const existing = documentReference.querySelector?.(`script[src="${GOOGLE_IDENTITY_SCRIPT_URL}"]`);
    const script = existing ?? documentReference.createElement('script');
    const finish = () => {
      const identity = windowReference?.google?.accounts?.id;
      if (identity) resolve(identity);
      else reject(authError('gis-unavailable'));
    };
    const fail = () => reject(authError('gis-unavailable'));

    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', fail, { once: true });
    if (!existing) {
      script.src = GOOGLE_IDENTITY_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      documentReference.head.append(script);
    }
  }).catch(error => {
    googleIdentityPromise = null;
    throw error;
  });

  return googleIdentityPromise;
}
