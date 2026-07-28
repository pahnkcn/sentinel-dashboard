import { isSupportedOpenRouterModel } from './chatModels.js';

const MAX_REQUEST_BYTES = 64_000;
const MAX_UTTERANCE_LENGTH = 3_000;
const MAX_MEMORY_TEXT_LENGTH = 500;
const MAX_RECENT_TURNS = 2;
const MAX_METRIC_ITEMS = 16;
const MAX_POINTS_PER_METRIC = 16;

const INTENTS = new Set([
  'general',
  'overview',
  'room',
  'individual',
  'comparison',
  'ranking',
  'prediction',
]);
const METRICS = new Set([
  'total_students',
  'observed_students',
  'concern_count',
  'physical_concern_count',
  'alert_red3',
  'alert_red_self_plus',
  'psychiatric_care',
  'self',
  'buddy',
  'command',
  'physical_injury',
  'mental_severity',
  'depression',
  'anxiety',
  'stress',
  'cd_risc',
  'grit',
  'self_forecast',
  'buddy_forecast',
  'command_forecast',
  'depression_forecast',
  'anxiety_forecast',
  'stress_forecast',
]);
const BASE_METRICS = new Set([...METRICS].filter(metric => !metric.endsWith('_forecast')));
const ANALYSIS_OPERATIONS = new Set([
  'summarize',
  'lookup',
  'compare',
  'rank',
  'trend',
  'forecast',
  'count',
]);
const ANALYSIS_SCOPES = new Set(['overview', 'subject', 'room']);
const ANALYSIS_STATISTICS = new Set([
  'latest',
  'mean',
  'change',
  'trend',
  'forecast',
  'count',
  'priority',
]);
const TIME_MODES = new Set([
  'latest',
  'available_range',
  'week_windows',
  'recent_vs_previous',
  'forecast_horizon',
]);
const RANKING_DIRECTIONS = new Set(['asc', 'desc', 'risk_first']);
const OUTPUT_MODES = new Set(['auto', 'narrative', 'table', 'chart', 'chart_table']);
const REFERENT_STATUSES = new Set(['none', 'resolved', 'ambiguous']);
const METRIC_RANGES = Object.freeze({
  total_students: [0, 250],
  observed_students: [0, 250],
  concern_count: [0, 250],
  physical_concern_count: [0, 250],
  alert_red3: [0, 250],
  alert_red_self_plus: [0, 250],
  psychiatric_care: [0, 250],
  self: [1, 4],
  buddy: [1, 4],
  command: [1, 4],
  physical_injury: [1, 3],
  mental_severity: [1, 3],
  depression: [0, 21],
  anxiety: [0, 21],
  stress: [0, 21],
  cd_risc: [0, 40],
  grit: [0, 32],
  self_forecast: [1, 4],
  buddy_forecast: [1, 4],
  command_forecast: [1, 4],
  depression_forecast: [0, 21],
  anxiety_forecast: [0, 21],
  stress_forecast: [0, 21],
});
const OMITTED_FIELDS = new Set([
  'names',
  'student-ids',
  'room-names',
  'demographics',
  'free-text-notes',
  'raw-records',
  'full-transcript',
  'unrequested-metrics',
  'small-groups',
]);
const CONSTRAINTS = new Set([
  'verified-data-only',
  'observed-values-only',
  'carried-forward-is-not-new',
  'decision-support-only',
  'prediction-is-exploratory',
  'prediction-ordinary-least-squares',
  'insufficient-small-group',
]);
const TOP_LEVEL_KEYS = new Set([
  'model',
  'utterance',
  'conversationState',
  'analysisRequest',
  'evidence',
]);
const STATE_KEYS = new Set([
  'topic',
  'subjectAliases',
  'roomAliases',
  'metrics',
  'dateRange',
  'lastEvidenceId',
  'recentTurns',
]);
const EVIDENCE_KEYS = new Set([
  'schemaVersion',
  'intent',
  'source',
  'metrics',
  'subjects',
  'rooms',
  'coverage',
  'constraints',
  'disclosure',
]);
const METRIC_KEYS = new Set([
  'metric',
  'value',
  'date',
  'week',
  'carriedForward',
  'rank',
  'points',
  'sampleSize',
]);
const POINT_KEYS = new Set(['date', 'week', 'value', 'carriedForward', 'sampleSize']);
const ANALYSIS_REQUEST_KEYS = new Set([
  'operation',
  'scope',
  'metrics',
  'statistic',
  'time',
  'ranking',
  'output',
  'explain',
  'referent',
]);
const ANALYSIS_TIME_KEYS = new Set(['mode', 'windows']);
const ANALYSIS_WINDOW_KEYS = new Set(['fromWeek', 'toWeek']);
const ANALYSIS_RANKING_KEYS = new Set(['direction', 'limit']);
const ANALYSIS_REFERENT_KEYS = new Set(['status', 'resolvedFromPrevious']);
const SOURCE_KEYS = new Set([
  'evidenceId',
  'datasetVersion',
  'verifiedAt',
  'asOfDate',
  'latestObservationDate',
]);
const COVERAGE_KEYS = new Set([
  'from',
  'to',
  'totalSubjects',
  'includedSubjects',
  'observedPoints',
]);

