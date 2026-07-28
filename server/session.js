import {
  createHash,
  createHmac,
  timingSafeEqual,
} from 'node:crypto';
import { Buffer } from 'node:buffer';

import { HttpError } from './errors.js';
import { parseCookies } from './http.js';

export const SESSION_COOKIE_NAME = '__Host-sentinel_session';
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
export const ALLOWED_ROLES = new Set(['clinician', 'admin']);

const SESSION_ISSUER = 'sentinel-dashboard';
const SESSION_AUDIENCE = 'sentinel-dashboard-web';
const JWT_PART = /^[A-Za-z0-9_-]+$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeJsonPart(value) {
  if (!JWT_PART.test(value)) throw new HttpError(401, 'invalid-auth');
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new HttpError(401, 'invalid-auth');
  }
}

function sessionSecret(value = process.env.SESSION_SECRET) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') < 32) {
    throw new HttpError(503, 'auth-not-configured');
  }
  return value;
}

export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.normalize('NFKC').trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

export function authorizedUserDocumentId(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new HttpError(400, 'invalid-email');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function issueSessionToken(identity, {
  secret,
  now = Date.now,
  maxAgeSeconds = SESSION_MAX_AGE_SECONDS,
} = {}) {
  const role = ALLOWED_ROLES.has(identity?.role) ? identity.role : null;
  const email = normalizeEmail(identity?.email);
  const subject = typeof identity?.uid === 'string' ? identity.uid.trim() : '';
  if (!role || !email || !subject || subject.length > 255) {
    throw new HttpError(403, 'forbidden');
  }
  const issuedAt = Math.floor(now() / 1_000);
  const ttl = Math.min(
    SESSION_MAX_AGE_SECONDS,
    Math.max(1, Number.isInteger(maxAgeSeconds) ? maxAgeSeconds : SESSION_MAX_AGE_SECONDS),
  );
  const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' });
  const payload = base64UrlJson({
    iss: SESSION_ISSUER,
    aud: SESSION_AUDIENCE,
    sub: subject,
    email,
    role,
    iat: issuedAt,
    exp: issuedAt + ttl,
    ...(typeof identity.name === 'string' && identity.name.trim()
      ? { name: identity.name.trim().slice(0, 200) }
      : {}),
    ...(typeof identity.picture === 'string' && identity.picture.startsWith('https://')
      ? { picture: identity.picture.slice(0, 2_048) }
      : {}),
  });
  const unsigned = `${header}.${payload}`;
  const signature = createHmac('sha256', sessionSecret(secret))
    .update(unsigned)
    .digest('base64url');
  return `${unsigned}.${signature}`;
}

export function verifySessionToken(token, {
  secret,
  now = Date.now,
} = {}) {
  if (typeof token !== 'string' || token.length > 8_192) {
    throw new HttpError(401, 'invalid-auth');
  }
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => !JWT_PART.test(part))) {
    throw new HttpError(401, 'invalid-auth');
  }
  const [encodedHeader, encodedPayload, suppliedSignature] = parts;
  const expectedSignature = createHmac('sha256', sessionSecret(secret))
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  let actualSignature;
  try {
    actualSignature = Buffer.from(suppliedSignature, 'base64url');
  } catch {
    throw new HttpError(401, 'invalid-auth');
  }
  if (
    actualSignature.toString('base64url') !== suppliedSignature
    || actualSignature.length !== expectedSignature.length
    || !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    throw new HttpError(401, 'invalid-auth');
  }
  const header = decodeJsonPart(encodedHeader);
  const payload = decodeJsonPart(encodedPayload);
  const currentTime = Math.floor(now() / 1_000);
  const email = normalizeEmail(payload?.email);
  if (
    header?.alg !== 'HS256'
    || header?.typ !== 'JWT'
    || payload?.iss !== SESSION_ISSUER
    || payload?.aud !== SESSION_AUDIENCE
    || typeof payload?.sub !== 'string'
    || !payload.sub
    || !email
    || !ALLOWED_ROLES.has(payload?.role)
    || !Number.isInteger(payload?.iat)
    || !Number.isInteger(payload?.exp)
    || payload.iat > currentTime + 60
    || payload.exp <= currentTime
    || payload.exp - payload.iat > SESSION_MAX_AGE_SECONDS
  ) {
    throw new HttpError(401, 'invalid-auth');
  }
  return {
    uid: payload.sub,
    email,
    role: payload.role,
    ...(typeof payload.name === 'string' ? { name: payload.name } : {}),
    ...(typeof payload.picture === 'string' ? { picture: payload.picture } : {}),
  };
}

export function sessionCookie(token) {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export function expiredSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export function requireSession(request, options = {}) {
  const token = parseCookies(request)[SESSION_COOKIE_NAME];
  if (!token) throw new HttpError(401, 'missing-auth');
  return verifySessionToken(token, options);
}

export function publicSession(identity) {
  return {
    authenticated: true,
    user: {
      uid: identity.uid,
      email: identity.email,
      ...(identity.name ? { name: identity.name } : {}),
      ...(identity.picture ? { picture: identity.picture } : {}),
    },
    role: identity.role,
  };
}
