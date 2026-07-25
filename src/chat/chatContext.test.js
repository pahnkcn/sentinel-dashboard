import assert from 'node:assert/strict';
import test from 'node:test';

import { createMonitoringAnalytics } from '../domain/monitoringAnalytics.js';
import { createChatContext, createLinearForecast } from './chatContext.js';

const students = [
  {
    id: 's-001',
    name: 'Alpha Student',
    room: 'A-101',
    tag: 'follow-up',
    demographics: { gender: 'ชาย', mentalSeverity: 2 },
  },
  {
    id: 's-002',
    name: 'Beta Student',
    room: 'B-201',
    tag: 'stable',
    demographics: { gender: 'หญิง', mentalSeverity: 1 },
  },
];
const logs = [
  { id: 'l1', studentId: 's-001', date: '2026-01-01', week: 1, self: 2, buddy: 2, command: 2, physicalInjury: 1 },
  { id: 'l2', studentId: 's-001', date: '2026-01-08', week: 2, self: 3, buddy: null, command: null, physicalInjury: 1 },
  { id: 'l3', studentId: 's-001', date: '2026-01-15', week: 3, self: 4, buddy: 4, command: 4, physicalInjury: 2 },
  { id: 'future', studentId: 's-001', date: '2027-01-01', week: 4, self: 4, buddy: 4, command: 4, physicalInjury: 2 },
  { id: 'l4', studentId: 's-002', date: '2026-01-15', week: 3, self: 1, buddy: 1, command: 1, physicalInjury: 1 },
];
const assessments = [
  { id: 'a1', studentId: 's-001', week: 0, dass_d: 2, dass_a: 2, dass_s: 2, cd_risc: 28, grit: 20, drawing_note: 'baseline note' },
];

test('linear forecast requires evidence and respects scale bounds', () => {
  assert.equal(createLinearForecast([{ week: 1, value: 2 }]), null);

  const forecast = createLinearForecast([
    { week: 1, value: 2 },
    { week: 2, value: 3 },
    { week: 3, value: 4 },
  ], { min: 1, max: 4 });

  assert.equal(forecast.slopePerWeek, 1);
  assert.deepEqual(forecast.forecast.slice(0, 2), [
    { week: 4, value: 4 },
    { week: 5, value: 4 },
  ]);
});

test('chat context withholds future logs and retrieves named student detail', () => {
  const analytics = createMonitoringAnalytics({
    students,
    logs,
    assessments,
    asOfDate: '2026-02-01',
  });
  const context = createChatContext({
    analytics,
    students,
    logs,
    assessments,
    question: 'ช่วยวิเคราะห์ Alpha Student และ prediction',
    asOfDate: '2026-02-01',
  });

  assert.equal(context.source.observations, undefined);
  assert.equal(context.source.recordCounts.observations, 4);
  assert.deepEqual(context.retrieval.questionMatchedStudentIds, ['s-001']);
  assert.equal(context.detailedStudents.length, 1);
  assert.equal(context.detailedStudents[0].fourColorTrend.at(-1).date, '2026-01-15');
  assert.ok(context.detailedStudents[0].prediction.self);
  assert.ok(context.prediction);
});

test('general questions avoid sending identifiable student profiles', () => {
  const analytics = createMonitoringAnalytics({
    students,
    logs,
    assessments,
    asOfDate: '2026-02-01',
  });
  const context = createChatContext({
    analytics,
    students,
    logs,
    assessments,
    question: 'ภาพรวมค่าเฉลี่ยสัปดาห์นี้เป็นอย่างไร',
    asOfDate: '2026-02-01',
  });

  assert.deepEqual(context.relevantStudents, []);
  assert.deepEqual(context.detailedStudents, []);
});