const PERSON_ALIAS = /^\[\[P[1-9]\d{0,2}\]\]$/u;
const ROOM_ALIAS = /^\[\[R[1-9]\d{0,2}\]\]$/u;
const EVIDENCE_ID = /^E[1-9]\d{0,7}$/u;
const DATASET_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const ISO_DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const PHONE_PATTERN = /(?<!\d)(?:\+?66|0)[\s().-]*\d(?:[\s().-]*\d){7,10}(?!\d)/u;
const NATIONAL_ID_PATTERN = /(?<!\d)\d(?:[ -]?\d){12}(?!\d)/u;
const RAW_NOTE_PATTERN = /(?:drawing[ _-]?note|clinical[ _-]?note|บันทึก(?:การรักษา|สุขภาพ|ส่วนตัว)?|ประวัติครอบครัว|ภาระการเงิน)\s*[:=]/iu;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value, allowed) {
  return isObject(value) && Object.keys(value).every(key => allowed.has(key));
}

function hasExactKeys(value, allowed) {
  return hasOnlyKeys(value, allowed) && Object.keys(value).length === allowed.size;
}

function replaceControlCharacters(value) {
  return [...value].map(character => {
    const code = character.charCodeAt(0);
    return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127
      ? ' '
      : character;
  }).join('');
}

function boundedString(value, maxLength) {
  if (typeof value !== 'string') return null;
  const text = replaceControlCharacters(value.normalize('NFKC')).trim();
  return text && text.length <= maxLength ? text : null;
}

