const MIN_AGGREGATE_SIZE = 5;
const MAX_RANKED_SUBJECTS = 5;
const MAX_COMPARED_SUBJECTS = 3;
const MAX_TREND_POINTS = 16;
const MAX_EVIDENCE_POINTS = 64;

const RANKING_PATTERN = /(จัดอันดับ|รายชื่อ|ใคร|อันดับ|ลำดับ|top\s*\d*|priority|rank|highest|lowest)/iu;
const INDIRECT_RANKING_PATTERN = /((?:ดู|ทบทวน|ติดตาม|ช่วย|จัดการ)(?:[^\n]{0,80})(?:ได้|เพียง|แค่)\s*\d{1,2}\s*(?:คน|ราย|เคส)|(?:ควร|ต้อง)(?:[^\n]{0,80})(?:เริ่ม|ดูก่อน|ทบทวนก่อน)(?:[^\n]{0,40})(?:คนไหน|ใคร)|(?:คนไหน|ใคร)(?:[^\n]{0,40})(?:ก่อน|เร่งด่วน))/iu;
const COMPARISON_PATTERN = /(เทียบ|เปรียบเทียบ|ต่างกัน|versus|\bvs\.?\b|compare)/iu;
const COMPARATIVE_FOLLOW_UP_PATTERN = /((?:คน|ราย|บุคคล)ไหน(?:[^\n]{0,40})(?:สูงกว่า|ต่ำกว่า|มากกว่า|น้อยกว่า|แย่กว่า|ดีกว่า)|(?:สูงกว่า|ต่ำกว่า|มากกว่า|น้อยกว่า|แย่กว่า|ดีกว่า)(?:[^\n]{0,40})(?:คน|ราย|บุคคล)ไหน)/iu;
const PREDICTION_PATTERN = /(คาดการณ์|พยากรณ์|ทำนาย|แนวโน้มข้างหน้า|prediction|predict|forecast|projection)/iu;
const ROOM_PATTERN = /(ห้อง|room)/iu;
const ROOM_RANKING_PATTERN = /((?:ห้อง|room)(?:ใด|ไหน)?(?:[^\n]{0,80})(?:มากที่สุด|สูงที่สุด|ต่ำที่สุด|น่ากังวลที่สุด|เสี่ยงที่สุด)|(?:ห้องใด|ห้องไหน|which room)(?:[^\n]{0,80})(?:ควร|ต้อง)(?:[^\n]{0,40})(?:เริ่ม|ดูก่อน|ทบทวนก่อน)|(?:จัดอันดับ|อันดับ|เรียง)(?:[^\n]{0,40})(?:ห้อง|room))/iu;
const SUBJECT_REFERENCE_PATTERN = /(คนนี้|คนเดิม|รายนี้|บุคคลเดิม|เขา|เธอ|this\s+(?:subject|student|person)|same\s+(?:subject|student|person)|\bhim\b|\bher\b|\bthem\b)/iu;
const ROOM_REFERENCE_PATTERN = /(ห้องนี้|ห้องเดิม|ห้องดังกล่าว|this room|same room)/iu;
const FOLLOW_UP_PATTERN = /^(?:แล้ว|ส่วน|ต่อ(?:ไป)?|ถ้าอย่างนั้น|what about|and\b)/iu;
const TREND_PATTERN = /(แนวโน้ม|ย้อนหลัง|trend|history|historical)/iu;
const RECENT_CHANGE_PATTERN = /((?:ช่วงนี้|ระยะนี้|พักนี้|ล่าสุด)(?:[^\n]{0,80})(?:แย่ลง|ดีขึ้น|เพิ่มขึ้น|สูงขึ้น|ลดลง|เปลี่ยน|จากก่อนหน้า|จากเดิม)|(?:แย่ลง|ดีขึ้น|เพิ่มขึ้น|สูงขึ้น|ลดลง)(?:[^\n]{0,50})(?:ก่อนหน้า|เดิม|ที่ผ่านมา)|(?:ทำไม|เพราะอะไร)(?:[^\n]{0,80})(?:เพิ่มขึ้น|สูงขึ้น|ลดลง|แย่ลง|ดีขึ้น))/iu;
const COUNT_PATTERN = /(กี่คน|กี่ราย|จำนวน|เท่าไร|เท่าไหร่|count|how many)/iu;
const COUNT_ENTITY_PATTERN = /(คน|ราย|เคส|นักเรียน|ผู้(?:ที่|มี)|ทั้งหมด|population|students?)/iu;
const MEAN_PATTERN = /(เฉลี่ย|ค่าเฉลี่ย|mean|average)/iu;
const CHART_PATTERN = /(กราฟ|แผนภูมิ|chart|plot)/iu;
const TABLE_PATTERN = /(ตาราง|table)/iu;
const NARRATIVE_PATTERN = /(บรรยาย|เล่าให้ฟัง|สรุปเป็นข้อความ|narrative)/iu;
const HISTORICAL_SYNTHESIS_PATTERN = /(?:(?:สรุป(?:เป็นข้อความ|ข้อมูล)?|บทสรุป|briefing|narrative|summary)(?:[^\n]{0,100})(?:ย้อนหลัง(?:ทั้งหมด)?|ตลอดช่วง|ทุกสัปดาห์|historical|available period)|(?:ย้อนหลัง(?:ทั้งหมด)?|ตลอดช่วง|historical|available period)(?:[^\n]{0,100})(?:สรุป(?:เป็นข้อความ|ข้อมูล)?|บทสรุป|briefing|narrative|summary))/iu;
const EXPLAIN_PATTERN = /(เพราะอะไร|ทำไม|อธิบาย|เหตุผล|explain|reason)/iu;
const DASS_GROUP_PATTERN = /\bdass(?:[- ]?21)?\b/iu;
const TOTAL_STUDENTS_PATTERN = /(นักเรียนทั้งหมด|จำนวนนักเรียน|ทั้งหมดกี่คน|total students?|student count|population size)/iu;
const OBSERVED_STUDENTS_PATTERN = /(นักเรียนที่มีข้อมูล|ได้รับการ(?:สังเกต|ประเมิน)|observed students?|students? observed)/iu;
const RED3_PATTERN = /(red\s*3|แดง\s*3|ครบทั้ง\s*3)/iu;
const RED_SELF_PLUS_PATTERN = /(red[ _-]?self|self\s*plus|self.*(?:buddy|command).*(?:แดง|red))/iu;
const LOWEST_PATTERN = /(ต่ำ(?:ที่)?สุด|น้อย(?:ที่)?สุด|จากน้อยไปมาก|lowest|smallest|ascending|\basc\b)/iu;
const HIGHEST_PATTERN = /(สูง(?:ที่)?สุด|มาก(?:ที่)?สุด|จากมากไปน้อย|highest|largest|descending|\bdesc\b)/iu;

