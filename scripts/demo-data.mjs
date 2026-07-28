import { stat } from 'node:fs/promises';

const SCHEMA_VERSION = 2;
const PROFILE_VERSION = 1;
const DATA_CLASSIFICATION = 'synthetic';
const TRAINING_WEEKS = 16;
const ASSESSMENT_WEEKS = Object.freeze([0, 4, 8, 16]);
const MAX_WORKBOOK_BYTES = 25 * 1024 * 1024;
const MAX_STUDENTS = 250;
const MAX_CONSECUTIVE_EMPTY_ROWS = 100;

const WORKBOOK_SCHEMA = Object.freeze({
  Demographics: {
    studentId: ['รหัส นรม.', 'student id', 'studentid', 'id'],
    name: ['ชื่อ-สกุล', 'name', 'full name'],
    room: ['ห้องพัก', 'room'],
    age: ['อายุ', 'age'],
    gender: ['เพศ (ชาย/หญิง)', 'gender', 'sex'],
    region: ['ภูมิลำเนา', 'region'],
    familyHistory: ['ประวัติจิตเวชครอบครัว (ไม่มี/มี)', 'family history'],
    financialBurden: ['ภาระทางบ้าน (ไม่มี/ปานกลาง/สูง)', 'financial burden'],
    physicalIssueDetail: ['ป่วยทางกาย (รายละเอียด)', 'physical issue detail'],
    mentalIssueDetail: ['ปัญหาสุขภาพจิต (รายละเอียด)', 'mental issue detail'],
    mentalSeverity: ['ความรุนแรงจิตเวช (1-3)', 'mental severity'],
  },
  Daily_Self: {
    date: ['วันที่ (YYYY-MM-DD)', 'date'],
    studentId: ['รหัส นรม.', 'student id', 'studentid', 'id'],
    week: ['สัปดาห์ (1-16)', 'week'],
    self: ['Self (1-4)', 'self'],
    physicalInjury: ['ป่วยกาย (1-3)', 'physical injury'],
    observedAt: ['เวลาส่ง', 'timestamp', 'submitted at', 'observed at'],
  },
  Weekly_Obs: {
    date: ['วันที่ (YYYY-MM-DD)', 'date'],
    studentId: ['รหัส นรม.', 'student id', 'studentid', 'id'],
    week: ['สัปดาห์ (1-16)', 'week'],
    buddy: ['Buddy (1-4)', 'buddy'],
    commandLookup: ['Command (1-4)', 'command'],
  },
  Command: {
    date: ['วันที่ (YYYY-MM-DD)', 'date'],
    studentId: ['รหัส นรม.', 'student id', 'studentid', 'id'],
    week: ['สัปดาห์ (1-16)', 'week'],
    command: ['Command (1-4)', 'command'],
  },
  Assessments: {
    studentId: ['รหัส นรม.', 'student id', 'studentid', 'id'],
    week: ['สัปดาห์ (0, 4, 8, 16)', 'week'],
    dass_d: ['DASS-D', 'dass d', 'dass_d'],
    dass_a: ['DASS-A', 'dass a', 'dass_a'],
    dass_s: ['DASS-S', 'dass s', 'dass_s'],
    cd_risc: ['CD-RISC', 'cd risc', 'cd_risc'],
    grit: ['GRIT', 'grit'],
    drawing_note: ['Drawing Note (ภาพวาด)', 'drawing note'],
  },
});

const OPTIONAL_COLUMNS = Object.freeze({
  Daily_Self: new Set(['observedAt']),
});

const ROW_ANCHORS = Object.freeze({
  Demographics: 'studentId',
  Daily_Self: 'date',
  Weekly_Obs: 'date',
  Command: 'date',
  Assessments: 'studentId',
});

