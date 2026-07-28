import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePrivacyChatRequest } from '../../server/chat/privacyPolicy.js';
import { createMonitoringAnalytics } from '../domain/monitoringAnalytics.js';
import {
  createAnalysisRequest,
  createEvidenceEnvelope,
  createLinearForecast,
} from './chatContext.js';
import { createConversationPrivacy } from './chatPrivacy.js';

const students = Array.from({ length: 7 }, (_, index) => ({
  id: `s-${String(index + 1).padStart(3, '0')}`,
  name: index === 0 ? 'Alpha Student' : `Student ${index + 1}`,
  room: index < 5 ? 'A-101' : 'B-201',
  demographics: { mentalSeverity: index === 0 ? 3 : 1 },
}));
const logs = students.flatMap((student, studentIndex) => [1, 2, 3].map(week => ({
  id: `${student.id}-l${week}`,
  studentId: student.id,
  date: `2026-01-${String(week * 7).padStart(2, '0')}`,
  week,
  self: studentIndex === 0 ? 4 : 2,
  buddy: studentIndex === 0 ? 4 : 2,
  command: studentIndex === 0 ? 4 : 2,
  physicalInjury: 1,
})));
logs.push({ id: 'future', studentId: 's-001', date: '2027-01-01', week: 4, self: 4, buddy: 4, command: 4, physicalInjury: 2 });
const assessments = students.map((student, index) => ({
  id: `${student.id}-a1`,
  studentId: student.id,
  week: 0,
  dass_d: index === 0 ? 5 : 2,
  dass_a: index === 0 ? 5 : 2,
  dass_s: index === 0 ? 5 : 2,
  cd_risc: 28,
  grit: 20,
  drawing_note: `sensitive note ${index}`,
}));

function evidenceFor(question) {
  const analytics = createMonitoringAnalytics({ students, logs, assessments, asOfDate: '2026-02-01' });
  const privacy = createConversationPrivacy();
  const prepared = privacy.prepareUtterance(question, students);
  return createEvidenceEnvelope({
    evidenceId: 'E1',
    analytics,
    students,
    logs,
    assessments,
    datasetVersion: 'test-v1',
    lastUpdatedAt: Date.parse('2026-02-01T00:00:00.000Z'),
    question,
    prepared,
    aliases: privacy.aliases,
    previousState: privacy.snapshot(),
    asOfDate: '2026-02-01',
  });
}

function analysisFor(question) {
  const analytics = createMonitoringAnalytics({ students, logs, assessments, asOfDate: '2026-02-01' });
  const privacy = createConversationPrivacy();
  const previousState = privacy.snapshot();
  const prepared = privacy.prepareUtterance(question, students);
  const evidence = createEvidenceEnvelope({
    evidenceId: 'E1',
    analytics,
    students,
    logs,
    datasetVersion: 'test-v1',
    lastUpdatedAt: Date.parse('2026-02-01T00:00:00.000Z'),
    question,
    prepared,
    aliases: privacy.aliases,
    previousState,
    asOfDate: '2026-02-01',
  });
  return {
    evidence,
    analysis: createAnalysisRequest({ question, evidence, prepared, previousState }),
    prepared,
    previousState,
  };
}

function metricsIn(evidence) {
  return [...new Set([
    ...evidence.metrics.map(metric => metric.metric),
    ...evidence.subjects.flatMap(subject => subject.metrics.map(metric => metric.metric)),
    ...evidence.rooms.flatMap(room => room.metrics.map(metric => metric.metric)),
  ])];
}

function commitEvidence(privacy, prepared, evidence) {
  privacy.commitTurn({
    utterance: prepared.utterance,
    answer: `ผลของ ${evidence.subjects[0]?.alias ?? evidence.rooms[0]?.alias ?? 'ภาพรวม'}`,
    evidenceId: evidence.source.evidenceId,
    intent: evidence.intent,
    subjectAliases: evidence.subjects.map(subject => subject.alias),
    roomAliases: evidence.rooms.map(room => room.alias),
    metrics: metricsIn(evidence),
    dateRange: evidence.coverage.from && evidence.coverage.to
      ? { from: evidence.coverage.from, to: evidence.coverage.to }
      : null,
  });
}