const TREND_METRICS = new Set([
  'self',
  'buddy',
  'command',
  'depression',
  'anxiety',
  'stress',
  'cd_risc',
  'grit',
]);
const OVERVIEW_COUNT_METRICS = new Set([
  'total_students',
  'observed_students',
  'concern_count',
  'physical_concern_count',
  'alert_red3',
  'alert_red_self_plus',
  'psychiatric_care',
]);
const BASE_METRICS = new Set([
  ...TREND_METRICS,
  ...OVERVIEW_COUNT_METRICS,
  'physical_injury',
  'mental_severity',
]);

const METRIC_DEFINITIONS = Object.freeze({
  self: { pattern: /(\bself\b|ประเมินตนเอง|ตนเอง)/iu, source: 'fourColors', field: 'self' },
  buddy: { pattern: /(\bbuddy\b|เพื่อนประเมิน|เพื่อน)/iu, source: 'fourColors', field: 'buddy' },
  command: { pattern: /(\bcommand\b|ผู้บังคับบัญชา|ครูฝึก)/iu, source: 'fourColors', field: 'command' },
  depression: { pattern: /(depression|dass[_ -]?d|ซึมเศร้า)/iu, source: 'assessment', field: 'dass_d' },
  anxiety: { pattern: /(anxiety|dass[_ -]?a|วิตกกังวล)/iu, source: 'assessment', field: 'dass_a' },
  stress: { pattern: /(stress|dass[_ -]?s|ความเครียด|เครียด)/iu, source: 'assessment', field: 'dass_s' },
  cd_risc: { pattern: /(cd[ -]?risc|resilience|ความยืดหยุ่น|ฟื้นตัว)/iu, source: 'assessment', field: 'cd_risc' },
  grit: { pattern: /(\bgrit\b|ความเพียร)/iu, source: 'assessment', field: 'grit' },
  mental_severity: { pattern: /(mental severity|ระดับสุขภาพจิต|ระดับอาการ)/iu, source: 'student', field: 'mentalSeverity' },
  physical_injury: { pattern: /(physical injury|บาดเจ็บ|ร่างกาย)/iu, source: 'physical', field: 'physicalInjury' },
});

function localIsoDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function round(value) {
  return Number(value.toFixed(2));
}

function mean(values) {
  const valid = values.filter(Number.isFinite);
  if (valid.length === 0) return null;
  return round(valid.reduce((total, value) => total + value, 0) / valid.length);
}

export function createLinearForecast(
  points,
  {
    valueKey = 'value',
    xKey = 'week',
    through = 99,
    horizon = 4,
    min = -Infinity,
    max = Infinity,
  } = {},
) {
  const valid = points
    .map(point => ({ x: Number(point[xKey]), y: Number(point[valueKey]) }))
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((left, right) => left.x - right.x);
  if (valid.length < 3) return null;

  const xMean = mean(valid.map(point => point.x));
  const yMean = mean(valid.map(point => point.y));
  const denominator = valid.reduce((sum, point) => sum + ((point.x - xMean) ** 2), 0);
  if (denominator === 0) return null;
  const slope = valid.reduce(
    (sum, point) => sum + ((point.x - xMean) * (point.y - yMean)),
    0,
  ) / denominator;
  const intercept = yMean - (slope * xMean);
  const lastX = valid.at(-1).x;
  const end = Math.min(through, lastX + horizon);
  const forecast = [];
  for (let x = Math.floor(lastX) + 1; x <= end; x += 1) {
    forecast.push({
      week: x,
      value: round(Math.min(max, Math.max(min, intercept + (slope * x)))),
    });
  }
  return forecast.length > 0
    ? { method: 'ordinary-least-squares linear trend', observedPoints: valid.length, slopePerWeek: round(slope), forecast }
    : null;
}

function detectMetrics(question) {
  const detected = Object.entries(METRIC_DEFINITIONS)
    .filter(([, definition]) => definition.pattern.test(question))
    .map(([metric]) => metric);
  if (DASS_GROUP_PATTERN.test(question)) {
    detected.push('depression', 'anxiety', 'stress');
  }
  return [...new Set(detected)];
}

function extractWeekWindows(question) {
  const windows = [];
  const pattern = /(?:สัปดาห์|week|wk)\s*(?:ที่\s*)?(\d{1,2})(?:\s*(?:-|–|—|ถึง|to)\s*(?:(?:สัปดาห์|week|wk)\s*(?:ที่\s*)?)?(\d{1,2}))?/giu;
  for (const match of String(question ?? '').matchAll(pattern)) {
    const first = Number(match[1]);
    const second = Number(match[2] ?? match[1]);
    if (!Number.isInteger(first) || !Number.isInteger(second) || first > 99 || second > 99) continue;
    const window = {
      fromWeek: Math.min(first, second),
      toWeek: Math.max(first, second),
    };
    if (!windows.some(item => item.fromWeek === window.fromWeek && item.toWeek === window.toWeek)) {
      windows.push(window);
    }
    if (windows.length === 2) break;
  }
  return windows;
}

function weekInWindows(week, windows) {
  return windows.length === 0 || windows.some(window => (
    Number.isFinite(week) && week >= window.fromWeek && week <= window.toWeek
  ));
}

function isComparisonFollowUp(question, previousState) {
  return previousState.topic === 'comparison'
    && previousState.subjectAliases.length > 1
    && (
      COMPARATIVE_FOLLOW_UP_PATTERN.test(question)
      || (FOLLOW_UP_PATTERN.test(question) && (
        COMPARISON_PATTERN.test(question)
        || TREND_PATTERN.test(question)
        || RECENT_CHANGE_PATTERN.test(question)
      ))
    );
}