const DEFAULT_PROFILE = Object.freeze({
  profileVersion: PROFILE_VERSION,
  schemaVersion: SCHEMA_VERSION,
  sourceShape: {
    studentCount: 100,
    mergedLogCount: 1_800,
  },
  scoreDistributions: {
    self: { 1: 52, 2: 27, 3: 15, 4: 6 },
    buddy: { 1: 48, 2: 30, 3: 16, 4: 6 },
    command: { 1: 55, 2: 27, 3: 13, 4: 5 },
    physicalInjury: {},
    dass_d: { 2: 15, 5: 30, 8: 30, 12: 18, 18: 7 },
    dass_a: { 2: 15, 5: 30, 8: 30, 12: 18, 18: 7 },
    dass_s: { 2: 15, 5: 30, 8: 30, 12: 18, 18: 7 },
    cd_risc: { 16: 10, 22: 25, 28: 35, 34: 25, 40: 5 },
    grit: { 12: 10, 18: 25, 24: 35, 29: 25, 32: 5 },
  },
  observedRates: {
    self: 1,
    buddy: 0.32,
    command: 0.11,
    physicalInjury: 0,
  },
});

function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[\s()[\]{}._/\\-]+/gu, '');
}

function resolveHeaderMap(sheetName, headers) {
  const schema = WORKBOOK_SCHEMA[sheetName];
  if (!schema) throw new Error(`Unsupported workbook sheet: ${sheetName}`);
  if (!Array.isArray(headers)) throw new TypeError(`${sheetName} headers must be an array`);

  const normalizedHeaders = headers.map(normalizeHeader);
  const indexes = {};
  for (const [field, aliases] of Object.entries(schema)) {
    const aliasSet = new Set(aliases.map(normalizeHeader));
    const index = normalizedHeaders.findIndex(header => aliasSet.has(header));
    if (index < 0 && !OPTIONAL_COLUMNS[sheetName]?.has(field)) {
      throw new Error(`${sheetName} is missing required column ${field}`);
    }
    indexes[field] = index;
  }
  return indexes;
}

function unwrapExcelValue(value, location = 'workbook cell') {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value !== 'object') return value;

  if ('formula' in value || 'sharedFormula' in value) {
    if (!Object.hasOwn(value, 'result') || value.result === undefined) {
      const formula = value.formula ?? value.sharedFormula;
      if (formula === 'IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),0.0)') {
        return 0;
      }
      if (formula === 'IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"")') {
        return '';
      }
      throw new Error(`${location} contains a formula without a cached result`);
    }
    return unwrapExcelValue(value.result, location);
  }
  if (Array.isArray(value.richText)) {
    return value.richText.map(part => part.text ?? '').join('');
  }
  if (typeof value.text === 'string') return value.text;
  if (value.error) throw new Error(`${location} contains formula error ${value.error}`);
  throw new Error(`${location} contains an unsupported Excel value`);
}

async function readTrustedWorkbook(workbookPath, { loadExcelJs } = {}) {
  if (typeof workbookPath !== 'string' || !/\.xlsx$/i.test(workbookPath)) {
    throw new TypeError('Trusted workbook input must be an .xlsx file');
  }
  const metadata = await stat(workbookPath);
  if (!metadata.isFile() || metadata.size < 1 || metadata.size > MAX_WORKBOOK_BYTES) {
    throw new Error(`Workbook must be a non-empty file no larger than ${MAX_WORKBOOK_BYTES} bytes`);
  }

  let ExcelJS;
  try {
    const module = loadExcelJs ? await loadExcelJs() : await import('exceljs');
    ExcelJS = module.default ?? module;
  } catch {
    throw new Error('exceljs is required for local workbook profiling. Run npm install first.');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const tables = {};

  for (const sheetName of Object.keys(WORKBOOK_SCHEMA)) {
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) throw new Error(`Workbook is missing required sheet ${sheetName}`);

    const headerRow = worksheet.getRow(1);
    const headers = Array.from(
      { length: Math.max(0, worksheet.actualColumnCount) },
      (_, index) => unwrapExcelValue(
        headerRow.getCell(index + 1).value,
        `${sheetName}!${headerRow.getCell(index + 1).address}`,
      ),
    );
    const indexes = resolveHeaderMap(sheetName, headers);
    const rows = [];
    let consecutiveEmptyRows = 0;

    for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const anchorIndex = indexes[ROW_ANCHORS[sheetName]];
      const anchorCell = row.getCell(anchorIndex + 1);
      const anchorValue = unwrapExcelValue(
        anchorCell.value,
        `${sheetName}!${anchorCell.address}`,
      );
      if (anchorValue === null || anchorValue === '') {
        consecutiveEmptyRows += 1;
        if (rows.length > 0 && consecutiveEmptyRows >= MAX_CONSECUTIVE_EMPTY_ROWS) break;
        continue;
      }
      consecutiveEmptyRows = 0;
      const allValues = headers.map((_, index) => unwrapExcelValue(
        row.getCell(index + 1).value,
        `${sheetName}!${row.getCell(index + 1).address}`,
      ));
      if (allValues.every(value => value === null || value === '')) continue;

      const record = { __rowNumber: rowNumber };
      for (const [field, index] of Object.entries(indexes)) {
        record[field] = index < 0 ? null : allValues[index];
      }
      rows.push(record);
    }

    tables[sheetName] = {
      state: worksheet.state,
      rows,
    };
  }

  return tables;
}

