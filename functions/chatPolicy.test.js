import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseAssistantPayload,
  validateChatRequest,
} from './chatPolicy.js';

test('chat request accepts only a bounded question and expected dataset version', () => {
  const result = validateChatRequest({
    question: 'สรุปภาพรวม',
    expectedDatasetVersion: 'v1',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.messages, [{ role: 'user', content: 'สรุปภาพรวม' }]);
});

test('chat request rejects legacy context, messages, extras, and oversized questions', () => {
  assert.deepEqual(
    validateChatRequest({
      messages: [{ role: 'user', content: 'สรุป' }],
      context: {},
    }),
    { ok: false, code: 'client-context-forbidden' },
  );
  assert.deepEqual(
    validateChatRequest({
      question: 'x'.repeat(1_201),
      expectedDatasetVersion: 'v1',
    }),
    { ok: false, code: 'question-too-large' },
  );
  assert.deepEqual(
    validateChatRequest({
      question: 'สรุป',
      expectedDatasetVersion: '../unsafe',
    }),
    { ok: false, code: 'invalid-dataset-version' },
  );
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

test('table normalization preserves empty cells in their original columns', () => {
  const payload = parseAssistantPayload(JSON.stringify({
    answer: 'ตารางผ่านการตรวจสอบ',
    highlights: [],
    confidence: 'high',
    dataCoverage: 'ข้อมูลจำลอง',
    table: {
      title: 'ตาราง',
      columns: ['หนึ่ง', 'สอง', 'สาม'],
      rows: [['alpha', '', 'gamma']],
    },
    chart: null,
    methodNote: null,
    followUps: [],
  }));

  assert.deepEqual(payload.table.rows[0], ['alpha', '', 'gamma']);
});

test('assistant payload rejects a placeholder-only answer', () => {
  assert.throws(
    () => parseAssistantPayload(JSON.stringify({
      answer: '...',
      highlights: ['…'],
      confidence: 'high',
      dataCoverage: '...',
      table: null,
      chart: null,
      methodNote: '...',
      followUps: ['...'],
    })),
    /empty-assistant-answer/,
  );
});

test('assistant payload removes placeholders from optional text fields', () => {
  const payload = parseAssistantPayload(JSON.stringify({
    answer: 'ข้อมูลยังไม่พอสำหรับสรุปแนวโน้ม กรุณาตรวจสอบช่วงวันที่ของข้อมูล',
    highlights: ['...', 'มีข้อมูลยืนยันถึงสัปดาห์ที่ 8'],
    confidence: 'low',
    dataCoverage: '…',
    table: null,
    chart: null,
    methodNote: '-',
    followUps: ['TBD', 'ตรวจสอบข้อมูลรายห้องหรือไม่'],
  }));

  assert.deepEqual(payload.highlights, ['มีข้อมูลยืนยันถึงสัปดาห์ที่ 8']);
  assert.equal(payload.dataCoverage, '');
  assert.equal(payload.methodNote, null);
  assert.deepEqual(payload.followUps, ['ตรวจสอบข้อมูลรายห้องหรือไม่']);
});