function rankingLimit(question) {
  const matches = [
    String(question ?? '').match(/top\s*(\d{1,2})/iu),
    String(question ?? '').match(/(?:แค่|เพียง|ได้แค่)?\s*(\d{1,2})\s*(?:คน|ราย|เคส|ห้อง|อันดับ)/iu),
  ];
  const requested = Number(matches.find(Boolean)?.[1]);
  return Number.isInteger(requested)
    ? Math.max(1, Math.min(MAX_RANKED_SUBJECTS, requested))
    : MAX_RANKED_SUBJECTS;
}

function requestedOutput(question) {
  const chart = CHART_PATTERN.test(question);
  const table = TABLE_PATTERN.test(question);
  if (chart && table) return 'chart_table';
  if (chart) return 'chart';
  if (table) return 'table';
  if (NARRATIVE_PATTERN.test(question)) return 'narrative';
  return 'auto';
}

function evidenceMetricNames(evidence) {
  return [...new Set([
    ...(evidence?.metrics ?? []).map(metric => metric.metric),
    ...(evidence?.subjects ?? []).flatMap(subject => subject.metrics.map(metric => metric.metric)),
    ...(evidence?.rooms ?? []).flatMap(room => room.metrics.map(metric => metric.metric)),
  ].map(metric => String(metric ?? '').replace(/_forecast$/u, ''))
    .filter(metric => BASE_METRICS.has(metric)))];
}

function evidenceWeeks(evidence) {
  return [...new Set([
    ...(evidence?.metrics ?? []),
    ...(evidence?.subjects ?? []).flatMap(subject => subject.metrics),
    ...(evidence?.rooms ?? []).flatMap(room => room.metrics),
  ].flatMap(metric => [
    ...(Number.isFinite(metric.week) ? [metric.week] : []),
    ...(metric.points ?? []).map(point => point.week),
  ]).filter(Number.isFinite))].sort((left, right) => left - right);
}

function recentComparisonWindows(evidence) {
  const weeks = evidenceWeeks(evidence);
  if (weeks.length === 0) return [];
  const first = weeks[0];
  const last = weeks.at(-1);
  if (first === last) return [];
  const pivot = Math.floor((first + last) / 2);
  return [
    { fromWeek: first, toWeek: pivot },
    { fromWeek: pivot + 1, toWeek: last },
  ];
}

function forecastWindows(evidence) {
  const weeks = [
    ...(evidence?.metrics ?? []),
    ...(evidence?.subjects ?? []).flatMap(subject => subject.metrics),
  ].filter(metric => /_forecast$/u.test(metric.metric))
    .flatMap(metric => metric.points ?? [])
    .map(point => point.week)
    .filter(Number.isFinite);
  return weeks.length > 0
    ? [{ fromWeek: Math.min(...weeks), toWeek: Math.max(...weeks) }]
    : [];
}

function referentFor({ question, evidence, prepared, previousState }) {
  const explicitSubjects = prepared?.matchedStudentIds?.length ?? 0;
  const explicitRooms = prepared?.matchedRooms?.length ?? 0;
  if (explicitSubjects > 0 || explicitRooms > 0) {
    return { status: 'resolved', resolvedFromPrevious: false };
  }

  const comparisonFollowUp = isComparisonFollowUp(question, previousState);
  if (comparisonFollowUp && (evidence?.subjects?.length ?? 0) > 1) {
    return { status: 'resolved', resolvedFromPrevious: true };
  }
  if (SUBJECT_REFERENCE_PATTERN.test(question)) {
    if (previousState.subjectAliases.length === 1) {
      return { status: 'resolved', resolvedFromPrevious: true };
    }
    if (previousState.subjectAliases.length > 1) {
      return { status: 'ambiguous', resolvedFromPrevious: false };
    }
  }
  if (ROOM_REFERENCE_PATTERN.test(question)) {
    if (previousState.roomAliases.length === 1) {
      return { status: 'resolved', resolvedFromPrevious: true };
    }
    if (previousState.roomAliases.length > 1) {
      return { status: 'ambiguous', resolvedFromPrevious: false };
    }
  }
  if (FOLLOW_UP_PATTERN.test(question) && (
    (evidence?.subjects?.length ?? 0) > 0 || (evidence?.rooms?.length ?? 0) > 0
  )) {
    return { status: 'resolved', resolvedFromPrevious: true };
  }
  return { status: 'none', resolvedFromPrevious: false };
}