function normalizeIdentifier(value, location) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  throw new Error(`${location} must contain a student identifier`);
}

function readInteger(value, location, minimum, maximum, { nullable = false } = {}) {
  if ((value === null || value === undefined || value === '') && nullable) return null;
  const numeric = value instanceof Date
    ? Math.round((value.getTime() / 86_400_000) + 25_569)
    : typeof value === 'number'
      ? value
      : Number(String(value).trim());
  if (!Number.isInteger(numeric) || numeric < minimum || numeric > maximum) {
    throw new Error(`${location} must be an integer from ${minimum} to ${maximum}`);
  }
  return numeric;
}

function excelSerialToDate(value) {
  const milliseconds = Math.round((value - 25_569) * 86_400_000);
  return new Date(milliseconds);
}

function readCalendarDate(value, location) {
  const candidate = value instanceof Date
    ? value
    : typeof value === 'number'
      ? excelSerialToDate(value)
      : new Date(`${String(value).trim().slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(candidate.getTime())) throw new Error(`${location} must contain a valid date`);
  const isoDate = candidate.toISOString().slice(0, 10);
  if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value.trim())) {
    throw new Error(`${location} must use YYYY-MM-DD`);
  }
  return isoDate;
}

function readObservedAt(value, date, location) {
  if (value === null || value === undefined || value === '') {
    return `${date}T00:00:00.000Z`;
  }
  const candidate = value instanceof Date
    ? value
    : typeof value === 'number'
      ? excelSerialToDate(value)
      : new Date(String(value));
  if (Number.isNaN(candidate.getTime())) throw new Error(`${location} must contain a valid timestamp`);
  return candidate.toISOString();
}

function rowLocation(sheetName, row) {
  return `${sheetName} row ${row.__rowNumber ?? '?'}`;
}

function histogram(values) {
  const result = {};
  for (const value of values) {
    if (value === null || value === undefined) continue;
    result[value] = (result[value] ?? 0) + 1;
  }
  return result;
}

function normalizeWorkbookTables(tables) {
  for (const sheetName of Object.keys(WORKBOOK_SCHEMA)) {
    if (!Array.isArray(tables?.[sheetName]?.rows)) {
      throw new Error(`Workbook table ${sheetName} is required`);
    }
  }

  const studentIds = new Set();
  for (const row of tables.Demographics.rows) {
    studentIds.add(normalizeIdentifier(row.studentId, rowLocation('Demographics', row)));
  }
  if (studentIds.size < 1 || studentIds.size > MAX_STUDENTS) {
    throw new RangeError(`Workbook must describe between 1 and ${MAX_STUDENTS} students`);
  }

  const dailyByKey = new Map();
  let duplicateDailyRows = 0;
  const duplicateDailyKeys = new Set();
  for (const row of tables.Daily_Self.rows) {
    const location = rowLocation('Daily_Self', row);
    const studentId = normalizeIdentifier(row.studentId, location);
    const date = readCalendarDate(row.date, location);
    const self = readInteger(row.self, `${location} Self`, 1, 4);
    const physicalInjury = readInteger(
      row.physicalInjury,
      `${location} physical injury`,
      1,
      3,
      { nullable: true },
    );
    const observedAt = readObservedAt(row.observedAt, date, location);
    const normalized = {
      studentId,
      date,
      week: readInteger(row.week, `${location} week`, 1, TRAINING_WEEKS),
      self,
      physicalInjury,
      selfObservedAt: observedAt,
      __rowNumber: row.__rowNumber ?? 0,
    };
    const key = `${studentId}\u0000${date}`;
    const previous = dailyByKey.get(key);
    if (previous) {
      duplicateDailyRows += 1;
      duplicateDailyKeys.add(key);
    }
    if (
      !previous
      || observedAt > previous.selfObservedAt
      || (observedAt === previous.selfObservedAt && normalized.__rowNumber > previous.__rowNumber)
    ) {
      dailyByKey.set(key, normalized);
    }
  }

  const buddyByKey = new Map();
  let zeroBuddyRows = 0;
  for (const row of tables.Weekly_Obs.rows) {
    const location = rowLocation('Weekly_Obs', row);
    const studentId = normalizeIdentifier(row.studentId, location);
    const date = readCalendarDate(row.date, location);
    const rawBuddy = row.buddy === '' || row.buddy === null || row.buddy === undefined
      ? null
      : Number(row.buddy);
    if (rawBuddy === 0) zeroBuddyRows += 1;
    const buddy = rawBuddy === 0
      ? null
      : readInteger(rawBuddy, `${location} Buddy`, 1, 4, { nullable: true });
    buddyByKey.set(`${studentId}\u0000${date}`, {
      studentId,
      date,
      week: readInteger(row.week, `${location} week`, 1, TRAINING_WEEKS),
      buddy,
    });
  }

  const commandByKey = new Map();
  for (const row of tables.Command.rows) {
    const location = rowLocation('Command', row);
    const studentId = normalizeIdentifier(row.studentId, location);
    const date = readCalendarDate(row.date, location);
    commandByKey.set(`${studentId}\u0000${date}`, {
      studentId,
      date,
      week: readInteger(row.week, `${location} week`, 1, TRAINING_WEEKS),
      command: readInteger(row.command, `${location} Command`, 1, 4, { nullable: true }),
    });
  }

  const logs = [];
  let weekMismatchCount = 0;
  let emptyObservationCount = 0;
  const observationKeys = new Set([
    ...dailyByKey.keys(),
    ...buddyByKey.keys(),
    ...commandByKey.keys(),
  ]);
  for (const key of observationKeys) {
    const daily = dailyByKey.get(key);
    const buddy = buddyByKey.get(key);
    const command = commandByKey.get(key);
    const weeks = new Set([daily?.week, buddy?.week, command?.week].filter(Number.isInteger));
    if (weeks.size !== 1) {
      weekMismatchCount += 1;
      continue;
    }
    const record = {
      studentId: daily?.studentId ?? buddy?.studentId ?? command.studentId,
      date: daily?.date ?? buddy?.date ?? command.date,
      week: [...weeks][0],
      self: daily?.self ?? null,
      buddy: buddy?.buddy ?? null,
      command: command?.command ?? null,
      physicalInjury: daily?.physicalInjury ?? null,
      selfObservedAt: daily?.selfObservedAt ?? null,
    };
    if ([record.self, record.buddy, record.command, record.physicalInjury].every(value => value === null)) {
      emptyObservationCount += 1;
      continue;
    }
    logs.push(record);
  }

  const assessments = tables.Assessments.rows.map(row => {
    const location = rowLocation('Assessments', row);
    return {
      studentId: normalizeIdentifier(row.studentId, location),
      week: readInteger(row.week, `${location} week`, 0, TRAINING_WEEKS),
      dass_d: readInteger(row.dass_d, `${location} DASS-D`, 0, 21),
      dass_a: readInteger(row.dass_a, `${location} DASS-A`, 0, 21),
      dass_s: readInteger(row.dass_s, `${location} DASS-S`, 0, 21),
      cd_risc: readInteger(row.cd_risc, `${location} CD-RISC`, 0, 40, { nullable: true }),
      grit: readInteger(row.grit, `${location} GRIT`, 0, 32, { nullable: true }),
    };
  });

  return {
    studentCount: studentIds.size,
    logs,
    assessments,
    report: {
      duplicateDailyRows,
      duplicateDailyKeyCount: duplicateDailyKeys.size,
      zeroBuddyRows,
      weekMismatchCount,
      emptyObservationCount,
      weeklyCommandLookupIgnored: true,
      commandSheetState: tables.Command.state ?? 'unknown',
      rawRowCounts: Object.fromEntries(
        Object.entries(tables).map(([name, table]) => [name, table.rows.length]),
      ),
    },
  };
}

function createSafeWorkbookProfile(tables) {
  const normalized = normalizeWorkbookTables(tables);
  const { logs, assessments } = normalized;
  const rate = field => logs.length === 0
    ? 0
    : logs.filter(record => record[field] !== null).length / logs.length;

  return {
    profileVersion: PROFILE_VERSION,
    schemaVersion: SCHEMA_VERSION,
    sourceShape: {
      studentCount: normalized.studentCount,
      mergedLogCount: logs.length,
      assessmentCount: assessments.length,
      assessmentWeeks: [...new Set(assessments.map(record => record.week))].sort((a, b) => a - b),
      rawRowCounts: normalized.report.rawRowCounts,
    },
    scoreDistributions: {
      self: histogram(logs.map(record => record.self)),
      buddy: histogram(logs.map(record => record.buddy)),
      command: histogram(logs.map(record => record.command)),
      physicalInjury: histogram(logs.map(record => record.physicalInjury)),
      dass_d: histogram(assessments.map(record => record.dass_d)),
      dass_a: histogram(assessments.map(record => record.dass_a)),
      dass_s: histogram(assessments.map(record => record.dass_s)),
      cd_risc: histogram(assessments.map(record => record.cd_risc)),
      grit: histogram(assessments.map(record => record.grit)),
    },
    observedRates: {
      self: rate('self'),
      buddy: rate('buddy'),
      command: rate('command'),
      physicalInjury: rate('physicalInjury'),
    },
    qualityReport: {
      duplicateDailyRows: normalized.report.duplicateDailyRows,
      duplicateDailyKeyCount: normalized.report.duplicateDailyKeyCount,
      zeroBuddyRowsTreatedAsMissing: normalized.report.zeroBuddyRows,
      weekMismatchRowsQuarantined: normalized.report.weekMismatchCount,
      emptyObservationsDropped: normalized.report.emptyObservationCount,
      weeklyCommandLookupIgnored: true,
      commandSheetState: normalized.report.commandSheetState,
    },
  };
}

function seedNumber(seed) {
  const text = String(seed);
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function createPrng(seed) {
  let state = seedNumber(seed);
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function weightedSample(distribution, random, fallbackValues) {
  const entries = Object.entries(distribution ?? {})
    .map(([value, count]) => [Number(value), Number(count)])
    .filter(([value, count]) => Number.isFinite(value) && Number.isFinite(count) && count > 0);
  const available = entries.length > 0
    ? entries
    : fallbackValues.map(value => [value, 1]);
  const total = available.reduce((sum, [, count]) => sum + count, 0);
  let point = random() * total;
  for (const [value, count] of available) {
    point -= count;
    if (point <= 0) return value;
  }
  return available.at(-1)[0];
}

function parseEndDate(endDate) {
  if (typeof endDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new TypeError('Demo end date must use YYYY-MM-DD');
  }
  const parsed = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== endDate) {
    throw new TypeError('Demo end date must be a valid calendar date');
  }
  return parsed;
}

function addUtcDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function observed(random, rate) {
  return random() < Math.min(1, Math.max(0, Number(rate) || 0));
}

function generateSyntheticDataset({
  profile = DEFAULT_PROFILE,
  studentCount = profile?.sourceShape?.studentCount,
  endDate,
  seed = 'sentinel-demo-v2',
} = {}) {
  if (!Number.isInteger(studentCount) || studentCount < 1 || studentCount > MAX_STUDENTS) {
    throw new RangeError(`Student count must be an integer from 1 to ${MAX_STUDENTS}`);
  }
  const trainingEnd = parseEndDate(endDate);
  const random = createPrng(seed);
  const distributions = profile?.scoreDistributions ?? DEFAULT_PROFILE.scoreDistributions;
  const rates = profile?.observedRates ?? DEFAULT_PROFILE.observedRates;
  const sourceLogCount = Number(profile?.sourceShape?.mergedLogCount);
  const observationsPerStudent = Number.isFinite(sourceLogCount) && sourceLogCount > 0
    ? Math.max(16, Math.min(32, Math.round(sourceLogCount / studentCount)))
    : 18;
  const trainingStart = addUtcDays(trainingEnd, -((TRAINING_WEEKS * 7) - 1));

  const students = Array.from({ length: studentCount }, (_, index) => {
    const sequence = String(index + 1).padStart(4, '0');
    const riskPoint = random();
    const baseline = riskPoint < 0.6 ? 'Low' : riskPoint < 0.88 ? 'Moderate' : 'High';
    return {
      id: `demo-${sequence}`,
      name: `Demo Participant ${sequence}`,
      room: `Demo Room ${String((index % 12) + 1).padStart(2, '0')}`,
      baseline,
      tag: baseline === 'High' ? 'priority' : baseline === 'Moderate' ? 'follow-up' : 'stable',
      demographics: {
        age: 18 + (index % 6),
        gender: index % 2 === 0 ? 'Demo A' : 'Demo B',
        region: `Demo Region ${(index % 5) + 1}`,
        school: `Demo School ${(index % 8) + 1}`,
        familyHistory: '',
        financialBurden: '',
        physicalIssueDetail: '',
        mentalIssueDetail: '',
        mentalSeverity: baseline === 'High' ? 3 : baseline === 'Moderate' ? 2 : 1,
      },
    };
  });

  const logs = [];
  for (const student of students) {
    for (let index = 0; index < observationsPerStudent; index += 1) {
      const dayOffset = observationsPerStudent === 1
        ? 0
        : Math.round((index * ((TRAINING_WEEKS * 7) - 1)) / (observationsPerStudent - 1));
      const date = addUtcDays(trainingStart, dayOffset).toISOString().slice(0, 10);
      const week = Math.min(TRAINING_WEEKS, Math.floor(dayOffset / 7) + 1);
      let self = observed(random, rates.self)
        ? weightedSample(distributions.self, random, [1, 2, 3, 4])
        : null;
      const buddy = observed(random, rates.buddy)
        ? weightedSample(distributions.buddy, random, [1, 2, 3, 4])
        : null;
      const command = observed(random, rates.command)
        ? weightedSample(distributions.command, random, [1, 2, 3, 4])
        : null;
      const physicalInjury = observed(random, rates.physicalInjury)
        ? weightedSample(distributions.physicalInjury, random, [1, 2, 3])
        : null;
      if ([self, buddy, command, physicalInjury].every(value => value === null)) {
        self = weightedSample(distributions.self, random, [1, 2, 3, 4]);
      }
      logs.push({
        id: `demo-log-${student.id.slice(5)}-${date}`,
        studentId: student.id,
        date,
        week,
        self,
        buddy,
        command,
        physicalInjury,
        selfObservedAt: self === null ? null : `${date}T00:00:00.000Z`,
      });
    }
  }

  const assessments = [];
  for (const student of students) {
    for (const week of ASSESSMENT_WEEKS) {
      const resilienceWeek = week !== 4;
      assessments.push({
        id: `demo-assessment-${student.id.slice(5)}-${week}`,
        studentId: student.id,
        week,
        dass_d: weightedSample(distributions.dass_d, random, [0, 5, 10, 15, 21]),
        dass_a: weightedSample(distributions.dass_a, random, [0, 5, 10, 15, 21]),
        dass_s: weightedSample(distributions.dass_s, random, [0, 5, 10, 15, 21]),
        cd_risc: resilienceWeek
          ? weightedSample(distributions.cd_risc, random, [0, 10, 20, 30, 40])
          : null,
        grit: resilienceWeek
          ? weightedSample(distributions.grit, random, [0, 8, 16, 24, 32])
          : null,
        drawing_note: '',
      });
    }
  }

  const dataset = {
    manifest: {
      schemaVersion: SCHEMA_VERSION,
      dataClassification: DATA_CLASSIFICATION,
    },
    streams: { students, logs, assessments },
  };
  validateSyntheticDataset(dataset);
  return dataset;
}

function assertScore(value, field, minimum, maximum, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${field} must be an integer from ${minimum} to ${maximum}`);
  }
}