function boundedInteger(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function finiteValue(value) {
  return value === null || Number.isFinite(value) ? value : undefined;
}

function uniqueStrings(value, { maxItems, pattern, allowed } = {}) {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const normalized = [];
  for (const item of value) {
    const text = boundedString(item, 80);
    if (!text || (pattern && !pattern.test(text)) || (allowed && !allowed.has(text))) return null;
    if (!normalized.includes(text)) normalized.push(text);
  }
  return normalized;
}

function nullableDate(value) {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' && ISO_DATE.test(value) ? value : undefined;
}

function isAllowedMetricValue(metric, value) {
  if (value === null) return true;
  const [minimum, maximum] = METRIC_RANGES[metric];
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function normalizePoint(point, metric) {
  if (!hasOnlyKeys(point, POINT_KEYS)) return null;
  const value = finiteValue(point.value);
  if (value === undefined || !isAllowedMetricValue(metric, value)) return null;
  const date = nullableDate(point.date);
  if (date === undefined) return null;
  const week = point.week === undefined
    ? null
    : boundedInteger(point.week, 0, 99);
  if (point.week !== undefined && week === null) return null;
  if (date === null && week === null) return null;
  if (point.carriedForward !== undefined && typeof point.carriedForward !== 'boolean') return null;
  const sampleSize = point.sampleSize === undefined
    ? null
    : boundedInteger(point.sampleSize, 5, 250);
  if (point.sampleSize !== undefined && sampleSize === null) return null;

  return {
    ...(date ? { date } : {}),
    ...(week !== null ? { week } : {}),
    value,
    ...(point.carriedForward === true ? { carriedForward: true } : {}),
    ...(sampleSize !== null ? { sampleSize } : {}),
  };
}

function normalizeMetric(item) {
  if (!hasOnlyKeys(item, METRIC_KEYS) || !METRICS.has(item.metric)) return null;
  const date = nullableDate(item.date);
  if (date === undefined) return null;
  const week = item.week === undefined ? null : boundedInteger(item.week, 0, 99);
  if (item.week !== undefined && week === null) return null;
  const rank = item.rank === undefined ? null : boundedInteger(item.rank, 1, 5);
  if (item.rank !== undefined && rank === null) return null;
  if (item.carriedForward !== undefined && typeof item.carriedForward !== 'boolean') return null;
  const sampleSize = item.sampleSize === undefined
    ? null
    : boundedInteger(item.sampleSize, 5, 250);
  if (item.sampleSize !== undefined && sampleSize === null) return null;

  const hasValue = Object.hasOwn(item, 'value');
  const value = hasValue ? finiteValue(item.value) : undefined;
  if (hasValue && value === undefined) return null;
  let points;
  if (item.points !== undefined) {
    if (!Array.isArray(item.points) || item.points.length === 0 || item.points.length > MAX_POINTS_PER_METRIC) {
      return null;
    }
    points = item.points.map(point => normalizePoint(point, item.metric));
    if (points.some(point => point === null)) return null;
  }
  if (hasValue === Boolean(points)) return null;
  if (hasValue && !isAllowedMetricValue(item.metric, value)) return null;

  return {
    metric: item.metric,
    ...(hasValue ? { value } : { points }),
    ...(date ? { date } : {}),
    ...(week !== null ? { week } : {}),
    ...(item.carriedForward === true ? { carriedForward: true } : {}),
    ...(rank !== null ? { rank } : {}),
    ...(sampleSize !== null ? { sampleSize } : {}),
  };
}

function normalizeMetrics(value, maxItems = MAX_METRIC_ITEMS) {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const metrics = value.map(normalizeMetric);
  if (metrics.some(metric => metric === null)) return null;
  const seen = new Set();
  for (const metric of metrics) {
    if (seen.has(metric.metric)) return null;
    seen.add(metric.metric);
  }
  return metrics;
}

function normalizeSource(source) {
  if (!hasOnlyKeys(source, SOURCE_KEYS)) return null;
  const datasetVersion = boundedString(source.datasetVersion, 128);
  if (!datasetVersion || !DATASET_VERSION.test(datasetVersion)) return null;
  const evidenceId = boundedString(source.evidenceId, 10);
  if (!evidenceId || !EVIDENCE_ID.test(evidenceId)) return null;
  if (typeof source.verifiedAt !== 'string' || !ISO_INSTANT.test(source.verifiedAt)) return null;
  const asOfDate = nullableDate(source.asOfDate);
  const latestObservationDate = nullableDate(source.latestObservationDate);
  if (asOfDate === undefined || latestObservationDate === undefined) return null;
  return {
    evidenceId,
    datasetVersion,
    verifiedAt: source.verifiedAt,
    asOfDate,
    latestObservationDate,
  };
}

function normalizeCoverage(coverage) {
  if (!hasOnlyKeys(coverage, COVERAGE_KEYS)) return null;
  const from = nullableDate(coverage.from);
  const to = nullableDate(coverage.to);
  if (from === undefined || to === undefined) return null;
  const totalSubjects = boundedInteger(coverage.totalSubjects, 0, 250);
  const includedSubjects = boundedInteger(coverage.includedSubjects, 0, 5);
  const observedPoints = boundedInteger(coverage.observedPoints, 0, 256);
  if (totalSubjects === null || includedSubjects === null || observedPoints === null) return null;
  if (includedSubjects > totalSubjects) return null;
  return { from, to, totalSubjects, includedSubjects, observedPoints };
}

function normalizeEntityList(value, { kind, maxItems }) {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const pattern = kind === 'subject' ? PERSON_ALIAS : ROOM_ALIAS;
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const allowedKeys = kind === 'subject'
      ? new Set(['alias', 'metrics'])
      : new Set(['alias', 'sampleSize', 'metrics']);
    if (!hasOnlyKeys(item, allowedKeys) || !pattern.test(item.alias) || seen.has(item.alias)) return null;
    const metrics = normalizeMetrics(item.metrics, kind === 'subject' ? 13 : 8);
    if (!metrics) return null;
    const normalized = { alias: item.alias, metrics };
    if (kind === 'room') {
      const sampleSize = boundedInteger(item.sampleSize, 5, 250);
      if (sampleSize === null) return null;
      normalized.sampleSize = sampleSize;
    }
    seen.add(item.alias);
    result.push(normalized);
  }
  return result;
}

function normalizeDisclosure(value) {
  if (!hasOnlyKeys(value, new Set(['mode', 'omittedFields'])) || value.mode !== 'deidentified') return null;
  const omittedFields = uniqueStrings(value.omittedFields, {
    maxItems: OMITTED_FIELDS.size,
    allowed: OMITTED_FIELDS,
  });
  return omittedFields ? { mode: 'deidentified', omittedFields } : null;
}

export function normalizeConversationState(value) {
  if (!hasOnlyKeys(value, STATE_KEYS)) return null;
  const topic = value.topic === null ? null : boundedString(value.topic, 40);
  if (topic !== null && !INTENTS.has(topic)) return null;
  const subjectAliases = uniqueStrings(value.subjectAliases, { maxItems: 5, pattern: PERSON_ALIAS });
  const roomAliases = uniqueStrings(value.roomAliases, { maxItems: 5, pattern: ROOM_ALIAS });
  const metrics = uniqueStrings(value.metrics, { maxItems: 10, allowed: METRICS });
  if (!subjectAliases || !roomAliases || !metrics) return null;
  let dateRange = null;
  if (value.dateRange !== null) {
    if (!hasOnlyKeys(value.dateRange, new Set(['from', 'to']))) return null;
    const from = nullableDate(value.dateRange.from);
    const to = nullableDate(value.dateRange.to);
    if (from === undefined || to === undefined || !from || !to || from > to) return null;
    dateRange = { from, to };
  }
  const lastEvidenceId = value.lastEvidenceId === null
    ? null
    : boundedString(value.lastEvidenceId, 10);
  if (lastEvidenceId !== null && !EVIDENCE_ID.test(lastEvidenceId)) return null;
  if (!Array.isArray(value.recentTurns) || value.recentTurns.length > MAX_RECENT_TURNS) return null;
  const recentTurns = [];
  for (const turn of value.recentTurns) {
    if (!hasOnlyKeys(turn, new Set(['utterance', 'answer']))) return null;
    const utterance = boundedString(turn.utterance, MAX_MEMORY_TEXT_LENGTH);
    const answer = boundedString(turn.answer, MAX_MEMORY_TEXT_LENGTH);
    if (!utterance || !answer) return null;
    recentTurns.push({ utterance, answer });
  }
  return {
    topic,
    subjectAliases,
    roomAliases,
    metrics,
    dateRange,
    lastEvidenceId,
    recentTurns,
  };
}

export function normalizeAnalysisRequest(value) {
  if (!hasExactKeys(value, ANALYSIS_REQUEST_KEYS)) return null;
  if (!ANALYSIS_OPERATIONS.has(value.operation) || !ANALYSIS_SCOPES.has(value.scope)) {
    return null;
  }
  if (!ANALYSIS_STATISTICS.has(value.statistic) || !OUTPUT_MODES.has(value.output)) {
    return null;
  }
  if (typeof value.explain !== 'boolean') return null;

  const metrics = uniqueStrings(value.metrics, { maxItems: 10, allowed: BASE_METRICS });
  if (!metrics || metrics.length === 0) return null;

  if (!hasExactKeys(value.time, ANALYSIS_TIME_KEYS) || !TIME_MODES.has(value.time.mode)) {
    return null;
  }
  if (!Array.isArray(value.time.windows) || value.time.windows.length > 2) return null;
  const windows = [];
  for (const window of value.time.windows) {
    if (!hasExactKeys(window, ANALYSIS_WINDOW_KEYS)) return null;
    const fromWeek = boundedInteger(window.fromWeek, 0, 99);
    const toWeek = boundedInteger(window.toWeek, 0, 99);
    if (fromWeek === null || toWeek === null || fromWeek > toWeek) return null;
    windows.push({ fromWeek, toWeek });
  }
  if (value.time.mode === 'week_windows' && windows.length === 0) return null;
  if (value.time.mode === 'recent_vs_previous' && windows.length !== 2) return null;
  if (['latest', 'available_range'].includes(value.time.mode) && windows.length !== 0) {
    return null;
  }
  if (value.time.mode === 'forecast_horizon' && windows.length > 1) {
    return null;
  }

  let ranking = null;
  if (value.ranking !== null) {
    if (!hasExactKeys(value.ranking, ANALYSIS_RANKING_KEYS)) return null;
    if (!RANKING_DIRECTIONS.has(value.ranking.direction)) return null;
    const limit = boundedInteger(value.ranking.limit, 1, 5);
    if (limit === null) return null;
    ranking = { direction: value.ranking.direction, limit };
  }
  if ((value.operation === 'rank') !== (ranking !== null)) return null;

  if (!hasExactKeys(value.referent, ANALYSIS_REFERENT_KEYS)) return null;
  if (!REFERENT_STATUSES.has(value.referent.status)) return null;
  if (typeof value.referent.resolvedFromPrevious !== 'boolean') return null;
  if (value.referent.resolvedFromPrevious && value.referent.status !== 'resolved') return null;
  if (value.referent.status === 'none' && value.referent.resolvedFromPrevious) return null;

  return {
    operation: value.operation,
    scope: value.scope,
    metrics,
    statistic: value.statistic,
    time: { mode: value.time.mode, windows },
    ranking,
    output: value.output,
    explain: value.explain,
    referent: {
      status: value.referent.status,
      resolvedFromPrevious: value.referent.resolvedFromPrevious,
    },
  };
}

export function validateEvidenceEnvelope(value) {
  if (!hasOnlyKeys(value, EVIDENCE_KEYS) || value.schemaVersion !== 1 || !INTENTS.has(value.intent)) {
    return { ok: false, code: 'invalid-evidence' };
  }
  const source = normalizeSource(value.source);
  const metrics = normalizeMetrics(value.metrics);
  const subjects = normalizeEntityList(value.subjects, { kind: 'subject', maxItems: 5 });
  const rooms = normalizeEntityList(value.rooms, { kind: 'room', maxItems: 5 });
  const coverage = normalizeCoverage(value.coverage);
  const constraints = uniqueStrings(value.constraints, { maxItems: CONSTRAINTS.size, allowed: CONSTRAINTS });
  const disclosure = normalizeDisclosure(value.disclosure);
  if (!source || !metrics || !subjects || !rooms || !coverage || !constraints || !disclosure) {
    return { ok: false, code: 'invalid-evidence' };
  }
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      intent: value.intent,
      source,
      metrics,
      subjects,
      rooms,
      coverage,
      constraints,
      disclosure,
    },
  };
}

