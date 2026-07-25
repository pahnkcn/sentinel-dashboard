import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseAssistantPayload,
  validateChatRequest,
} from './chatPolicy.js';

test('chat request accepts bounded user conversation and context', () => {
  const result = validateChatRequest({
    model: 'qwen/qwen3.7-plus',
    messages: [{ role: 'user', content: 'สรุปภาพรวม' }],
    context: { source: { datasetVersion: 'v1' } },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.model, 'qwen/qwen3.7-plus');
  assert.equal(result.value.messages.length, 1);
});

test('chat request rejects a model outside the server allowlist', () => {
  const result = validateChatRequest({
    model: 'openrouter/auto',
    messages: [{ role: 'user', content: 'summary' }],
    context: {},
  });

  assert.deepEqual(result, { ok: false, code: 'unsupported-model' });
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
