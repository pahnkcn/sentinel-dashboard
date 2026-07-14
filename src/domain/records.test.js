import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeAssessment, decodeLog, decodeStudent } from './records.js';

function fields(result) {
  assert.equal(result.ok, false);
  return result.issues.map(issue => issue.field);
}

test('decodes and sanitizes a valid student without mutating input', () => {
  const data = {
    id: '001',
    name: '  Student One  ',
    room: '201',
    baseline: 'Low',
    tag: '',
    ignored: 'drop me',
    demographics: {
      age: 19,
      gender: 'ชาย',
      mentalSeverity: 2,
      ignored: 'drop me too',
    },
  };
  const original = structuredClone(data);

  const decoded = decodeStudent({ documentId: '001', data });

  assert.equal(decoded.ok, true);
  assert.equal(decoded.value.name, 'Student One');
  assert.equal(decoded.value.demographics.mentalSeverity, 2);
  assert.equal('ignored' in decoded.value, false);
  assert.equal('ignored' in decoded.value.demographics, false);
  assert.deepEqual(data, original);
});

test('uses the document ID when payload ID is absent', () => {
  const decoded = decodeStudent({ documentId: 'student_2', data: { name: 'Student Two' } });

  assert.equal(decoded.ok, true);
  assert.equal(decoded.value.id, 'student_2');
});

test('rejects mismatched and prototype-sensitive identifiers', () => {
  assert.ok(fields(decodeStudent({
    documentId: 'student_1',
    data: { id: 'student_2', name: 'Mismatch' },
  })).includes('id'));

  assert.ok(fields(decodeStudent({
    documentId: '__proto__',
    data: { name: 'Unsafe' },
  })).includes('documentId'));

  assert.ok(fields(decodeLog({
    documentId: 'safe_log',
    data: {
      studentId: 'constructor',
      date: '2026-05-12',
      week: 1,
      self: 1,
      physicalInjury: 1,
    },
  })).includes('studentId'));
});

test('decodes nullable Buddy and Command observations', () => {
  const decoded = decodeLog({
    documentId: 'log_001_2026-05-12',
    data: {
      studentId: '001',
      date: '2026-05-12',
      week: 1,
      self: 2,
      buddy: null,
      command: undefined,
      physicalInjury: 1,
    },
  });

  assert.equal(decoded.ok, true);
  assert.equal(decoded.value.buddy, null);
  assert.equal(decoded.value.command, null);
});

test('rejects invalid dates, numeric strings, and out-of-range observations', () => {
  const decoded = decodeLog({
    documentId: 'bad_log',
    data: {
      studentId: '001',
      date: '2026-02-30',
      week: '1',
      self: 5,
      buddy: 2.5,
      command: 2,
      physicalInjury: 0,
    },
  });
  const issueFields = fields(decoded);

  for (const field of ['date', 'week', 'self', 'buddy', 'physicalInjury']) {
    assert.ok(issueFields.includes(field));
  }
});

test('decodes DASS-only assessments with nullable resilience scores', () => {
  const decoded = decodeAssessment({
    documentId: 'assess_001_4',
    data: {
      studentId: '001',
      week: 4,
      dass_d: 2.5,
      dass_a: 2,
      dass_s: 3,
      cd_risc: null,
      grit: null,
      drawing_note: '  reviewed  ',
    },
  });

  assert.equal(decoded.ok, true);
  assert.equal(decoded.value.cd_risc, null);
  assert.equal(decoded.value.grit, null);
  assert.equal(decoded.value.drawing_note, 'reviewed');
});

test('accepts resilience scores only on their scheduled weeks', () => {
  const valid = decodeAssessment({
    documentId: 'assess_001_8',
    data: {
      studentId: '001',
      week: 8,
      dass_d: 2,
      dass_a: 2,
      dass_s: 2,
      cd_risc: 30,
      grit: 24,
    },
  });
  const invalid = decodeAssessment({
    documentId: 'assess_001_4',
    data: {
      studentId: '001',
      week: 4,
      dass_d: 2,
      dass_a: 2,
      dass_s: 2,
      cd_risc: 30,
      grit: 24,
    },
  });

  assert.equal(valid.ok, true);
  assert.deepEqual(fields(invalid).filter(field => (
    field === 'cd_risc' || field === 'grit'
  )), ['cd_risc', 'grit']);
});

test('rejects unscheduled weeks and malformed assessment values', () => {
  const decoded = decodeAssessment({
    documentId: 'bad_assessment',
    data: {
      studentId: '001',
      week: 3,
      dass_d: '2',
      dass_a: 0,
      dass_s: 6,
      cd_risc: 41,
      grit: -1,
    },
  });
  const issueFields = fields(decoded);

  for (const field of ['week', 'dass_d', 'dass_a', 'dass_s', 'cd_risc', 'grit']) {
    assert.ok(issueFields.includes(field));
  }
});

test('rejects arrays and non-object records without exposing raw data', () => {
  const arrayResult = decodeStudent({ documentId: 'student', data: ['secret'] });
  const nullResult = decodeStudent({ documentId: 'student', data: null });

  assert.deepEqual(fields(arrayResult), ['document']);
  assert.deepEqual(fields(nullResult), ['document']);
  assert.doesNotMatch(JSON.stringify(arrayResult), /secret/);
});