test('linear forecast requires evidence and respects scale bounds', () => {
  assert.equal(createLinearForecast([{ week: 1, value: 2 }]), null);
  const forecast = createLinearForecast([
    { week: 1, value: 2 },
    { week: 2, value: 3 },
    { week: 3, value: 4 },
  ], { min: 1, max: 4 });
  assert.equal(forecast.slopePerWeek, 1);
  assert.deepEqual(forecast.forecast.slice(0, 2), [{ week: 4, value: 4 }, { week: 5, value: 4 }]);
  const afterWeekSixteen = createLinearForecast([
    { week: 8, value: 1 },
    { week: 12, value: 2 },
    { week: 16, value: 3 },
  ], { min: 1, max: 4 });
  assert.deepEqual(afterWeekSixteen.forecast.map(point => point.week), [17, 18, 19, 20]);
});

test('structured analysis request preserves week windows and requested presentation', () => {
  const question = 'เปรียบเทียบค่า self เฉลี่ยสัปดาห์ 1-2 กับสัปดาห์ 3-4 ทำกราฟและตาราง พร้อมอธิบายเหตุผล';
  const { evidence, analysis } = analysisFor(question);

  assert.equal(evidence.intent, 'overview');
  assert.deepEqual(analysis, {
    operation: 'compare',
    scope: 'overview',
    metrics: ['self'],
    statistic: 'mean',
    time: {
      mode: 'week_windows',
      windows: [
        { fromWeek: 1, toWeek: 2 },
        { fromWeek: 3, toWeek: 4 },
      ],
    },
    ranking: null,
    output: 'chart_table',
    explain: true,
    referent: { status: 'none', resolvedFromPrevious: false },
  });
  assert.deepEqual(
    evidence.metrics.find(metric => metric.metric === 'self').points.map(point => point.week),
    [1, 2, 3],
  );
});

test('indirect ranking and indirect change questions receive semantic operations', () => {
  const ranked = analysisFor(
    'ถ้าวันนี้ทีมดูได้แค่ 3 เคส ควรเริ่มกับคนไหนก่อน เพราะอะไร ขอเป็นตาราง',
  );
  assert.equal(ranked.evidence.intent, 'ranking');
  assert.equal(ranked.evidence.subjects.length, 3);
  assert.deepEqual(ranked.analysis.ranking, {
    direction: 'risk_first',
    limit: 3,
  });
  assert.equal(ranked.analysis.operation, 'rank');
  assert.equal(ranked.analysis.scope, 'subject');
  assert.equal(ranked.analysis.output, 'table');
  assert.equal(ranked.analysis.explain, true);

  const changed = analysisFor('ช่วงนี้ภาพรวมแย่ลงจากก่อนหน้าหรือยัง');
  assert.equal(changed.evidence.intent, 'overview');
  assert.ok(changed.evidence.metrics.some(metric => metric.points?.length > 1));
  assert.deepEqual(metricsIn(changed.evidence), ['self', 'buddy', 'command']);
  assert.equal(changed.analysis.operation, 'trend');
  assert.equal(changed.analysis.statistic, 'change');
  assert.deepEqual(changed.analysis.time, {
    mode: 'recent_vs_previous',
    windows: [
      { fromWeek: 1, toWeek: 2 },
      { fromWeek: 3, toWeek: 3 },
    ],
  });
  const validated = validatePrivacyChatRequest({
    model: 'z-ai/glm-5.2',
    utterance: changed.prepared.utterance,
    conversationState: changed.previousState,
    analysisRequest: changed.analysis,
    evidence: changed.evidence,
  });
  assert.equal(validated.ok, true, validated.code);

  assert.equal(analysisFor('สรุปภาพรวมวันนี้').analysis.operation, 'summarize');
  assert.equal(analysisFor('นักเรียนทั้งหมดเท่าไหร่').analysis.operation, 'count');

  const historicalBrief = analysisFor(
    'เขียนสรุปเป็นข้อความสำหรับการประชุมจากข้อมูล self, buddy และ command ย้อนหลังทั้งหมด',
  );
  assert.equal(historicalBrief.analysis.operation, 'summarize');
  assert.equal(historicalBrief.analysis.scope, 'overview');
  assert.equal(historicalBrief.analysis.statistic, 'trend');
  assert.equal(historicalBrief.analysis.time.mode, 'available_range');
  assert.equal(historicalBrief.analysis.output, 'narrative');
  assert.ok(historicalBrief.evidence.metrics.every(metric => metric.points?.length > 1));
  assert.equal(validatePrivacyChatRequest({
    model: 'z-ai/glm-5.2',
    utterance: historicalBrief.prepared.utterance,
    conversationState: historicalBrief.previousState,
    analysisRequest: historicalBrief.analysis,
    evidence: historicalBrief.evidence,
  }).ok, true);

  for (const question of [
    'ช่วยสรุปข้อมูล self ย้อนหลังทั้งหมด',
    'Give me a historical summary of self',
  ]) {
    const historicalSummary = analysisFor(question);
    assert.equal(historicalSummary.analysis.operation, 'summarize', question);
    assert.equal(historicalSummary.analysis.statistic, 'trend', question);
    assert.equal(historicalSummary.analysis.time.mode, 'available_range', question);
    assert.ok(historicalSummary.evidence.metrics.every(metric => metric.points?.length > 1));
  }
});

