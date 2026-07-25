import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFusionRequestView,
  parseAssistantPayload,
  validateChatRequest,
} from './chatPolicy.js';

test('chat request accepts bounded user conversation and context', () => {
  const result = validateChatRequest({
    messages: [{ role: 'user', content: 'สรุปภาพรวม' }],
    context: { source: { datasetVersion: 'v1' } },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.messages.length, 1);
});

test('chat request rejects a conversation that does not end with the user', () => {
  const result = validateChatRequest({
    messages: [{ role: 'assistant', content: 'answer' }],
    context: {},
  });

  assert.deepEqual(result, { ok: false, code: 'last-message-must-be-user' });
});

test('assistant payload is normalized before it reaches the browser', () => {
  const payload = parseAssistantPayload(JSON.stringify({
    answer: 'พบแนวโน้มเพิ่มขึ้น',
    highlights: ['หนึ่ง', 'สอง'],
    confidence: 'high',
    dataCoverage: 'Wk 1-4',
    table: null,
    chart: {
      type: 'line',
      title: 'แนวโน้ม',
      xLabel: 'สัปดาห์',
      yLabel: 'คะแนน',
      series: [{ id: 'self', label: 'Self', color: 'blue' }],
      points: [
        { label: 'Wk 1', values: [1] },
        { label: 'Wk 2', values: [2] },
      ],
    },
    methodNote: null,
    followUps: ['ดูรายห้อง'],
  }));

  assert.equal(payload.chart.series[0].id, 'self');
  assert.deepEqual(payload.chart.points[1].values, [2]);
});

test('fusion view replaces identities and removes sensitive free text', () => {
  const result = createFusionRequestView({
    messages: [{ role: 'user', content: 'วิเคราะห์ Alpha Student รหัส s-001 และ baseline note' }],
    context: {
      source: { datasetVersion: 'v1' },
      relevantStudents: [{
        id: 's-001',
        name: 'Alpha Student',
        room: 'A-101',
        mentalSeverity: 2,
        latestObservation: { self: 4 },
      }],
      detailedStudents: [{
        id: 's-001',
        name: 'Alpha Student',
        room: 'A-101',
        mentalSeverity: 2,
        demographics: { school: 'Private School' },
        drawingNote: 'baseline note',
        fourColorTrend: [{ date: '2026-01-01', self: 4, buddy: 3, command: 3 }],
        assessments: [{
          id: 'a1',
          studentId: 's-001',
          week: 0,
          dass_d: 2,
          dass_a: 3,
          dass_s: 4,
          drawing_note: 'baseline note',
        }],
      }],
      retrieval: {
        includedRelevantStudentCount: 1,
        includedDetailedStudentCount: 1,
        detailedStudentLimit: 12,
      },
      constraints: [],
    },
  });
  const serialized = JSON.stringify(result.context);

  assert.doesNotMatch(serialized, /Alpha Student|s-001|Private School|baseline note/);
  assert.match(serialized, /subject_001/);
  assert.equal(
    result.messages[0].content,
    'วิเคราะห์ subject_001 รหัส subject_001 และ [redacted_detail]',
  );
  assert.deepEqual(result.aliases, [{
    id: 's-001',
    name: 'Alpha Student',
    alias: 'subject_001',
  }]);
});
