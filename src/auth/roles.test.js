import assert from 'node:assert/strict';
import test from 'node:test';

import { getAuthorizedRole } from './roles.js';

test('accepts verified clinicians and administrators', () => {
  assert.equal(getAuthorizedRole({ email_verified: true, sentinelRole: 'clinician' }), 'clinician');
  assert.equal(getAuthorizedRole({ email_verified: true, sentinelRole: 'admin' }), 'admin');
});

test('rejects missing, unknown, and unverified claims', () => {
  assert.equal(getAuthorizedRole(), null);
  assert.equal(getAuthorizedRole({ email_verified: true }), null);
  assert.equal(getAuthorizedRole({ email_verified: true, sentinelRole: 'viewer' }), null);
  assert.equal(getAuthorizedRole({ email_verified: false, sentinelRole: 'clinician' }), null);
});