test('individual evidence uses aliases, withholds future records, and omits free text', () => {
  const evidence = evidenceFor('ช่วยวิเคราะห์ Alpha Student และแนวโน้ม self');
  const serialized = JSON.stringify(evidence);

  assert.equal(evidence.intent, 'individual');
  assert.equal(evidence.subjects.length, 1);
  assert.equal(evidence.subjects[0].alias, '[[P1]]');
  assert.equal(evidence.subjects[0].metrics[0].points.at(-1).date, '2026-01-21');
  assert.equal(serialized.includes('Alpha Student'), false);
  assert.equal(serialized.includes('s-001'), false);
  assert.equal(serialized.includes('sensitive note'), false);
  assert.equal(serialized.includes('2027-01-01'), false);
});

test('ranking sends at most five alias-only subjects', () => {
  const evidence = evidenceFor('จัดอันดับรายชื่อที่เสี่ยงและควรติดตาม');
  assert.equal(evidence.intent, 'ranking');
  assert.equal(evidence.subjects.length, 5);
  assert.equal(evidence.subjects[0].alias, '[[P1]]');
  assert.equal(evidence.subjects[0].metrics[0].rank, 1);
});

test('named prediction uses a deterministic alias-only forecast instead of a population forecast', () => {
  const evidence = evidenceFor('คาดการณ์แนวโน้ม self ของ Alpha Student');
  assert.equal(evidence.intent, 'prediction');
  assert.equal(evidence.subjects.length, 1);
  assert.equal(evidence.metrics.length, 0);
  assert.equal(evidence.subjects[0].metrics.some(metric => metric.metric === 'self_forecast'), true);
  assert.equal(evidence.constraints.includes('prediction-ordinary-least-squares'), true);
});

test('small rooms are suppressed and aggregate trend points require at least five people', () => {
  const roomEvidence = evidenceFor('ห้องใดมีสัญญาณน่ากังวลมากที่สุด');
  assert.equal(roomEvidence.rooms.length, 1);
  assert.equal(roomEvidence.rooms[0].alias, '[[R1]]');
  assert.equal(roomEvidence.rooms[0].sampleSize, 5);

  const overview = evidenceFor('ภาพรวมแนวโน้ม self');
  assert.equal(overview.subjects.length, 0);
  assert.equal(overview.metrics.find(metric => metric.metric === 'self').points.length, 3);
});

test('room ranking stays aggregate instead of disclosing ranked people', () => {
  const ranked = analysisFor('ห้องใดมีสัญญาณน่ากังวลมากที่สุด');
  assert.equal(ranked.evidence.intent, 'room');
  assert.equal(ranked.evidence.subjects.length, 0);
  assert.equal(ranked.evidence.rooms.length, 1);
  assert.equal(ranked.evidence.rooms[0].sampleSize, 5);
  assert.equal(ranked.analysis.operation, 'rank');
  assert.equal(ranked.analysis.scope, 'room');
  assert.deepEqual(ranked.analysis.ranking, { direction: 'desc', limit: 5 });

  const named = analysisFor('ห้อง A-101 มี stress เท่าไร');
  assert.equal(named.analysis.operation, 'lookup');
  assert.equal(named.analysis.ranking, null);

  const workload = analysisFor('ถ้ามีเวลาเข้าดูเพียง 5 ห้อง ห้องไหนควรเริ่มก่อน ขอเป็นตาราง');
  assert.equal(workload.analysis.operation, 'rank');
  assert.deepEqual(workload.analysis.ranking, { direction: 'risk_first', limit: 5 });

  const topTwo = analysisFor('จัดอันดับ 2 ห้องที่ควรเริ่มก่อน');
  assert.deepEqual(topTwo.analysis.ranking, { direction: 'risk_first', limit: 2 });
  assert.ok(topTwo.evidence.rooms.length <= 2);
});