export function createAnalysisRequest({
  question = '',
  evidence,
  prepared = {},
  previousState = {},
} = {}) {
  const safeState = {
    topic: previousState?.topic ?? null,
    subjectAliases: Array.isArray(previousState?.subjectAliases) ? previousState.subjectAliases : [],
    roomAliases: Array.isArray(previousState?.roomAliases) ? previousState.roomAliases : [],
    metrics: Array.isArray(previousState?.metrics) ? previousState.metrics : [],
  };
  const weekWindows = extractWeekWindows(question);
  const comparisonFollowUp = isComparisonFollowUp(question, safeState);
  const indirectRanking = INDIRECT_RANKING_PATTERN.test(question);
  const roomRanking = ROOM_RANKING_PATTERN.test(question)
    && (prepared?.matchedRooms?.length ?? 0) === 0;
  const asksTrend = TREND_PATTERN.test(question) || RECENT_CHANGE_PATTERN.test(question);
  const questionMetrics = detectMetrics(question).filter(metric => BASE_METRICS.has(metric));
  const scalarAmountQuestion = /(เท่าไร|เท่าไหร่)/iu.test(question)
    && questionMetrics.length > 0
    && !COUNT_ENTITY_PATTERN.test(question);
  const countRequested = (COUNT_PATTERN.test(question) && !scalarAmountQuestion)
    || TOTAL_STUDENTS_PATTERN.test(question)
    || OBSERVED_STUDENTS_PATTERN.test(question)
    || RED3_PATTERN.test(question)
    || RED_SELF_PLUS_PATTERN.test(question);
  const metrics = evidenceMetricNames(evidence);
  if (metrics.length === 0) {
    metrics.push(...questionMetrics);
  }
  if (metrics.length === 0 && (comparisonFollowUp || SUBJECT_REFERENCE_PATTERN.test(question))) {
    metrics.push(...safeState.metrics
      .map(metric => String(metric).replace(/_forecast$/u, ''))
      .filter(metric => BASE_METRICS.has(metric)));
  }

  let scope = 'overview';
  if (
    evidence?.intent === 'room'
    || (prepared?.matchedRooms?.length ?? 0) > 0
    || ROOM_REFERENCE_PATTERN.test(question)
  ) {
    scope = 'room';
  } else if (
    ['individual', 'comparison', 'ranking'].includes(evidence?.intent)
    || (evidence?.subjects?.length ?? 0) > 0
    || (prepared?.matchedStudentIds?.length ?? 0) > 0
    || SUBJECT_REFERENCE_PATTERN.test(question)
    || comparisonFollowUp
    || indirectRanking
  ) {
    scope = 'subject';
  }
  if (metrics.length === 0 && scope === 'room') {
    metrics.push(...defaultMetrics('room'));
  }

  let operation;
  if (PREDICTION_PATTERN.test(question) || evidence?.intent === 'prediction') {
    operation = 'forecast';
  } else if (comparisonFollowUp || COMPARISON_PATTERN.test(question) || weekWindows.length > 1) {
    operation = 'compare';
  } else if (
    evidence?.intent === 'ranking'
    || RANKING_PATTERN.test(question)
    || indirectRanking
    || roomRanking
  ) {
    operation = 'rank';
  } else if (
    evidence?.intent === 'overview'
    && HISTORICAL_SYNTHESIS_PATTERN.test(question)
  ) {
    operation = 'summarize';
  } else if (asksTrend || (weekWindows.length > 0 && evidence?.intent !== 'individual')) {
    operation = 'trend';
  } else if (countRequested) {
    operation = 'count';
  } else if (scope !== 'overview') {
    operation = 'lookup';
  } else {
    operation = 'summarize';
  }

  let statistic = 'latest';
  if (operation === 'forecast') statistic = 'forecast';
  else if (operation === 'rank') statistic = 'priority';
  else if (operation === 'count') statistic = 'count';
  else if (MEAN_PATTERN.test(question)) statistic = 'mean';
  else if (RECENT_CHANGE_PATTERN.test(question)) statistic = 'change';
  else if (operation === 'trend' || TREND_PATTERN.test(question)) statistic = 'trend';

  let time = { mode: 'latest', windows: [] };
  if (operation === 'forecast') {
    time = { mode: 'forecast_horizon', windows: forecastWindows(evidence) };
  } else if (weekWindows.length > 0) {
    time = { mode: 'week_windows', windows: weekWindows };
  } else if (RECENT_CHANGE_PATTERN.test(question)) {
    const windows = recentComparisonWindows(evidence);
    time = windows.length === 2
      ? { mode: 'recent_vs_previous', windows }
      : { mode: 'available_range', windows: [] };
  } else if (operation === 'trend' || TREND_PATTERN.test(question) || comparisonFollowUp) {
    time = { mode: 'available_range', windows: [] };
  }

  const ranking = operation === 'rank'
    ? {
        direction: LOWEST_PATTERN.test(question)
          ? 'asc'
          : HIGHEST_PATTERN.test(question) ? 'desc' : 'risk_first',
        limit: rankingLimit(question),
      }
    : null;

  return {
    operation,
    scope,
    metrics: [...new Set(metrics)],
    statistic,
    time,
    ranking,
    output: requestedOutput(question),
    explain: EXPLAIN_PATTERN.test(question),
    referent: referentFor({
      question,
      evidence,
      prepared,
      previousState: safeState,
    }),
  };
}

function mentionsPriorAlias(currentAliases, previousAliases) {
  return currentAliases.some(alias => previousAliases.includes(alias));
}

function isSubjectFollowUp(question, prepared, previousState) {
  if (previousState.subjectAliases.length === 0) return false;
  if (isComparisonFollowUp(question, previousState)) return true;
  if (SUBJECT_REFERENCE_PATTERN.test(question)) return true;
  if (mentionsPriorAlias(prepared.subjectAliases, previousState.subjectAliases)) return true;
  return previousState.subjectAliases.length === 1
    && ['individual', 'prediction'].includes(previousState.topic)
    && FOLLOW_UP_PATTERN.test(question);
}

function isRoomFollowUp(question, prepared, previousState) {
  if (previousState.roomAliases.length === 0) return false;
  if (ROOM_REFERENCE_PATTERN.test(question)) return true;
  if (mentionsPriorAlias(prepared.roomAliases, previousState.roomAliases)) return true;
  return previousState.roomAliases.length === 1
    && previousState.topic === 'room'
    && FOLLOW_UP_PATTERN.test(question);
}

function classifyIntent(question, prepared, previousState, {
  subjectFollowUp,
  roomFollowUp,
  ambiguousSubjectReference,
  ambiguousRoomReference,
}) {
  if (ambiguousSubjectReference) {
    return previousState.topic === 'comparison' ? 'comparison' : 'general';
  }
  if (ambiguousRoomReference) return previousState.topic === 'room' ? 'room' : 'general';
  const hasRoomQuery = prepared.matchedRooms.length > 0 || ROOM_PATTERN.test(question) || roomFollowUp;
  if (hasRoomQuery && prepared.matchedStudentIds.length === 0) return 'room';
  if (isComparisonFollowUp(question, previousState)) return 'comparison';
  if (COMPARISON_PATTERN.test(question) && (
    prepared.matchedStudentIds.length > 0 || subjectFollowUp
  )) return 'comparison';
  if (prepared.matchedStudentIds.length > 1) return 'comparison';
  if (PREDICTION_PATTERN.test(question)) return 'prediction';
  if (
    subjectFollowUp
    && previousState.topic === 'prediction'
    && FOLLOW_UP_PATTERN.test(question)
  ) return 'prediction';
  if (prepared.matchedStudentIds.length === 1) return 'individual';
  if (RANKING_PATTERN.test(question) || INDIRECT_RANKING_PATTERN.test(question)) return 'ranking';
  if (subjectFollowUp) return 'individual';
  return 'overview';
}

function overviewRequestedMetrics(question, detectedMetrics) {
  const requested = detectedMetrics.map(metric => {
    if (metric === 'mental_severity') return 'psychiatric_care';
    if (metric === 'physical_injury') return 'physical_concern_count';
    return metric;
  });
  if (TOTAL_STUDENTS_PATTERN.test(question)) requested.push('total_students');
  if (OBSERVED_STUDENTS_PATTERN.test(question)) requested.push('observed_students');
  if (RED3_PATTERN.test(question)) requested.push('alert_red3');
  if (RED_SELF_PLUS_PATTERN.test(question)) requested.push('alert_red_self_plus');
  return [...new Set(requested)];
}