function validateSyntheticDataset(dataset) {
  if (dataset?.manifest?.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Synthetic dataset schemaVersion must be ${SCHEMA_VERSION}`);
  }
  if (dataset?.manifest?.dataClassification !== DATA_CLASSIFICATION) {
    throw new Error('Synthetic dataset dataClassification must be synthetic');
  }
  for (const stream of ['students', 'logs', 'assessments']) {
    if (!Array.isArray(dataset?.streams?.[stream])) {
      throw new Error(`Synthetic dataset stream ${stream} must be an array`);
    }
  }

  const studentIds = new Set();
  for (const student of dataset.streams.students) {
    if (!/^demo-[0-9]{4}$/.test(student.id)) throw new Error('Every student ID must be demo-*');
    if (!/^Demo Participant [0-9]{4}$/.test(student.name)) {
      throw new Error('Every student name must be a generic demo name');
    }
    if (!/^Demo Room [0-9]{2}$/.test(student.room)) {
      throw new Error('Every room must be a generic demo room');
    }
    studentIds.add(student.id);
  }

  for (const log of dataset.streams.logs) {
    if (!/^demo-log-/.test(log.id)) throw new Error('Every log ID must be demo-*');
    if (!studentIds.has(log.studentId)) throw new Error(`Unknown log student ${log.studentId}`);
    assertScore(log.week, `${log.id}.week`, 1, 16);
    assertScore(log.self, `${log.id}.self`, 1, 4, { nullable: true });
    assertScore(log.buddy, `${log.id}.buddy`, 1, 4, { nullable: true });
    assertScore(log.command, `${log.id}.command`, 1, 4, { nullable: true });
    assertScore(log.physicalInjury, `${log.id}.physicalInjury`, 1, 3, { nullable: true });
    if ([log.self, log.buddy, log.command, log.physicalInjury].every(value => value === null)) {
      throw new Error(`${log.id} must contain at least one observed value`);
    }
    if (log.self === null && log.selfObservedAt !== null) {
      throw new Error(`${log.id}.selfObservedAt must be null when Self is missing`);
    }
    if (log.self !== null && !/^\d{4}-\d{2}-\d{2}T/.test(log.selfObservedAt)) {
      throw new Error(`${log.id}.selfObservedAt must be an ISO timestamp`);
    }
  }

  for (const assessment of dataset.streams.assessments) {
    if (!/^demo-assessment-/.test(assessment.id)) {
      throw new Error('Every assessment ID must be demo-*');
    }
    if (!studentIds.has(assessment.studentId)) {
      throw new Error(`Unknown assessment student ${assessment.studentId}`);
    }
    if (!ASSESSMENT_WEEKS.includes(assessment.week)) {
      throw new Error(`${assessment.id}.week must be 0, 4, 8, or 16`);
    }
    assertScore(assessment.dass_d, `${assessment.id}.dass_d`, 0, 21);
    assertScore(assessment.dass_a, `${assessment.id}.dass_a`, 0, 21);
    assertScore(assessment.dass_s, `${assessment.id}.dass_s`, 0, 21);
    assertScore(assessment.cd_risc, `${assessment.id}.cd_risc`, 0, 40, { nullable: true });
    assertScore(assessment.grit, `${assessment.id}.grit`, 0, 32, { nullable: true });
    if (assessment.week === 4 && (assessment.cd_risc !== null || assessment.grit !== null)) {
      throw new Error(`${assessment.id} must omit resilience scores at week 4`);
    }
  }
  return dataset;
}

export {
  ASSESSMENT_WEEKS,
  createPrng,
  createSafeWorkbookProfile,
  DATA_CLASSIFICATION,
  DEFAULT_PROFILE,
  generateSyntheticDataset,
  MAX_STUDENTS,
  normalizeHeader,
  normalizeIdentifier,
  normalizeWorkbookTables,
  PROFILE_VERSION,
  readTrustedWorkbook,
  resolveHeaderMap,
  SCHEMA_VERSION,
  unwrapExcelValue,
  validateSyntheticDataset,
  weightedSample,
  WORKBOOK_SCHEMA,
};