test('a new explicit comparison does not append a stale remembered subject', () => {
  const analytics = createMonitoringAnalytics({ students, logs, assessments, asOfDate: '2026-02-01' });
  const privacy = createConversationPrivacy();
  const firstQuestion = 'ดู Alpha Student stress';
  const firstPrepared = privacy.prepareUtterance(firstQuestion, students);
  const first = createEvidenceEnvelope({
    evidenceId: 'E1', analytics, students, logs, datasetVersion: 'test-v1',
    lastUpdatedAt: Date.parse('2026-02-01T00:00:00.000Z'), question: firstQuestion,
    prepared: firstPrepared, aliases: privacy.aliases, previousState: privacy.snapshot(),
    asOfDate: '2026-02-01',
  });
  commitEvidence(privacy, firstPrepared, first);

  const nextQuestion = 'เปรียบเทียบ Student 2 กับ Student 3';
  const nextPrepared = privacy.prepareUtterance(nextQuestion, students);
  const next = createEvidenceEnvelope({
    evidenceId: 'E2', analytics, students, logs, datasetVersion: 'test-v1',
    lastUpdatedAt: Date.parse('2026-02-01T00:00:00.000Z'), question: nextQuestion,
    prepared: nextPrepared, aliases: privacy.aliases, previousState: privacy.snapshot(),
    asOfDate: '2026-02-01',
  });

  assert.equal(next.intent, 'comparison');
  assert.deepEqual(
    next.subjects.map(subject => privacy.aliases.personId(subject.alias)),
    ['s-002', 's-003'],
  );
});

test('period comparison becomes an overview trend and true follow-ups reuse semantic metrics', () => {
  const period = evidenceFor('เปรียบเทียบช่วงเวลา self');
  assert.equal(period.intent, 'overview');
  assert.ok(period.metrics.find(metric => metric.metric === 'self')?.points.length > 1);

  const analytics = createMonitoringAnalytics({ students, logs, assessments, asOfDate: '2026-02-01' });
  const privacy = createConversationPrivacy();
  const firstQuestion = 'ดู stress ของ Alpha Student';
  const firstPrepared = privacy.prepareUtterance(firstQuestion, students);
  const first = createEvidenceEnvelope({
    evidenceId: 'E1', analytics, students, logs, datasetVersion: 'test-v1',
    lastUpdatedAt: Date.parse('2026-02-01T00:00:00.000Z'), question: firstQuestion,
    prepared: firstPrepared, aliases: privacy.aliases, previousState: privacy.snapshot(),
    asOfDate: '2026-02-01',
  });
  commitEvidence(privacy, firstPrepared, first);

  const followUpQuestion = 'แล้วคนนี้ล่ะ';
  const followUpPrepared = privacy.prepareUtterance(followUpQuestion, students);
  const followUp = createEvidenceEnvelope({
    evidenceId: 'E2', analytics, students, logs, datasetVersion: 'test-v1',
    lastUpdatedAt: Date.parse('2026-02-01T00:00:00.000Z'), question: followUpQuestion,
    prepared: followUpPrepared, aliases: privacy.aliases, previousState: privacy.snapshot(),
    asOfDate: '2026-02-01',
  });
  assert.equal(followUp.intent, 'individual');
  assert.deepEqual(metricsIn(followUp), ['stress']);
});

