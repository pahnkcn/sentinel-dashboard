import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAuthoritativeRosterGateway,
  createRosterRedactor,
  PRIVACY_ROSTER_LIMIT,
} from './privacyRoster.js';

const records = [
  { id: 's-001', name: 'Alpha Student', room: 'A-101' },
  { id: 's-002', name: 'สมชาย ใจดี', room: 'B-201' },
];

function request(version = 'v1') {
  return {
    utterance: 'เปรียบเทียบ Alpha Student (s-001) กับห้อง A-101',
    conversationState: {
      recentTurns: [{
        utterance: 'ก่อนหน้านี้ถาม สมชาย ใจดี',
        answer: 'ผลของ s-002 อยู่ในห้อง B-201',
      }],
    },
    evidence: { source: { datasetVersion: version } },
  };
}

test('redacts authoritative names, ids and rooms without exposing the roster', () => {
  const redactor = createRosterRedactor(records);
  const result = redactor.sanitize('ดู Alpha Student, s-002 และห้อง A-101');

  assert.equal(result.text.includes('Alpha Student'), false);
  assert.equal(result.text.includes('s-002'), false);
  assert.equal(result.text.includes('A-101'), false);
  assert.match(result.text, /\[\[REDACTED_PERSON\]\]/u);
  assert.match(result.text, /\[\[REDACTED_ROOM\]\]/u);
  assert.equal(redactor.containsIdentifier('ไม่มีตัวระบุ'), false);
});

test('redacts valid short roster values and identifiers pasted inside surrounding text', () => {
  const redactor = createRosterRedactor([
    { id: 'A1', name: 'Li', room: 'R1' },
    { id: 'A-123', name: 'Long Name', room: 'Q' },
  ]);
  const result = redactor.sanitize('A1 Li R1 Q xxA-123yy');

  for (const rawValue of ['A1', 'Li', 'R1', 'Q', 'A-123']) {
    assert.equal(result.text.includes(rawValue), false, rawValue);
  }
  assert.ok(result.redactionCount >= 5);
});

test('checks the current manifest and sanitizes current plus remembered turns', async () => {
  let studentReads = 0;
  const gateway = createAuthoritativeRosterGateway({
    readCurrentManifest: async () => ({ version: 'v1' }),
    readStudents: async (version, limit) => {
      studentReads += 1;
      assert.equal(version, 'v1');
      assert.equal(limit, PRIVACY_ROSTER_LIMIT + 1);
      return records;
    },
    now: () => 100,
  });

  const first = await gateway.sanitizeRequest(request());
  const second = await gateway.sanitizeRequest(request());
  assert.equal(studentReads, 1);
  assert.equal(JSON.stringify(first.request).includes('Alpha Student'), false);
  assert.equal(JSON.stringify(first.request).includes('สมชาย ใจดี'), false);
  assert.ok(first.redactionCount >= 4);
  assert.equal(second.rosterSize, 2);
  assert.equal(first.assertProviderSafe([{ content: '[[SUBJECT_ALIAS_1]]' }]), true);
  assert.throws(
    () => first.assertProviderSafe([{ content: 'leak s-001' }]),
    error => error.publicCode === 'privacy-sensitive-data',
  );
});

test('fails closed on a stale dataset version or oversized roster', async () => {
  const mismatch = createAuthoritativeRosterGateway({
    readCurrentManifest: async () => ({ version: 'v2' }),
    readStudents: async () => records,
  });
  await assert.rejects(
    mismatch.sanitizeRequest(request('v1')),
    error => error.publicCode === 'privacy-dataset-mismatch',
  );

  assert.throws(
    () => createRosterRedactor(Array.from({ length: PRIVACY_ROSTER_LIMIT + 1 }, (_, index) => ({
      id: `s-${index}`,
      name: `Student ${index}`,
    }))),
    error => error.publicCode === 'privacy-roster-unavailable',
  );
});