function pointCount(evidence) {
  const allMetrics = [
    ...evidence.metrics,
    ...evidence.subjects.flatMap(subject => subject.metrics),
    ...evidence.rooms.flatMap(room => room.metrics),
  ];
  return allMetrics.reduce((total, metric) => total + (metric.points?.length ?? 1), 0);
}

export function enforcePrivacyBudget(evidence) {
  const subjectLimit = evidence.intent === 'ranking'
    ? 5
    : evidence.intent === 'comparison'
      ? 3
      : evidence.intent === 'individual' || evidence.intent === 'prediction'
        ? 1
        : 0;
  if (evidence.subjects.length > subjectLimit) return { ok: false, code: 'privacy-budget-exceeded' };
  if (evidence.rooms.length > 0 && evidence.intent !== 'room') {
    return { ok: false, code: 'privacy-budget-exceeded' };
  }
  if (evidence.intent === 'room' && (
    evidence.rooms.length > 5
    || evidence.subjects.length > 0
    || evidence.metrics.length > 0
  )) {
    return { ok: false, code: 'privacy-budget-exceeded' };
  }
  if (evidence.metrics.length > 0 && !['overview', 'prediction'].includes(evidence.intent)) {
    return { ok: false, code: 'privacy-budget-exceeded' };
  }
  if (evidence.subjects.length > 0 && !['individual', 'comparison', 'ranking', 'prediction'].includes(evidence.intent)) {
    return { ok: false, code: 'privacy-budget-exceeded' };
  }
  if (evidence.intent === 'prediction' && evidence.metrics.length > 0 && evidence.subjects.length > 0) {
    return { ok: false, code: 'privacy-budget-exceeded' };
  }
  const observedPoints = pointCount(evidence);
  if (observedPoints > 64) return { ok: false, code: 'privacy-budget-exceeded' };
  if (evidence.coverage.includedSubjects !== evidence.subjects.length) {
    return { ok: false, code: 'privacy-budget-exceeded' };
  }
  if (evidence.coverage.observedPoints !== observedPoints) {
    return { ok: false, code: 'privacy-budget-exceeded' };
  }
  return { ok: true };
}