test('multi-subject comparative follow-up preserves prior subjects and metric', () => {
  const analytics = createMonitoringAnalytics({ students, logs, assessments, asOfDate: '2026-02-01' });
  const privacy = createConversationPrivacy();
  const firstQuestion = 'เทียบ stress ของ Alpha Student กับ Student 2';
  const firstState = privacy.snapshot();
  const firstPrepared = privacy.prepareUtterance(firstQuestion, students);
  const first = createEvidenceEnvelope({
    evidenceId: 'E1', analytics, students, logs, datasetVersion: 'test-v1',
    lastUpdatedAt: Date.parse('2026-02-01T00:00:00.000Z'), question: firstQuestion,
    prepared: firstPrepared, aliases: privacy.aliases, previousState: firstState,
    asOfDate: '2026-02-01',
  });
  commitEvidence(privacy, firstPrepared, first);

  const question = 'แล้วคนไหนสูงกว่า';
  const previousState = privacy.snapshot();
  const prepared = privacy.prepareUtterance(question, students);
  const evidence = createEvidenceEnvelope({
    evidenceId: 'E2', analytics, students, logs, datasetVersion: 'test-v1',
    lastUpdatedAt: Date.parse('2026-02-01T00:00:00.000Z'), question,
    prepared, aliases: privacy.aliases, previousState, asOfDate: '2026-02-01',
  });
  const analysis = createAnalysisRequest({ question, evidence, prepared, previousState });

  assert.equal(evidence.intent, 'comparison');
  assert.deepEqual(
    evidence.subjects.map(subject => privacy.aliases.personId(subject.alias)),
    ['s-001', 's-002'],
  );
  assert.deepEqual(metricsIn(evidence), ['stress']);
  assert.equal(analysis.operation, 'compare');
  assert.deepEqual(analysis.referent, {
    status: 'resolved',
    resolvedFromPrevious: true,
  });

  const ambiguousQuestion = 'แล้วคนนี้ล่ะ';
  const ambiguousPrepared = privacy.prepareUtterance(ambiguousQuestion, students);
  const ambiguousEvidence = createEvidenceEnvelope({
    evidenceId: 'E3', analytics, students, logs, datasetVersion: 'test-v1',
    lastUpdatedAt: Date.parse('2026-02-01T00:00:00.000Z'), question: ambiguousQuestion,
    prepared: ambiguousPrepared, aliases: privacy.aliases, previousState,
    asOfDate: '2026-02-01',
  });
  const ambiguousAnalysis = createAnalysisRequest({
    question: ambiguousQuestion,
    evidence: ambiguousEvidence,
    prepared: ambiguousPrepared,
    previousState,
  });
  assert.equal(ambiguousEvidence.subjects.length, 2);
  assert.deepEqual(ambiguousAnalysis.referent, {
    status: 'ambiguous',
    resolvedFromPrevious: false,
  });
  const validated = validatePrivacyChatRequest({
    model: 'z-ai/glm-5.2',
    utterance: ambiguousPrepared.utterance,
    conversationState: previousState,
    analysisRequest: ambiguousAnalysis,
    evidence: ambiguousEvidence,
  });
  assert.equal(validated.ok, true, validated.code);
});

test('prediction follow-up preserves the subject and forecast operation', () => {
  const analytics = createMonitoringAnalytics({ students, logs, assessments, asOfDate: '2026-02-01' });
  const privacy = createConversationPrivacy();
  const firstQuestion = 'คาดการณ์ self ของ Alpha Student';
  const firstPrepared = privacy.prepareUtterance(firstQuestion, students);
  const firstState = privacy.snapshot();
  const first = createEvidenceEnvelope({
    evidenceId: 'E1', analytics, students, logs, datasetVersion: 'test-v1',
    lastUpdatedAt: Date.parse('2026-02-01T00:00:00.000Z'), question: firstQuestion,
    prepared: firstPrepared, aliases: privacy.aliases, previousState: firstState,
    asOfDate: '2026-02-01',
  });
  commitEvidence(privacy, firstPrepared, first);

  const followUpQuestion = 'แล้ว buddy ล่ะ ขอเป็นตาราง';
  const previousState = privacy.snapshot();
  const prepared = privacy.prepareUtterance(followUpQuestion, students);
  const evidence = createEvidenceEnvelope({
    evidenceId: 'E2', analytics, students, logs, datasetVersion: 'test-v1',
    lastUpdatedAt: Date.parse('2026-02-01T00:00:00.000Z'), question: followUpQuestion,
    prepared, aliases: privacy.aliases, previousState, asOfDate: '2026-02-01',
  });
  const analysis = createAnalysisRequest({
    question: followUpQuestion, evidence, prepared, previousState,
  });

  assert.equal(evidence.intent, 'prediction');
  assert.equal(evidence.subjects[0].alias, first.subjects[0].alias);
  assert.equal(metricsIn(evidence).includes('buddy_forecast'), true);
  assert.equal(analysis.operation, 'forecast');
  assert.equal(analysis.output, 'table');
  assert.equal(analysis.referent.resolvedFromPrevious, true);
  assert.deepEqual(analysis.time, {
    mode: 'forecast_horizon',
    windows: [{ fromWeek: 4, toWeek: 7 }],
  });
});

