import { createMonitoringAnalytics } from './domain/monitoringAnalytics.js';

const MAX_DISCLOSURE_BYTES = 1_536;
const MAX_SUBJECTS = 10;
const DEFAULT_SUBJECTS = 5;
const MAX_INDIVIDUALS = 3;
const MAX_HISTORY_MESSAGES = 6;
const MAX_SANITIZED_MESSAGE_LENGTH = 1_200;
const MIN_AGGREGATE_GROUP_SIZE = 5;
const LOCAL_CHART_COLORS = ['blue', 'emerald', 'amber', 'rose'];
const METRIC_LABELS = Object.freeze({
  self: 'Self',
  buddy: 'Buddy',
  command: 'Command',
  physical: 'Physical',
  depression: 'DASS-D',
  anxiety: 'DASS-A',
  stress: 'DASS-S',
  resilience: 'CD-RISC',
  grit: 'Grit',
});

const PEOPLE_REQUEST = /(ใคร|คนไหน|รายชื่อ|ขอ\s*[๐-๙\d]+\s*คน|คนที่ควรติดตาม|จัดอันดับ(?:บุคคล|นักเรียน|รายชื่อ)?|อันดับ(?:บุคคล|นักเรียน|แรก)|บุคคลใด|นักเรียน(?:คน)?(?:ใด|ไหน)|[๐-๙\d]+\s*อันดับแรก|\b(?:list\s+students?|students?.*follow[ -]?up|follow[ -]?up|priority|rank(?:ing)?|highest|lowest|top\s*\d+\s+students?)\b)/iu;
const ROOM_REQUEST = /(ห้อง(?:ใด|ไหน)|รายห้อง|แยกตามห้อง|จัดอันดับห้อง|เปรียบเทียบห้อง|\brooms?\b)/iu;
const PREDICTION_REQUEST = /(คาดการณ์|พยากรณ์|ทำนาย|แนวโน้ม(?:ข้างหน้า|ในอนาคต)|อีก\s*[๐-๙\d]+\s*สัปดาห์|จะเป็นเท่าไร|\b(?:prediction|predict|forecast|projection)\b)/iu;
const CHART_REQUEST = /(กราฟ|แผนภูมิ|\b(?:chart|graph|plot)\b)/iu;
const TABLE_REQUEST = /(ตาราง|รายชื่อ|จัดอันดับ|ขอ\s*[๐-๙\d]+\s*คน|คนที่ควรติดตาม|\b(?:table|list\s+students?|rank(?:ing)?|top\s*\d+|students?.*follow[ -]?up)\b)/iu;
const NEGATED_PREDICTION = /(?:(?:ไม่ต้อง|ไม่เอา|ห้าม|อย่า)\s*(?:ทำ|แสดง)?\s*(?:คาดการณ์|พยากรณ์|ทำนาย)|\b(?:do\s+not|don't|without|no)\s+(?:a\s+)?(?:prediction|forecast|projection)\b)/iu;
const NEGATED_CHART = /(?:(?:ไม่ต้อง|ไม่เอา|ห้าม|อย่า)\s*(?:ทำ|วาด|แสดง)?\s*(?:กราฟ|แผนภูมิ)|\b(?:do\s+not|don't|without|no)\s+(?:show\s+|draw\s+)?(?:a\s+)?(?:chart|graph|plot)\b)/iu;
const NEGATED_TABLE = /(?:(?:ไม่ต้อง|ไม่เอา|ห้าม|อย่า)\s*(?:ทำ|แสดง)?\s*(?:ตาราง|รายชื่อ)|\b(?:do\s+not|don't|without|no)\s+(?:show\s+)?(?:a\s+)?(?:table|list)\b)/iu;
const ANAPHORA_REQUEST = /(เขา|เธอ|คนนั้น|คนเดิม|รายนั้น|รายดังกล่าว|ห้องนั้น|ห้องเดิม|แล้ว\s*(?:.+)?ล่ะ|\b(?:him|her|their|them|that person|same person|that room)\b)/iu;
const DIAGNOSIS_REQUEST = /(เป็นโรค|วินิจฉัย|เข้าข่าย.{0,40}(?:ไหม|หรือไม่|หรือเปล่า)|(?:มี|เป็น|ป่วย).{0,30}(?:ภาวะ|ทางจิต|ptsd|depress|ซึมเศร้า).{0,20}(?:ไหม|หรือไม่|หรือเปล่า)|ซึมเศร้า\s*(?:ไหม|หรือไม่|หรือเปล่า)|ฆ่าตัวตาย|ทำร้ายตัวเอง|ควร\s*(?:ส่งต่อ|รักษา)|diagnos|suicid|self[ -]?harm|is.{0,40}depress|does.{0,80}(?:have|meet).{0,40}(?:depress|ptsd|disorder))/iu;
const RESTRICTED_REQUEST = /(system\s*prompt|developer\s*(?:message|prompt|instruction)|hidden\s*(?:instruction|prompt|message)|MINIMIZED[\s_-]*VERIFIED[\s_-]*FACTS|(?:คืน|เปิดเผย|แสดง|พิมพ์|reveal|show|dump).{0,50}(?:prompt|คำสั่ง|instructions?|facts?|บริบท)|ignore.{0,40}(?:rules?|instructions?|prompt)|jailbreak)/iu;
const COVERAGE_REQUEST = /(ข้อมูล(?:มี)?ถึง(?:วัน|วันที่)?ไหน|ครอบคลุม|จำนวน(?:นักเรียน|คน|ข้อมูล)|(?:นักเรียน|คน|records?|observations?|assessments?)\s*(?:ทั้งหมด)?\s*(?:กี่|เท่าไร|count)|\b(?:coverage|record\s*count|how\s+many)\b)/iu;
const OVERVIEW_REQUEST = /(สรุป|ภาพรวม|แนวโน้ม|ค่าเฉลี่ย|จุดที่ควรติดตาม|\b(?:overview|trend)\b)/iu;
const METRIC_PATTERNS = Object.freeze([
  ['self', /(\bself\b|ตนเอง)/iu],
  ['buddy', /(\bbuddy\b|เพื่อน)/iu],
  ['command', /(\bcommand\b|ผู้บังคับบัญชา)/iu],
  ['depression', /(\bdepression\b|ซึมเศร้า|dass[_\s-]?d)/iu],
  ['anxiety', /(\banxiety\b|วิตกกังวล|dass[_\s-]?a)/iu],
  ['stress', /(\bstress\b|ความเครียด|dass[_\s-]?s)/iu],
  ['resilience', /(\bresilience\b|\bcd.?risc\b|ความยืดหยุ่น)/iu],
  ['grit', /(\bgrit\b|ความมุ่งมั่น)/iu],
  ['physical', /(\bphysical\b|ร่างกาย|บาดเจ็บ)/iu],
]);

function localIsoDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('th');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function roundedMean(values) {
  const valid = values.filter(Number.isFinite);
  if (valid.length === 0) return null;
  return Number(
    (valid.reduce((total, value) => total + value, 0) / valid.length).toFixed(2),
  );
}

export function createLinearForecast(
  points,
  {
    valueKey = 'value',
    xKey = 'week',
    through = 16,
    horizon = 4,
    minimum = -Infinity,
    maximum = Infinity,
  } = {},
) {
  const valid = points
    .filter(point => Number.isFinite(point?.[valueKey]))
    .map(point => ({
      x: Number(String(point[xKey]).replace(/\D+/g, '')),
      y: point[valueKey],
    }))
    .filter(point => Number.isFinite(point.x))
    .sort((left, right) => left.x - right.x);

  if (valid.length < 3) return null;
  const xMean = roundedMean(valid.map(point => point.x));
  const yMean = roundedMean(valid.map(point => point.y));
  const denominator = valid.reduce(
    (total, point) => total + ((point.x - xMean) ** 2),
    0,
  );
  if (denominator === 0) return null;

  const slope = valid.reduce(
    (total, point) => total + ((point.x - xMean) * (point.y - yMean)),
    0,
  ) / denominator;
  const intercept = yMean - (slope * xMean);
  const lastX = valid.at(-1).x;
  const finalWeek = Math.min(through, lastX + horizon);
  const forecast = [];
  for (let week = Math.floor(lastX) + 1; week <= finalWeek; week += 1) {
    forecast.push({
      week,
      value: Number(
        Math.min(maximum, Math.max(minimum, intercept + (slope * week))).toFixed(2),
      ),
    });
  }

  return {
    method: 'ordinary-least-squares-linear-trend',
    observedPoints: valid.length,
    throughWeek: through,
    slopePerWeek: Number(slope.toFixed(2)),
    forecast,
    limitation: forecast.length === 0
      ? `no-week-remains-before-through-week-${through}`
      : 'exploratory-trend-not-clinical-prediction',
  };
}

function compareLogs(left, right) {
  return left.date.localeCompare(right.date) || left.id.localeCompare(right.id);
}

function compareAssessments(left, right) {
  return left.week - right.week || left.id.localeCompare(right.id);
}

function redactGenericIdentifiers(value) {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, '[EMAIL_REDACTED]')
    .replace(/(?:\+?66|0)[\s-]?\d(?:[\s-]?\d){7,9}/gu, '[PHONE_REDACTED]')
    .replace(/\b\d{13}\b/gu, '[IDENTIFIER_REDACTED]')
    .replace(/https?:\/\/\S+/giu, '[URL_REDACTED]');
}

export function createEntityVault(students = [], messages = []) {
  const searchable = normalize(messages.map(message => message?.content).join('\n'));
  const currentSearchable = normalize(messages.at(-1)?.content);
  const studentTokens = new Map();
  const roomTokens = new Map();
  const currentStudentIds = new Set();
  const currentRooms = new Set();
  const replacements = [];
  let studentSequence = 0;
  let roomSequence = 0;

  const tokenForStudent = student => {
    if (!studentTokens.has(student.id)) {
      studentSequence += 1;
      studentTokens.set(student.id, `SUBJECT_${studentSequence}`);
    }
    return studentTokens.get(student.id);
  };

  const tokenForRoom = room => {
    if (!roomTokens.has(room)) {
      roomSequence += 1;
      roomTokens.set(room, `ROOM_${roomSequence}`);
    }
    return roomTokens.get(room);
  };

  for (const student of students) {
    const candidates = [student.name, student.id]
      .filter(value => typeof value === 'string' && value.trim());
    if (candidates.some(value => containsSensitiveValue(searchable, value))) {
      const token = tokenForStudent(student);
      for (const value of candidates) replacements.push([value, token]);
    }
    if (candidates.some(value => containsSensitiveValue(currentSearchable, value))) {
      currentStudentIds.add(student.id);
    }
  }

  const rooms = [...new Set(students.map(student => student.room).filter(Boolean))];
  for (const room of rooms) {
    if (containsSensitiveValue(searchable, room)) {
      replacements.push([room, tokenForRoom(room)]);
    }
    if (containsSensitiveValue(currentSearchable, room)) {
      currentRooms.add(room);
    }
  }

  const replaceKnownEntities = value => {
    let text = String(value ?? '');
    for (const [sensitive, token] of replacements
      .slice()
      .sort(([left], [right]) => right.length - left.length)) {
      if (normalize(sensitive).length < 3) {
        text = text.replace(
          new RegExp(
            `(^|[^\\p{L}\\p{N}_])${escapeRegExp(sensitive)}(?=$|[^\\p{L}\\p{N}_])`,
            'giu',
          ),
          (_, prefix) => `${prefix}${token}`,
        );
      } else {
        text = text.replace(new RegExp(escapeRegExp(sensitive), 'giu'), token);
      }
    }
    return redactGenericIdentifiers(text);
  };

  const sanitizedMessages = messages
    .slice(-MAX_HISTORY_MESSAGES)
    .map(message => ({
      role: message.role,
      content: replaceKnownEntities(message.content)
        .trim()
        .slice(0, MAX_SANITIZED_MESSAGE_LENGTH),
    }))
    .filter(message => message.content);

  const restoreText = value => {
    let text = String(value ?? '');
    const replacementsToRestore = [];
    for (const student of students) {
      const token = studentTokens.get(student.id);
      if (token) replacementsToRestore.push([token, student.name]);
    }
    for (const [room, token] of roomTokens.entries()) {
      replacementsToRestore.push([token, room]);
    }
    for (const [token, display] of replacementsToRestore.sort(
      ([left], [right]) => right.length - left.length,
    )) {
      text = text.replace(new RegExp(`\\b${escapeRegExp(token)}\\b`, 'gu'), display);
    }
    return text.replace(/\b(?:SUBJECT|ROOM)_\d+\b/gu, '[ข้อมูลระบุตัวตนถูกปกปิด]');
  };

  return {
    sanitizedMessages,
    matchedStudents: students.filter(student => currentStudentIds.has(student.id)),
    matchedRooms: rooms.filter(room => currentRooms.has(room)),
    tokenForStudent,
    tokenForRoom,
    restoreText,
  };
}

function detectMetrics(question) {
  const metrics = METRIC_PATTERNS
    .filter(([, pattern]) => pattern.test(question))
    .map(([metric]) => metric);
  return metrics.length > 0 ? metrics : ['all-relevant'];
}

function canonicalModelQuestion(task) {
  return `สร้างคำตอบภาษาไทยจาก facts ตามงานที่กำหนดเท่านั้น\nTASK\n${JSON.stringify({
    intent: task.intent,
    operation: task.operation,
    metrics: task.metrics,
    output: task.output,
  })}`;
}

function readRequestedLimit(question) {
  const normalizedDigits = question.replace(/[๐-๙]/gu, digit => (
    String('๐๑๒๓๔๕๖๗๘๙'.indexOf(digit))
  ));
  const match = normalizedDigits.match(/(\d{1,3})\s*(?:คน|ราย)/iu)
    ?? normalizedDigits.match(
      /(?:ขอ|top|อันดับ)(?:\s*(?:รายชื่อ|สูงสุด|ต่ำสุด|มากสุด|น้อยสุด))*\s*(\d{1,3})/iu,
    );
  if (!match) {
    const wordMatch = normalizedDigits.match(
      /(หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ)\s*(?:คน|ราย|อันดับ)/u,
    );
    if (wordMatch) {
      return {
        หนึ่ง: 1,
        สอง: 2,
        สาม: 3,
        สี่: 4,
        ห้า: 5,
        หก: 6,
        เจ็ด: 7,
        แปด: 8,
        เก้า: 9,
        สิบ: 10,
      }[wordMatch[1]];
    }
    return DEFAULT_SUBJECTS;
  }
  return Math.min(MAX_SUBJECTS, Math.max(1, Number(match[1])));
}

function readWeekRange(question) {
  const normalizedDigits = question.replace(/[๐-๙]/gu, digit => (
    String('๐๑๒๓๔๕๖๗๘๙'.indexOf(digit))
  ));
  const matches = [
    ...normalizedDigits.matchAll(/(?:wk|สัปดาห์(?:ที่)?)\s*(\d{1,2})/giu),
  ]
    .map(match => Number(match[1]))
    .filter(week => week >= 0 && week <= 16);
  if (matches.length < 2) return null;
  return { fromWeek: matches[0], toWeek: matches[1] };
}

function readForecastHorizon(question) {
  const normalizedDigits = question.replace(/[๐-๙]/gu, digit => (
    String('๐๑๒๓๔๕๖๗๘๙'.indexOf(digit))
  ));
  const match = normalizedDigits.match(/อีก\s*(\d{1,2})\s*สัปดาห์/iu)
    ?? normalizedDigits.match(/\b(?:next|for)\s+(\d{1,2})\s+weeks?\b/iu);
  if (!match) return 4;
  return Math.min(4, Math.max(1, Number(match[1])));
}

function buildTaskSpec({ question, requestType, metrics, vault }) {
  const wantsPrediction = PREDICTION_REQUEST.test(question)
    && !NEGATED_PREDICTION.test(question);
  const wantsChart = CHART_REQUEST.test(question) && !NEGATED_CHART.test(question);
  const wantsTable = (
    TABLE_REQUEST.test(question) || requestType === 'people'
  ) && !NEGATED_TABLE.test(question);
  const weekRange = readWeekRange(question);
  const operation = DIAGNOSIS_REQUEST.test(question)
    ? 'clinical-diagnosis-request'
    : /(ทำไม|สาเหตุ|cause|reason)/iu.test(question)
      ? 'causal-evidence'
      : requestType === 'overview' && COVERAGE_REQUEST.test(question)
        ? 'coverage'
        : weekRange
          ? 'compare-weeks'
          : wantsPrediction
            ? 'forecast'
            : requestType === 'people'
              ? 'rank-for-review'
              : /(ล่าสุด|วันนี้|latest)/iu.test(question)
                ? 'latest'
                : 'summary';
  return {
    intent: requestType,
    operation,
    metrics,
    weekRange,
    limit: requestType === 'people' ? readRequestedLimit(question) : null,
    sort: /(ต่ำสุด|น้อยสุด|\blowest\b)/iu.test(question)
      ? 'ascending'
      : 'descending',
    prediction: wantsPrediction,
    forecastHorizon: wantsPrediction ? readForecastHorizon(question) : null,
    output: wantsChart ? 'chart-and-summary' : wantsTable ? 'table-and-summary' : 'summary',
    subjects: vault.matchedStudents
      .slice(0, MAX_INDIVIDUALS)
      .map(student => vault.tokenForStudent(student)),
    rooms: vault.matchedRooms.map(room => vault.tokenForRoom(room)),
  };
}

function localPayload(answer, followUps = []) {
  return {
    answer,
    highlights: [],
    confidence: 'low',
    dataCoverage: 'ไม่มีการส่งข้อมูลไปยังโมเดลภายนอกสำหรับคำขอนี้',
    table: null,
    chart: null,
    methodNote: 'ระบบหยุดคำขอด้วยนโยบายลดการเปิดเผยข้อมูล',
    followUps,
  };
}

function localCoveragePayload({
  students,
  logs,
  eligibleAssessments,
  asOfDate,
  latestDate,
  latestWeek,
}) {
  const observedLogs = logs.filter(log => log.date <= asOfDate);
  const latestLabel = latestDate
    ? `วันที่ ${latestDate}${Number.isFinite(latestWeek) ? ` (Wk ${latestWeek})` : ''}`
    : 'ยังไม่มี observation ที่ใช้ได้';
  return {
    answer: `ข้อมูลที่ยืนยันแล้วครอบคลุม ${students.length} คน และล่าสุดถึง${latestLabel}`,
    highlights: [
      `Observation ที่ใช้ได้ ${observedLogs.length} รายการ`,
      `Assessment ที่ไม่เกินสัปดาห์ล่าสุด ${eligibleAssessments.length} รายการ`,
    ],
    confidence: latestDate ? 'high' : 'low',
    dataCoverage: `คำนวณจากข้อมูลที่ยืนยันแล้ว ณ ${asOfDate}; ไม่ได้ส่งข้อมูลไปยังโมเดลภายนอก`,
    table: null,
    chart: null,
    methodNote: 'คำตอบนี้คำนวณแบบ deterministic ภายใน Firebase Function',
    followUps: ['ต้องการสรุปแนวโน้มของ metric ใดเป็นพิเศษ'],
  };
}

function classifyRequest(question, vault) {
  const normalized = normalize(question);
  if (vault.matchedStudents.length > 0 && vault.matchedRooms.length > 0) {
    return 'mixed';
  }
  if (vault.matchedStudents.length > 0) return 'individual';
  if (PEOPLE_REQUEST.test(normalized)) return 'people';
  if (vault.matchedRooms.length > 0) return 'room';
  if (ROOM_REQUEST.test(normalized)) return 'room';
  return 'overview';
}

function metricRequested(metrics, metric) {
  return metrics.includes('all-relevant') || metrics.includes(metric);
}

function summarizeMetric(
  points,
  valueKey,
  sampleKey,
  {
    includePoints = false,
    weekRange = null,
  } = {},
) {
  const valid = points
    .filter(point => (
      Number.isFinite(point[valueKey])
      && Number.isFinite(point[sampleKey])
      && point[sampleKey] >= MIN_AGGREGATE_GROUP_SIZE
      && (
        !weekRange
        || Number(String(point.week).replace(/\D+/gu, '')) === weekRange.fromWeek
        || Number(String(point.week).replace(/\D+/gu, '')) === weekRange.toWeek
      )
    ))
    .map(point => ({
      week: point.week,
      value: point[valueKey],
      n: point[sampleKey],
    }));
  if (valid.length === 0) {
    return {
      suppressed: true,
      reason: `no-cell-with-n-at-least-${MIN_AGGREGATE_GROUP_SIZE}`,
    };
  }
  const first = valid[0];
  const latest = valid.at(-1);
  const change = Number((latest.value - first.value).toFixed(2));
  const summary = {
    observedWeeks: valid.length,
    first,
    latest,
    change,
    direction: change > 0 ? 'increasing' : change < 0 ? 'decreasing' : 'stable',
  };
  if (includePoints) summary.points = valid;
  return summary;
}

function createOverviewFacts(
  analytics,
  {
    wantsPrediction = false,
    wantsChart = false,
    metrics = ['all-relevant'],
    weekRange = null,
    forecastHorizon = 4,
  } = {},
) {
  const overview = analytics.getOverview();
  if (overview.totalStudents < MIN_AGGREGATE_GROUP_SIZE) {
    return {
      population: {
        totalStudents: overview.totalStudents,
        suppressed: true,
        reason: `group-size-below-${MIN_AGGREGATE_GROUP_SIZE}`,
      },
    };
  }

  const definitions = [
    ['self', overview.populationTrend, 'self', 'self_n', 1, 4],
    ['buddy', overview.populationTrend, 'buddy', 'buddy_n', 1, 4],
    ['command', overview.populationTrend, 'command', 'command_n', 1, 4],
    ['depression', overview.dassTrend, 'dass_d', 'dass_d_n', 1, 5],
    ['anxiety', overview.dassTrend, 'dass_a', 'dass_a_n', 1, 5],
    ['stress', overview.dassTrend, 'dass_s', 'dass_s_n', 1, 5],
    ['resilience', overview.resilienceTrend, 'cd_risc', 'cd_risc_n', 0, 40],
    ['grit', overview.resilienceTrend, 'grit', 'grit_n', 0, 32],
  ].filter(([metric]) => metricRequested(metrics, metric));

  const trends = Object.fromEntries(definitions.map(
    ([metric, points, valueKey, sampleKey]) => [
      metric,
      summarizeMetric(points, valueKey, sampleKey, {
        includePoints: wantsChart || Boolean(weekRange),
        weekRange,
      }),
    ],
  ));
  const facts = {
    population: {
      totalStudents: overview.totalStudents,
      alerts: Object.fromEntries(Object.entries(overview.alerts).map(([key, count]) => [
        key,
        count > 0 && count < MIN_AGGREGATE_GROUP_SIZE
          ? {
              suppressed: true,
              reason: `sensitive-count-below-${MIN_AGGREGATE_GROUP_SIZE}`,
            }
          : count,
      ])),
      trends,
    },
  };

  if (wantsPrediction) {
    facts.prediction = Object.fromEntries(
      definitions
        .filter(([metric]) => ['self', 'buddy', 'command'].includes(metric))
        .map(([metric, points, valueKey, , minimum, maximum]) => [
          metric,
          createLinearForecast(points, {
            valueKey,
            minimum,
            maximum,
            horizon: forecastHorizon,
          }),
        ]),
    );
  }
  return facts;
}

function createModelOverviewFacts(facts) {
  const population = facts.population ?? {};
  const trends = Object.fromEntries(
    Object.entries(population.trends ?? {})
      .filter(([, trend]) => trend?.suppressed !== true)
      .map(([metric, trend]) => [
        metric,
        { direction: trend.direction },
      ]),
  );
  return {
    population: {
      trends,
    },
  };
}

function latestObservedDate(logs, asOfDate) {
  return logs.reduce(
    (latest, log) => (
      log.date <= asOfDate && (!latest || log.date > latest) ? log.date : latest
    ),
    null,
  );
}

function createRoomFacts({
  students,
  logs,
  assessments,
  asOfDate,
  vault,
  requestedRooms,
  metrics,
}) {
  const latestDate = latestObservedDate(logs, asOfDate);
  if (!latestDate) return { latestObservationDate: null, rooms: [] };

  const studentsByRoom = new Map();
  for (const student of students) {
    if (!student.room) continue;
    if (!studentsByRoom.has(student.room)) studentsByRoom.set(student.room, []);
    studentsByRoom.get(student.room).push(student.id);
  }
  const logsByStudent = new Map();
  for (const log of logs) {
    if (log.date !== latestDate) continue;
    const current = logsByStudent.get(log.studentId);
    if (!current || current.id.localeCompare(log.id) < 0) {
      logsByStudent.set(log.studentId, log);
    }
  }
  const assessmentsByStudent = new Map();
  for (const assessment of assessments) {
    const latestLog = logsByStudent.get(assessment.studentId);
    if (!latestLog || assessment.week > latestLog.week) continue;
    const current = assessmentsByStudent.get(assessment.studentId);
    if (!current || compareAssessments(current, assessment) < 0) {
      assessmentsByStudent.set(assessment.studentId, assessment);
    }
  }

  let rooms = [...studentsByRoom.entries()].map(([room, studentIds]) => {
    const observations = studentIds.map(id => logsByStudent.get(id)).filter(Boolean);
    const roomAssessments = studentIds
      .map(id => assessmentsByStudent.get(id))
      .filter(Boolean);
    const metricMean = (records, field, metric) => {
      if (!metricRequested(metrics, metric)) return undefined;
      const values = records.map(item => item[field]).filter(Number.isFinite);
      return values.length >= MIN_AGGREGATE_GROUP_SIZE
        ? { value: roundedMean(values), n: values.length }
        : {
            suppressed: true,
            n: values.length,
            reason: `metric-n-below-${MIN_AGGREGATE_GROUP_SIZE}`,
          };
    };
    return {
      sourceRoom: room,
      studentCount: studentIds.length,
      observedCount: observations.length,
      concernCount: observations.filter(item => (
        item.self === 4 || item.buddy === 4 || item.command === 4
      )).length,
      physicalConcernCount: observations.filter(item => item.physicalInjury > 1).length,
      metrics: Object.fromEntries([
        ['self', metricMean(observations, 'self', 'self')],
        ['buddy', metricMean(observations, 'buddy', 'buddy')],
        ['command', metricMean(observations, 'command', 'command')],
        ['physical', metricMean(observations, 'physicalInjury', 'physical')],
        ['depression', metricMean(roomAssessments, 'dass_d', 'depression')],
        ['anxiety', metricMean(roomAssessments, 'dass_a', 'anxiety')],
        ['stress', metricMean(roomAssessments, 'dass_s', 'stress')],
        ['resilience', metricMean(roomAssessments, 'cd_risc', 'resilience')],
        ['grit', metricMean(roomAssessments, 'grit', 'grit')],
      ].filter(([, value]) => value !== undefined)),
    };
  });

  if (requestedRooms.length > 0) {
    const selected = new Set(requestedRooms);
    rooms = rooms.filter(room => selected.has(room.sourceRoom));
  } else {
    rooms.sort((left, right) => (
      right.concernCount - left.concernCount
      || right.physicalConcernCount - left.physicalConcernCount
      || (right.metrics.self?.value ?? -Infinity)
        - (left.metrics.self?.value ?? -Infinity)
    ));
    rooms = rooms.slice(0, 10);
  }

  return {
    latestObservationDate: latestDate,
    rooms: rooms.map(({ sourceRoom, ...room }) => {
      const roomToken = vault.tokenForRoom(sourceRoom);
      return room.observedCount < MIN_AGGREGATE_GROUP_SIZE
        ? {
            room: roomToken,
            studentCount: room.studentCount,
            observedCount: room.observedCount,
            suppressed: true,
            reason: `observed-group-size-below-${MIN_AGGREGATE_GROUP_SIZE}`,
          }
        : { ...room, room: roomToken };
    }),
  };
}

function reviewPriority(student, log, assessment) {
  const values = [log?.self, log?.buddy, log?.command].filter(Number.isFinite);
  const redSignals = values.filter(value => value === 4).length;
  const dassValues = [
    assessment?.dass_d,
    assessment?.dass_a,
    assessment?.dass_s,
  ].filter(Number.isFinite);
  const maxDass = dassValues.length > 0 ? Math.max(...dassValues) : null;
  const mentalSeverity = student.demographics?.mentalSeverity ?? null;
  const reviewTier = log?.self === 4 && log?.buddy === 4 && log?.command === 4
    ? 1
    : log?.self === 4 && (log?.buddy === 4 || log?.command === 4)
      ? 2
      : mentalSeverity === 3
        ? 3
        : redSignals > 0
          ? 4
          : maxDass >= 4
            ? 5
            : log?.physicalInjury > 1
              ? 6
              : null;
  return {
    reviewTier,
    reasons: [
      reviewTier === 1 ? 'latest-red-3' : null,
      reviewTier === 2 ? 'latest-self-plus-red' : null,
      redSignals > 0 ? `${redSignals}-latest-level-4-signals` : null,
      log?.physicalInjury > 1 ? 'physical-concern' : null,
      mentalSeverity === 3 ? 'existing-high-severity-status' : null,
      maxDass >= 4 ? 'latest-dass-dimension-at-least-4' : null,
    ].filter(Boolean),
  };
}

function rankedMetricValue(metric, log, assessment) {
  return {
    self: log?.self,
    buddy: log?.buddy,
    command: log?.command,
    physical: log?.physicalInjury,
    depression: assessment?.dass_d,
    anxiety: assessment?.dass_a,
    stress: assessment?.dass_s,
    resilience: assessment?.cd_risc,
    grit: assessment?.grit,
  }[metric] ?? null;
}

function createPeopleFacts({
  students,
  logs,
  assessments,
  asOfDate,
  vault,
  limit = MAX_SUBJECTS,
  sort = 'descending',
  metrics = ['all-relevant'],
}) {
  const observedLogs = logs.filter(log => log.date <= asOfDate);
  const latestLogs = new Map();
  for (const log of observedLogs) {
    const current = latestLogs.get(log.studentId);
    if (!current || compareLogs(current, log) < 0) latestLogs.set(log.studentId, log);
  }

  const rankingMetric = metrics.length === 1 && metrics[0] !== 'all-relevant'
    ? metrics[0]
    : null;
  const candidates = students
    .map(student => {
      const log = latestLogs.get(student.id) ?? null;
      const assessment = assessments
        .filter(item => (
          item.studentId === student.id
          && Number.isFinite(log?.week)
          && item.week <= log.week
        ))
        .sort(compareAssessments)
        .at(-1) ?? null;
      if (rankingMetric) {
        return {
          student,
          metric: rankingMetric,
          value: rankedMetricValue(rankingMetric, log, assessment),
          latestWeek: rankingMetric === 'self'
            || rankingMetric === 'buddy'
            || rankingMetric === 'command'
            || rankingMetric === 'physical'
            ? log?.week ?? null
            : assessment?.week ?? null,
        };
      }
      const priority = reviewPriority(student, log, assessment);
      return {
        student,
        reviewTier: priority.reviewTier,
        reasonCodes: priority.reasons,
        latestWeek: log?.week ?? null,
      };
    })
    .filter(item => (
      rankingMetric ? Number.isFinite(item.value) : item.reviewTier !== null
    ))
    .sort((left, right) => (
      (rankingMetric
        ? (sort === 'ascending'
            ? left.value - right.value
            : right.value - left.value)
        : (sort === 'ascending'
            ? right.reviewTier - left.reviewTier
            : left.reviewTier - right.reviewTier))
      || left.student.id.localeCompare(right.student.id)
    ));
  const subjects = candidates
    .slice(0, Math.min(MAX_SUBJECTS, Math.max(1, limit)))
    .map(({ student, ...item }) => ({
      ...item,
      token: vault.tokenForStudent(student),
    }));

  return {
    rankingMethod: rankingMetric
      ? 'deterministic-metric-ranking-v1'
      : 'deterministic-review-priority-v1',
    rankingMetric,
    sort,
    rankingLimit: Math.min(MAX_SUBJECTS, Math.max(1, limit)),
    subjects,
  };
}

function createIndividualFacts({
  matchedStudents,
  logs,
  assessments,
  asOfDate,
  vault,
  wantsPrediction,
  wantsChart,
  metrics,
  weekRange,
  forecastHorizon,
}) {
  return matchedStudents.slice(0, MAX_INDIVIDUALS).map(student => {
    const logsByDate = new Map();
    for (const log of logs.filter(item => (
      item.studentId === student.id && item.date <= asOfDate
    ))) {
      const current = logsByDate.get(log.date);
      if (!current || current.id.localeCompare(log.id) < 0) logsByDate.set(log.date, log);
    }
    const orderedStudentLogs = [...logsByDate.values()].sort(compareLogs);
    const selectedStudentLogs = weekRange
      ? orderedStudentLogs.filter(log => (
          log.week === weekRange.fromWeek || log.week === weekRange.toWeek
        ))
      : orderedStudentLogs;
    const studentLogs = selectedStudentLogs.map(log => ({
        week: log.week,
        self: log.self,
        buddy: log.buddy,
        command: log.command,
        physicalInjury: log.physicalInjury,
      }));
    const latestObservedWeek = studentLogs.at(-1)?.week ?? null;
    const assessmentsByWeek = new Map();
    for (const assessment of assessments.filter(item => (
      item.studentId === student.id
      && Number.isFinite(latestObservedWeek)
      && item.week <= latestObservedWeek
    ))) {
      const current = assessmentsByWeek.get(assessment.week);
      if (!current || current.id.localeCompare(assessment.id) < 0) {
        assessmentsByWeek.set(assessment.week, assessment);
      }
    }
    const orderedStudentAssessments = [...assessmentsByWeek.values()]
      .sort(compareAssessments);
    const selectedStudentAssessments = weekRange
      ? orderedStudentAssessments.filter(assessment => (
          assessment.week === weekRange.fromWeek
          || assessment.week === weekRange.toWeek
        ))
      : orderedStudentAssessments;
    const studentAssessments = selectedStudentAssessments
      .map(assessment => ({
        week: assessment.week,
        depression: assessment.dass_d,
        anxiety: assessment.dass_a,
        stress: assessment.dass_s,
        cdRisc: assessment.cd_risc,
        grit: assessment.grit,
      }));

    const metricDefinitions = [
      ['self', studentLogs, 'self'],
      ['buddy', studentLogs, 'buddy'],
      ['command', studentLogs, 'command'],
      ['physical', studentLogs, 'physicalInjury'],
      ['depression', studentAssessments, 'depression'],
      ['anxiety', studentAssessments, 'anxiety'],
      ['stress', studentAssessments, 'stress'],
      ['resilience', studentAssessments, 'cdRisc'],
      ['grit', studentAssessments, 'grit'],
    ].filter(([metric]) => metricRequested(metrics, metric));
    const metricFacts = Object.fromEntries(metricDefinitions.map(
      ([metric, points, field]) => {
        const valid = points.filter(point => Number.isFinite(point[field]));
        if (valid.length === 0) return [metric, { available: false }];
        const first = valid[0];
        const latest = valid.at(-1);
        const change = Number((latest[field] - first[field]).toFixed(2));
        const fact = {
          observedPoints: valid.length,
          first: { week: first.week, value: first[field] },
          latest: { week: latest.week, value: latest[field] },
          change,
          direction: change > 0 ? 'increasing' : change < 0 ? 'decreasing' : 'stable',
        };
        if (wantsChart) {
          fact.points = valid.map(point => ({ week: point.week, value: point[field] }));
        }
        return [metric, fact];
      },
    ));

    const facts = {
      subject: vault.tokenForStudent(student),
      metrics: metricFacts,
    };
    if (wantsPrediction) {
      const forecastDefinitions = metricDefinitions.filter(
        ([metric]) => ['self', 'buddy', 'command'].includes(metric),
      );
      facts.prediction = Object.fromEntries(forecastDefinitions.map(
        ([metric, points, field]) => {
          const valuesByWeek = new Map();
          for (const point of points) {
            if (!Number.isFinite(point[field])) continue;
            if (!valuesByWeek.has(point.week)) valuesByWeek.set(point.week, []);
            valuesByWeek.get(point.week).push(point[field]);
          }
          const weeklyPoints = [...valuesByWeek.entries()].map(([week, values]) => ({
            week,
            value: roundedMean(values),
          }));
          return [
            metric,
            createLinearForecast(weeklyPoints, {
              minimum: 1,
              maximum: 4,
              horizon: forecastHorizon,
            }),
          ];
        },
      ));
    }
    return facts;
  });
}

function formatValue(value) {
  if (!Number.isFinite(value)) return 'ไม่มีข้อมูล';
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(2)));
}

function directionLabel(direction) {
  if (direction === 'increasing') return 'เพิ่มขึ้น';
  if (direction === 'decreasing') return 'ลดลง';
  return 'คงที่';
}

function reasonLabel(reason) {
  const levelMatch = String(reason).match(/^(\d+)-latest-level-4-signals$/u);
  if (levelMatch) return `มีสัญญาณระดับ 4 ล่าสุด ${levelMatch[1]} ด้าน`;
  return {
    'latest-red-3': 'Self, Buddy และ Command ล่าสุดอยู่ระดับ 4',
    'latest-self-plus-red': 'Self และอย่างน้อยหนึ่งสัญญาณร่วมล่าสุดอยู่ระดับ 4',
    'physical-concern': 'มีสัญญาณด้านร่างกายที่ควรทบทวน',
    'existing-high-severity-status': 'มีสถานะเดิมที่กำหนดให้ทบทวนเป็นลำดับสูง',
    'latest-dass-dimension-at-least-4': 'DASS อย่างน้อยหนึ่งด้านล่าสุดอยู่ระดับ 4 ขึ้นไป',
  }[reason] ?? 'เข้าเกณฑ์ทบทวนข้อมูลตามกติกาที่กำหนด';
}

function createPeopleLocalPayload({ facts, task, restoreText }) {
  const metricRanking = facts.rankingMethod === 'deterministic-metric-ranking-v1';
  const metricLabel = METRIC_LABELS[facts.rankingMetric] ?? facts.rankingMetric;
  const rows = facts.subjects.map((subject, index) => {
    const display = restoreText(subject.token);
    return metricRanking
      ? [
          String(index + 1),
          display,
          formatValue(subject.value),
          Number.isFinite(subject.latestWeek) ? `Wk ${subject.latestWeek}` : 'ไม่มีข้อมูล',
        ]
      : [
          String(index + 1),
          display,
          String(subject.reviewTier),
          subject.reasonCodes.map(reasonLabel).join('; '),
          Number.isFinite(subject.latestWeek) ? `Wk ${subject.latestWeek}` : 'ไม่มีข้อมูล',
        ];
  });
  const latestWeeks = facts.subjects
    .map(subject => subject.latestWeek)
    .filter(Number.isFinite);
  const coverage = latestWeeks.length > 0
    ? `ข้อมูลล่าสุดของรายการอยู่ระหว่าง Wk ${Math.min(...latestWeeks)}–${Math.max(...latestWeeks)}`
    : 'ไม่มี observation ที่ใช้จัดลำดับ';

  return {
    answer: facts.subjects.length > 0
      ? metricRanking
        ? `จัดลำดับ ${facts.subjects.length} คนตามค่า ${metricLabel} แบบ ${facts.sort === 'ascending' ? 'ต่ำไปสูง' : 'สูงไปต่ำ'}`
        : `พบ ${facts.subjects.length} คนที่ควรทบทวนข้อมูลตามกติกา deterministic ที่กำหนด`
      : 'ไม่พบรายการที่เข้าเกณฑ์ทบทวนข้อมูลตามกติกาที่กำหนด',
    highlights: facts.subjects.slice(0, 3).map(subject => (
      metricRanking
        ? `${restoreText(subject.token)}: ${metricLabel} = ${formatValue(subject.value)}`
        : `${restoreText(subject.token)}: ${subject.reasonCodes.map(reasonLabel).join('; ')}`
    )),
    confidence: facts.subjects.length > 0 ? 'high' : 'low',
    dataCoverage: `${coverage}; คำตอบนี้ไม่ได้ส่งข้อมูลระดับบุคคลไปยังโมเดลภายนอก`,
    table: task.output === 'table-and-summary'
      ? {
          title: metricRanking
            ? `ลำดับตามค่า ${metricLabel}`
            : 'ลำดับสำหรับทบทวนข้อมูล',
          columns: metricRanking
            ? ['ลำดับ', 'บุคคล', metricLabel, 'ข้อมูลล่าสุด']
            : ['ลำดับ', 'บุคคล', 'ระดับทบทวน', 'เหตุผล', 'ข้อมูลล่าสุด'],
          rows,
        }
      : null,
    chart: null,
    methodNote: metricRanking
      ? 'จัดลำดับค่าล่าสุดแบบ deterministic; ไม่ใช่การวินิจฉัยหรือการจัดลำดับความเสี่ยงทางคลินิก'
      : 'จัดลำดับด้วย deterministic-review-priority-v1 ไม่ใช่คะแนนวินิจฉัยหรือความเสี่ยงทางคลินิก',
    followUps: ['ต้องการเปิดดูแนวโน้มของบุคคลใดโดยระบุชื่อหรือรหัสให้ชัดเจน'],
  };
}

function individualMetricSentence(metric, fact, operation) {
  const label = METRIC_LABELS[metric] ?? metric;
  if (!fact || fact.available === false) return `${label}: ไม่มีข้อมูลที่ใช้ได้`;
  if (operation === 'compare-weeks') {
    return `${label}: Wk ${fact.first.week} = ${formatValue(fact.first.value)}, `
      + `Wk ${fact.latest.week} = ${formatValue(fact.latest.value)}, `
      + `เปลี่ยน ${formatValue(fact.change)}`;
  }
  return `${label}: ล่าสุด Wk ${fact.latest.week} = ${formatValue(fact.latest.value)}, `
    + `${directionLabel(fact.direction)} ${formatValue(Math.abs(fact.change))} `
    + `จาก Wk ${fact.first.week}`;
}

function createIndividualChart(individuals) {
  const candidates = individuals.flatMap(individual => (
    Object.entries(individual.metrics).map(([metric, fact]) => ({
      subject: individual.subject,
      metric,
      fact,
    }))
  )).filter(candidate => Array.isArray(candidate.fact?.points)).slice(0, 4);
  if (candidates.length === 0) return null;

  const weeks = [...new Set(candidates.flatMap(candidate => (
    candidate.fact.points.map(point => point.week)
  )))].sort((left, right) => left - right).slice(0, 24);
  if (weeks.length === 0) return null;

  return {
    type: 'line',
    title: 'แนวโน้มข้อมูลที่สังเกตได้',
    xLabel: 'สัปดาห์',
    yLabel: 'ค่า',
    series: candidates.map((candidate, index) => ({
      id: `series_${index + 1}`,
      label: `${candidate.subject} · ${METRIC_LABELS[candidate.metric] ?? candidate.metric}`,
      color: LOCAL_CHART_COLORS[index],
    })),
    points: weeks.map(week => ({
      label: `Wk ${week}`,
      values: candidates.map(candidate => (
        candidate.fact.points.find(point => point.week === week)?.value ?? null
      )),
    })),
  };
}

function createIndividualLocalPayload({ facts, task, restoreText }) {
  const hydrated = facts.individuals.map(individual => ({
    ...individual,
    subject: restoreText(individual.subject),
  }));
  const sentences = hydrated.flatMap(individual => (
    Object.entries(individual.metrics).map(([metric, fact]) => (
      `${individual.subject} — ${individualMetricSentence(metric, fact, task.operation)}`
    ))
  ));
  const forecastSentences = hydrated.flatMap(individual => (
    Object.entries(individual.prediction ?? {}).flatMap(([metric, prediction]) => {
      if (!prediction || prediction.forecast.length === 0) {
        return [`${individual.subject} — ${METRIC_LABELS[metric] ?? metric}: ไม่มีสัปดาห์ที่คาดการณ์ได้ภายใน Wk 16`];
      }
      return [
        `${individual.subject} — แนวโน้มเชิงเส้น ${METRIC_LABELS[metric] ?? metric}: `
        + prediction.forecast
          .map(point => `Wk ${point.week} = ${formatValue(point.value)}`)
          .join(', '),
      ];
    })
  ));
  const allSentences = [...sentences, ...forecastSentences];
  const tableRows = hydrated.flatMap(individual => (
    Object.entries(individual.metrics).map(([metric, fact]) => [
      individual.subject,
      METRIC_LABELS[metric] ?? metric,
      fact?.available === false ? 'ไม่มีข้อมูล' : `Wk ${fact.latest.week}`,
      fact?.available === false ? 'ไม่มีข้อมูล' : formatValue(fact.latest.value),
      fact?.available === false ? 'ไม่มีข้อมูล' : formatValue(fact.change),
    ])
  ));
  const predictionUsed = forecastSentences.length > 0;

  return {
    answer: allSentences.length > 0
      ? allSentences.join(' | ')
      : 'ไม่พบข้อมูลที่ใช้ตอบคำถามนี้',
    highlights: allSentences.slice(0, 6),
    confidence: sentences.length > 0 ? 'high' : 'low',
    dataCoverage: 'ใช้เฉพาะค่าที่สังเกตได้ของบุคคลที่ระบุ และไม่ได้ส่งข้อมูลระดับบุคคลไปยังโมเดลภายนอก',
    table: task.output === 'table-and-summary'
      ? {
          title: 'สรุปข้อมูลรายบุคคล',
          columns: ['บุคคล', 'Metric', 'ล่าสุด', 'ค่า', 'การเปลี่ยนแปลง'],
          rows: tableRows.slice(0, 20),
        }
      : null,
    chart: task.output === 'chart-and-summary'
      ? createIndividualChart(hydrated)
      : null,
    methodNote: predictionUsed
      ? 'Forecast คำนวณด้วย ordinary least squares จากค่ารายสัปดาห์ที่สังเกตได้ เป็นแนวโน้มเชิงสำรวจ ไม่ใช่การวินิจฉัย'
      : 'สรุปแบบ deterministic จากค่าที่สังเกตได้ ไม่ใช่การวินิจฉัย',
    followUps: ['ต้องการเปรียบเทียบสัปดาห์หรือ metric ใดเพิ่มเติม'],
  };
}

function roomMetricText(metric) {
  if (!metric || metric.suppressed) return 'sample ไม่พอ';
  return `${formatValue(metric.value)} (n=${metric.n})`;
}

function createRoomLocalPayload({ facts, task, restoreText }) {
  const rooms = facts.rooms.map(room => ({
    ...room,
    room: restoreText(room.room),
  }));
  const metricKeys = [...new Set(rooms.flatMap(room => Object.keys(room.metrics ?? {})))]
    .slice(0, 4);
  const summaryRows = rooms.map(room => [
    room.room,
    String(room.observedCount),
    String(room.concernCount ?? 0),
    ...metricKeys.map(metric => roomMetricText(room.metrics?.[metric])),
  ]);
  const top = rooms.find(room => !room.suppressed) ?? rooms[0] ?? null;
  const topMetricSummary = top && !top.suppressed
    ? Object.entries(top.metrics ?? {})
        .map(([metric, value]) => (
          `${METRIC_LABELS[metric] ?? metric} = ${roomMetricText(value)}`
        ))
        .join(', ')
    : '';
  const highlights = rooms.slice(0, 3).map(room => (
    room.suppressed
      ? `${room.room}: ปกปิดค่า aggregate เพราะมี observation ไม่ถึง ${MIN_AGGREGATE_GROUP_SIZE}`
      : `${room.room}: observation ${room.observedCount}, สัญญาณที่ควรทบทวน ${room.concernCount}`
  ));
  const chart = task.output === 'chart-and-summary' && metricKeys.length > 0
    ? {
        type: 'bar',
        title: 'ค่าเฉลี่ยล่าสุดแยกตามห้อง',
        xLabel: 'ห้อง',
        yLabel: 'ค่าเฉลี่ย',
        series: metricKeys.map((metric, index) => ({
          id: `series_${index + 1}`,
          label: METRIC_LABELS[metric] ?? metric,
          color: LOCAL_CHART_COLORS[index],
        })),
        points: rooms.slice(0, 24).map(room => ({
          label: room.room,
          values: metricKeys.map(metric => (
            Number.isFinite(room.metrics?.[metric]?.value)
              ? room.metrics[metric].value
              : null
          )),
        })),
      }
    : null;

  return {
    answer: top
      ? `${top.room}: ${topMetricSummary || `sample ไม่ถึง ${MIN_AGGREGATE_GROUP_SIZE}`}; `
        + 'ผลนี้เป็นข้อมูลเพื่อทบทวน ไม่ใช่การวินิจฉัย'
      : 'ไม่มีข้อมูลรายห้องที่ใช้ได้',
    highlights,
    confidence: top && !top.suppressed ? 'high' : 'low',
    dataCoverage: facts.latestObservationDate
      ? `ค่าที่สังเกตจริงล่าสุดวันที่ ${facts.latestObservationDate}; ไม่ได้ส่งข้อมูลรายห้องไปยังโมเดลภายนอก`
      : 'ไม่มี observation ล่าสุดที่ใช้ได้ และไม่ได้เรียกโมเดลภายนอก',
    table: task.output === 'table-and-summary'
      ? {
          title: 'สรุปล่าสุดแยกตามห้อง',
          columns: [
            'ห้อง',
            'จำนวน observation',
            'สัญญาณที่ควรทบทวน',
            ...metricKeys.map(metric => METRIC_LABELS[metric] ?? metric),
          ],
          rows: summaryRows,
        }
      : null,
    chart,
    methodNote: `ใช้เฉพาะ observation จริงของวันล่าสุด และ suppress metric ที่มี n < ${MIN_AGGREGATE_GROUP_SIZE}`,
    followUps: ['ต้องการดูห้องใดหรือ metric ใดโดยเฉพาะ'],
  };
}

function overviewTrendSentence(metric, trend, operation) {
  const label = METRIC_LABELS[metric] ?? metric;
  if (!trend || trend.suppressed) return `${label}: sample ไม่พอ`;
  if (operation === 'compare-weeks') {
    return `${label}: ${trend.first.week} = ${formatValue(trend.first.value)}, `
      + `${trend.latest.week} = ${formatValue(trend.latest.value)}, `
      + `เปลี่ยน ${formatValue(trend.change)}`;
  }
  return `${label}: ล่าสุด ${trend.latest.week} = ${formatValue(trend.latest.value)}, `
    + `${directionLabel(trend.direction)} ${formatValue(Math.abs(trend.change))}`;
}

function createOverviewChart(trends) {
  const candidates = Object.entries(trends)
    .filter(([, trend]) => Array.isArray(trend?.points))
    .slice(0, 4);
  if (candidates.length === 0) return null;
  const labels = [...new Set(candidates.flatMap(([, trend]) => (
    trend.points.map(point => String(point.week))
  )))].slice(0, 24);
  return {
    type: 'line',
    title: 'แนวโน้มภาพรวม',
    xLabel: 'สัปดาห์',
    yLabel: 'ค่าเฉลี่ย',
    series: candidates.map(([metric], index) => ({
      id: `series_${index + 1}`,
      label: METRIC_LABELS[metric] ?? metric,
      color: LOCAL_CHART_COLORS[index],
    })),
    points: labels.map(label => ({
      label,
      values: candidates.map(([, trend]) => (
        trend.points.find(point => String(point.week) === label)?.value ?? null
      )),
    })),
  };
}

function createOverviewLocalPayload({ facts, task, source }) {
  const trends = facts.population?.trends ?? {};
  const trendSentences = Object.entries(trends).map(([metric, trend]) => (
    overviewTrendSentence(metric, trend, task.operation)
  ));
  const forecastSentences = Object.entries(facts.prediction ?? {}).flatMap(
    ([metric, prediction]) => {
      if (!prediction || prediction.forecast.length === 0) {
        return [`${METRIC_LABELS[metric] ?? metric}: ไม่มีสัปดาห์ที่คาดการณ์ได้ภายใน Wk 16`];
      }
      return [
        `แนวโน้มเชิงเส้น ${METRIC_LABELS[metric] ?? metric}: `
        + prediction.forecast
          .map(point => `Wk ${point.week} = ${formatValue(point.value)}`)
          .join(', '),
      ];
    },
  );
  const sentences = [...trendSentences, ...forecastSentences];
  const tableRows = Object.entries(trends).map(([metric, trend]) => [
    METRIC_LABELS[metric] ?? metric,
    trend?.suppressed ? 'sample ไม่พอ' : String(trend.latest.week),
    trend?.suppressed ? 'sample ไม่พอ' : formatValue(trend.latest.value),
    trend?.suppressed ? 'sample ไม่พอ' : formatValue(trend.change),
  ]);

  return {
    answer: facts.population?.suppressed
      ? `ไม่สรุปค่า aggregate เพราะกลุ่มมี ${facts.population.totalStudents} คน ซึ่งต่ำกว่าเกณฑ์ ${MIN_AGGREGATE_GROUP_SIZE}`
      : sentences.length > 0
        ? sentences.join(' | ')
        : 'ไม่มีข้อมูลภาพรวมที่ใช้ได้',
    highlights: sentences.slice(0, 6),
    confidence: trendSentences.some(sentence => !sentence.endsWith('sample ไม่พอ'))
      ? 'high'
      : 'low',
    dataCoverage: source.latestObservationDate
      ? `ข้อมูลที่สังเกตได้ล่าสุด ${source.latestObservationDate} (${source.latestObservationWeek ? `Wk ${source.latestObservationWeek}` : 'ไม่ระบุสัปดาห์'}); คำนวณภายในระบบ`
      : 'ไม่มี observation ล่าสุดที่ใช้ได้',
    table: task.output === 'table-and-summary'
      ? {
          title: 'สรุปแนวโน้มภาพรวม',
          columns: ['Metric', 'ล่าสุด', 'ค่า', 'การเปลี่ยนแปลง'],
          rows: tableRows,
        }
      : null,
    chart: task.output === 'chart-and-summary' ? createOverviewChart(trends) : null,
    methodNote: forecastSentences.length > 0
      ? 'Forecast คำนวณด้วย ordinary least squares และเป็นแนวโน้มเชิงสำรวจ ไม่ใช่การวินิจฉัย'
      : 'คำนวณแบบ deterministic จาก aggregate ที่ผ่านเกณฑ์ sample ขั้นต่ำ',
    followUps: ['ต้องการเจาะจง metric หรือช่วงสัปดาห์ใดเพิ่มเติม'],
  };
}

function shouldUseLocalDerivedResponse(requestType, task, metrics, facts) {
  if (requestType !== 'overview') return true;
  const hasUsableTrend = Object.values(facts.population?.trends ?? {}).some(trend => (
    trend?.suppressed !== true
    && Number.isFinite(trend?.latest?.value)
  ));
  return (
    facts.population?.suppressed === true
    ||
    !hasUsableTrend
    ||
    task.operation !== 'summary'
    || task.output !== 'summary'
    || !metrics.includes('all-relevant')
  );
}

function createLocalDerivedPayload({
  requestType,
  facts,
  task,
  source,
  restoreText,
}) {
  if (requestType === 'people') {
    return createPeopleLocalPayload({ facts, task, restoreText });
  }
  if (requestType === 'individual') {
    return createIndividualLocalPayload({ facts, task, restoreText });
  }
  if (requestType === 'room') {
    return createRoomLocalPayload({ facts, task, restoreText });
  }
  return createOverviewLocalPayload({ facts, task, source });
}

function containsSensitiveValue(payload, value) {
  const sensitive = normalize(value).trim();
  if (!sensitive) return false;
  if (sensitive.length >= 3) return payload.includes(sensitive);
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}_])${escapeRegExp(sensitive)}(?:$|[^\\p{L}\\p{N}_])`,
    'u',
  ).test(payload);
}

function assertNoDirectIdentifiers(serialized, dataset) {
  const normalizedPayload = normalize(serialized);
  for (const student of dataset.students) {
    for (const value of [student.id, student.name, student.room]) {
      if (typeof value === 'string' && containsSensitiveValue(normalizedPayload, value)) {
        const error = new Error('privacy-identifier-leak');
        error.publicCode = 'chat-privacy-blocked';
        error.stage = 'privacy';
        throw error;
      }
    }
    const narrativeValues = [
      student.demographics?.school,
      student.demographics?.region,
      student.demographics?.familyHistory,
      student.demographics?.financialBurden,
      student.demographics?.physicalIssueDetail,
      student.demographics?.mentalIssueDetail,
    ];
    if (narrativeValues.some(value => (
      typeof value === 'string'
      && value.trim().length >= 8
      && normalizedPayload.includes(normalize(value))
    ))) {
      const error = new Error('privacy-narrative-leak');
      error.publicCode = 'chat-privacy-blocked';
      error.stage = 'privacy';
      throw error;
    }
  }
  if (dataset.assessments.some(assessment => (
    typeof assessment.drawing_note === 'string'
    && assessment.drawing_note.trim().length >= 8
    && normalizedPayload.includes(normalize(assessment.drawing_note))
  ))) {
    const error = new Error('privacy-note-leak');
    error.publicCode = 'chat-privacy-blocked';
    error.stage = 'privacy';
    throw error;
  }
}

function assertDisclosureBudget(contextJson) {
  if (Buffer.byteLength(contextJson, 'utf8') > MAX_DISCLOSURE_BYTES) {
    const error = new Error('privacy-context-too-large');
    error.publicCode = 'chat-privacy-blocked';
    error.stage = 'privacy';
    throw error;
  }
}

function assertModelRoutePolicy({
  requestType,
  task,
  metrics,
  outboundJson,
}) {
  const aggregateSummaryOnly = (
    requestType === 'overview'
    && task.operation === 'summary'
    && task.output === 'summary'
    && task.prediction === false
    && metrics.length === 1
    && metrics[0] === 'all-relevant'
  );
  if (
    !aggregateSummaryOnly
    || /\b(?:SUBJECT|ROOM)_\d+\b/gu.test(outboundJson)
  ) {
    const error = new Error('privacy-model-route-forbidden');
    error.publicCode = 'chat-privacy-blocked';
    error.stage = 'privacy';
    throw error;
  }
}

function preparePrivateTask({ students, messages }) {
  const vault = createEntityVault(students, messages);
  const originalQuestion = messages.at(-1)?.content ?? '';
  const sanitizedQuestion = vault.sanitizedMessages.at(-1)?.content ?? '';
  const requestType = classifyRequest(sanitizedQuestion, vault);
  const metrics = detectMetrics(originalQuestion);
  const task = buildTaskSpec({
    question: sanitizedQuestion,
    requestType,
    metrics,
    vault,
  });
  return {
    vault,
    originalQuestion,
    sanitizedQuestion,
    requestType,
    metrics,
    task,
  };
}

export function compilePrivateTask({ students, messages }) {
  const prepared = preparePrivateTask({ students, messages });
  return {
    sanitizedQuestion: prepared.sanitizedQuestion,
    requestType: prepared.requestType,
    metrics: prepared.metrics,
    task: prepared.task,
  };
}

export function buildPrivateModelRequest({
  dataset,
  messages,
  asOfDate = localIsoDate(),
}) {
  const {
    vault,
    originalQuestion,
    requestType,
    metrics,
    task,
  } = preparePrivateTask({
    students: dataset.students,
    messages,
  });

  if (RESTRICTED_REQUEST.test(originalQuestion)) {
    return {
      localPayload: localPayload(
        'ไม่สามารถเปิดเผยคำสั่งระบบหรือข้อมูลบริบทภายในได้',
        ['ถามสรุปภาพรวมจากข้อมูลที่ได้รับอนุญาต'],
      ),
      requestType: 'local-privacy',
      disclosureBytes: 0,
    };
  }
  if (task.operation === 'clinical-diagnosis-request') {
    return {
      localPayload: localPayload(
        'ระบบนี้ไม่สามารถสรุปการวินิจฉัยโรคได้ กรุณาให้ผู้เชี่ยวชาญที่รับผิดชอบทบทวนข้อมูลและประเมินตามกระบวนการที่กำหนด',
        ['สรุปเฉพาะแนวโน้มคะแนนที่สังเกตได้'],
      ),
      requestType: 'local-clinical-safety',
      disclosureBytes: 0,
    };
  }
  if (task.operation === 'causal-evidence') {
    return {
      localPayload: {
        answer: 'ข้อมูลในระบบเป็นค่าที่สังเกตและผลประเมิน ไม่ใช่หลักฐานเชิงสาเหตุ จึงไม่สามารถสรุปได้ว่าทำไมจึงเกิดภาวะหรือการเปลี่ยนแปลงนั้น',
        highlights: [],
        confidence: 'low',
        dataCoverage: 'ไม่มีการส่งข้อมูลไปยังโมเดลภายนอกสำหรับคำถามเชิงสาเหตุ',
        table: null,
        chart: null,
        methodNote: 'การพบคะแนนหรือแนวโน้มร่วมกันไม่พิสูจน์ความเป็นเหตุและผล',
        followUps: ['ต้องการสรุปเฉพาะแนวโน้มคะแนนที่สังเกตได้หรือไม่'],
      },
      requestType: 'local-clinical-safety',
      disclosureBytes: 0,
    };
  }
  if (requestType === 'mixed') {
    return {
      localPayload: localPayload(
        'คำถามระบุทั้งบุคคลและห้องพร้อมกัน กรุณาแยกเป็นคำถามรายบุคคลหรือรายห้องเพื่อป้องกันการจับคู่ข้อมูลผิดขอบเขต',
      ),
      requestType: 'local-clarification',
      disclosureBytes: 0,
    };
  }
  if (
    vault.matchedStudents.length === 0
    && vault.matchedRooms.length === 0
    && ANAPHORA_REQUEST.test(originalQuestion)
  ) {
    return {
      localPayload: localPayload(
        'เพื่อป้องกันการใช้ข้อมูลผิดบุคคล กรุณาระบุชื่อ รหัส หรือห้องที่ต้องการถามให้ชัดเจนอีกครั้ง',
      ),
      requestType: 'local-clarification',
      disclosureBytes: 0,
    };
  }
  if (vault.matchedStudents.length > MAX_INDIVIDUALS) {
    return {
      localPayload: localPayload(
        `กรุณาระบุไม่เกิน ${MAX_INDIVIDUALS} คนต่อคำถาม เพื่อจำกัดการเปิดเผยข้อมูล`,
      ),
      requestType: 'local-clarification',
      disclosureBytes: 0,
    };
  }
  if (
    requestType === 'overview'
    && metrics.includes('all-relevant')
    && !OVERVIEW_REQUEST.test(originalQuestion)
    && !COVERAGE_REQUEST.test(originalQuestion)
    && !task.prediction
    && task.output === 'summary'
  ) {
    return {
      localPayload: localPayload(
        'คำถามยังไม่ระบุขอบเขตข้อมูลที่ชัดเจน กรุณาระบุว่าต้องการภาพรวม ห้อง บุคคล หรือ metric ใด',
      ),
      requestType: 'local-clarification',
      disclosureBytes: 0,
    };
  }
  const wantsPrediction = task.prediction;
  const wantsChart = task.output === 'chart-and-summary';
  const latestDate = latestObservedDate(dataset.logs, asOfDate);
  const latestWeek = dataset.logs
    .filter(log => log.date === latestDate)
    .reduce((latest, log) => Math.max(latest, log.week), 0) || null;
  const eligibleAssessments = dataset.assessments.filter(assessment => (
    Number.isFinite(latestWeek) && assessment.week <= latestWeek
  ));
  if (task.operation === 'coverage') {
    return {
      localPayload: localCoveragePayload({
        students: dataset.students,
        logs: dataset.logs,
        eligibleAssessments,
        asOfDate,
        latestDate,
        latestWeek,
      }),
      requestType: 'local-derived',
      disclosureBytes: 0,
    };
  }
  const analytics = requestType === 'overview'
    ? createMonitoringAnalytics({
        students: dataset.students,
        logs: dataset.logs,
        assessments: eligibleAssessments,
        asOfDate,
      })
    : null;

  const source = {
    asOfDate,
    ...(requestType === 'overview' || requestType === 'people'
      ? {
          latestObservationDate: latestDate,
          latestObservationWeek: latestWeek,
        }
      : {}),
  };
  const facts = requestType === 'individual'
    ? {
        individuals: createIndividualFacts({
          matchedStudents: vault.matchedStudents,
          logs: dataset.logs,
          assessments: eligibleAssessments,
          asOfDate,
          vault,
          wantsPrediction,
          wantsChart,
          metrics,
          weekRange: task.weekRange,
          forecastHorizon: task.forecastHorizon ?? 4,
        }),
      }
    : requestType === 'people'
      ? createPeopleFacts({
          students: vault.matchedRooms.length > 0
            ? dataset.students.filter(student => (
                vault.matchedRooms.includes(student.room)
              ))
            : dataset.students,
          logs: dataset.logs,
          assessments: eligibleAssessments,
          asOfDate,
          vault,
          limit: task.limit,
          sort: task.sort,
          metrics,
        })
      : requestType === 'room'
        ? createRoomFacts({
            students: dataset.students,
            logs: dataset.logs,
            assessments: eligibleAssessments,
            asOfDate,
            vault,
            requestedRooms: vault.matchedRooms,
            metrics,
          })
        : createOverviewFacts(analytics, {
            wantsPrediction,
            wantsChart,
            metrics,
            weekRange: task.weekRange,
            forecastHorizon: task.forecastHorizon ?? 4,
          });

  if (shouldUseLocalDerivedResponse(requestType, task, metrics, facts)) {
    return {
      localPayload: createLocalDerivedPayload({
        requestType,
        facts,
        task,
        source,
        restoreText: vault.restoreText,
      }),
      requestType: 'local-derived',
      disclosureBytes: 0,
    };
  }

  const context = {
    facts: createModelOverviewFacts(facts),
    policy: {
      aggregateOnly: true,
      directIdentifiersWithheld: true,
      rawSensitiveTextWithheld: true,
      useOnlySuppliedFacts: true,
      clinicalDiagnosisProhibited: true,
    },
  };

  const contextJson = JSON.stringify(context);
  const outboundMessages = [{
    role: 'user',
    content: canonicalModelQuestion(task),
  }];
  const outboundJson = JSON.stringify({
    messages: outboundMessages,
    context,
  });
  assertModelRoutePolicy({
    requestType,
    task,
    metrics,
    outboundJson,
  });
  assertDisclosureBudget(outboundJson);
  assertNoDirectIdentifiers(outboundJson, dataset);

  return {
    messages: outboundMessages,
    context,
    contextJson,
    requestType,
    disclosureBytes: Buffer.byteLength(outboundJson, 'utf8'),
    restoreText: vault.restoreText,
    fallbackPayload: createOverviewLocalPayload({ facts, task, source }),
  };
}

export function restoreAssistantPayload(payload, restoreText) {
  const restore = value => {
    if (typeof value === 'string') return restoreText(value);
    if (Array.isArray(value)) return value.map(restore);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, restore(entry)]),
      );
    }
    return value;
  };
  return restore(payload);
}

export function mergeDeterministicEvidence(payload, fallbackPayload) {
  return {
    ...payload,
    highlights: fallbackPayload.highlights,
    dataCoverage: fallbackPayload.dataCoverage,
    table: null,
    chart: null,
    methodNote: fallbackPayload.methodNote,
  };
}

function collectAllowedDisclosureValues(value, allowedTokens, allowedNumbers) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    allowedNumbers.add(String(value));
    return;
  }
  if (typeof value === 'string') {
    for (const token of value.match(/\b(?:SUBJECT|ROOM)_\d+\b/gu) ?? []) {
      allowedTokens.add(token);
    }
    for (const number of value.match(/-?\d+(?:\.\d+)?/gu) ?? []) {
      allowedNumbers.add(String(Number(number)));
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectAllowedDisclosureValues(item, allowedTokens, allowedNumbers);
    }
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      collectAllowedDisclosureValues(item, allowedTokens, allowedNumbers);
    }
  }
}

export function validateAssistantDisclosure(payload, context, dataset = null) {
  const allowedTokens = new Set();
  const allowedNumbers = new Set();
  collectAllowedDisclosureValues(context, allowedTokens, allowedNumbers);
  const serialized = JSON.stringify(payload);
  if (dataset) assertNoDirectIdentifiers(serialized, dataset);

  const outputTokens = serialized.match(/\b(?:SUBJECT|ROOM)_\d+\b/gu) ?? [];
  if (outputTokens.some(token => !allowedTokens.has(token))) {
    const error = new Error('assistant-invented-entity-token');
    error.publicCode = 'chat-invalid-answer';
    error.stage = 'validation';
    throw error;
  }

  const outputNumbers = serialized.match(/-?\d+(?:\.\d+)?/gu) ?? [];
  if (outputNumbers.some(number => !allowedNumbers.has(String(Number(number))))) {
    const error = new Error('assistant-invented-number');
    error.publicCode = 'chat-invalid-answer';
    error.stage = 'validation';
    throw error;
  }
  if (/(วินิจฉัยว่า|สรุปได้ว่า.{0,30}เป็นโรค|สาเหตุ(?:คือ|มาจาก)|เกิดจาก|\b(?:caused by|diagnosed with)\b)/iu.test(serialized)) {
    const error = new Error('assistant-unsafe-clinical-claim');
    error.publicCode = 'chat-invalid-answer';
    error.stage = 'validation';
    throw error;
  }
  return payload;
}

export const PRIVACY_LIMITS = Object.freeze({
  maxDisclosureBytes: MAX_DISCLOSURE_BYTES,
  maxSubjects: MAX_SUBJECTS,
  maxIndividuals: MAX_INDIVIDUALS,
  maxHistoryMessages: MAX_HISTORY_MESSAGES,
  maxSanitizedMessageLength: MAX_SANITIZED_MESSAGE_LENGTH,
  minAggregateGroupSize: MIN_AGGREGATE_GROUP_SIZE,
});
