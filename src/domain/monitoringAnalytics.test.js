import assert from 'node:assert/strict';
import test from 'node:test';

import { createMonitoringAnalytics } from './monitoringAnalytics.js';

function student(id, overrides = {}) {
  return {
    id,
    name: `Student ${id}`,
    room: '201',
    demographics: { gender: 'ชาย', mentalSeverity: 1 },
    ...overrides,
  };
}

function log(id, studentId, date, overrides = {}) {
  return {
    id,
    studentId,
    date,
    week: 1,
    self: 1,
    buddy: null,
    command: null,
    physicalInjury: 1,
    ...overrides,
  };
}

function assessment(id, studentId, week, overrides = {}) {
  return {
    id,
    studentId,
    week,
    dass_d: 1,
    dass_a: 1,
    dass_s: 1,
    cd_risc: null,
    grit: null,
    drawing_note: '',
    ...overrides,
  };
}

test('applies LOCF chronologically within one student without mutating inputs', () => {
  const logs = [
    log('a_later', 'a', '2026-05-13', { self: 2 }),
    log('b_first', 'b', '2026-05-12', { self: 3 }),
    log('a_first', 'a', '2026-05-12', { buddy: 2, command: 3 }),
  ];
  const original = structuredClone(logs);
  const analytics = createMonitoringAnalytics({
    students: [student('a'), student('b')],
    logs,
  });

  const aTrend = analytics.getIndividual({ studentId: 'a' }).fourColorTrend;
  const bTrend = analytics.getIndividual({ studentId: 'b' }).fourColorTrend;

  assert.deepEqual(aTrend.map(point => point.date), ['2026-05-12', '2026-05-13']);
  assert.equal(aTrend[1].buddy, 2);
  assert.equal(aTrend[1].command, 3);
  assert.equal(aTrend[1].isBuddyCF, true);
  assert.equal(aTrend[1].buddySourceDate, '2026-05-12');
  assert.equal(bTrend[0].buddy, null);
  assert.equal(bTrend[0].isBuddyCF, false);
  assert.deepEqual(logs, original);
});

test('calculates sample statistics and gender-filtered trends', () => {
  const analytics = createMonitoringAnalytics({
    students: [
      student('a'),
      student('b', { demographics: { gender: 'หญิง', mentalSeverity: 1 } }),
    ],
    logs: [
      log('a_log', 'a', '2026-05-12', { self: 1, buddy: 1, command: 1 }),
      log('b_log', 'b', '2026-05-12', { self: 3, buddy: 3, command: 3 }),
    ],
  });

  const all = analytics.getOverview();
  const male = analytics.getOverview({ gender: 'ชาย' });

  assert.equal(all.populationTrend[0].self, 2);
  assert.equal(all.populationTrend[0].self_sd, 1.41);
  assert.equal(all.filteredStudentCount, 2);
  assert.equal(male.filteredStudentCount, 1);
  assert.equal(male.populationTrend[0].self, 1);
  assert.equal(male.populationTrend[0].self_sd, 0);
});

test('classifies alerts from each student latest observation', () => {
  const analytics = createMonitoringAnalytics({
    students: [
      student('red3'),
      student('self_plus'),
      student('care', { demographics: { gender: 'ชาย', mentalSeverity: 3 } }),
    ],
    logs: [
      log('red3_old', 'red3', '2026-05-12', { self: 1, buddy: 1, command: 1 }),
      log('red3_new', 'red3', '2026-05-13', { self: 4, buddy: 4, command: 4 }),
      log('plus', 'self_plus', '2026-05-12', { self: 4, buddy: 4, command: 2 }),
    ],
  });

  assert.deepEqual(analytics.getOverview().alerts, {
    red3: 1,
    redSelfPlus: 1,
    psychiatricCare: 1,
  });
});

test('keeps presentation-only LOCF out of population statistics and alerts', () => {
  const analytics = createMonitoringAnalytics({
    students: [student('a'), student('b')],
    logs: [
      log('a_observed', 'a', '2026-05-12', { self: 1, buddy: 1, command: 4 }),
      log('a_missing', 'a', '2026-05-13', { self: 4 }),
      log('b_observed', 'b', '2026-05-13', { self: 2, buddy: 3, command: 2 }),
    ],
    asOfDate: '2026-05-13',
  });

  const overview = analytics.getOverview();
  const individual = analytics.getIndividual({ studentId: 'a' });

  assert.equal(overview.populationTrend[0].buddy, 2);
  assert.deepEqual(overview.alerts, {
    red3: 0,
    redSelfPlus: 0,
    psychiatricCare: 0,
  });
  assert.equal(individual.fourColorTrend[1].buddy, 1);
  assert.equal(individual.fourColorTrend[1].isBuddyCF, true);
});