test('metric ranking follows the requested metric and direction', () => {
  const rankedAssessments = assessments.map((assessment, index) => ({
    ...assessment,
    grit: 10 + index,
  }));
  const analytics = createMonitoringAnalytics({
    students,
    logs,
    assessments: rankedAssessments,
    asOfDate: '2026-02-01',
  });

  for (const [question, expectedId] of [
    ['ใครมี stress สูงสุด', 's-001'],
    ['rank lowest grit', 's-001'],
  ]) {
    const privacy = createConversationPrivacy();
    const prepared = privacy.prepareUtterance(question, students);
    const evidence = createEvidenceEnvelope({
      evidenceId: 'E1', analytics, students, logs, datasetVersion: 'test-v1',
      lastUpdatedAt: Date.parse('2026-02-01T00:00:00.000Z'), question, prepared,
      aliases: privacy.aliases, previousState: privacy.snapshot(), asOfDate: '2026-02-01',
    });
    assert.equal(privacy.aliases.personId(evidence.subjects[0].alias), expectedId);
    assert.equal(evidence.subjects[0].metrics[0].rank, 1);
  }

  const thaiLowest = analysisFor('จัดอันดับ 3 คนที่ grit ต่ำที่สุดและควรทบทวนก่อน');
  assert.deepEqual(thaiLowest.analysis.ranking, { direction: 'asc', limit: 3 });
});

test('causal wording about a score increase requests trend evidence without claiming causation', () => {
  const result = analysisFor('ทำไม stress ของ Alpha Student ถึงสูงขึ้น อธิบายเหตุผลให้หน่อย');
  assert.equal(result.evidence.intent, 'individual');
  assert.equal(result.analysis.operation, 'trend');
  assert.equal(result.analysis.statistic, 'change');
  assert.equal(result.analysis.explain, true);
});

test('three-person three-metric trend uses a dynamic 64-point budget', () => {
  const longLogs = students.flatMap((student, studentIndex) => Array.from({ length: 16 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, 1 + index));
    return {
      id: `${student.id}-long-${index + 1}`,
      studentId: student.id,
      date: date.toISOString().slice(0, 10),
      week: index + 1,
      self: studentIndex === 0 ? 4 : 2,
      buddy: 2,
      command: 2,
      physicalInjury: 1,
    };
  }));
  const analytics = createMonitoringAnalytics({
    students,
    logs: longLogs,
    assessments,
    asOfDate: '2026-02-01',
  });
  const privacy = createConversationPrivacy();
  const question = 'เปรียบเทียบแนวโน้ม self buddy command ของ Student 2 Student 3 Student 4';
  const previousState = privacy.snapshot();
  const prepared = privacy.prepareUtterance(question, students);
  const evidence = createEvidenceEnvelope({
    evidenceId: 'E1', analytics, students, logs: longLogs, datasetVersion: 'test-v1',
    lastUpdatedAt: Date.parse('2026-02-01T00:00:00.000Z'), question, prepared,
    aliases: privacy.aliases, previousState, asOfDate: '2026-02-01',
  });
  const analysisRequest = createAnalysisRequest({ question, evidence, prepared, previousState });
  const validated = validatePrivacyChatRequest({
    model: 'z-ai/glm-5.2',
    utterance: prepared.utterance,
    conversationState: previousState,
    analysisRequest,
    evidence,
  });

  assert.equal(evidence.subjects.length, 3);
  assert.deepEqual(metricsIn(evidence), ['self', 'buddy', 'command']);
  assert.ok(evidence.subjects.every(subject => (
    subject.metrics.length === 3
    && subject.metrics.every(metric => metric.points.length === 7)
  )));
  assert.equal(evidence.coverage.observedPoints, 63);
  assert.equal(validated.ok, true, validated.code);
});