function rememberedMetrics(previousState) {
  return [...new Set(previousState.metrics
    .map(metric => metric.replace(/_forecast$/u, ''))
    .filter(metric => METRIC_DEFINITIONS[metric] || OVERVIEW_COUNT_METRICS.has(metric)))];
}

function latestDate(logs) {
  return logs.reduce((latest, log) => (
    typeof log.date === 'string' && (!latest || log.date > latest) ? log.date : latest
  ), null);
}

function metricRange(metric) {
  if (['self', 'buddy', 'command'].includes(metric)) return [1, 4];
  if (['depression', 'anxiety', 'stress'].includes(metric)) return [0, 21];
  if (metric === 'cd_risc') return [0, 40];
  if (metric === 'grit') return [0, 32];
  return [-Infinity, Infinity];
}

function defaultMetrics(intent) {
  if (intent === 'ranking' || intent === 'comparison' || intent === 'individual') {
    return ['mental_severity', 'self', 'buddy', 'command', 'depression', 'anxiety', 'stress'];
  }
  return ['self', 'buddy', 'command'];
}

function assessmentPoint(assessment, metric) {
  const definition = METRIC_DEFINITIONS[metric];
  const value = assessment?.[definition.field];
  return Number.isFinite(value) ? { metric, value, week: assessment.week } : null;
}

function individualMetric(
  individual,
  metric,
  observedLogs,
  wantsTrend,
  { pointLimit = MAX_TREND_POINTS, weekWindows = [] } = {},
) {
  const definition = METRIC_DEFINITIONS[metric];
  if (!definition) return null;
  if (definition.source === 'student') {
    const value = individual.student.demographics?.[definition.field];
    return Number.isFinite(value) ? { metric, value } : null;
  }
  if (definition.source === 'physical') {
    const latest = observedLogs.filter(log => log.studentId === individual.student.id).at(-1);
    return Number.isFinite(latest?.physicalInjury)
      ? { metric, value: latest.physicalInjury, date: latest.date }
      : null;
  }
  if (definition.source === 'assessment') {
    const valid = individual.assessments
      .map(assessment => assessmentPoint(assessment, metric))
      .filter(Boolean)
      .filter(point => weekInWindows(point.week, weekWindows))
      .slice(-pointLimit);
    if (valid.length === 0) return null;
    return wantsTrend && valid.length > 1
      ? { metric, points: valid.map(({ value, week }) => ({ value, week })) }
      : valid.at(-1);
  }

  const weekByDate = new Map(observedLogs
    .filter(log => log.studentId === individual.student.id && Number.isFinite(log.week))
    .map(log => [log.date, log.week]));
  const valid = individual.fourColorTrend
    .filter(point => Number.isFinite(point[definition.field]))
    .map(point => ({ ...point, week: weekByDate.get(point.date) }))
    .filter(point => weekInWindows(point.week, weekWindows))
    .slice(-pointLimit);
  if (valid.length === 0) return null;
  if (wantsTrend && valid.length > 1) {
    return {
      metric,
      points: valid.map(point => ({
        date: point.date,
        ...(Number.isFinite(point.week) ? { week: point.week } : {}),
        value: point[definition.field],
        carriedForward: point[`is${definition.field[0].toUpperCase()}${definition.field.slice(1)}CF`] === true,
      })),
    };
  }
  const latest = valid.at(-1);
  return {
    metric,
    value: latest[definition.field],
    date: latest.date,
    carriedForward: latest[`is${definition.field[0].toUpperCase()}${definition.field.slice(1)}CF`] === true,
  };
}

function priorityTuple(student, analytics) {
  const individual = analytics.getIndividual({ studentId: student.id });
  if (!individual) return [0, 0, 0, 0];
  const latest = individual.fourColorTrend.at(-1) ?? {};
  const assessment = individual.assessments.at(-1) ?? {};
  const views = ['self', 'buddy', 'command'].map(key => latest[key]).filter(Number.isFinite);
  return [
    Number(student.demographics?.mentalSeverity) || 0,
    views.filter(value => value === 4).length,
    Math.max(0, ...views),
    Math.max(0, ...['dass_d', 'dass_a', 'dass_s'].map(key => assessment[key]).filter(Number.isFinite)),
  ];
}

function compareTuple(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] ?? 0) !== (right[index] ?? 0)) return (right[index] ?? 0) - (left[index] ?? 0);
  }
  return 0;
}

function rankingMetricValue(student, analytics, observedLogs, metric) {
  const individual = analytics.getIndividual({ studentId: student.id });
  if (!individual) return null;
  const item = individualMetric(individual, metric, observedLogs, false);
  return Number.isFinite(item?.value) ? item.value : null;
}

function compareRankingValues(left, right, { ascending }) {
  if (left.value === null && right.value === null) return 0;
  if (left.value === null) return 1;
  if (right.value === null) return -1;
  return ascending ? left.value - right.value : right.value - left.value;
}

function createSubjectForecasts(studentId, observedLogs, metrics) {
  return metrics.flatMap(metric => {
    if (!['self', 'buddy', 'command'].includes(metric)) return [];
    const latestByDate = new Map();
    for (const log of observedLogs) {
      if (log.studentId !== studentId || !Number.isFinite(log[metric])) continue;
      const current = latestByDate.get(log.date);
      if (!current || log.id.localeCompare(current.id) >= 0) latestByDate.set(log.date, log);
    }
    const valuesByWeek = new Map();
    for (const log of latestByDate.values()) {
      if (!Number.isFinite(log.week)) continue;
      if (!valuesByWeek.has(log.week)) valuesByWeek.set(log.week, []);
      valuesByWeek.get(log.week).push(log[metric]);
    }
    const weekly = [...valuesByWeek.entries()]
      .sort(([left], [right]) => left - right)
      .map(([week, values]) => ({ week, value: mean(values) }));
    const [min, max] = metricRange(metric);
    const forecast = createLinearForecast(weekly, { min, max });
    return forecast
      ? [{ metric: `${metric}_forecast`, points: forecast.forecast }]
      : [];
  });
}