function evidenceMetricIds(evidence) {
  return new Set([
    ...evidence.metrics,
    ...evidence.subjects.flatMap(subject => subject.metrics),
    ...evidence.rooms.flatMap(room => room.metrics),
  ].map(metric => metric.metric));
}

function validateAnalysisEvidenceConsistency(analysisRequest, evidence) {
  const hasSubjects = evidence.subjects.length > 0;
  const hasRooms = evidence.rooms.length > 0;
  const smallGroupSuppressed = evidence.intent === 'room'
    && evidence.constraints.includes('insufficient-small-group')
    && !hasRooms
    && !hasSubjects;
  if (
    (analysisRequest.scope === 'overview' && (hasSubjects || hasRooms))
    || (analysisRequest.scope === 'subject' && (!hasSubjects || hasRooms))
    || (analysisRequest.scope === 'room' && ((!hasRooms && !smallGroupSuppressed) || hasSubjects))
  ) {
    return { ok: false, code: 'invalid-analysis-request' };
  }
  if (analysisRequest.operation === 'forecast' && evidence.intent !== 'prediction') {
    return { ok: false, code: 'invalid-analysis-request' };
  }
  if (
    analysisRequest.operation === 'rank'
    && analysisRequest.scope === 'subject'
    && evidence.intent !== 'ranking'
  ) {
    return { ok: false, code: 'invalid-analysis-request' };
  }
  if (
    analysisRequest.operation === 'rank'
    && analysisRequest.scope === 'room'
    && evidence.intent !== 'room'
  ) {
    return { ok: false, code: 'invalid-analysis-request' };
  }

  const represented = evidenceMetricIds(evidence);
  const noDisclosedEvidence = represented.size === 0 && evidence.coverage.observedPoints === 0;
  const forecastOperation = analysisRequest.operation === 'forecast';
  const allowedMetrics = new Set(analysisRequest.metrics.flatMap(metric => (
    forecastOperation ? [metric, `${metric}_forecast`] : [metric]
  )));
  const unexpectedMetric = [...represented].some(metric => !allowedMetrics.has(metric));
  const missingMetric = !smallGroupSuppressed && !noDisclosedEvidence
    && analysisRequest.metrics.some(metric => (
      forecastOperation
        ? !represented.has(metric) && !represented.has(`${metric}_forecast`)
        : !represented.has(metric)
    ));
  return missingMetric || unexpectedMetric
    ? { ok: false, code: 'invalid-analysis-request' }
    : { ok: true };
}

export function scanForSensitiveData(value) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  if (
    EMAIL_PATTERN.test(serialized)
    || PHONE_PATTERN.test(serialized)
    || NATIONAL_ID_PATTERN.test(serialized)
    || RAW_NOTE_PATTERN.test(serialized)
  ) {
    return { ok: false, code: 'privacy-sensitive-data' };
  }
  return { ok: true };
}

export function validatePrivacyChatRequest(body) {
  if (!hasOnlyKeys(body, TOP_LEVEL_KEYS)) return { ok: false, code: 'invalid-body' };
  const serialized = JSON.stringify(body);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_REQUEST_BYTES) {
    return { ok: false, code: 'privacy-budget-exceeded' };
  }
  const model = boundedString(body.model, 120);
  if (!model || !isSupportedOpenRouterModel(model)) return { ok: false, code: 'unsupported-model' };
  const utterance = boundedString(body.utterance, MAX_UTTERANCE_LENGTH);
  if (!utterance) return { ok: false, code: 'invalid-utterance' };
  const conversationState = normalizeConversationState(body.conversationState);
  if (!conversationState) return { ok: false, code: 'invalid-conversation-state' };
  const analysisRequest = normalizeAnalysisRequest(body.analysisRequest);
  if (!analysisRequest) return { ok: false, code: 'invalid-analysis-request' };
  const evidence = validateEvidenceEnvelope(body.evidence);
  if (!evidence.ok) return evidence;
  const budget = enforcePrivacyBudget(evidence.value);
  if (!budget.ok) return budget;
  const consistent = validateAnalysisEvidenceConsistency(analysisRequest, evidence.value);
  if (!consistent.ok) return consistent;
  const sensitive = scanForSensitiveData({
    utterance,
    conversationState,
    analysisRequest,
    evidence: evidence.value,
  });
  if (!sensitive.ok) return sensitive;
  return {
    ok: true,
    value: {
      model,
      utterance,
      conversationState,
      analysisRequest,
      evidence: evidence.value,
    },
  };
}