test('excludes future-dated observations from current projections', () => {
  const analytics = createMonitoringAnalytics({
    students: [student('a')],
    logs: [
      log('current', 'a', '2026-05-13', { self: 1, buddy: 1, command: 1 }),
      log('future', 'a', '2026-05-14', { self: 4, buddy: 4, command: 4 }),
    ],
    asOfDate: '2026-05-13',
  });

  assert.deepEqual(analytics.getOverview().alerts, {
    red3: 0,
    redSelfPlus: 0,
    psychiatricCare: 0,
  });
  assert.deepEqual(
    analytics.getIndividual({ studentId: 'a' }).fourColorTrend.map(point => point.date),
    ['2026-05-13'],
  );
});

test('room status never uses an assessment from a later week', () => {
  const analytics = createMonitoringAnalytics({
    students: [student('a')],
    logs: [
      log('observed', 'a', '2026-06-02', {
        week: 4,
        buddy: 2,
        command: 2,
        physicalInjury: 2,
      }),
    ],
    assessments: [
      assessment('baseline', 'a', 0, { cd_risc: 20, grit: 12 }),
      assessment('week4_dass', 'a', 4, { dass_d: 3, dass_a: 4, dass_s: 5 }),
      assessment('future', 'a', 8, { cd_risc: 35, grit: 28 }),
    ],
  });

  const row = analytics.getRoomStatus({ date: '2026-06-02' }).rooms[0].students[0];
  const noObservation = analytics.getRoomStatus({ date: '2026-05-01' }).rooms[0].students[0];

  assert.equal(row.assessment.week, 4);
  assert.equal(row.assessment.dass_d, 3);
  assert.equal(row.resilienceAssessment.week, 0);
  assert.equal(row.resilienceAssessment.cd_risc, 20);
  assert.equal(row.physicalLabel, 'บาดเจ็บเล็กน้อย');
  assert.equal(noObservation.assessment, null);
});

test('uses deterministic IDs to resolve duplicate day and week records', () => {
  const analytics = createMonitoringAnalytics({
    students: [student('a')],
    logs: [
      log('a_record', 'a', '2026-05-12', { self: 1 }),
      log('z_record', 'a', '2026-05-12', { self: 4 }),
    ],
    assessments: [
      assessment('a_assessment', 'a', 0, { dass_d: 1 }),
      assessment('z_assessment', 'a', 0, { dass_d: 5 }),
    ],
  });

  const individual = analytics.getIndividual({ studentId: 'a' });
  assert.equal(individual.fourColorTrend.length, 1);
  assert.equal(individual.fourColorTrend[0].self, 4);
  assert.equal(individual.assessments.length, 1);
  assert.equal(individual.assessments[0].dass_d, 5);
});

test('interprets score boundaries and exposes scheduled projections', () => {
  const analytics = createMonitoringAnalytics({
    students: [student('a')],
    assessments: [
      assessment('week0', 'a', 0, {
        cd_risc: 29,
        grit: 15,
        drawing_note: 'baseline note',
      }),
      assessment('week8', 'a', 8, { cd_risc: 32, grit: 24 }),
      assessment('week16', 'a', 16, { cd_risc: 33, grit: 25 }),
    ],
  });

  const individual = analytics.getIndividual({ studentId: 'a' });
  const overview = analytics.getOverview();

  assert.equal(individual.latestResilience.cdRiscInterpretation, 'สูง (High)');
  assert.equal(individual.latestResilience.gritInterpretation, 'สูง (High)');
  assert.equal(individual.drawingNote, 'baseline note');
  assert.deepEqual(individual.resilienceTrend.map(item => item.week), [0, 8, 16]);
  assert.deepEqual(overview.dassTrend.map(item => item.week), ['Wk 0', 'Wk 4', 'Wk 8', 'Wk 16']);
  assert.deepEqual(overview.resilienceTrend.map(item => item.week), ['Wk 0', 'Wk 8', 'Wk 16']);
});

test('keeps latest resilience scores when the newest assessment is DASS-only', () => {
  const analytics = createMonitoringAnalytics({
    students: [student('a')],
    assessments: [
      assessment('week0', 'a', 0, { cd_risc: 30, grit: 20 }),
      assessment('week4', 'a', 4, { dass_d: 4, dass_a: 3, dass_s: 2 }),
    ],
  });

  const individual = analytics.getIndividual({ studentId: 'a' });
  assert.equal(individual.latestResilience.week, 0);
  assert.equal(individual.latestResilience.cd_risc, 30);
  assert.equal(individual.latestResilience.grit, 20);
});

test('returns null for an unknown individual', () => {
  const analytics = createMonitoringAnalytics({ students: [student('a')] });
  assert.equal(analytics.getIndividual({ studentId: 'missing' }), null);
});
