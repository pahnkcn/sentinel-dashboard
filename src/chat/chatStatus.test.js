import assert from 'node:assert/strict';
import test from 'node:test';

import { getChatConnectionPresentation } from './chatStatus.js';

test('chat is not labeled online before a successful API response', () => {
  const presentation = getChatConnectionPresentation({
    dataReady: true,
    pending: false,
    apiState: 'unverified',
  });

  assert.equal(presentation.label, 'ยังไม่ยืนยัน API');
});

test('chat reports configured and failed states from real request outcomes', () => {
  assert.equal(getChatConnectionPresentation({
    dataReady: true,
    pending: false,
    apiState: 'online',
  }).label, 'Fusion พร้อมใช้งาน');

  assert.equal(getChatConnectionPresentation({
    dataReady: true,
    pending: false,
    apiState: 'not-configured',
  }).label, 'ยังไม่ได้ตั้งค่า API');
});
