import assert from 'node:assert/strict';
import test from 'node:test';

import { createConversationPrivacy, createDisclosureReceipt } from './chatPrivacy.js';

const students = [
  { id: 's-001', name: 'Alpha Student', room: 'A-101' },
  { id: 's-002', name: 'Beta Student', room: 'B-201' },
];

test('aliases are stable only inside one conversation and raw identifiers are removed', () => {
  const privacy = createConversationPrivacy();
  const first = privacy.prepareUtterance('เทียบ Alpha Student (s-001) กับห้อง A-101', students);
  const second = privacy.prepareUtterance('ดู Alpha Student อีกครั้ง', students);

  assert.equal(first.utterance, 'เทียบ [[P1]] ([[P1]]) กับห้อง [[R1]]');
  assert.equal(second.utterance, 'ดู [[P1]] อีกครั้ง');
  assert.deepEqual(first.subjectAliases, ['[[P1]]']);
  assert.deepEqual(first.roomAliases, ['[[R1]]']);

  privacy.clear();
  assert.deepEqual(privacy.snapshot().subjectAliases, []);
  assert.equal(privacy.prepareUtterance('Beta Student', students).utterance, '[[P1]]');
});

test('generic identifiers and pasted sensitive notes are redacted', () => {
  const privacy = createConversationPrivacy();
  const prepared = privacy.prepareUtterance(
    'email test@example.com โทร 081-234-5678 บันทึกสุขภาพ: ข้อความละเอียด',
    students,
  );

  assert.equal(prepared.utterance.includes('test@example.com'), false);
  assert.equal(prepared.utterance.includes('081-234-5678'), false);
  assert.equal(prepared.utterance.includes('ข้อความละเอียด'), false);
  assert.deepEqual(prepared.redactions.sort(), ['email', 'free-text-note', 'phone']);
});

test('duplicate display names require an explicit roster id before selecting a person', () => {
  const duplicateStudents = [
    { id: 's-101', name: 'Alex Same', room: 'A-101' },
    { id: 's-102', name: 'Alex Same', room: 'B-201' },
  ];
  const privacy = createConversationPrivacy();

  const ambiguous = privacy.prepareUtterance('ดู Alex Same', duplicateStudents);
  assert.deepEqual(ambiguous.matchedStudentIds, []);
  assert.deepEqual(ambiguous.ambiguousNames, ['Alex Same']);
  assert.equal(ambiguous.utterance, 'ดู [[AMBIGUOUS_PERSON]]');

  const resolved = privacy.prepareUtterance('ดู Alex Same รหัส s-102', duplicateStudents);
  assert.deepEqual(resolved.matchedStudentIds, ['s-102']);
  assert.deepEqual(resolved.ambiguousNames, []);
  assert.equal(resolved.utterance.includes('Alex Same'), false);
  assert.equal(resolved.utterance.includes('s-102'), false);
  assert.deepEqual(resolved.subjectAliases, ['[[P1]]']);
});

test('sensitive note redaction consumes multiline note content', () => {
  const privacy = createConversationPrivacy();
  const prepared = privacy.prepareUtterance(
    'ช่วยดู บันทึกสุขภาพ: บรรทัดแรก\nชื่อและเรื่องละเอียดอีกบรรทัด',
    students,
  );

  assert.equal(prepared.utterance, 'ช่วยดู [[REDACTED_NOTE]]');
  assert.deepEqual(prepared.redactions, ['free-text-note']);
});

test('semantic memory keeps no more than two deidentified exchanges', () => {
  const privacy = createConversationPrivacy();
  const prepared = privacy.prepareUtterance('Alpha Student', students);

  for (let index = 1; index <= 3; index += 1) {
    const evidenceId = privacy.rememberEvidence({ schemaVersion: 1, index });
    privacy.commitTurn({
      utterance: prepared.utterance,
      answer: `ผลของ [[P1]] ครั้ง ${index}`,
      evidenceId,
      intent: 'individual',
      subjectAliases: prepared.subjectAliases,
      roomAliases: [],
      metrics: ['self'],
      dateRange: null,
    });
  }

  const state = privacy.snapshot();
  assert.equal(state.recentTurns.length, 2);
  assert.equal(state.recentTurns[0].answer, 'ผลของ [[P1]] ครั้ง 2');
  assert.equal(JSON.stringify(state).includes('Alpha Student'), false);
  assert.equal(privacy.restoreAssistantPayload({ answer: 'ผลของ [[P1]]' }).answer, 'ผลของ Alpha Student');
});

test('disclosure receipt reports the serialized outbound payload', () => {
  const evidence = { subjects: [{ alias: '[[P1]]' }], rooms: [] };
  const body = { model: 'model', utterance: 'ดู [[P1]]', conversationState: {}, evidence };
  const receipt = createDisclosureReceipt({ body, evidence, redactions: ['email'] });

  assert.equal(receipt.subjectCount, 1);
  assert.equal(receipt.rawIdentifiersSent, false);
  assert.ok(receipt.byteCount > 0);
});
