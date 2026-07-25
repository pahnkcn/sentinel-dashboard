const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const UNSAFE_IDENTIFIERS = new Set(['__proto__', 'constructor', 'prototype']);
const ASSESSMENT_WEEKS = new Set([0, 4, 8, 16]);
const RESILIENCE_WEEKS = new Set([0, 8, 16]);

function invalid(field, message) {
  return { field, message };
}

function result(value, issues) {
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value };
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readIdentifier(value, field, issues) {
  if (
    typeof value !== 'string'
    || !IDENTIFIER_PATTERN.test(value)
    || UNSAFE_IDENTIFIERS.has(value)
  ) {
    issues.push(invalid(field, 'must be a safe non-empty identifier'));
    return '';
  }
  return value;
}

function readRecordId(documentId, data, issues) {
  const safeDocumentId = readIdentifier(documentId, 'documentId', issues);

  if (data.id === undefined || data.id === null) return safeDocumentId;

  const payloadId = readIdentifier(data.id, 'id', issues);
  if (safeDocumentId && payloadId && safeDocumentId !== payloadId) {
    issues.push(invalid('id', 'must match the Firestore document ID'));
  }
  return payloadId;
}

function readString(value, field, issues, { required = false, maxLength = 500 } = {}) {
  if (value === undefined || value === null) {
    if (required) issues.push(invalid(field, 'is required'));
    return '';
  }
  if (typeof value !== 'string') {
    issues.push(invalid(field, 'must be a string'));
    return '';
  }

  const normalized = value.trim();
  if (required && normalized.length === 0) {
    issues.push(invalid(field, 'is required'));
  }
  if (normalized.length > maxLength) {
    issues.push(invalid(field, `must be at most ${maxLength} characters`));
  }
  return normalized;
}

function readNumber(
  value,
  field,
  issues,
  { min, max, integer = false, nullable = false } = {},
) {
  if (value === undefined || value === null) {
    if (nullable) return null;
    issues.push(invalid(field, 'is required'));
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push(invalid(field, 'must be a finite number'));
    return null;
  }
  if (integer && !Number.isInteger(value)) {
    issues.push(invalid(field, 'must be an integer'));
  }
  if (value < min || value > max) {
    issues.push(invalid(field, `must be between ${min} and ${max}`));
  }
  return value;
}

function readOptionalInteger(value, field, issues, min, max) {
  if (value === undefined || value === null || value === '') return null;
  return readNumber(value, field, issues, { min, max, integer: true });
}

function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function readDate(value, field, issues) {
  if (!isCalendarDate(value)) {
    issues.push(invalid(field, 'must be a valid YYYY-MM-DD calendar date'));
    return '';
  }
  return value;
}

function startRecord(documentId, data) {
  const issues = [];
  if (!isPlainObject(data)) {
    return { issues: [invalid('document', 'must be a plain object')], id: '', data: null };
  }
  return { issues, id: readRecordId(documentId, data, issues), data };
}

export function decodeStudent({ documentId, data }) {
  const record = startRecord(documentId, data);
  if (!record.data) return { ok: false, issues: record.issues };

  const { issues } = record;
  const demographicsData = record.data.demographics;
  let demographics = {};

  if (demographicsData !== undefined && demographicsData !== null) {
    if (!isPlainObject(demographicsData)) {
      issues.push(invalid('demographics', 'must be a plain object'));
    } else {
      demographics = {
        age: readOptionalInteger(demographicsData.age, 'demographics.age', issues, 0, 120),
        gender: readString(demographicsData.gender, 'demographics.gender', issues, { maxLength: 50 }),
        region: readString(demographicsData.region, 'demographics.region', issues),
        school: readString(demographicsData.school, 'demographics.school', issues),
        familyHistory: readString(demographicsData.familyHistory, 'demographics.familyHistory', issues),
        financialBurden: readString(demographicsData.financialBurden, 'demographics.financialBurden', issues),
        physicalIssueDetail: readString(demographicsData.physicalIssueDetail, 'demographics.physicalIssueDetail', issues),
        mentalIssueDetail: readString(demographicsData.mentalIssueDetail, 'demographics.mentalIssueDetail', issues),
        mentalSeverity: readOptionalInteger(
          demographicsData.mentalSeverity,
          'demographics.mentalSeverity',
          issues,
          1,
          3,
        ),
      };
    }
  }

  return result({
    id: record.id,
    name: readString(record.data.name, 'name', issues, { required: true, maxLength: 200 }),
    room: readString(record.data.room, 'room', issues, { maxLength: 100 }),
    baseline: readString(record.data.baseline, 'baseline', issues, { maxLength: 100 }),
    tag: readString(record.data.tag, 'tag', issues, { maxLength: 100 }),
    demographics,
  }, issues);
}

export function decodeLog({ documentId, data }) {
  const record = startRecord(documentId, data);
  if (!record.data) return { ok: false, issues: record.issues };

  const { issues } = record;
  return result({
    id: record.id,
    studentId: readIdentifier(record.data.studentId, 'studentId', issues),
    date: readDate(record.data.date, 'date', issues),
    week: readNumber(record.data.week, 'week', issues, { min: 1, max: 16, integer: true }),
    self: readNumber(record.data.self, 'self', issues, { min: 1, max: 4, integer: true }),
    buddy: readNumber(record.data.buddy, 'buddy', issues, { min: 1, max: 4, integer: true, nullable: true }),
    command: readNumber(record.data.command, 'command', issues, { min: 1, max: 4, integer: true, nullable: true }),
    physicalInjury: readNumber(record.data.physicalInjury, 'physicalInjury', issues, {
      min: 1,
      max: 3,
      integer: true,
    }),
  }, issues);
}

export function decodeAssessment({ documentId, data }) {
  const record = startRecord(documentId, data);
  if (!record.data) return { ok: false, issues: record.issues };

  const { issues } = record;
  const week = readNumber(record.data.week, 'week', issues, { min: 0, max: 16, integer: true });
  if (week !== null && !ASSESSMENT_WEEKS.has(week)) {
    issues.push(invalid('week', 'must be one of 0, 4, 8, or 16'));
  }
  const resilienceRequired = RESILIENCE_WEEKS.has(week);
  const cdRisc = readNumber(record.data.cd_risc, 'cd_risc', issues, {
    min: 0,
    max: 40,
    nullable: !resilienceRequired,
  });
  const grit = readNumber(record.data.grit, 'grit', issues, {
    min: 0,
    max: 32,
    nullable: !resilienceRequired,
  });

  if (week !== null && !RESILIENCE_WEEKS.has(week)) {
    if (cdRisc !== null) {
      issues.push(invalid('cd_risc', 'is only scheduled for weeks 0, 8, and 16'));
    }
    if (grit !== null) {
      issues.push(invalid('grit', 'is only scheduled for weeks 0, 8, and 16'));
    }
  }

  return result({
    id: record.id,
    studentId: readIdentifier(record.data.studentId, 'studentId', issues),
    week,
    dass_d: readNumber(record.data.dass_d, 'dass_d', issues, { min: 1, max: 5 }),
    dass_a: readNumber(record.data.dass_a, 'dass_a', issues, { min: 1, max: 5 }),
    dass_s: readNumber(record.data.dass_s, 'dass_s', issues, { min: 1, max: 5 }),
    cd_risc: cdRisc,
    grit,
    drawing_note: readString(record.data.drawing_note, 'drawing_note', issues, { maxLength: 2000 }),
  }, issues);
}