function createProviderAliasCodec(request) {
  const entries = [
    ...request.evidence.subjects.map((subject, index) => [
      subject.alias,
      `[[SUBJECT_ALIAS_${index + 1}]]`,
    ]),
    ...request.evidence.rooms.map((room, index) => [
      room.alias,
      `[[GROUP_ALIAS_${index + 1}]]`,
    ]),
  ];
  const transform = (value, transformText) => {
    if (typeof value === 'string') {
      return transformText(value);
    }
    if (Array.isArray(value)) return value.map(item => transform(item, transformText));
    if (isObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, transform(item, transformText)]),
      );
    }
    return value;
  };
  const replacePairs = (text, pairs) => pairs.reduce(
    (current, [from, to]) => current.replaceAll(from, to),
    text,
  );
  const decodeText = value => {
    const canonicalized = value
      .replace(
        /\[\[(?:[A-Z]+_)*SUBJECT_ALIAS_(\d+)\]\]/gu,
        (_match, index) => `[[SUBJECT_ALIAS_${index}]]`,
      )
      .replace(
        /\[\[(?:[A-Z]+_)*GROUP_ALIAS_(\d+)\]\]/gu,
        (_match, index) => `[[GROUP_ALIAS_${index}]]`,
      );
    return replacePairs(
      canonicalized,
      entries.map(([local, provider]) => [provider, local]),
    )
      .replace(/\[\[SUBJECT_ALIAS_\d+\]\]/gu, 'บุคคลที่ไม่เปิดเผย')
      .replace(/\[\[GROUP_ALIAS_\d+\]\]/gu, 'กลุ่มที่ไม่เปิดเผย');
  };
  return {
    encode: value => transform(value, text => replacePairs(text, entries)),
    decode: value => transform(value, decodeText),
  };
}

