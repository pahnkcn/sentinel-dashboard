import { createPublicKey, timingSafeEqual, verify } from 'node:crypto';
import { Buffer } from 'node:buffer';

import { HttpError } from './errors.js';
import { normalizeEmail } from './session.js';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const JWT_PART = /^[A-Za-z0-9_-]+$/u;
let sharedJwksCache = null;

function decodeJsonPart(value) {
  if (!JWT_PART.test(value)) throw new HttpError(401, 'invalid-google-credential');
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new HttpError(401, 'invalid-google-credential');
  }
}

function maxAgeMilliseconds(headers) {
  const cacheControl = headers?.get?.('cache-control') ?? '';
  const match = cacheControl.match(/(?:^|,)\s*max-age=(\d+)/iu);
  const seconds = Number(match?.[1]);
  return Number.isFinite(seconds)
    ? Math.min(Math.max(seconds, 60), 24 * 60 * 60) * 1_000
    : 60 * 60 * 1_000;
}

async function fetchGoogleJwks({ fetchImpl, now }) {
  const timestamp = now();
  if (sharedJwksCache && sharedJwksCache.expiresAt > timestamp) {
    return sharedJwksCache.keys;
  }
  let response;
  try {
    response = await fetchImpl(GOOGLE_JWKS_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new HttpError(503, 'google-auth-unavailable', { cause: error });
  }
  if (!response.ok) throw new HttpError(503, 'google-auth-unavailable');
  const body = await response.json().catch(() => null);
  if (!Array.isArray(body?.keys)) throw new HttpError(503, 'google-auth-unavailable');
  sharedJwksCache = {
    keys: body.keys,
    expiresAt: timestamp + maxAgeMilliseconds(response.headers),
  };
  return body.keys;
}

function audienceMatches(audience, clientId, authorizedParty) {
  if (typeof audience === 'string') return audience === clientId;
  return Array.isArray(audience)
    && audience.includes(clientId)
    && audience.length > 0
    && authorizedParty === clientId;
}

export async function verifyGoogleCredential(credential, {
  clientId = process.env.GOOGLE_CLIENT_ID,
  fetchImpl = fetch,
  now = Date.now,
  getJwks = fetchGoogleJwks,
} = {}) {
  if (typeof clientId !== 'string' || !clientId.trim()) {
    throw new HttpError(503, 'auth-not-configured');
  }
  if (typeof credential !== 'string' || credential.length > 8_192) {
    throw new HttpError(401, 'invalid-google-credential');
  }
  const parts = credential.split('.');
  if (parts.length !== 3 || parts.some(part => !JWT_PART.test(part))) {
    throw new HttpError(401, 'invalid-google-credential');
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJsonPart(encodedHeader);
  const payload = decodeJsonPart(encodedPayload);
  if (
    header?.alg !== 'RS256'
    || typeof header?.kid !== 'string'
    || !header.kid
  ) {
    throw new HttpError(401, 'invalid-google-credential');
  }
  const keys = await getJwks({ fetchImpl, now });
  const jwk = keys.find(key => (
    key?.kid === header.kid
    && key?.kty === 'RSA'
    && (!key.alg || key.alg === 'RS256')
    && (!key.use || key.use === 'sig')
  ));
  if (!jwk) {
    sharedJwksCache = null;
    throw new HttpError(401, 'invalid-google-credential');
  }
  let validSignature;
  try {
    validSignature = verify(
      'RSA-SHA256',
      Buffer.from(`${encodedHeader}.${encodedPayload}`, 'ascii'),
      createPublicKey({ key: jwk, format: 'jwk' }),
      Buffer.from(encodedSignature, 'base64url'),
    );
  } catch {
    validSignature = false;
  }
  const currentTime = Math.floor(now() / 1_000);
  const email = normalizeEmail(payload?.email);
  if (
    !validSignature
    || !GOOGLE_ISSUERS.has(payload?.iss)
    || !audienceMatches(payload?.aud, clientId.trim(), payload?.azp)
    || !Number.isInteger(payload?.exp)
    || payload.exp <= currentTime
    || !Number.isInteger(payload?.iat)
    || payload.iat > currentTime + 300
    || typeof payload?.sub !== 'string'
    || !payload.sub
    || payload.sub.length > 255
    || !email
    || payload?.email_verified !== true
  ) {
    throw new HttpError(401, 'invalid-google-credential');
  }
  return {
    uid: payload.sub,
    email,
    ...(typeof payload.name === 'string' && payload.name.trim()
      ? { name: payload.name.trim().slice(0, 200) }
      : {}),
    ...(typeof payload.picture === 'string' && payload.picture.startsWith('https://')
      ? { picture: payload.picture.slice(0, 2_048) }
      : {}),
  };
}

export function validateDoubleSubmitCsrf(cookieToken, bodyToken) {
  if (
    typeof cookieToken !== 'string'
    || typeof bodyToken !== 'string'
    || !cookieToken
    || cookieToken.length > 512
    || bodyToken.length > 512
  ) {
    throw new HttpError(400, 'invalid-csrf');
  }
  const left = Buffer.from(cookieToken, 'utf8');
  const right = Buffer.from(bodyToken, 'utf8');
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new HttpError(400, 'invalid-csrf');
  }
}

export function clearGoogleJwksCacheForTest() {
  sharedJwksCache = null;
}