test('overview count, DASS group, and room assessment questions produce relevant evidence', () => {
  const mental = evidenceFor('มีกี่คนระดับสุขภาพจิต 3');
  assert.equal(mental.metrics.find(metric => metric.metric === 'psychiatric_care')?.value, 1);

  const dass = evidenceFor('สรุป DASS-21');
  assert.deepEqual(metricsIn(dass), ['depression', 'anxiety', 'stress']);

  const room = evidenceFor('ห้อง A-101 มี stress เท่าไร');
  assert.equal(room.intent, 'room');
  const roomStress = room.rooms[0].metrics.find(metric => metric.metric === 'stress');
  assert.ok(Number.isFinite(roomStress?.value));
  assert.equal(roomStress.sampleSize, 5);

  const overview = evidenceFor('ภาพรวมแนวโน้ม self');
  assert.ok(overview.metrics.find(metric => metric.metric === 'self')
    .points.every(point => point.sampleSize === students.length));
  assert.equal(overview.constraints.includes('insufficient-small-group'), false);

  const smallRoom = evidenceFor('ห้อง B-201 มี stress เท่าไร');
  assert.equal(smallRoom.rooms.length, 0);
  assert.equal(smallRoom.constraints.includes('insufficient-small-group'), true);

  const suppressed = analysisFor('สรุปห้อง B-201');
  assert.deepEqual(suppressed.analysis.metrics, ['self', 'buddy', 'command']);
  const validated = validatePrivacyChatRequest({
    model: 'z-ai/glm-5.2',
    utterance: suppressed.prepared.utterance,
    conversationState: suppressed.previousState,
    analysisRequest: suppressed.analysis,
    evidence: suppressed.evidence,
  });
  assert.equal(validated.ok, true, validated.code);
});

test('OLS constraint is present only when forecast evidence exists', () => {
  const sparseLogs = logs.filter(log => log.studentId !== 's-001' || log.week < 3);
  const analytics = createMonitoringAnalytics({
    students,
    logs: sparseLogs,
    assessments,
    asOfDate: '2026-02-01',
  });
  const privacy = createConversationPrivacy();
  const question = 'คาดการณ์ self ของ Alpha Student';
  const prepared = privacy.prepareUtterance(question, students);
  const evidence = createEvidenceEnvelope({
    evidenceId: 'E1', analytics, students, logs: sparseLogs, datasetVersion: 'test-v1',
    lastUpdatedAt: Date.parse('2026-02-01T00:00:00.000Z'), question, prepared,
    aliases: privacy.aliases, previousState: privacy.snapshot(), asOfDate: '2026-02-01',
  });

  assert.equal(metricsIn(evidence).includes('self_forecast'), false);
  assert.equal(evidence.constraints.includes('prediction-is-exploratory'), true);
  assert.equal(evidence.constraints.includes('prediction-ordinary-least-squares'), false);
});

test('client evidence envelopes satisfy the strict server contract', () => {
  for (const question of [
    'สรุปภาพรวมวันนี้',
    'ช่วยวิเคราะห์ Alpha Student และแนวโน้ม self',
    'จัดอันดับรายชื่อที่เสี่ยงและควรติดตาม',
    'ห้องใดมีสัญญาณน่ากังวลมากที่สุด',
    'คาดการณ์แนวโน้ม self',
  ]) {
    const analytics = createMonitoringAnalytics({ students, logs, assessments, asOfDate: '2026-02-01' });
    const privacy = createConversationPrivacy();
    const previousState = privacy.snapshot();
    const prepared = privacy.prepareUtterance(question, students);
    const evidence = createEvidenceEnvelope({
      evidenceId: 'E1',
      analytics,
      students,
      logs,
      datasetVersion: 'test-v1',
      lastUpdatedAt: Date.parse('2026-02-01T00:00:00.000Z'),
      question,
      prepared,
      aliases: privacy.aliases,
      previousState,
      asOfDate: '2026-02-01',
    });
    const analysisRequest = createAnalysisRequest({ question, evidence, prepared, previousState });
    const validated = validatePrivacyChatRequest({
      model: 'z-ai/glm-5.2',
      utterance: prepared.utterance,
      conversationState: previousState,
      analysisRequest,
      evidence,
    });
    assert.equal(validated.ok, true, `${question}: ${validated.code}`);
  }
});