function roundDerived(value, decimals = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function summarizeTrend(points, window = null) {
  const observed = points
    .map((point, index) => ({ ...point, index }))
    .filter(point => Number.isFinite(point.value) && point.carriedForward !== true)
    .filter(point => !window || (
      Number.isInteger(point.week)
      && point.week >= window.fromWeek
      && point.week <= window.toWeek
    ));
  const usesWeeks = observed.length > 0 && observed.every(point => Number.isInteger(point.week));
  const usesDates = !usesWeeks
    && observed.length > 0
    && observed.every(point => typeof point.date === 'string');
  const positioned = observed.map(point => ({
    ...point,
    x: usesWeeks
      ? point.week
      : usesDates ? Date.parse(`${point.date}T00:00:00.000Z`) / (7 * 24 * 60 * 60 * 1_000) : null,
  }));
  if (usesWeeks || usesDates) {
    positioned.sort((left, right) => left.x - right.x || left.index - right.index);
  }

  const first = positioned.at(0)?.value;
  const last = positioned.at(-1)?.value;
  const mean = positioned.length > 0
    ? positioned.reduce((sum, point) => sum + point.value, 0) / positioned.length
    : null;
  let slopePerWeek = null;
  if (positioned.length >= 2 && positioned.every(point => Number.isFinite(point.x))) {
    const xMean = positioned.reduce((sum, point) => sum + point.x, 0) / positioned.length;
    const yMean = positioned.reduce((sum, point) => sum + point.value, 0) / positioned.length;
    const denominator = positioned.reduce(
      (sum, point) => sum + ((point.x - xMean) ** 2),
      0,
    );
    if (denominator > 0) {
      slopePerWeek = positioned.reduce(
        (sum, point) => sum + ((point.x - xMean) * (point.value - yMean)),
        0,
      ) / denominator;
    }
  }

  return {
    first: Number.isFinite(first) ? roundDerived(first) : null,
    last: Number.isFinite(last) ? roundDerived(last) : null,
    min: positioned.length > 0 ? roundDerived(Math.min(...positioned.map(point => point.value))) : null,
    max: positioned.length > 0 ? roundDerived(Math.max(...positioned.map(point => point.value))) : null,
    mean: roundDerived(mean),
    change: positioned.length >= 2 ? roundDerived(last - first) : null,
    slopePerWeek: roundDerived(slopePerWeek, 4),
    fromWeek: window?.fromWeek ?? (usesWeeks ? positioned.at(0)?.week ?? null : null),
    toWeek: window?.toWeek ?? (usesWeeks ? positioned.at(-1)?.week ?? null : null),
    observedPoints: positioned.length,
  };
}

function addProviderDerivedMetrics(metrics, windows, { derivedOnly = false } = {}) {
  return metrics.map(metric => {
    if (!Array.isArray(metric.points)) return metric;
    const derived = {
      trend: summarizeTrend(metric.points),
      windowSummaries: windows.map(window => summarizeTrend(metric.points, window)),
    };
    if (derivedOnly) {
      const metadata = Object.fromEntries(
        Object.entries(metric).filter(([key]) => key !== 'points'),
      );
      return { ...metadata, derived };
    }
    return {
      ...metric,
      derived,
    };
  });
}

export function buildProviderMessages({ systemPrompt, request }) {
  const requestedMetrics = [...new Set([
    ...request.evidence.metrics.map(metric => metric.metric),
    ...request.evidence.subjects.flatMap(subject => subject.metrics.map(metric => metric.metric)),
    ...request.evidence.rooms.flatMap(room => room.metrics.map(metric => metric.metric)),
  ])];
  const codec = createProviderAliasCodec(request);
  const windows = request.analysisRequest.time.windows;
  const derivedOnly = request.analysisRequest.operation === 'summarize';
  const semanticState = codec.encode({
    topic: request.evidence.intent,
    subjectAliases: request.evidence.subjects.map(subject => subject.alias),
    roomAliases: request.evidence.rooms.map(room => room.alias),
    metrics: requestedMetrics,
    dateRange: {
      from: request.evidence.coverage.from,
      to: request.evidence.coverage.to,
    },
  });
  const providerEvidence = codec.encode({
    schemaVersion: request.evidence.schemaVersion,
    intent: request.evidence.intent,
    source: {
      verifiedAt: request.evidence.source.verifiedAt,
      asOfDate: request.evidence.source.asOfDate,
      latestObservationDate: request.evidence.source.latestObservationDate,
    },
    metrics: addProviderDerivedMetrics(request.evidence.metrics, windows, { derivedOnly }),
    subjects: request.evidence.subjects.map(subject => ({
      ...subject,
      metrics: addProviderDerivedMetrics(subject.metrics, windows, { derivedOnly }),
    })),
    rooms: request.evidence.rooms.map(room => ({
      ...room,
      metrics: addProviderDerivedMetrics(room.metrics, windows, { derivedOnly }),
    })),
    coverage: {
      from: request.evidence.coverage.from,
      to: request.evidence.coverage.to,
      populationSize: request.evidence.coverage.totalSubjects,
      disclosedSubjectAliases: request.evidence.coverage.includedSubjects,
      observedPoints: request.evidence.coverage.observedPoints,
    },
    constraints: request.evidence.constraints,
  });
  const canonicalRequest = codec.encode(request.analysisRequest);
  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'system',
      content: `SEMANTIC_CONVERSATION_STATE\n${JSON.stringify(semanticState)}`,
    },
    {
      role: 'system',
      content: `MINIMIZED_EVIDENCE\n${JSON.stringify(providerEvidence)}`,
    },
    { role: 'user', content: `ANALYSIS_REQUEST\n${JSON.stringify(canonicalRequest)}` },
  ];
  const sensitive = scanForSensitiveData(messages);
  if (!sensitive.ok) {
    throw Object.assign(new Error('provider-payload-blocked'), { publicCode: sensitive.code });
  }
  return messages;
}

export function restoreProviderAliases(payload, request) {
  return createProviderAliasCodec(request).decode(payload);
}

const REFERENCE_SUMMARY_KEYS = Object.freeze([
  'first',
  'last',
  'min',
  'max',
  'mean',
  'change',
  'slopePerWeek',
  'fromWeek',
  'toWeek',
  'observedPoints',
]);

function referenceSummary(value) {
  if (!isObject(value)) return null;
  return Object.fromEntries(REFERENCE_SUMMARY_KEYS.flatMap(key => (
    value[key] === null || Number.isFinite(value[key]) ? [[key, value[key]]] : []
  )));
}

function referencePoint(point) {
  return {
    ...(typeof point.date === 'string' ? { date: point.date } : {}),
    ...(Number.isInteger(point.week) ? { week: point.week } : {}),
    ...(point.value === null || Number.isFinite(point.value) ? { value: point.value } : {}),
    ...(point.carriedForward === true ? { carriedForward: true } : {}),
    ...(Number.isInteger(point.sampleSize) ? { sampleSize: point.sampleSize } : {}),
  };
}

function referenceMetric(metric) {
  const points = Array.isArray(metric.points)
    ? metric.points.map(referencePoint)
    : null;
  const trend = referenceSummary(metric.derived?.trend);
  const windowSummaries = Array.isArray(metric.derived?.windowSummaries)
    ? metric.derived.windowSummaries.map(referenceSummary).filter(Boolean)
    : [];
  const hasDerived = Boolean(trend) || windowSummaries.length > 0;
  return {
    metric: metric.metric,
    representation: points
      ? hasDerived ? 'points-and-derived' : 'points'
      : hasDerived ? 'derived' : 'scalar',
    ...(Object.hasOwn(metric, 'value') ? { value: metric.value } : {}),
    ...(typeof metric.date === 'string' ? { date: metric.date } : {}),
    ...(Number.isInteger(metric.week) ? { week: metric.week } : {}),
    ...(metric.carriedForward === true ? { carriedForward: true } : {}),
    ...(Number.isInteger(metric.rank) ? { rank: metric.rank } : {}),
    ...(Number.isInteger(metric.sampleSize) ? { sampleSize: metric.sampleSize } : {}),
    ...(points ? { points } : {}),
    ...(hasDerived ? {
      derived: {
        ...(trend ? { trend } : {}),
        ...(windowSummaries.length > 0 ? { windowSummaries } : {}),
      },
    } : {}),
  };
}