function selectedStudentIds({
  intent,
  prepared,
  previousState,
  aliases,
  students,
  analytics,
  observedLogs,
  question,
  subjectFollowUp,
  rankingMetric,
  requestedRankingLimit,
}) {
  const explicit = prepared.matchedStudentIds;
  if (intent === 'ranking') {
    if (rankingMetric) {
      const explicitlyLowest = LOWEST_PATTERN.test(question);
      const explicitlyHighest = HIGHEST_PATTERN.test(question);
      const ascending = explicitlyLowest || (
        !explicitlyHighest && ['cd_risc', 'grit'].includes(rankingMetric)
      );
      return students
        .map(student => ({
          id: student.id,
          value: rankingMetricValue(student, analytics, observedLogs, rankingMetric),
          tuple: priorityTuple(student, analytics),
        }))
        .filter(item => item.value !== null)
        .sort((left, right) => (
          compareRankingValues(left, right, { ascending })
          || compareTuple(left.tuple, right.tuple)
          || left.id.localeCompare(right.id)
        ))
        .slice(0, requestedRankingLimit)
        .map(item => item.id);
    }
    return students
      .map(student => ({ id: student.id, tuple: priorityTuple(student, analytics) }))
      .sort((left, right) => compareTuple(left.tuple, right.tuple) || left.id.localeCompare(right.id))
      .slice(0, requestedRankingLimit)
      .map(item => item.id);
  }
  if (!['individual', 'comparison', 'prediction'].includes(intent)) return [];
  const explicitIds = new Set(explicit);
  const typedPriorAliases = prepared.subjectAliases.filter(alias => {
    const id = aliases.personId(alias);
    return previousState.subjectAliases.includes(alias) && id && !explicitIds.has(id);
  });
  const directReference = SUBJECT_REFERENCE_PATTERN.test(question);
  const rememberAliases = typedPriorAliases.length > 0
    ? typedPriorAliases
    : directReference || (
      subjectFollowUp
      && (explicit.length === 0 || (intent === 'comparison' && explicit.length === 1))
    )
      ? previousState.subjectAliases
      : [];
  const remembered = rememberAliases.map(alias => aliases.personId(alias)).filter(Boolean);
  const candidates = [...new Set([...explicit, ...remembered])];
  return candidates.slice(0, intent === 'comparison' ? MAX_COMPARED_SUBJECTS : 1);
}

function createSubjects({
  ids,
  students,
  analytics,
  aliases,
  metrics,
  observedLogs,
  intent,
  wantsTrend,
  pointLimit,
  weekWindows,
}) {
  return ids.map((id, index) => {
    const student = students.find(item => item.id === id);
    const individual = analytics.getIndividual({ studentId: id });
    if (!student || !individual) return null;
    const items = metrics
      .map(metric => individualMetric(individual, metric, observedLogs, wantsTrend, {
        pointLimit,
        weekWindows,
      }))
      .filter(Boolean);
    if (intent === 'prediction') {
      items.push(...createSubjectForecasts(id, observedLogs, metrics));
    }
    if (items.length > 0 && intent === 'ranking') items[0] = { ...items[0], rank: index + 1 };
    return { alias: aliases.person(student), metrics: items };
  }).filter(subject => subject?.metrics.length > 0);
}

function overviewSeries(overview, metric) {
  const definition = METRIC_DEFINITIONS[metric];
  if (!definition || definition.source === 'student' || definition.source === 'physical') return [];
  const series = definition.source === 'fourColors'
    ? overview.populationTrend
    : ['depression', 'anxiety', 'stress'].includes(metric)
      ? overview.dassTrend
      : overview.resilienceTrend;
  return series.map(point => ({
    week: Number(String(point.week).replace(/\D+/gu, '')),
    value: point[definition.field],
    sampleSize: point[`${definition.field}_n`],
  })).filter(point => Number.isFinite(point.value) && point.sampleSize >= MIN_AGGREGATE_SIZE);
}

function latestObservedByStudent(observedLogs) {
  const latest = new Map();
  for (const log of observedLogs) latest.set(log.studentId, log);
  return latest;
}

function overviewCountValue(metric, overview, observedLogs) {
  if (metric === 'total_students') return overview.totalStudents;
  if (metric === 'observed_students') return new Set(observedLogs.map(log => log.studentId)).size;
  if (metric === 'concern_count') return overview.alerts.red3 + overview.alerts.redSelfPlus;
  if (metric === 'alert_red3') return overview.alerts.red3;
  if (metric === 'alert_red_self_plus') return overview.alerts.redSelfPlus;
  if (metric === 'psychiatric_care') return overview.alerts.psychiatricCare;
  if (metric === 'physical_concern_count') {
    return [...latestObservedByStudent(observedLogs).values()]
      .filter(log => Number.isFinite(log.physicalInjury) && log.physicalInjury > 1)
      .length;
  }
  return null;
}

function createOverviewMetrics(overview, metrics, {
  includeAlerts,
  wantsTrend,
  observedLogs,
  pointLimit,
  weekWindows,
}) {
  const result = [];
  if (
    includeAlerts
    && overview.totalStudents >= MIN_AGGREGATE_SIZE
    && !metrics.includes('concern_count')
  ) {
    result.push({
      metric: 'concern_count',
      value: overview.alerts.red3 + overview.alerts.redSelfPlus,
    });
  }
  for (const metric of metrics) {
    if (OVERVIEW_COUNT_METRICS.has(metric)) {
      if (overview.totalStudents >= MIN_AGGREGATE_SIZE) {
        result.push({ metric, value: overviewCountValue(metric, overview, observedLogs) });
      }
      continue;
    }
    const points = overviewSeries(overview, metric)
      .filter(point => weekInWindows(point.week, weekWindows))
      .slice(-pointLimit);
    if (points.length === 0) continue;
    result.push(wantsTrend
      ? {
          metric,
          points: points.map(point => ({
            week: point.week,
            value: point.value,
            sampleSize: point.sampleSize,
          })),
        }
      : {
          metric,
          value: points.at(-1).value,
          week: points.at(-1).week,
          sampleSize: points.at(-1).sampleSize,
        });
  }
  return result;
}

