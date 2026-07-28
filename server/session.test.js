import assert from 'node:assert/strict';
import test from 'node:test';

import { HttpError } from './errors.js';
import {
  SESSION_COOKIE_NAME,
  expiredSessionCookie,
  issueSessionToken,
  requireSession,
  sessionCookie,
  verifySessionToken,
} from './session.js';

const SECRET = 'test-only-secret-that-is-longer-than-thirty-two-bytes';
const NOW = Date.parse('2026-07-28T10:00:00.000Z');
const IDENTITY = Object.freeze({
  uid: 'google-subject-123',
  email: 'Clinician@Example.com',
  name: 'Test Clinician',
  picture: 'https://example.com/avatar.png',
  role: 'clinician',
});

test('HS256 session round-trips normalized identity and has an eight-hour ceiling', () => {
  const token = issueSessionToken(IDENTITY, { secret: SECRET, now: () => NOW });
  assert.deepEqual(
    verifySessionToken(token, { secret: SECRET, now: () => NOW + 7 * 60 * 60 * 1_000 }),
    {
      uid: IDENTITY.uid,
      email: 'clinician@example.com',
      name: IDENTITY.name,
      picture: IDENTITY.picture,
      role: IDENTITY.role,
    },
  );
  assert.throws(
    () => verifySessionToken(token, { secret: SECRET, now: () => NOW + 8 * 60 * 60 * 1_000 }),
    error => error instanceof HttpError && error.code === 'invalid-auth',
  );
});

test('tampered and wrongly signed session tokens are rejected', () => {
  const token = issueSessionToken(IDENTITY, { secret: SECRET, now: () => NOW });
  const [header, payload, signature] = token.split('.');
  const signatureBytes = Buffer.from(signature, 'base64url');
  signatureBytes[0] ^= 0xff;
  assert.throws(
    () => verifySessionToken(`${header}.${payload}.${signatureBytes.toString('base64url')}`, {
      secret: SECRET,
      now: () => NOW,
    }),
    error => error.code === 'invalid-auth',
  );
  assert.throws(
    () => verifySessionToken(token, {
      secret: 'a-different-test-secret-that-is-also-long-enough',
      now: () => NOW,
    }),
    error => error.code === 'invalid-auth',
  );
});

test('session cookies use __Host, HttpOnly, Secure, Strict and browser-session semantics', () => {
  const token = issueSessionToken(IDENTITY, { secret: SECRET, now: () => NOW });
  const cookie = sessionCookie(token);
  assert.match(cookie, new RegExp(`^${SESSION_COOKIE_NAME}=`));
  assert.match(cookie, /; Path=\//u);
  assert.match(cookie, /; HttpOnly/u);
  assert.match(cookie, /; Secure/u);
  assert.match(cookie, /; SameSite=Strict/u);
  assert.doesNotMatch(cookie, /Max-Age|Expires/iu);
  assert.match(expiredSessionCookie(), /Max-Age=0/u);
});

test('requireSession reads only the signed session cookie', () => {
  const token = issueSessionToken(IDENTITY, { secret: SECRET, now: () => NOW });
  const identity = requireSession({
    headers: { cookie: `unrelated=1; ${SESSION_COOKIE_NAME}=${token}` },
  }, { secret: SECRET, now: () => NOW });
  assert.equal(identity.uid, IDENTITY.uid);
});
