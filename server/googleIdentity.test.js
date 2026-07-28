import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';

import { verifyGoogleCredential } from './googleIdentity.js';

const NOW = Date.parse('2026-07-28T10:00:00.000Z');
const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2_048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };

function credential(overrides = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: jwk.kid }))
    .toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: 'google-subject',
    email: 'Clinician@Example.com',
    email_verified: true,
    iat: Math.floor(NOW / 1_000) - 60,
    exp: Math.floor(NOW / 1_000) + 600,
    name: 'Clinician',
    picture: 'https://example.com/avatar.png',
    ...overrides,
  })).toString('base64url');
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(`${header}.${payload}`, 'ascii'),
    privateKey,
  ).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

const options = {
  clientId: CLIENT_ID,
  now: () => NOW,
  getJwks: async () => [jwk],
};

test('Google credential verifies RS256 signature and required identity claims', async () => {
  const identity = await verifyGoogleCredential(credential(), options);
  assert.deepEqual(identity, {
    uid: 'google-subject',
    email: 'clinician@example.com',
    name: 'Clinician',
    picture: 'https://example.com/avatar.png',
  });
});

for (const [name, override] of [
  ['audience', { aud: 'other-client.apps.googleusercontent.com' }],
  ['issuer', { iss: 'https://attacker.example' }],
  ['expiry', { exp: Math.floor(NOW / 1_000) }],
  ['verified email', { email_verified: false }],
]) {
  test(`Google credential rejects invalid ${name}`, async () => {
    await assert.rejects(
      verifyGoogleCredential(credential(override), options),
      error => error.code === 'invalid-google-credential' && error.status === 401,
    );
  });
}

test('Google credential rejects a modified signature', async () => {
  const parts = credential().split('.');
  const signatureBytes = Buffer.from(parts[2], 'base64url');
  signatureBytes[0] ^= 0xff;
  parts[2] = signatureBytes.toString('base64url');
  await assert.rejects(
    verifyGoogleCredential(parts.join('.'), options),
    error => error.code === 'invalid-google-credential',
  );
});