function createForecastMetrics(overview, metrics) {
  return metrics.flatMap(metric => {
    if (!['self', 'buddy', 'command', 'depression', 'anxiety', 'stress'].includes(metric)) return [];
    const observed = overviewSeries(overview, metric);
    const [min, max] = metricRange(metric);
    const forecast = createLinearForecast(observed, { min, max });
    return forecast
      ? [{ metric: `${metric}_forecast`, points: forecast.forecast }]
      : [];
  });
}

function roomSummaries(analytics, date) {
  if (!date) return [];
  return analytics.getRoomStatus({ date }).rooms.map(room => {
    const aggregate = select => {
      const values = room.students.map(select).filter(Number.isFinite);
      return {
        value: values.length >= MIN_AGGREGATE_SIZE ? mean(values) : null,
        sampleSize: values.length,
      };
    };
    const self = aggregate(item => item.observation?.self);
    const buddy = aggregate(item => item.observation?.buddy);
    const command = aggregate(item => item.observation?.command);
    const physicalInjury = aggregate(item => item.observation?.physicalInjury);
    const mentalSeverity = aggregate(item => item.student?.demographics?.mentalSeverity);
    const depression = aggregate(item => item.assessment?.dass_d);
    const anxiety = aggregate(item => item.assessment?.dass_a);
    const stress = aggregate(item => item.assessment?.dass_s);
    const cdRisc = aggregate(item => item.resilienceAssessment?.cd_risc);
    const grit = aggregate(item => item.resilienceAssessment?.grit);
    return {
      name: room.name,
      sampleSize: room.students.length,
      self: self.value,
      self_n: self.sampleSize,
      buddy: buddy.value,
      buddy_n: buddy.sampleSize,
      command: command.value,
      command_n: command.sampleSize,
      physical_injury: physicalInjury.value,
      physical_injury_n: physicalInjury.sampleSize,
      mental_severity: mentalSeverity.value,
      mental_severity_n: mentalSeverity.sampleSize,
      depression: depression.value,
      depression_n: depression.sampleSize,
      anxiety: anxiety.value,
      anxiety_n: anxiety.sampleSize,
      stress: stress.value,
      stress_n: stress.sampleSize,
      cd_risc: cdRisc.value,
      cd_risc_n: cdRisc.sampleSize,
      grit: grit.value,
      grit_n: grit.sampleSize,
    };
  });
}

function createRooms({
  intent,
  prepared,
  previousState,
  aliases,
  analytics,
  date,
  metrics,
  question,
  roomFollowUp,
  requestedRankingLimit,
}) {
  if (intent !== 'room') return [];
  const remembered = roomFollowUp
    ? previousState.roomAliases.map(alias => aliases.roomName(alias)).filter(Boolean)
    : [];
  const requested = prepared.matchedRooms.length > 0
    ? [...new Set(prepared.matchedRooms)]
    : [...new Set(remembered)];
  const roomRanking = requested.length === 0 && ROOM_RANKING_PATTERN.test(question);
  const primaryMetric = metrics[0] ?? null;
  const explicitlyLowest = LOWEST_PATTERN.test(question);
  const explicitlyHighest = HIGHEST_PATTERN.test(question);
  const ascending = explicitlyLowest || (
    !explicitlyHighest && ['cd_risc', 'grit'].includes(primaryMetric)
  );
  const roomScore = room => {
    if (primaryMetric && Number.isFinite(room[primaryMetric])) return room[primaryMetric];
    return Math.max(room.self ?? 0, room.buddy ?? 0, room.command ?? 0);
  };
  return roomSummaries(analytics, date)
    .filter(room => room.sampleSize >= MIN_AGGREGATE_SIZE)
    .filter(room => requested.length === 0 || requested.includes(room.name))
    .sort((left, right) => (
      (ascending ? roomScore(left) - roomScore(right) : roomScore(right) - roomScore(left))
      || left.name.localeCompare(right.name, 'th', { numeric: true })
    ))
    .slice(0, requested.length > 0
      ? Math.min(requested.length, MAX_RANKED_SUBJECTS)
      : roomRanking ? Math.min(requestedRankingLimit, MAX_RANKED_SUBJECTS) : 1)
    .map(room => ({
      alias: aliases.room(room.name),
      sampleSize: room.sampleSize,
      metrics: metrics
        .map(metric => Number.isFinite(room[metric])
          ? {
              metric,
              value: room[metric],
              date,
              sampleSize: room[`${metric}_n`],
            }
          : null)
        .filter(Boolean),
    }))
    .filter(room => room.metrics.length > 0);
}

function extractDateRange(observedLogs, asOfDate, wantsTrend) {
  const to = latestDate(observedLogs) ?? asOfDate;
  const from = wantsTrend
    ? observedLogs.reduce((earliest, log) => (!earliest || log.date < earliest ? log.date : earliest), null)
    : to;
  return { from, to };
}

function countObservedPoints(metrics, subjects, rooms) {
  const items = [
    ...metrics,
    ...subjects.flatMap(subject => subject.metrics),
    ...rooms.flatMap(room => room.metrics),
  ];
  return items.reduce((count, item) => count + (item.points?.length ?? (item.value === undefined ? 0 : 1)), 0);
}

function dynamicPointLimit({ intent, subjectCount, metricCount, wantsTrend }) {
  if (!wantsTrend || metricCount === 0) return MAX_TREND_POINTS;
  const consumers = ['individual', 'comparison', 'prediction'].includes(intent)
    ? Math.max(1, subjectCount)
    : 1;
  const forecastReserve = intent === 'prediction' ? metricCount * 4 : 0;
  const available = Math.max(1, MAX_EVIDENCE_POINTS - forecastReserve);
  return Math.max(1, Math.min(
    MAX_TREND_POINTS,
    Math.floor(available / Math.max(1, consumers * metricCount)),
  ));
}

function hasForecastEvidence(metrics, subjects) {
  return [
    ...metrics,
    ...subjects.flatMap(subject => subject.metrics),
  ].some(metric => /_forecast$/u.test(metric.metric) && (metric.points?.length ?? 0) > 0);
}

function hasRequestedSmallRoom({ intent, prepared, analytics, date }) {
  if (intent !== 'room' || prepared.matchedRooms.length === 0) return false;
  const summaries = roomSummaries(analytics, date);
  return prepared.matchedRooms.some(name => {
    const room = summaries.find(item => item.name === name);
    return room && room.sampleSize < MIN_AGGREGATE_SIZE;
  });
}

