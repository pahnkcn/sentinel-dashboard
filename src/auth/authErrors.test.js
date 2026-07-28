import assert from 'node:assert/strict';
import test from 'node:test';

import { getPublicAuthErrorCode, getPublicAuthMessage } from './authErrors.js';

test('retains only bounded Firebase Auth error codes', () => {
  assert.equal(
    getPublicAuthErrorCode({ code: 'auth/network-request-failed' }),
    'auth/network-request-failed',
  );
  assert.equal(getPublicAuthErrorCode({ code: 'permission-denied' }), 'auth/unknown');
  assert.equal(
    getPublicAuthErrorCode({ code: 'auth/failure\nuser@example.test' }),
    'auth/unknown',
  );
  assert.equal(getPublicAuthErrorCode({ customData: { email: 'private@example.test' } }), 'auth/unknown');
});

test('returns messages without reflecting error details', () => {
  assert.equal(
    getPublicAuthMessage({ code: 'auth/popup-closed-by-user' }),
    'ยกเลิกการเข้าสู่ระบบแล้ว',
  );
  assert.equal(
    getPublicAuthMessage({ code: 'auth/internal-error', message: 'private@example.test' }),
    'ไม่สามารถตรวจสอบสิทธิ์ได้ กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ',
  );
});
