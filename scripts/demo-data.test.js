import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSafeWorkbookProfile,
  generateSyntheticDataset,
  normalizeWorkbookTables,
  resolveHeaderMap,
  unwrapExcelValue,
  validateSyntheticDataset,
} from './demo-data.mjs';

function fixtureTables() {
  return {
    Demographics: {
      rows: [
        { __rowNumber: 2, studentId: 101, name: 'Synthetic One', room: 'Fixture A' },
        { __rowNumber: 3, studentId: 102, name: 'Synthetic Two', room: 'Fixture B' },
      ],
    },
    Daily_Self: {
      rows: [
        {
          __rowNumber: 2,
          date: '2026-01-01',
          studentId: 101,
          week: 1,
          self: 1,
          physicalInjury: '',
          observedAt: '2026-01-01T08:00:00.000Z',
        },
        {
          __rowNumber: 3,
          date: '2026-01-01',
          studentId: 101,
          week: 1,
          self: 4,
          physicalInjury: '',
          observedAt: '2026-01-01T09:00:00.000Z',
        },
        {
          __rowNumber: 4,
          date: '2026-01-08',
          studentId: 102,
          week: 2,
          self: 2,
          physicalInjury: '',
        },
      ],
    },
    Weekly_Obs: {
      rows: [
        {
          __rowNumber: 2,
          date: '2026-01-01',
          studentId: 101,
          week: 1,
          buddy: 0,
          commandLookup: 4,
        },
        {
          __rowNumber: 3,
          date: '2026-01-08',
          studentId: 102,
          week: 3,
          buddy: 3,
          commandLookup: 4,
        },
      ],
    },
    Command: {
      state: 'hidden',
      rows: [{
        __rowNumber: 2,
        date: '2026-01-01',
        studentId: 101,
        week: 1,
        command: 2,
      }],
    },
    Assessments: {
      rows: [
        {
          __rowNumber: 2,
          studentId: 101,
          week: 0,
          dass_d: 0,
          dass_a: 12,
          dass_s: 21,
          cd_risc: 40,
          grit: 32,
        },
        {
          __rowNumber: 3,
          studentId: 102,
          week: 0,
          dass_d: 18,
          dass_a: 6,
          dass_s: 3,
          cd_risc: 20,
          grit: 16,
        },
      ],
    },
  };
}

test('accepts the trusted workbook headers and optional future timestamp column', () => {
  const indexes = resolveHeaderMap('Daily_Self', [
    'วันที่ (YYYY-MM-DD)',
    'รหัส นรม.',
    'สัปดาห์ (1-16)',
    'Self (1-4)',
    'ป่วยกาย (1-3)',
    'Timestamp',
  ]);
  assert.deepEqual(indexes, {
    date: 0,
    studentId: 1,
    week: 2,
    self: 3,
    physicalInjury: 4,
    observedAt: 5,
  });
});

test('requires cached values for formulas before profiling', () => {
  assert.equal(unwrapExcelValue({ formula: '1+1', result: 2 }, 'fixture'), 2);
  assert.equal(unwrapExcelValue({
    formula: 'IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),0.0)',
  }, 'fixture'), 0);
  assert.throws(
    () => unwrapExcelValue({ formula: '1+1' }, 'Fixture!A1'),
    /without a cached result/,
  );
});

test('normalizes duplicates, zero Buddy, hidden Command, null injury, and mismatched weeks', () => {
  const normalized = normalizeWorkbookTables(fixtureTables());

  assert.equal(normalized.report.duplicateDailyRows, 1);
  assert.equal(normalized.report.duplicateDailyKeyCount, 1);
  assert.equal(normalized.report.zeroBuddyRows, 1);
  assert.equal(normalized.report.weekMismatchCount, 1);
  assert.equal(normalized.report.weeklyCommandLookupIgnored, true);
  assert.equal(normalized.logs.length, 1);
  assert.deepEqual(normalized.logs[0], {
    studentId: '101',
    date: '2026-01-01',
    week: 1,
    self: 4,
    buddy: null,
    command: 2,
    physicalInjury: null,
    selfObservedAt: '2026-01-01T09:00:00.000Z',
  });
});

test('safe profile contains aggregate counts only and preserves DASS 0-21 distributions', () => {
  const profile = createSafeWorkbookProfile(fixtureTables());
  const serialized = JSON.stringify(profile);

  assert.equal(profile.sourceShape.studentCount, 2);
  assert.equal(profile.scoreDistributions.dass_d[0], 1);
  assert.equal(profile.scoreDistributions.dass_s[21], 1);
  assert.equal(profile.qualityReport.weekMismatchRowsQuarantined, 1);
  assert.doesNotMatch(serialized, /Synthetic One|Synthetic Two|Fixture A|Fixture B/);
  assert.doesNotMatch(serialized, /2026-01-0[18]/);
  assert.doesNotMatch(serialized, /"studentId"/);
});

test('synthetic generation is deterministic and never preserves source identities or trajectories', () => {
  const profile = createSafeWorkbookProfile(fixtureTables());
  const options = {
    profile,
    studentCount: 2,
    endDate: '2026-06-30',
    seed: 'stable-fixture',
  };
  const first = generateSyntheticDataset(options);
  const second = generateSyntheticDataset(options);
  const serialized = JSON.stringify(first);

  assert.deepEqual(first, second);
  assert.equal(validateSyntheticDataset(first), first);
  assert.ok(first.streams.students.every(student => student.id.startsWith('demo-')));
  assert.doesNotMatch(serialized, /Synthetic One|Synthetic Two|Fixture A|Fixture B/);
  assert.ok(first.streams.logs.every(log => log.date <= '2026-06-30'));
});

test('synthetic validation rejects non-demo identities and non-synthetic classification', () => {
  const dataset = generateSyntheticDataset({
    studentCount: 1,
    endDate: '2026-06-30',
    seed: 'validation-fixture',
  });
  dataset.streams.students[0].name = 'Source Person';
  assert.throws(() => validateSyntheticDataset(dataset), /generic demo name/);

  dataset.streams.students[0].name = 'Demo Participant 0001';
  dataset.manifest.dataClassification = 'clinical';
  assert.throws(() => validateSyntheticDataset(dataset), /must be synthetic/);
});