export function createEvidenceEnvelope({
  evidenceId,
  analytics,
  students = [],
  logs = [],
  datasetVersion = null,
  lastUpdatedAt = null,
  question = '',
  prepared,
  aliases,
  previousState,
  asOfDate = localIsoDate(),
} = {}) {
  if (!analytics || typeof analytics.getOverview !== 'function') {
    throw new TypeError('analytics is required to create evidence');
  }
  if (!prepared || !aliases || !previousState) {
    throw new TypeError('privacy preparation, aliases, and previous state are required');
  }

  const observedLogs = logs
    .filter(log => typeof log.date === 'string' && log.date <= asOfDate)
    .slice()
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
  const overview = analytics.getOverview();
  const comparisonFollowUp = isComparisonFollowUp(question, previousState);
  const subjectFollowUp = isSubjectFollowUp(question, prepared, previousState);
  const roomFollowUp = isRoomFollowUp(question, prepared, previousState);
  const ambiguousSubjectReference = prepared.matchedStudentIds.length === 0
    && previousState.subjectAliases.length > 1
    && SUBJECT_REFERENCE_PATTERN.test(question)
    && !comparisonFollowUp;
  const ambiguousRoomReference = prepared.matchedRooms.length === 0
    && previousState.roomAliases.length > 1
    && ROOM_REFERENCE_PATTERN.test(question);
  const intent = classifyIntent(question, prepared, previousState, {
    subjectFollowUp,
    roomFollowUp,
    ambiguousSubjectReference,
    ambiguousRoomReference,
  });
  const detectedMetrics = detectMetrics(question);
  const requestedOverviewMetrics = overviewRequestedMetrics(question, detectedMetrics);
  const priorMetrics = rememberedMetrics(previousState);
  const inheritedMetrics = (subjectFollowUp || roomFollowUp) && detectedMetrics.length === 0
    ? priorMetrics.filter(metric => METRIC_DEFINITIONS[metric])
    : [];
  const baseMetrics = intent === 'overview'
    ? requestedOverviewMetrics
    : detectedMetrics.length > 0
      ? detectedMetrics
      : inheritedMetrics.length > 0 ? inheritedMetrics : defaultMetrics(intent);
  const weekWindows = extractWeekWindows(question);
  const wantsTrend = PREDICTION_PATTERN.test(question)
    || COMPARISON_PATTERN.test(question)
    || comparisonFollowUp
    || TREND_PATTERN.test(question)
    || RECENT_CHANGE_PATTERN.test(question)
    || weekWindows.length > 0;
  const metricLimit = wantsTrend
    ? intent === 'prediction' ? 3 : ['comparison', 'individual'].includes(intent) ? 8 : 4
    : 13;
  const trendReadyMetrics = wantsTrend && detectedMetrics.length === 0
    ? baseMetrics.filter(metric => TREND_METRICS.has(metric))
    : baseMetrics;
  const metrics = (intent === 'overview' && trendReadyMetrics.length === 0
    ? defaultMetrics(intent)
    : trendReadyMetrics
  ).slice(0, metricLimit);
  const rankingMetric = intent === 'ranking' && detectedMetrics.length > 0
    ? detectedMetrics[0]
    : null;
  const ids = selectedStudentIds({
    intent,
    prepared,
    previousState,
    aliases,
    students,
    analytics,
    observedLogs,
    question,
    subjectFollowUp,
    rankingMetric,
    requestedRankingLimit: rankingLimit(question),
  });
  const pointLimit = dynamicPointLimit({
    intent,
    subjectCount: ids.length,
    metricCount: metrics.length,
    wantsTrend,
  });
  const subjects = createSubjects({
    ids,
    students,
    analytics,
    aliases,
    metrics,
    observedLogs,
    intent,
    wantsTrend: wantsTrend && intent !== 'ranking',
    pointLimit,
    weekWindows,
  });
  const latestObservationDate = latestDate(observedLogs);
  const rooms = createRooms({
    intent,
    prepared,
    previousState,
    aliases,
    analytics,
    date: latestObservationDate,
    metrics,
    question,
    roomFollowUp,
    requestedRankingLimit: rankingLimit(question),
  });
  const topLevelMetrics = intent === 'prediction' && subjects.length === 0
    ? createForecastMetrics(overview, metrics)
    : intent === 'overview'
      ? createOverviewMetrics(overview, metrics, {
          includeAlerts: requestedOverviewMetrics.length === 0 && !wantsTrend,
          observedLogs,
          wantsTrend,
          pointLimit,
          weekWindows,
        })
      : [];
  const dateRange = extractDateRange(observedLogs, asOfDate, wantsTrend);
  const forecastEvidence = hasForecastEvidence(topLevelMetrics, subjects);
  const suppressedSmallRoom = hasRequestedSmallRoom({
    intent,
    prepared,
    analytics,
    date: latestObservationDate,
  });

  return {
    schemaVersion: 1,
    intent,
    source: {
      evidenceId,
      datasetVersion: datasetVersion == null ? null : String(datasetVersion).slice(0, 128),
      verifiedAt: Number.isFinite(lastUpdatedAt) ? new Date(lastUpdatedAt).toISOString() : null,
      asOfDate,
      latestObservationDate,
    },
    metrics: topLevelMetrics,
    subjects,
    rooms,
    coverage: {
      from: dateRange.from,
      to: dateRange.to,
      totalSubjects: students.length,
      includedSubjects: subjects.length,
      observedPoints: countObservedPoints(topLevelMetrics, subjects, rooms),
    },
    constraints: [
      'verified-data-only',
      'carried-forward-is-not-new',
      'decision-support-only',
      ...(intent === 'prediction' ? ['prediction-is-exploratory'] : []),
      ...(forecastEvidence ? ['prediction-ordinary-least-squares'] : []),
      ...(suppressedSmallRoom ? ['insufficient-small-group'] : []),
    ],
    disclosure: {
      mode: 'deidentified',
      omittedFields: [
        'names',
        'student-ids',
        'room-names',
        'demographics',
        'free-text-notes',
        'raw-records',
        'full-transcript',
        'unrequested-metrics',
        'small-groups',
      ],
    },
  };
}

// Compatibility name for internal callers; output is now a de-identified EvidenceEnvelope.
export const createChatContext = createEvidenceEnvelope;