function referenceEntities(evidence) {
  return [
    ...(evidence.metrics?.length > 0 ? [{
      scope: 'overview',
      sampleSize: evidence.coverage?.populationSize ?? evidence.coverage?.totalSubjects ?? null,
      metrics: evidence.metrics,
    }] : []),
    ...(evidence.subjects ?? []).map(subject => ({
      scope: 'subject',
      alias: subject.alias,
      sampleSize: subject.sampleSize ?? null,
      metrics: subject.metrics,
    })),
    ...(evidence.rooms ?? []).map(room => ({
      scope: 'room',
      alias: room.alias,
      sampleSize: room.sampleSize ?? null,
      metrics: room.metrics,
    })),
  ].map(entity => ({
    scope: entity.scope,
    ...(entity.alias ? { alias: entity.alias } : {}),
    ...(Number.isInteger(entity.sampleSize) ? { sampleSize: entity.sampleSize } : {}),
    metrics: entity.metrics.map(referenceMetric),
  }));
}

function providerEvidenceFromMessages(providerMessages, request) {
  const evidenceMessage = providerMessages.find(message => (
    message?.role === 'system'
    && typeof message.content === 'string'
    && message.content.startsWith('MINIMIZED_EVIDENCE\n')
  ));
  if (!evidenceMessage) return null;
  try {
    const providerEvidence = JSON.parse(evidenceMessage.content.slice('MINIMIZED_EVIDENCE\n'.length));
    return restoreProviderAliases(providerEvidence, request);
  } catch {
    return null;
  }
}

function createReferenceDetails({ request, providerMessages, providerEgress }) {
  const referencedEvidence = providerEgress
    ? providerEvidenceFromMessages(providerMessages, request)
    : request.evidence;
  if (!referencedEvidence) return null;
  return {
    source: providerEgress ? 'model-provider' : 'server-local',
    operation: request.analysisRequest.operation,
    scope: request.analysisRequest.scope,
    statistic: request.analysisRequest.statistic,
    time: request.analysisRequest.time,
    entities: referenceEntities(referencedEvidence),
    constraints: [...request.evidence.constraints],
    omittedFields: [...request.evidence.disclosure.omittedFields],
  };
}

export function createDisclosureReceipt({
  request,
  providerMessages,
  rosterRedactionCount = 0,
  providerEgress = true,
  attemptCount = providerEgress ? 1 : 0,
}) {
  const allMetrics = [
    ...request.evidence.metrics,
    ...request.evidence.subjects.flatMap(subject => subject.metrics),
    ...request.evidence.rooms.flatMap(room => room.metrics),
  ];
  const evidencePoints = allMetrics.flatMap(metric => (
    Array.isArray(metric.points)
      ? metric.points.map(point => ({ metric: metric.metric, ...point }))
      : [{ metric: metric.metric, ...metric }]
  ));
  const providerAttemptCount = providerEgress
    ? Math.max(1, Number.isInteger(attemptCount) ? attemptCount : 1)
    : 0;
  const evidenceMessageByteCount = providerEgress
    ? Buffer.byteLength(JSON.stringify(providerMessages), 'utf8')
    : 0;
  return {
    mode: providerEgress ? 'deidentified' : 'local-only',
    providerEgress,
    aliasesOnly: true,
    rawIdentifiersSent: false,
    subjectCount: request.evidence.subjects.length,
    roomCount: request.evidence.rooms.length,
    metricCount: allMetrics.length,
    uniqueMetricCount: new Set(allMetrics.map(metric => metric.metric)).size,
    evidencePointCount: evidencePoints.length,
    observedPointCount: evidencePoints.filter(point => (
      point.carriedForward !== true && !point.metric.endsWith('_forecast')
    )).length,
    carriedForwardPointCount: evidencePoints.filter(point => point.carriedForward === true).length,
    forecastPointCount: evidencePoints.filter(point => point.metric.endsWith('_forecast')).length,
    historyTurnCount: 0,
    freeTextForwarded: false,
    coverage: {
      from: request.evidence.coverage.from,
      to: request.evidence.coverage.to,
    },
    redactionCount: Number.isInteger(rosterRedactionCount) && rosterRedactionCount > 0
      ? rosterRedactionCount
      : 0,
    providerAttemptCount,
    evidenceMessageByteCount,
    byteCount: evidenceMessageByteCount * providerAttemptCount,
    omittedFields: request.evidence.disclosure.omittedFields,
    referenceDetails: createReferenceDetails({
      request,
      providerMessages,
      providerEgress,
    }),
  };
}

export const PRIVACY_POLICY_LIMITS = Object.freeze({
  maxRequestBytes: MAX_REQUEST_BYTES,
  maxRecentTurns: MAX_RECENT_TURNS,
  maxPointsPerMetric: MAX_POINTS_PER_METRIC,
});
