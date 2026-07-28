const MAX_ANSWER_LENGTH = 8_000;
const MAX_CHART_SERIES = 9;
const ALLOWED_COLORS = new Set(['blue', 'emerald', 'amber', 'rose', 'violet', 'slate']);
const ALLOWED_CHART_TYPES = new Set(['line', 'bar', 'area']);
const ALLOWED_RESPONSE_STATUSES = new Set(['answered', 'partial', 'insufficient']);
const ALLOWED_LIMITATIONS = new Set([
  'insufficient-evidence',
  'forecast-unavailable',
  'small-group-suppressed',
  'metric-omitted-by-privacy-budget',
  'time-window-unavailable',
  'aggregate-only',
  'no-causal-evidence',
  'carried-forward-present',
  'requested-output-unavailable',
  'provider-fallback',
]);
const PLACEHOLDER_TEXT = /^(?:[\s.…·•*_~—–-]+|tbd|todo|placeholder|null|undefined|answered|partial|insufficient)$/iu;
const PUNCTUATION_ONLY = /^[\p{P}\p{S}\s]+$/u;
const MODEL_REPAIR_CHATTER = /(?:output is not valid json|corrected json response|let me fix(?: the)? json|ensure proper json|ผลลัพธ์(?:นี้)?ไม่ใช่ json|แก้(?:ไข)?โครงสร้าง json|\b(?:comma|semicolon)\b)/iu;
const FOLLOW_UP_ACTION = /^(?:ดู|สรุป|เปรียบเทียบ|เทียบ|ตรวจสอบ|วิเคราะห์|คาดการณ์|พยากรณ์|จัดอันดับ|ต้องการ|อยาก|ให้|ขอ|what|show|compare|check|analy[sz]e|forecast|rank)/iu;
const SUMMARY_METRIC_RANGES = Object.freeze({
  self: [1, 4],
  buddy: [1, 4],
  command: [1, 4],
  depression: [0, 21],
  anxiety: [0, 21],
  stress: [0, 21],
  mental_severity: [1, 3],
  physical_injury: [1, 3],
  cd_risc: [0, 40],
  grit: [0, 32],
});
const UNDECLARED_UNIT_TERM = /(?:ค่าเฉลี่ย|ค่าสะสม|อัตรา|ร้อยละ|เปอร์เซ็นต์|รายใหม่|\baverage\b|\bmean\b|\bcumulative\b|\brate\b|\bpercent(?:age)?\b|\bnew cases?\b)/iu;
const NEGATED_UNIT_CLAIM = /(?:ไม่ใช่|มิใช่|ไม่ได้เป็น|ไม่ได้ระบุว่าเป็น|ไม่มีการระบุว่าเป็น|not(?:\s+an?)?)[^.!?;,\n]{0,40}?(?:ค่าเฉลี่ย|ค่าสะสม|อัตรา|ร้อยละ|เปอร์เซ็นต์|รายใหม่|\baverage\b|\bmean\b|\bcumulative\b|\brate\b|\bpercent(?:age)?\b|\bnew cases?\b)(?:\s*(?:หรือ|and|or)\s*(?:ค่าเฉลี่ย|ค่าสะสม|อัตรา|ร้อยละ|เปอร์เซ็นต์|รายใหม่|\baverage\b|\bmean\b|\bcumulative\b|\brate\b|\bpercent(?:age)?\b|\bnew cases?\b))*/giu;
const CONSTANT_TREND_CLAIM = /(?:คงที่|ไม่เปลี่ยนแปลง(?:เลย|ตลอด)|\bconstant\b|\bstable\b|\bunchanged throughout\b)/iu;
const NEGATED_CONSTANT_CLAIM = /(?:ไม่(?:ได้|ใช่)?(?:คงที่|นิ่ง)|not\s+(?:constant|stable)|did\s+not\s+remain\s+unchanged)/giu;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function meaningfulString(value, maxLength) {
  const text = boundedString(value, maxLength);
  return text && !PLACEHOLDER_TEXT.test(text) && !PUNCTUATION_ONLY.test(text) ? text : '';
}

function boundedStrings(value, maxItems, maxLength) {
  return Array.isArray(value)
    ? value
        .map(item => boundedString(item, maxLength))
        .filter(Boolean)
        .slice(0, maxItems)
    : [];
}

function meaningfulStrings(value, maxItems, maxLength) {
  return Array.isArray(value)
    ? value
        .map(item => meaningfulString(item, maxLength))
        .filter(Boolean)
        .slice(0, maxItems)
    : [];
}

function normalizedAnswer(value) {
  const answer = meaningfulString(value, MAX_ANSWER_LENGTH);
  if (!answer || !answer.startsWith('{') || !answer.endsWith('}')) return answer;
  try {
    const nested = JSON.parse(answer);
    if (!isObject(nested)) return answer;
    return meaningfulString(nested.answer ?? nested.summary, MAX_ANSWER_LENGTH) || answer;
  } catch {
    return answer;
  }
}

export const CHAT_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    answer: {
      type: 'string',
      description: 'A substantive Thai answer grounded only in the supplied dashboard context. Never use ellipses or placeholder text.',
    },
    highlights: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'string',
        description: 'A concrete supporting fact or finding in Thai, never placeholder text.',
      },
    },
    confidence: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
    },
    status: {
      type: 'string',
      enum: ['answered', 'partial', 'insufficient'],
      description: 'Whether the requested task was fully answered, only partly answered, or cannot be answered from the supplied evidence.',
    },
    limitations: {
      type: 'array',
      maxItems: 6,
      uniqueItems: true,
      items: {
        type: 'string',
        enum: [
          'insufficient-evidence',
          'forecast-unavailable',
          'small-group-suppressed',
          'metric-omitted-by-privacy-budget',
          'time-window-unavailable',
          'aggregate-only',
          'no-causal-evidence',
          'carried-forward-present',
          'requested-output-unavailable',
          'provider-fallback',
        ],
      },
    },
    dataCoverage: {
      type: 'string',
      description: 'A concrete Thai description of the verified dates, weeks, students, or rooms supporting the answer. Never use placeholder text.',
    },
    table: {
      type: ['object', 'null'],
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        columns: {
          type: 'array',
          minItems: 1,
          maxItems: 8,
          items: { type: 'string' },
        },
        rows: {
          type: 'array',
          maxItems: 20,
          items: {
            type: 'array',
            maxItems: 8,
            items: { type: 'string' },
          },
        },
      },
      required: ['title', 'columns', 'rows'],
    },
    chart: {
      type: ['object', 'null'],
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['line', 'bar', 'area'] },
        title: { type: 'string' },
        xLabel: { type: 'string' },
        yLabel: { type: 'string' },
        series: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_CHART_SERIES,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string' },
              label: { type: 'string' },
              color: {
                type: 'string',
                enum: ['blue', 'emerald', 'amber', 'rose', 'violet', 'slate'],
              },
            },
            required: ['id', 'label', 'color'],
          },
        },
        points: {
          type: 'array',
          minItems: 1,
          maxItems: 24,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              label: { type: 'string' },
              values: {
                type: 'array',
                maxItems: MAX_CHART_SERIES,
                items: { type: ['number', 'null'] },
              },
            },
            required: ['label', 'values'],
          },
        },
      },
      required: ['type', 'title', 'xLabel', 'yLabel', 'series', 'points'],
    },
    methodNote: {
      type: ['string', 'null'],
      description: 'The calculation or prediction method and its important limitation in Thai, or null when not applicable. Never use placeholder text.',
    },
    followUps: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'string',
        description: 'A complete, actionable follow-up question in Thai, never placeholder text.',
      },
    },
  },
  required: [
    'answer',
    'highlights',
    'confidence',
    'status',
    'limitations',
    'dataCoverage',
    'table',
    'chart',
    'methodNote',
    'followUps',
  ],
});

function normalizeTable(table) {
  if (!isObject(table)) return null;
  if (!Array.isArray(table.columns) || table.columns.length === 0 || table.columns.length > 8) {
    return null;
  }
  const columns = table.columns.map(column => boundedString(column, 80));
  if (columns.some(column => !meaningfulString(column, 80))) return null;

  const rows = Array.isArray(table.rows)
    ? table.rows.slice(0, 20).map(row => {
        if (!Array.isArray(row)) return null;
        const normalized = Array.from(
          { length: columns.length },
          (_, index) => boundedString(row[index], 160),
        );
        const hasMeaningfulData = columns.length === 1
          ? Boolean(meaningfulString(normalized[0], 160))
          : normalized.slice(1).some(cell => Boolean(meaningfulString(cell, 160)));
        if (!hasMeaningfulData) return null;
        return normalized.map(cell => meaningfulString(cell, 160) || 'ไม่มีข้อมูล');
      }).filter(Boolean)
    : [];

  if (rows.length === 0) return null;

  return {
    title: boundedString(table.title, 160) || 'ตารางข้อมูล',
    columns,
    rows,
  };
}

function normalizeChart(chart) {
  if (!isObject(chart) || !ALLOWED_CHART_TYPES.has(chart.type)) return null;
  const seenIds = new Set();
  const series = Array.isArray(chart.series)
    ? chart.series
        .map((item, index) => {
          if (!isObject(item)) return null;
          const candidateId = boundedString(item.id, 32);
          const id = /^[a-z][a-z0-9_]{0,31}$/i.test(candidateId)
            ? candidateId
            : `series_${index + 1}`;
          if (seenIds.has(id)) return null;
          seenIds.add(id);
          return {
            id,
            label: boundedString(item.label, 80) || `ชุดข้อมูล ${index + 1}`,
            color: ALLOWED_COLORS.has(item.color) ? item.color : 'blue',
          };
        })
        .filter(Boolean)
        .slice(0, MAX_CHART_SERIES)
    : [];
  if (series.length === 0) return null;

  const points = Array.isArray(chart.points)
    ? chart.points
        .filter(isObject)
        .slice(0, 24)
        .map(point => ({
          label: boundedString(point.label, 80),
          values: Array.from({ length: series.length }, (_, index) => {
            const value = point.values?.[index];
            return Number.isFinite(value) ? value : null;
          }),
        }))
        .filter(point => point.label)
    : [];
  if (points.length === 0) return null;

  return {
    type: chart.type,
    title: boundedString(chart.title, 160) || 'กราฟวิเคราะห์',
    xLabel: boundedString(chart.xLabel, 80),
    yLabel: boundedString(chart.yLabel, 80),
    series,
    points,
  };
}

export function parseAssistantPayload(content) {
  const source = boundedString(content, 100_000)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  let payload;
  try {
    payload = JSON.parse(source);
  } catch {
    throw new Error('invalid-structured-response');
  }
  if (!isObject(payload)) throw new Error('invalid-structured-response');
  const responseText = [
    payload.answer,
    payload.dataCoverage,
    payload.methodNote,
    ...(Array.isArray(payload.highlights) ? payload.highlights : []),
    ...(Array.isArray(payload.followUps) ? payload.followUps : []),
  ].filter(item => typeof item === 'string');
  if (responseText.some(item => MODEL_REPAIR_CHATTER.test(item))) {
    throw new Error('invalid-structured-response');
  }

  const answer = normalizedAnswer(payload.answer);
  if (!answer) throw new Error('empty-assistant-answer');

  return {
    answer,
    highlights: meaningfulStrings(payload.highlights, 6, 500),
    confidence: ['high', 'medium', 'low'].includes(payload.confidence)
      ? payload.confidence
      : 'low',
    status: ALLOWED_RESPONSE_STATUSES.has(payload.status)
      ? payload.status
      : 'insufficient',
    limitations: [...new Set(boundedStrings(payload.limitations, 6, 80))]
      .filter(item => ALLOWED_LIMITATIONS.has(item)),
    dataCoverage: meaningfulString(payload.dataCoverage, 500),
    table: normalizeTable(payload.table),
    chart: normalizeChart(payload.chart),
    methodNote: meaningfulString(payload.methodNote, 1_000) || null,
    followUps: meaningfulStrings(payload.followUps, 3, 240)
      .filter(item => FOLLOW_UP_ACTION.test(item)),
  };
}

function evidenceMetricGroups(evidence, scope) {
  if (scope === 'subject') return evidence.subjects.map(subject => subject.metrics);
  if (scope === 'room') return evidence.rooms.map(room => room.metrics);
  return [evidence.metrics];
}

function numericTokenMatches(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return [...String(text ?? '').matchAll(/(^|[^\d])(-?\d+(?:\.\d+)?)/gu)]
    .map(match => ({
      value: Number(match[2]),
      index: (match.index ?? 0) + match[1].length,
      length: match[2].length,
    }))
    .filter(match => Number.isFinite(match.value));
}

function numericTokens(value) {
  return numericTokenMatches(value).map(match => match.value);
}

function allSummaryMetrics(evidence) {
  return [
    ...evidence.metrics,
    ...evidence.subjects.flatMap(subject => subject.metrics),
    ...evidence.rooms.flatMap(room => room.metrics),
  ];
}

function sameGroundedNumber(left, right) {
  return Math.abs(left - right) <= 0.005;
}

function metricSummaryValues(metric, windows) {
  const directValues = Number.isFinite(metric.value) ? [metric.value] : [];
  const summaryValues = [null, ...windows].flatMap(window => {
    const summary = summarizeObservedTrend(metric, window);
    if (!summary) return [];
    return [
      summary.first,
      summary.last,
      summary.min,
      summary.max,
      summary.mean,
      summary.change,
      summary.slopePerWeek,
    ].filter(Number.isFinite);
  });
  const facts = [...directValues, ...summaryValues];
  const withinMetricDifferences = facts.flatMap((left, leftIndex) => (
    facts.slice(leftIndex + 1).map(right => Math.abs(left - right))
  ));
  return [...facts, ...withinMetricDifferences];
}

function summaryMetricFacts(evidence, windows) {
  const facts = new Map();
  for (const metric of allSummaryMetrics(evidence)) {
    const values = metricSummaryValues(metric, windows);
    const existing = facts.get(metric.metric) ?? [];
    facts.set(metric.metric, [...existing, ...values]);
  }
  return facts;
}

function summaryDerivedValues(evidence, windows) {
  return allSummaryMetrics(evidence).flatMap(metric => [null, ...windows].flatMap(window => {
    const summary = summarizeObservedTrend(metric, window);
    return summary ? Object.values(summary).filter(Number.isFinite) : [];
  }));
}

function withoutRawPoints(metric) {
  if (!metric || typeof metric !== 'object') return metric;
  return Object.fromEntries(Object.entries(metric).filter(([key]) => key !== 'points'));
}

function summaryDisclosedMetadata(evidence, analysisRequest) {
  return {
    schemaVersion: evidence.schemaVersion,
    intent: evidence.intent,
    source: evidence.source,
    coverage: evidence.coverage,
    constraints: evidence.constraints,
    metrics: evidence.metrics.map(withoutRawPoints),
    subjects: evidence.subjects.map(subject => ({
      alias: subject.alias,
      sampleSize: subject.sampleSize,
      metrics: subject.metrics.map(withoutRawPoints),
    })),
    rooms: evidence.rooms.map(room => ({
      alias: room.alias,
      sampleSize: room.sampleSize,
      metrics: room.metrics.map(withoutRawPoints),
    })),
    analysisRequest,
  };
}

function contextualSummaryNumber(text, match) {
  const before = text.slice(Math.max(0, match.index - 32), match.index);
  const after = text.slice(match.index + match.length, match.index + match.length + 24);
  const around = text.slice(Math.max(0, match.index - 10), match.index + match.length + 11);
  return /\d{4}-\d{2}-\d{2}/u.test(around)
    || /(?:week|weeks|สัปดาห์|scale|range|สเกล|ช่วงค่า)[^.!?;,\n]{0,24}$/iu.test(before)
    || /(?:sample(?: size)?|population|cohort|กลุ่มตัวอย่าง|ประชากร)[^.!?;,\n]{0,24}$/iu.test(before)
    || /^\s*(?:week|weeks|สัปดาห์|คน|people|subjects?|จุด|points?|records?|observations?|รายการ|ตัวชี้วัด|metrics?)(?=\s|$|[.,;:])/iu.test(after);
}

function scaleContextNumber(text, match) {
  const before = text.slice(Math.max(0, match.index - 32), match.index);
  const after = text.slice(match.index + match.length, match.index + match.length + 24);
  return /(?:scale|range|สเกล|ช่วงค่า)[^.!?;,\n]{0,24}$/iu.test(before)
    || /^[^.!?;,\n]{0,12}(?:scale|range|สเกล|ช่วงค่า)/iu.test(after);
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function summaryMetricAssociationsAreGrounded(textValue, metricFacts) {
  const text = String(textValue ?? '');
  const metricNames = [...metricFacts.keys()].sort((left, right) => right.length - left.length);
  if (!text || metricNames.length === 0) return true;
  const metricPattern = new RegExp(
    `\\b(?:${metricNames.map(escapeRegularExpression).join('|')})\\b`,
    'giu',
  );
  const clauses = text.split(/[\n,;]|\s+(?:และ|แต่|ขณะที่|and|but|while)\s+/giu);
  return clauses.every(clause => {
    const occurrences = [...clause.matchAll(metricPattern)].map(match => ({
      metric: match[0].toLowerCase(),
      index: match.index ?? 0,
      length: match[0].length,
    }));
    const numbers = numericTokenMatches(clause)
      .filter(match => !contextualSummaryNumber(clause, match));
    if (numbers.length === 0) return true;
    if (occurrences.length === 0) {
      if (metricFacts.size !== 1) return false;
      const allowed = metricFacts.values().next().value ?? [];
      return numbers.every(number => (
        allowed.some(value => sameGroundedNumber(number.value, value))
      ));
    }
    const namedMetrics = [...new Set(occurrences.map(occurrence => occurrence.metric))];
    const comparativeValues = namedMetrics.length >= 2
      && /(?:ต่าง|สูงกว่า|ต่ำกว่า|มากกว่า|น้อยกว่า|difference|higher|lower|more|less)/iu.test(clause)
      ? namedMetrics.flatMap((left, leftIndex) => (
          namedMetrics.slice(leftIndex + 1).flatMap(right => (
            (metricFacts.get(left) ?? []).flatMap(leftValue => (
              (metricFacts.get(right) ?? []).map(rightValue => Math.abs(leftValue - rightValue))
            ))
          ))
        ))
      : [];
    return numbers.every(number => {
      const nearest = occurrences.reduce((best, occurrence) => {
        const center = occurrence.index + (occurrence.length / 2);
        const distance = Math.abs(number.index - center);
        return !best || distance < best.distance ? { occurrence, distance } : best;
      }, null)?.occurrence;
      const allowed = metricFacts.get(nearest?.metric) ?? [];
      return allowed.some(value => sameGroundedNumber(number.value, value))
        || comparativeValues.some(value => sameGroundedNumber(number.value, value));
    });
  });
}

function meanClaimNumber(text, match) {
  const before = text.slice(Math.max(0, match.index - 48), match.index);
  return /(?:ค่าเฉลี่ย|เฉลี่ย|\bmean\b|\baverage\b)[^.!?;,\n\d]{0,40}$/iu.test(before);
}

function summaryMeanClaimsAreGrounded(textValue, evidence, windows) {
  const text = String(textValue ?? '');
  const meansByMetric = new Map();
  for (const metric of allSummaryMetrics(evidence)) {
    const means = [null, ...windows]
      .map(window => summarizeObservedTrend(metric, window)?.mean)
      .filter(Number.isFinite);
    const existing = meansByMetric.get(metric.metric) ?? [];
    meansByMetric.set(metric.metric, [...existing, ...means]);
  }
  const metricNames = [...meansByMetric.keys()].sort((left, right) => right.length - left.length);
  if (!text || metricNames.length === 0) return true;
  const metricPattern = new RegExp(
    `\\b(?:${metricNames.map(escapeRegularExpression).join('|')})\\b`,
    'giu',
  );
  const clauses = text.split(/[\n,;]|\s+(?:และ|แต่|ขณะที่|and|but|while)\s+/giu);
  return clauses.every(clause => {
    const positiveUnitText = clause.replace(NEGATED_UNIT_CLAIM, '');
    const meanNumbers = numericTokenMatches(positiveUnitText)
      .filter(match => !contextualSummaryNumber(positiveUnitText, match))
      .filter(match => meanClaimNumber(positiveUnitText, match));
    if (meanNumbers.length === 0) return true;

    const occurrences = [...positiveUnitText.matchAll(metricPattern)].map(match => ({
      metric: match[0].toLowerCase(),
      index: match.index ?? 0,
      length: match[0].length,
    }));
    if (occurrences.length === 0) {
      if (meansByMetric.size !== 1) return false;
      const allowed = meansByMetric.values().next().value ?? [];
      return meanNumbers.every(number => (
        allowed.some(value => sameGroundedNumber(number.value, value))
      ));
    }
    return meanNumbers.every(number => {
      const nearest = occurrences.reduce((best, occurrence) => {
        const center = occurrence.index + (occurrence.length / 2);
        const distance = Math.abs(number.index - center);
        return !best || distance < best.distance ? { occurrence, distance } : best;
      }, null)?.occurrence;
      const allowed = meansByMetric.get(nearest?.metric) ?? [];
      return allowed.some(value => sameGroundedNumber(number.value, value));
    });
  });
}

function summaryMetricSemanticsAreGrounded(textValue, evidence, windows) {
  const text = String(textValue ?? '');
  const metricsByName = new Map();
  for (const metric of allSummaryMetrics(evidence)) {
    const existing = metricsByName.get(metric.metric) ?? [];
    metricsByName.set(metric.metric, [...existing, metric]);
  }
  const metricNames = [...metricsByName.keys()].sort((left, right) => right.length - left.length);
  if (!text || metricNames.length === 0) return true;
  const metricPattern = new RegExp(
    `\\b(?:${metricNames.map(escapeRegularExpression).join('|')})\\b`,
    'giu',
  );
  const clauses = text.split(/[\n,;]+/gu);
  return clauses.every(clause => {
    let mentioned = [...new Set(
      [...clause.matchAll(metricPattern)].map(match => match[0].toLowerCase()),
    )];
    if (mentioned.length === 0) {
      if (metricsByName.size !== 1) return true;
      mentioned = [metricsByName.keys().next().value];
    }

    const positiveUnitText = clause.replace(NEGATED_UNIT_CLAIM, '');
    const assignsUndeclaredUnit = UNDECLARED_UNIT_TERM.test(positiveUnitText)
      && mentioned.some(name => (
        (metricsByName.get(name) ?? []).every(metric => !Array.isArray(metric.points))
      ));
    if (assignsUndeclaredUnit) return false;

    const positiveConstantText = clause.replace(NEGATED_CONSTANT_CLAIM, '');
    if (!CONSTANT_TREND_CLAIM.test(positiveConstantText)) return true;
    return mentioned.every(name => (
      (metricsByName.get(name) ?? []).every(metric => (
        [null, ...windows].every(window => {
          const summary = summarizeObservedTrend(metric, window);
          return !summary
            || !Number.isFinite(summary.min)
            || !Number.isFinite(summary.max)
            || sameGroundedNumber(summary.min, summary.max);
        })
      ))
    ));
  });
}

function providerSummaryIsNumericallyGrounded(payload, { evidence, analysisRequest }) {
  const metricFacts = summaryMetricFacts(evidence, analysisRequest.time.windows);
  const metricValues = [...metricFacts.values()].flat();
  if (metricValues.length === 0) return false;
  const derivedValues = summaryDerivedValues(evidence, analysisRequest.time.windows);
  const groundedFacts = [...metricValues, ...derivedValues];
  const answerNumbers = numericTokens(payload.answer);
  if (!answerNumbers.some(number => metricValues.some(value => sameGroundedNumber(number, value)))) {
    return false;
  }
  const textualOutput = [
    payload.answer,
    ...payload.highlights,
    payload.dataCoverage,
    payload.methodNote ?? '',
  ].join('\n');
  if (!summaryMetricAssociationsAreGrounded(textualOutput, metricFacts)) return false;
  if (!summaryMeanClaimsAreGrounded(
    textualOutput,
    evidence,
    analysisRequest.time.windows,
  )) return false;
  if (!summaryMetricSemanticsAreGrounded(
    textualOutput,
    evidence,
    analysisRequest.time.windows,
  )) return false;
  const disclosedNumbers = numericTokens(summaryDisclosedMetadata(evidence, analysisRequest));
  const scaleNumbers = analysisRequest.metrics.flatMap(metric => (
    SUMMARY_METRIC_RANGES[metric] ?? []
  ));
  const derivedDifferences = groundedFacts.flatMap((left, leftIndex) => (
    groundedFacts.slice(leftIndex + 1).map(right => Math.abs(left - right))
  ));
  const allowed = [
    ...disclosedNumbers,
    ...derivedValues,
    ...derivedDifferences,
  ];
  const outputNumbers = numericTokenMatches(textualOutput);
  return outputNumbers.every(number => (
    allowed.some(value => sameGroundedNumber(number.value, value))
    || (
      scaleNumbers.some(value => sameGroundedNumber(number.value, value))
      && scaleContextNumber(textualOutput, number)
    )
  ));
}

function metricMatches(metric, requested, operation) {
  return operation === 'forecast'
    ? metric.metric === `${requested}_forecast`
    : metric.metric === requested;
}

function pointCount(evidence) {
  return [
    ...evidence.metrics,
    ...evidence.subjects.flatMap(subject => subject.metrics),
    ...evidence.rooms.flatMap(room => room.metrics),
  ].reduce((total, metric) => total + (metric.points?.length ?? (metric.value === undefined ? 0 : 1)), 0);
}

function hasCarriedForward(evidence) {
  return [
    ...evidence.metrics,
    ...evidence.subjects.flatMap(subject => subject.metrics),
    ...evidence.rooms.flatMap(room => room.metrics),
  ].some(metric => metric.carriedForward === true
    || metric.points?.some(point => point.carriedForward === true));
}

function requestCoverage({ analysisRequest, evidence }) {
  const groups = evidenceMetricGroups(evidence, analysisRequest.scope);
  const missingMetric = groups.length === 0 || groups.some(metrics => (
    analysisRequest.metrics.some(requested => (
      !metrics.some(metric => metricMatches(metric, requested, analysisRequest.operation))
    ))
  ));
  const missingWindow = analysisRequest.time.windows.length > 0 && groups.some(metrics => (
    analysisRequest.metrics.some(requested => {
      const candidates = metrics.filter(metric => metricMatches(
        metric,
        requested,
        analysisRequest.operation,
      ));
      return analysisRequest.time.windows.some(window => !candidates.some(metric => (
        metric.carriedForward !== true
        && metric.points?.some(point => point.carriedForward !== true
          && Number.isFinite(point.week)
          && point.week >= window.fromWeek
          && point.week <= window.toWeek)
      )));
    })
  ));
  return { missingMetric, missingWindow };
}

function latestMetricObservation(metrics, requested) {
  const metric = metrics.find(item => item.metric === requested);
  if (!metric) return null;
  const candidates = Array.isArray(metric.points)
    ? metric.points
        .map((point, index) => ({ ...point, index }))
        .filter(point => Number.isFinite(point.value))
    : [];
  const usesWeeks = candidates.length > 0
    && candidates.every(point => Number.isInteger(point.week));
  const usesDates = !usesWeeks
    && candidates.length > 0
    && candidates.every(point => typeof point.date === 'string');
  if (usesWeeks) {
    candidates.sort((left, right) => left.week - right.week || left.index - right.index);
  } else if (usesDates) {
    candidates.sort((left, right) => left.date.localeCompare(right.date) || left.index - right.index);
  }
  const point = candidates.at(-1);
  const value = metric.value ?? point?.value;
  if (!Number.isFinite(value)) return null;
  return {
    value,
    week: metric.week ?? point?.week ?? null,
    date: metric.date ?? point?.date ?? null,
    carriedForward: metric.carriedForward === true || point?.carriedForward === true,
  };
}

function latestMetricValue(metrics, requested) {
  const observation = latestMetricObservation(metrics, requested);
  if (!observation) return 'ไม่มีข้อมูล';
  return `${observation.value}${observation.carriedForward ? ' (CF)' : ''}`;
}

function roundTrendStatistic(value, decimals = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function summarizeObservedTrend(metric, window = null) {
  if (!metric || metric.carriedForward === true) return null;
  const rawPoints = Array.isArray(metric.points)
    ? metric.points
    : Number.isFinite(metric.value)
      ? [{
          value: metric.value,
          week: metric.week,
          date: metric.date,
          carriedForward: metric.carriedForward,
        }]
      : [];
  const observed = rawPoints
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
    first: Number.isFinite(first) ? roundTrendStatistic(first) : null,
    last: Number.isFinite(last) ? roundTrendStatistic(last) : null,
    min: positioned.length > 0
      ? roundTrendStatistic(Math.min(...positioned.map(point => point.value)))
      : null,
    max: positioned.length > 0
      ? roundTrendStatistic(Math.max(...positioned.map(point => point.value)))
      : null,
    mean: roundTrendStatistic(mean),
    change: positioned.length >= 2 ? roundTrendStatistic(last - first) : null,
    slopePerWeek: roundTrendStatistic(slopePerWeek, 4),
    fromWeek: window?.fromWeek ?? (usesWeeks ? positioned.at(0)?.week ?? null : null),
    toWeek: window?.toWeek ?? (usesWeeks ? positioned.at(-1)?.week ?? null : null),
    fromDate: usesDates ? positioned.at(0)?.date ?? null : null,
    toDate: usesDates ? positioned.at(-1)?.date ?? null : null,
    observedPoints: positioned.length,
  };
}

function trendValue(value) {
  return value === null ? 'ไม่มีข้อมูล' : String(value);
}

function trendRange(summary, window) {
  if (window) return `สัปดาห์ ${window.fromWeek}-${window.toWeek}`;
  if (summary.fromWeek !== null && summary.toWeek !== null) {
    return `สัปดาห์ ${summary.fromWeek}-${summary.toWeek}`;
  }
  if (summary.fromDate && summary.toDate) return `${summary.fromDate} ถึง ${summary.toDate}`;
  return 'ช่วงที่มีข้อมูล';
}

function supportsCanonicalTrendTable(analysisRequest) {
  return analysisRequest.operation === 'trend'
    || (analysisRequest.operation === 'compare'
      && ['trend', 'change'].includes(analysisRequest.statistic));
}

function canonicalTrendTable({ analysisRequest, evidence }) {
  if (!supportsCanonicalTrendTable(analysisRequest)) return null;
  const entities = analysisRequest.scope === 'subject'
    ? evidence.subjects
    : analysisRequest.scope === 'room'
      ? evidence.rooms
      : [{ alias: 'ภาพรวม', metrics: evidence.metrics }];
  const windows = analysisRequest.time.windows.length > 0
    ? analysisRequest.time.windows
    : [null];
  const expectedRows = entities.length * analysisRequest.metrics.length * windows.length;
  if (expectedRows === 0 || expectedRows > 20) return null;

  const rows = entities.flatMap(entity => analysisRequest.metrics.flatMap(requested => {
    const metric = entity.metrics.find(item => item.metric === requested);
    return windows.map(window => {
      const summary = summarizeObservedTrend(metric, window) ?? {
        first: null,
        last: null,
        change: null,
        slopePerWeek: null,
        fromWeek: null,
        toWeek: null,
        fromDate: null,
        toDate: null,
        observedPoints: 0,
      };
      return [
        entity.alias,
        requested,
        trendValue(summary.first),
        trendValue(summary.last),
        trendValue(summary.change),
        trendValue(summary.slopePerWeek),
        trendRange(summary, window),
        String(summary.observedPoints),
      ];
    });
  }));

  return {
    title: 'แนวโน้มจากค่าที่สังเกตจริง (ไม่รวม carried-forward)',
    columns: [
      'รายการ',
      'ตัวชี้วัด',
      'ค่าแรก',
      'ค่าล่าสุด',
      'เปลี่ยนแปลง',
      'ความชัน/สัปดาห์',
      'ช่วง',
      'จุดสังเกต',
    ],
    rows,
  };
}

const FAVORABLE_TREND_METRICS = new Set(['cd_risc', 'grit']);

function scopedObservedPoints(metric, windows) {
  if (!Array.isArray(metric?.points) || metric.carriedForward === true) return [];
  return metric.points
    .filter(point => Number.isFinite(point.value) && point.carriedForward !== true)
    .filter(point => windows.length === 0 || windows.some(window => (
      Number.isInteger(point.week)
      && point.week >= window.fromWeek
      && point.week <= window.toWeek
    )));
}

function canonicalTrendResponse({ analysisRequest, evidence }) {
  if (!supportsCanonicalTrendTable(analysisRequest)) return null;
  const entities = analysisRequest.scope === 'subject'
    ? evidence.subjects
    : analysisRequest.scope === 'room'
      ? evidence.rooms
      : [{ alias: 'ภาพรวม', metrics: evidence.metrics }];
  const summaryWindows = analysisRequest.time.windows.length > 0
    ? analysisRequest.time.windows
    : [null];
  const entries = entities.flatMap(entity => analysisRequest.metrics.flatMap(requested => {
    const metric = entity.metrics.find(item => item.metric === requested);
    return summaryWindows.map(window => {
      const summary = summarizeObservedTrend(metric, window);
      return summary?.observedPoints > 0
        ? { alias: entity.alias, requested, metric, window, summary }
        : null;
    });
  })).filter(Boolean);
  if (entries.length === 0) return null;

  const worsening = entries
    .filter(entry => Number.isFinite(entry.summary.slopePerWeek))
    .map(entry => ({
      ...entry,
      worseningRate: FAVORABLE_TREND_METRICS.has(entry.requested)
        ? -entry.summary.slopePerWeek
        : entry.summary.slopePerWeek,
    }));
  const fastestRate = worsening.length > 0
    ? Math.max(...worsening.map(entry => entry.worseningRate))
    : null;
  const fastest = Number.isFinite(fastestRate) && fastestRate > 0
    ? worsening.filter(entry => entry.worseningRate === fastestRate)
    : [];
  const finding = fastest.length > 0
    ? `ชุดที่มีทิศทางควรทบทวนเร็วที่สุดตามความชันคือ ${fastest.map(entry => (
        `${entry.alias} ${entry.requested} ${trendRange(entry.summary, entry.window)} (ความชัน ${entry.summary.slopePerWeek} ต่อสัปดาห์)`
      )).join(', ')}`
    : 'ไม่พบชุดข้อมูลที่มีความชันไปในทิศทางน่ากังวลจากจุดที่สังเกตจริง';

  const seriesEntries = entities.flatMap(entity => analysisRequest.metrics.map(requested => {
    const metric = entity.metrics.find(item => item.metric === requested);
    const points = scopedObservedPoints(metric, analysisRequest.time.windows)
      .map((point, index) => ({ ...point, index }))
      .sort((left, right) => {
        if (Number.isInteger(left.week) && Number.isInteger(right.week)) {
          return left.week - right.week || left.index - right.index;
        }
        return String(left.date ?? '').localeCompare(String(right.date ?? '')) || left.index - right.index;
      });
    return points.length > 0 ? { alias: entity.alias, requested, points } : null;
  })).filter(Boolean);
  const labels = [...new Set(seriesEntries.flatMap(({ points }) => points.map(point => (
    Number.isInteger(point.week) ? `สัปดาห์ ${point.week}` : point.date
  ))))].filter(Boolean).sort((left, right) => left.localeCompare(right, 'th', { numeric: true }));
  const colors = ['blue', 'emerald', 'amber', 'rose', 'violet', 'slate'];
  const chart = seriesEntries.length <= MAX_CHART_SERIES && labels.length <= 24
    ? {
        type: 'line',
        title: 'แนวโน้มจากจุดที่สังเกตจริง',
        xLabel: 'ช่วง',
        yLabel: 'ค่า',
        series: seriesEntries.map(({ alias, requested }, index) => ({
          id: `trend_${index + 1}`,
          label: `${alias} ${requested}`,
          color: colors[index % colors.length],
        })),
        points: labels.map(label => ({
          label,
          values: seriesEntries.map(({ points }) => {
            const point = points.find(item => (
              Number.isInteger(item.week) ? `สัปดาห์ ${item.week}` : item.date
            ) === label);
            return point?.value ?? null;
          }),
        })),
      }
    : null;

  return {
    answer: `${finding} การสรุปนี้เป็นการเปรียบเทียบเชิงพรรณนาจากค่าแรก ค่าล่าสุด การเปลี่ยนแปลง และความชัน โดยไม่อนุมานสาเหตุ`,
    highlights: entries.slice(0, 6).map(entry => (
      `${entry.alias} ${entry.requested} ${trendRange(entry.summary, entry.window)}: ${entry.summary.first} เป็น ${entry.summary.last}, เปลี่ยนแปลง ${trendValue(entry.summary.change)}, ความชัน ${trendValue(entry.summary.slopePerWeek)} ต่อสัปดาห์`
    )),
    confidence: 'high',
    status: 'answered',
    limitations: [],
    dataCoverage: `ใช้จุดที่สังเกตจริง ${entries.reduce((sum, entry) => sum + entry.summary.observedPoints, 0)} จุด ใน ${entries.length} ชุดสรุป`,
    table: canonicalTrendTable({ analysisRequest, evidence }),
    chart,
    methodNote: 'คำนวณ OLS จากจุดที่สังเกตจริงตามช่วงที่ร้องขอ ไม่ถือ carried-forward เป็นการสังเกตใหม่ และตีความทิศทางกลับด้านสำหรับ cd_risc/grit ซึ่งค่าสูงกว่าเป็นผลเชิงบวก',
    followUps: [],
  };
}

function canonicalNoEvidenceResponse({ analysisRequest, evidence }) {
  if (pointCount(evidence) !== 0) return null;
  const smallGroup = evidence.constraints.includes('insufficient-small-group');
  const windowText = analysisRequest.time.windows.length > 0
    ? analysisRequest.time.windows
        .map(window => `สัปดาห์ ${window.fromWeek}-${window.toWeek}`)
        .join(' และ ')
    : 'ช่วงที่ร้องขอ';
  return {
    answer: smallGroup
      ? 'ไม่เปิดเผยผลลัพธ์ เพราะกลุ่มที่ร้องขอมีผู้สนับสนุนข้อมูลน้อยกว่าเกณฑ์ขั้นต่ำ 5 คน'
      : `ไม่มีหลักฐานที่ผ่านการยืนยันสำหรับ ${analysisRequest.metrics.join(', ')} ใน${windowText} จึงไม่สามารถคำนวณคำตอบได้`,
    highlights: [],
    confidence: 'low',
    status: 'insufficient',
    limitations: [
      'insufficient-evidence',
      ...(smallGroup ? ['small-group-suppressed'] : []),
      ...(analysisRequest.time.windows.length > 0 ? ['time-window-unavailable'] : []),
      ...(analysisRequest.operation === 'forecast' ? ['forecast-unavailable'] : []),
    ],
    dataCoverage: 'ไม่มีจุดข้อมูลที่เปิดเผยสำหรับคำขอนี้',
    table: null,
    chart: null,
    methodNote: 'ระบบไม่เติมค่า ไม่ขยายช่วงเวลา และไม่อนุมานจากข้อมูลที่ถูกปกปิด',
    followUps: ['ตรวจสอบช่วงเวลาหรือตัวชี้วัดอื่นที่มีหลักฐานยืนยันหรือไม่'],
  };
}

function canonicalWindowMeanResponse({ analysisRequest, evidence }) {
  if (
    analysisRequest.operation !== 'compare'
    || analysisRequest.statistic !== 'mean'
    || analysisRequest.time.windows.length === 0
  ) return null;
  const entities = analysisRequest.scope === 'subject'
    ? evidence.subjects
    : analysisRequest.scope === 'room'
      ? evidence.rooms
      : [{ alias: 'ภาพรวม', metrics: evidence.metrics }];
  const entries = entities.flatMap(entity => analysisRequest.metrics.flatMap(requested => {
    const metric = entity.metrics.find(item => item.metric === requested);
    return analysisRequest.time.windows.map(window => ({
      alias: entity.alias,
      requested,
      window,
      summary: summarizeObservedTrend(metric, window) ?? {
        first: null,
        last: null,
        mean: null,
        change: null,
        slopePerWeek: null,
        observedPoints: 0,
      },
    }));
  }));
  if (entries.length === 0 || entries.every(entry => entry.summary.observedPoints === 0)) return null;

  const comparisons = entities.flatMap(entity => analysisRequest.metrics.map(requested => {
    const matches = entries.filter(entry => (
      entry.alias === entity.alias && entry.requested === requested
    ));
    const means = matches.map(entry => entry.summary.mean);
    if (means.some(value => value === null)) {
      return `${entity.alias} ${requested}: มีอย่างน้อยหนึ่งช่วงที่ไม่มีข้อมูล จึงเปรียบเทียบค่าเฉลี่ยไม่ครบ`;
    }
    if (means.length === 1) return `${entity.alias} ${requested}: ค่าเฉลี่ย ${means[0]}`;
    if (means[0] === means[1]) {
      return `${entity.alias} ${requested}: ทั้งสองช่วงมีค่าเฉลี่ยเท่ากันที่ ${means[0]}`;
    }
    const higherIndex = means[0] > means[1] ? 0 : 1;
    return `${entity.alias} ${requested}: ${trendRange(matches[higherIndex].summary, matches[higherIndex].window)} มีค่าเฉลี่ยสูงกว่า (${means[higherIndex]} เทียบกับ ${means[1 - higherIndex]})`;
  }));
  const table = entries.length <= 20
    ? {
        title: 'เปรียบเทียบค่าเฉลี่ยตามช่วงที่ร้องขอ',
        columns: ['รายการ', 'ตัวชี้วัด', 'ช่วง', 'ค่าเฉลี่ย', 'ค่าแรก', 'ค่าล่าสุด', 'เปลี่ยนแปลง', 'จุดสังเกต'],
        rows: entries.map(entry => [
          entry.alias,
          entry.requested,
          trendRange(entry.summary, entry.window),
          trendValue(entry.summary.mean),
          trendValue(entry.summary.first),
          trendValue(entry.summary.last),
          trendValue(entry.summary.change),
          String(entry.summary.observedPoints),
        ]),
      }
    : null;
  const seriesEntries = entities.flatMap(entity => analysisRequest.metrics.map(requested => ({
    alias: entity.alias,
    requested,
    summaries: entries.filter(entry => entry.alias === entity.alias && entry.requested === requested),
  })));
  const colors = ['blue', 'emerald', 'amber', 'rose', 'violet', 'slate'];
  const chart = seriesEntries.length <= MAX_CHART_SERIES
    ? {
        type: 'bar',
        title: 'ค่าเฉลี่ยตามช่วงที่ร้องขอ',
        xLabel: 'ช่วง',
        yLabel: 'ค่าเฉลี่ย',
        series: seriesEntries.map(({ alias, requested }, index) => ({
          id: `mean_${index + 1}`,
          label: `${alias} ${requested}`,
          color: colors[index % colors.length],
        })),
        points: analysisRequest.time.windows.map(window => ({
          label: `สัปดาห์ ${window.fromWeek}-${window.toWeek}`,
          values: seriesEntries.map(entry => (
            entry.summaries.find(item => item.window === window)?.summary.mean ?? null
          )),
        })),
      }
    : null;
  const hasMissingWindow = entries.some(entry => entry.summary.observedPoints === 0);
  return {
    answer: `ผลเปรียบเทียบค่าเฉลี่ยจากจุดที่สังเกตจริง: ${comparisons.join('; ')}`,
    highlights: comparisons.slice(0, 6),
    confidence: hasMissingWindow ? 'medium' : 'high',
    status: hasMissingWindow ? 'partial' : 'answered',
    limitations: hasMissingWindow ? ['time-window-unavailable'] : [],
    dataCoverage: `ใช้จุดที่สังเกตจริง ${entries.reduce((sum, entry) => sum + entry.summary.observedPoints, 0)} จุด ใน ${entries.length} ชุดช่วงเวลา`,
    table: ['table', 'chart_table'].includes(analysisRequest.output) ? table : null,
    chart: ['chart', 'chart_table'].includes(analysisRequest.output) ? chart : null,
    methodNote: 'คำนวณค่าเฉลี่ยจากจุดที่สังเกตจริงเฉพาะในแต่ละช่วงที่ร้องขอ ไม่เติมสัปดาห์ที่ไม่มีข้อมูลและไม่ใช้เกณฑ์เชิงคุณภาพที่ไม่ได้ให้มา',
    followUps: [],
  };
}

function canonicalMultiLatestComparison({ analysisRequest, evidence }) {
  if (
    analysisRequest.operation !== 'compare'
    || analysisRequest.statistic !== 'latest'
    || !['subject', 'room'].includes(analysisRequest.scope)
  ) return null;
  const entities = analysisRequest.scope === 'subject' ? evidence.subjects : evidence.rooms;
  if (
    entities.length < 2
    || entities.length > 3
    || analysisRequest.metrics.length < 2
    || analysisRequest.metrics.length > 6
  ) return null;
  const rows = entities.map(entity => ({
    alias: entity.alias,
    observations: analysisRequest.metrics.map(metric => ({
      metric,
      observation: latestMetricObservation(entity.metrics, metric),
    })),
  }));
  if (rows.some(row => row.observations.some(item => !item.observation))) return null;
  const comparisons = analysisRequest.metrics.map(metric => {
    const values = rows.map(row => ({
      alias: row.alias,
      value: row.observations.find(item => item.metric === metric).observation.value,
    }));
    const maximum = Math.max(...values.map(item => item.value));
    const highest = values.filter(item => item.value === maximum);
    const valueText = values.map(item => `${item.alias} ${item.value}`).join(', ');
    if (highest.length === values.length) return `${metric}: ทุกอันเท่ากันที่ ${maximum}`;
    const meaning = FAVORABLE_TREND_METRICS.has(metric)
      ? 'ค่าสูงกว่าเป็นผลเชิงบวกมากกว่า'
      : 'ค่าสูงกว่าน่ากังวลมากกว่า';
    return `${metric}: ${highest.map(item => item.alias).join(', ')} มีค่าสูงกว่า (${valueText}); ${meaning}`;
  });
  const anyCarriedForward = rows.some(row => row.observations.some(
    item => item.observation.carriedForward,
  ));
  const colors = ['blue', 'emerald', 'amber', 'rose', 'violet', 'slate'];
  return {
    answer: `เปรียบเทียบค่าล่าสุดจากหลักฐานโดยตรง: ${comparisons.join('; ')}`,
    highlights: comparisons.slice(0, 6),
    confidence: anyCarriedForward ? 'medium' : 'high',
    status: 'answered',
    limitations: [],
    dataCoverage: `ครอบคลุม ${entities.length} รายการและ ${analysisRequest.metrics.length} ตัวชี้วัดล่าสุด`,
    table: ['auto', 'table', 'chart_table'].includes(analysisRequest.output)
      ? {
          title: 'เปรียบเทียบค่าล่าสุดจากหลักฐานที่เปิดเผย',
          columns: [analysisRequest.scope === 'room' ? 'ห้อง' : 'รายการ', ...analysisRequest.metrics],
          rows: rows.map(row => [
            row.alias,
            ...row.observations.map(item => `${item.observation.value}${item.observation.carriedForward ? ' (CF)' : ''}`),
          ]),
        }
      : null,
    chart: ['chart', 'chart_table'].includes(analysisRequest.output)
      ? {
          type: 'bar',
          title: 'เปรียบเทียบค่าล่าสุด',
          xLabel: 'รายการ',
          yLabel: 'ค่า',
          series: analysisRequest.metrics.map((metric, index) => ({
            id: `latest_${index + 1}`,
            label: metric,
            color: colors[index % colors.length],
          })),
          points: rows.map(row => ({
            label: row.alias,
            values: row.observations.map(item => item.observation.value),
          })),
        }
      : null,
    methodNote: 'เลือกค่าตามสัปดาห์หรือวันที่ล่าสุดของแต่ละตัวชี้วัด และเปรียบเทียบโดยไม่สร้างสูตรรวมคะแนน',
    followUps: [],
  };
}

function canonicalUnavailableForecast({ analysisRequest, evidence }) {
  if (analysisRequest.operation !== 'forecast') return null;
  const metricGroups = evidenceMetricGroups(evidence, analysisRequest.scope);
  const hasUsablePoint = (metric) => metric.carriedForward !== true
    && metric.points?.some(point => (
      Number.isFinite(point.value)
      && point.carriedForward !== true
      && (analysisRequest.time.windows.length === 0
        || analysisRequest.time.windows.some(window => (
          Number.isInteger(point.week)
          && point.week >= window.fromWeek
          && point.week <= window.toWeek
        )))
    ));
  const missing = analysisRequest.metrics.filter(requested => !metricGroups.some(metrics => (
    metrics.some(metric => (
      metric.metric === `${requested}_forecast` && hasUsablePoint(metric)
    ))
  )));
  if (missing.length === 0) return null;
  return {
    answer: `ไม่สามารถคาดการณ์ ${missing.join(', ')} ได้ เพราะหลักฐานไม่มีค่า forecast ที่ระบบคำนวณไว้ในช่วงที่ร้องขอ และระบบจะไม่สร้างหรือขยายการพยากรณ์ขึ้นเอง`,
    highlights: [],
    confidence: 'low',
    status: 'insufficient',
    limitations: ['forecast-unavailable'],
    dataCoverage: `มีข้อมูลย้อนหลังแต่ไม่มีค่า forecast ที่ใช้ได้ในช่วงที่ร้องขอสำหรับ ${missing.join(', ')}`,
    table: null,
    chart: null,
    methodNote: 'การคาดการณ์ใช้ได้เฉพาะค่า ordinary-least-squares projection ที่ระบบจัดเตรียมในหลักฐานเท่านั้น',
    followUps: ['ตรวจสอบว่ามีจุดสังเกตจริงเพียงพอสำหรับสร้าง forecast หรือไม่'],
  };
}

function canonicalLatestSnapshotResponse(
  { analysisRequest, evidence },
  { allowSummarize = false } = {},
) {
  const supportedOperations = allowSummarize
    ? ['lookup', 'count', 'summarize']
    : ['lookup', 'count'];
  if (!supportedOperations.includes(analysisRequest.operation)) return null;
  const entities = analysisRequest.scope === 'subject'
    ? evidence.subjects
    : analysisRequest.scope === 'room'
      ? evidence.rooms
      : [{ alias: 'ภาพรวม', metrics: evidence.metrics }];
  const rows = entities.flatMap(entity => analysisRequest.metrics.map(requested => {
    const observation = latestMetricObservation(entity.metrics, requested);
    if (!observation) return null;
    const source = observation.week !== null
      ? `สัปดาห์ ${observation.week}`
      : observation.date ?? 'ล่าสุด';
    return {
      alias: entity.alias,
      metric: requested,
      value: observation.value,
      source,
      carriedForward: observation.carriedForward,
    };
  })).filter(Boolean);
  if (rows.length === 0) return null;
  const adverse = [...new Set(rows.map(row => row.metric)
    .filter(metric => !FAVORABLE_TREND_METRICS.has(metric)
      && !['total_students', 'observed_students'].includes(metric)))];
  const favorable = [...new Set(rows.map(row => row.metric)
    .filter(metric => FAVORABLE_TREND_METRICS.has(metric)))];
  const direction = [
    ...(adverse.length > 0 ? [`สำหรับ ${adverse.join(', ')} ค่าที่สูงขึ้นหมายถึงน่ากังวลมากขึ้น`] : []),
    ...(favorable.length > 0 ? [`สำหรับ ${favorable.join(', ')} ค่าที่สูงขึ้นหมายถึงผลเชิงบวกมากขึ้น`] : []),
  ].join('; ');
  return {
    answer: `ค่าล่าสุดจากหลักฐานที่เปิดเผย: ${rows.map(row => (
      `${row.alias} ${row.metric} ${row.value}${row.carriedForward ? ' (carried-forward)' : ''} (${row.source})`
    )).join('; ')}${direction ? `. ${direction}` : ''}`,
    highlights: rows.slice(0, 6).map(row => (
      `${row.alias} ${row.metric}: ${row.value} (${row.source}${row.carriedForward ? ', carried-forward' : ''})`
    )),
    confidence: rows.some(row => row.carriedForward) ? 'medium' : 'high',
    status: 'answered',
    limitations: [],
    dataCoverage: `ครอบคลุมค่าล่าสุด ${rows.length} ค่า จาก ${entities.length} รายการ`,
    table: ['table', 'chart_table'].includes(analysisRequest.output)
      ? {
          title: 'ค่าล่าสุดจากหลักฐานที่เปิดเผย',
          columns: ['รายการ', 'ตัวชี้วัด', 'ค่าล่าสุด', 'แหล่งสังเกต'],
          rows: rows.map(row => [row.alias, row.metric, String(row.value), row.source]),
        }
      : null,
    chart: ['chart', 'chart_table'].includes(analysisRequest.output) && rows.length <= 20
      ? {
          type: 'bar',
          title: 'ค่าล่าสุดจากหลักฐานที่เปิดเผย',
          xLabel: 'รายการและตัวชี้วัด',
          yLabel: 'ค่าล่าสุด',
          series: [{ id: 'latest_value', label: 'ค่าล่าสุด', color: 'blue' }],
          points: rows.map(row => ({
            label: `${row.alias} ${row.metric}`,
            values: [row.value],
          })),
        }
      : null,
    methodNote: 'เลือกค่าตามสัปดาห์หรือวันที่ล่าสุดโดยตรง และระบุ carried-forward แยกจากการสังเกตใหม่',
    followUps: [],
  };
}

function canonicalHistoricalSummaryFallback(request) {
  const { analysisRequest } = request;
  if (
    analysisRequest.operation !== 'summarize'
    || analysisRequest.time.mode === 'latest'
  ) return null;
  const trendRequest = {
    ...request,
    analysisRequest: {
      ...analysisRequest,
      operation: 'trend',
      statistic: 'trend',
    },
  };
  const trend = canonicalTrendResponse(trendRequest);
  return trend
    ? {
        ...trend,
        answer: `สรุปเชิงพรรณนาจากค่าแรก ค่าล่าสุด การเปลี่ยนแปลง และความชันที่คำนวณจากจุดสังเกตจริง: ${trend.highlights.join('; ')} ความชันใช้บอกทิศทางเชิงเส้นที่ปัดเศษเท่านั้น ไม่ใช่ระดับความสำคัญทางคลินิกและไม่ใช้ระบุสาเหตุ`,
      }
    : null;
}

function canonicalNoCausalExplanation({ analysisRequest, evidence }) {
  if (!analysisRequest.explain || !supportsCanonicalTrendTable(analysisRequest)) return null;
  const entities = analysisRequest.scope === 'subject'
    ? evidence.subjects
    : analysisRequest.scope === 'room'
      ? evidence.rooms
      : [{ alias: 'ภาพรวม', metrics: evidence.metrics }];
  const windows = analysisRequest.time.windows.length > 0
    ? analysisRequest.time.windows
    : [null];
  const findings = entities.flatMap(entity => analysisRequest.metrics.flatMap(requested => {
    const metric = entity.metrics.find(item => item.metric === requested);
    return windows.map(window => {
      const summary = summarizeObservedTrend(metric, window);
      if (!summary || summary.observedPoints === 0) return null;
      const range = trendRange(summary, window);
      return summary.change === null
        ? `${entity.alias} ${requested} ${range}: มีค่า ${trendValue(summary.last)} จาก ${summary.observedPoints} จุด จึงยังคำนวณการเปลี่ยนแปลงในช่วงนี้ไม่ได้`
        : `${entity.alias} ${requested} ${range}: ค่าแรก ${summary.first} ค่าล่าสุด ${summary.last} เปลี่ยนแปลง ${summary.change} จาก ${summary.observedPoints} จุด`;
    });
  })).filter(Boolean);
  if (findings.length === 0) return null;

  return {
    answer: `หลักฐานที่มีระบุสาเหตุไม่ได้ เพราะมีเฉพาะค่าตัวชี้วัดตามเวลาและไม่มีปัจจัยอธิบายที่ผ่านการยืนยัน จึงตอบได้เพียงการเปลี่ยนแปลงเชิงพรรณนา: ${findings.join('; ')}`,
    highlights: findings.slice(0, 6),
    confidence: 'low',
    status: 'partial',
    limitations: ['no-causal-evidence'],
    dataCoverage: `ใช้หลักฐาน ${findings.length} ชุดสำหรับ ${analysisRequest.metrics.length} ตัวชี้วัด โดยไม่ใช้ข้อมูลที่ถูกปกปิดเพื่ออนุมานสาเหตุ`,
    table: null,
    chart: null,
    methodNote: 'คำนวณค่าแรก ค่าล่าสุด และการเปลี่ยนแปลงจากจุดที่สังเกตจริง โดยไม่นับ carried-forward เป็นการสังเกตใหม่ และไม่อนุมานเหตุและผล',
    followUps: ['ตรวจสอบปัจจัยบริบทที่ได้รับอนุญาตและมีหลักฐานยืนยันเพิ่มเติมหรือไม่'],
  };
}

function canonicalForecastResponse({ analysisRequest, evidence }) {
  if (analysisRequest.operation !== 'forecast') return null;
  const entities = analysisRequest.scope === 'subject'
    ? evidence.subjects
    : analysisRequest.scope === 'room'
      ? evidence.rooms
      : [{ alias: 'ภาพรวม', metrics: evidence.metrics }];
  const entries = entities.flatMap(entity => analysisRequest.metrics.map(requested => {
    const metric = entity.metrics.find(item => item.metric === `${requested}_forecast`);
    const points = (metric?.points ?? [])
      .filter(point => Number.isFinite(point.value))
      .filter(point => analysisRequest.time.windows.length === 0
        || analysisRequest.time.windows.some(window => Number.isInteger(point.week)
          && point.week >= window.fromWeek
          && point.week <= window.toWeek))
      .map((point, index) => ({ ...point, index }))
      .sort((left, right) => {
        if (Number.isInteger(left.week) && Number.isInteger(right.week)) {
          return left.week - right.week || left.index - right.index;
        }
        return String(left.date ?? '').localeCompare(String(right.date ?? '')) || left.index - right.index;
      });
    const scopedMetric = metric ? { ...metric, points } : null;
    const summary = summarizeObservedTrend(scopedMetric);
    if (!metric || !summary || summary.observedPoints === 0) return null;
    return { alias: entity.alias, requested, metric: scopedMetric, points, summary };
  })).filter(Boolean);
  if (entries.length === 0) return null;
  const missingForecasts = entities.flatMap(entity => analysisRequest.metrics
    .filter(requested => !entries.some(entry => (
      entry.alias === entity.alias && entry.requested === requested
    )))
    .map(requested => `${entity.alias} ${requested}_forecast`));

  const findings = entries.map(({ alias, requested, summary }) => {
    if (summary.change === null) {
      return `${alias} ${requested}_forecast ${trendRange(summary, null)}: มีค่าพยากรณ์ ${summary.last} เพียง ${summary.observedPoints} จุด จึงยังคำนวณการเปลี่ยนแปลงไม่ได้`;
    }
    const movement = summary.change > 0
      ? 'เพิ่มขึ้น'
      : summary.change < 0 ? 'ลดลง' : 'คงที่';
    return `${alias} ${requested}_forecast ${trendRange(summary, null)}: ${summary.first} เป็น ${summary.last} ${movement} ${Math.abs(summary.change)} ความชัน ${trendValue(summary.slopePerWeek)} ต่อสัปดาห์`;
  });
  const tableRows = entries.flatMap(({ alias, requested, points }) => points.map(point => [
    alias,
    `${requested}_forecast`,
    Number.isInteger(point.week) ? `สัปดาห์ ${point.week}` : point.date ?? 'ไม่มีข้อมูล',
    String(point.value),
  ]));
  const table = tableRows.length <= 20
    ? {
        title: 'ค่าพยากรณ์เชิงเส้นที่ระบบจัดเตรียม',
        columns: ['รายการ', 'ตัวชี้วัด', 'ช่วง', 'ค่าพยากรณ์'],
        rows: tableRows,
      }
    : null;
  const labels = [...new Set(entries.flatMap(({ points }) => points.map(point => (
    Number.isInteger(point.week) ? `สัปดาห์ ${point.week}` : point.date
  ))))].filter(Boolean).sort((left, right) => left.localeCompare(right, 'th', { numeric: true }));
  const colors = ['blue', 'emerald', 'amber', 'rose', 'violet', 'slate'];
  const chart = entries.length <= MAX_CHART_SERIES && labels.length <= 24
    ? {
        type: 'line',
        title: 'แนวโน้มค่าพยากรณ์เชิงเส้น',
        xLabel: 'ช่วง',
        yLabel: 'ค่าพยากรณ์',
        series: entries.map(({ alias, requested }, index) => ({
          id: `forecast_${index + 1}`,
          label: `${alias} ${requested}_forecast`,
          color: colors[index % colors.length],
        })),
        points: labels.map(label => ({
          label,
          values: entries.map(({ points }) => {
            const point = points.find(item => (
              Number.isInteger(item.week) ? `สัปดาห์ ${item.week}` : item.date
            ) === label);
            return point?.value ?? null;
          }),
        })),
      }
    : null;

  return {
    answer: `ผลคาดการณ์เชิงเส้นตามหลักฐานที่ระบบจัดเตรียม: ${findings.join('; ')}${missingForecasts.length > 0 ? ` ไม่มีค่า forecast ที่ใช้ได้ในช่วงที่ร้องขอสำหรับ ${missingForecasts.join(', ')}` : ''} ผลนี้ใช้เพื่อสำรวจแนวโน้มและสนับสนุนการตัดสินใจเท่านั้น ไม่ใช่การวินิจฉัยหรือการรับประกัน`,
    highlights: [
      ...findings,
      ...(missingForecasts.length > 0
        ? [`ไม่มี forecast ที่ใช้ได้สำหรับ ${missingForecasts.join(', ')}`]
        : []),
    ].slice(0, 6),
    confidence: missingForecasts.length > 0 ? 'medium' : 'high',
    status: missingForecasts.length > 0 ? 'partial' : 'answered',
    limitations: missingForecasts.length > 0 ? ['forecast-unavailable'] : [],
    dataCoverage: `ครอบคลุมค่าพยากรณ์ ${tableRows.length} จุด สำหรับ ${entries.length} ชุดรายการและตัวชี้วัด${missingForecasts.length > 0 ? `; ขาด ${missingForecasts.length} ชุด` : ''}`,
    table,
    chart,
    methodNote: 'ใช้เฉพาะค่า forecast แบบ ordinary-least-squares ที่ระบบจัดเตรียมไว้ ไม่คำนวณหรือขยายช่วงพยากรณ์เพิ่มเติม',
    followUps: [],
  };
}

function canonicalLatestComparison(request) {
  const { analysisRequest, evidence } = request;
  if (
    analysisRequest.operation !== 'compare'
    || analysisRequest.statistic !== 'latest'
    || analysisRequest.scope !== 'subject'
    || analysisRequest.metrics.length !== 1
    || evidence.subjects.length !== 2
  ) return null;
  const metric = analysisRequest.metrics[0];
  const [left, right] = evidence.subjects;
  if (typeof left.alias !== 'string' || typeof right.alias !== 'string') return null;
  const leftObservation = latestMetricObservation(left.metrics, metric);
  const rightObservation = latestMetricObservation(right.metrics, metric);
  if (!leftObservation || !rightObservation) return null;
  const equal = leftObservation.value === rightObservation.value;
  const higher = leftObservation.value > rightObservation.value
    ? { alias: left.alias, value: leftObservation.value }
    : { alias: right.alias, value: rightObservation.value };
  const favorableWhenHigher = ['cd_risc', 'grit'].includes(metric);
  const relation = equal
    ? `ทั้งสองรายการมีค่า ${metric} ล่าสุดเท่ากันที่ ${leftObservation.value}`
    : `${higher.alias} มีค่า ${metric} ล่าสุดสูงกว่า (${higher.value})`;
  const interpretation = equal
    ? ''
    : favorableWhenHigher
      ? ' โดยค่าที่สูงกว่าหมายถึงผลเชิงบวกมากกว่า'
      : ' โดยค่าที่สูงกว่าหมายถึงน่ากังวลมากกว่า';
  const sourceLabel = observation => observation.week !== null
    ? `สัปดาห์ ${observation.week}`
    : observation.date ?? 'ล่าสุด';
  return {
    answer: `${left.alias} มีค่า ${metric} ล่าสุด ${leftObservation.value} และ ${right.alias} มีค่า ${rightObservation.value}; ${relation}${interpretation}`,
    highlights: [
      `${left.alias}: ${leftObservation.value} (${sourceLabel(leftObservation)})`,
      `${right.alias}: ${rightObservation.value} (${sourceLabel(rightObservation)})`,
    ],
    table: {
      title: `เปรียบเทียบค่า ${metric} ล่าสุด`,
      columns: ['รายการ', metric, 'แหล่งสังเกต'],
      rows: [
        [left.alias, String(leftObservation.value), sourceLabel(leftObservation)],
        [right.alias, String(rightObservation.value), sourceLabel(rightObservation)],
      ],
    },
    chart: {
      type: 'bar',
      title: `เปรียบเทียบค่า ${metric} ล่าสุด`,
      xLabel: 'รายการ',
      yLabel: metric,
      series: [{ id: 'latest_value', label: metric, color: 'blue' }],
      points: [
        { label: left.alias, values: [leftObservation.value] },
        { label: right.alias, values: [rightObservation.value] },
      ],
    },
    confidence: leftObservation.carriedForward || rightObservation.carriedForward
      ? 'medium'
      : 'high',
    dataCoverage: `ค่าล่าสุดของ 2 รายสำหรับ ${metric}: ${sourceLabel(leftObservation)} และ ${sourceLabel(rightObservation)}`,
  };
}

export function createDeterministicAssistantPayload(request) {
  const noEvidence = canonicalNoEvidenceResponse(request);
  if (noEvidence) return noEvidence;
  const noCausalExplanation = canonicalNoCausalExplanation(request);
  if (noCausalExplanation) return noCausalExplanation;
  const windowMean = canonicalWindowMeanResponse(request);
  if (windowMean) return withNoCausalLimit(windowMean, request);
  const forecast = canonicalForecastResponse(request);
  if (forecast) return withNoCausalLimit(forecast, request);
  const unavailableForecast = canonicalUnavailableForecast(request);
  if (unavailableForecast) return withNoCausalLimit(unavailableForecast, request);
  const trend = canonicalTrendResponse(request);
  if (trend) return withNoCausalLimit(trend, request);
  const ranking = canonicalRankingAssistantPayload(request);
  if (ranking) return withNoCausalLimit(ranking, request);
  const multiMetricComparison = canonicalMultiLatestComparison(request);
  if (multiMetricComparison) return withNoCausalLimit(multiMetricComparison, request);
  const comparison = canonicalLatestComparison(request);
  if (comparison) {
    const { output, metrics } = request.analysisRequest;
    return withNoCausalLimit({
      answer: comparison.answer,
      highlights: comparison.highlights,
      confidence: comparison.confidence,
      status: 'answered',
      limitations: [],
      dataCoverage: comparison.dataCoverage,
      table: ['auto', 'table', 'chart_table'].includes(output) ? comparison.table : null,
      chart: ['chart', 'chart_table'].includes(output) ? comparison.chart : null,
      methodNote: 'เปรียบเทียบค่าล่าสุดที่เปิดเผยโดยตรงโดยไม่อนุมานสาเหตุ',
      followUps: [`ดูแนวโน้ม ${metrics[0]} ของทั้งสองรายการหรือไม่`],
    }, request);
  }
  const snapshot = canonicalLatestSnapshotResponse(request);
  return snapshot ? withNoCausalLimit(snapshot, request) : null;
}

export function createProviderFailureFallbackPayload(request) {
  const { analysisRequest } = request;
  if (analysisRequest.operation !== 'summarize') return null;
  const fallback = analysisRequest.time.mode === 'latest'
    ? canonicalLatestSnapshotResponse(request, { allowSummarize: true })
    : canonicalHistoricalSummaryFallback(request);
  if (!fallback) return null;
  return {
    ...fallback,
    confidence: fallback.confidence === 'high' ? 'medium' : fallback.confidence,
    status: 'partial',
    limitations: [...new Set([...fallback.limitations, 'provider-fallback'])],
    methodNote: `${fallback.methodNote ?? ''} ใช้คำตอบสำรองที่คำนวณจากหลักฐานโดยตรง เพราะไม่ได้รับคำบรรยายที่ใช้ได้จากโมเดลภายนอก`.trim(),
  };
}

function withNoCausalLimit(payload, { analysisRequest }) {
  if (!analysisRequest.explain) return payload;
  return {
    ...payload,
    answer: `${payload.answer} หลักฐานนี้ใช้เปรียบเทียบเชิงพรรณนาเท่านั้นและไม่สามารถระบุสาเหตุได้`,
    confidence: payload.confidence === 'high' ? 'medium' : payload.confidence,
    status: 'partial',
    limitations: [...new Set([...payload.limitations, 'no-causal-evidence'])],
    methodNote: `${payload.methodNote ?? ''} ไม่อนุมานเหตุและผลจากความสัมพันธ์ของตัวเลข`.trim(),
  };
}

function canonicalRankingTable({ analysisRequest, evidence }) {
  if (analysisRequest.operation !== 'rank' || analysisRequest.metrics.length > 6) return null;
  const entities = analysisRequest.scope === 'subject'
    ? evidence.subjects
    : analysisRequest.scope === 'room' ? evidence.rooms : [];
  const limitedEntities = entities.slice(0, analysisRequest.ranking?.limit ?? entities.length);
  if (limitedEntities.length === 0) return null;
  return {
    title: analysisRequest.scope === 'room'
      ? 'อันดับห้องจากหลักฐานที่เปิดเผย'
      : 'อันดับรายการจากหลักฐานที่เปิดเผย',
    columns: [
      'อันดับ',
      analysisRequest.scope === 'room' ? 'ห้อง' : 'รายการ',
      ...analysisRequest.metrics,
    ],
    rows: limitedEntities.map((entity, index) => [
      String(index + 1),
      entity.alias,
      ...analysisRequest.metrics.map(metric => latestMetricValue(entity.metrics, metric)),
    ]),
  };
}

function canonicalRankingNarrative({ analysisRequest, evidence }) {
  if (analysisRequest.operation !== 'rank') return null;
  const entities = analysisRequest.scope === 'subject'
    ? evidence.subjects
    : analysisRequest.scope === 'room' ? evidence.rooms : [];
  const limitedEntities = entities.slice(0, analysisRequest.ranking?.limit ?? entities.length);
  if (limitedEntities.length === 0) return null;
  const direction = analysisRequest.ranking?.direction;
  const directionText = direction === 'asc'
    ? 'จากค่าน้อยไปมาก'
    : direction === 'desc'
      ? 'จากค่ามากไปน้อย'
      : 'ตามลำดับความน่ากังวลที่หลักฐานกำหนด';
  const ordered = limitedEntities.map((entity, index) => `${index + 1}) ${entity.alias}`).join(', ');
  const highlights = limitedEntities.slice(0, 5).map((entity, index) => (
    `อันดับ ${index + 1} ${entity.alias}: ${analysisRequest.metrics
      .map(metric => `${metric} ${latestMetricValue(entity.metrics, metric)}`)
      .join(', ')}`
  ));
  return {
    answer: `ลำดับจากหลักฐานที่เปิดเผย ${directionText} คือ ${ordered} อันดับแรกคือ ${limitedEntities[0].alias} ลำดับนี้ยึดลำดับที่ผ่านการคัดเลือกมากับหลักฐานและไม่สร้างสูตรคะแนนรวมทางคลินิกขึ้นใหม่`,
    highlights,
    methodNote: 'รักษาลำดับของรายการตามหลักฐานที่เซิร์ฟเวอร์ตรวจสอบแล้ว และแสดงค่าล่าสุดของตัวชี้วัดที่ร้องขอโดยตรง',
  };
}

function canonicalRankingAssistantPayload(request) {
  const { analysisRequest, evidence } = request;
  if (!['auto', 'narrative', 'table'].includes(analysisRequest.output)) return null;
  const narrative = canonicalRankingNarrative(request);
  if (!narrative) return null;
  const entities = analysisRequest.scope === 'subject'
    ? evidence.subjects
    : evidence.rooms;
  return {
    answer: narrative.answer,
    highlights: narrative.highlights,
    confidence: 'high',
    status: 'answered',
    limitations: [],
    dataCoverage: `ครอบคลุม ${entities.length} รายการและ ${analysisRequest.metrics.length} ตัวชี้วัดจากหลักฐานล่าสุดที่เปิดเผย`,
    table: analysisRequest.output === 'narrative' ? null : canonicalRankingTable(request),
    chart: null,
    methodNote: narrative.methodNote,
    followUps: [],
  };
}

function normalizeRequestedArtifacts(payload, request) {
  const { analysisRequest } = request;
  const { operation, output } = analysisRequest;
  let table = payload.table;
  let chart = payload.chart;
  if (output === 'narrative') {
    table = null;
    chart = null;
  } else if (output === 'table') {
    chart = null;
  } else if (output === 'chart') {
    table = null;
  } else if (output === 'auto' && table && chart) {
    if (['trend', 'forecast'].includes(operation)) table = null;
    else chart = null;
  }
  const rankingTable = canonicalRankingTable(request);
  if (rankingTable && ['auto', 'table', 'chart_table'].includes(output)) {
    table = rankingTable;
  }
  const trendTable = canonicalTrendTable(request);
  if (supportsCanonicalTrendTable(analysisRequest)
    && ['table', 'chart_table'].includes(output)) {
    table = trendTable;
  }
  const summarySnapshot = analysisRequest.operation === 'summarize'
    && analysisRequest.time.mode === 'latest'
    ? canonicalLatestSnapshotResponse({
        ...request,
        analysisRequest: { ...analysisRequest, output: 'chart_table' },
      }, { allowSummarize: true })
    : null;
  const historicalSummary = analysisRequest.operation === 'summarize'
    && analysisRequest.time.mode !== 'latest'
    ? canonicalHistoricalSummaryFallback(request)
    : null;
  if (summarySnapshot) {
    if (output === 'narrative') {
      table = null;
      chart = null;
    } else if (output === 'table') {
      table = summarySnapshot.table;
      chart = null;
    } else if (output === 'chart') {
      table = null;
      chart = summarySnapshot.chart;
    } else if (output === 'chart_table') {
      table = summarySnapshot.table;
      chart = summarySnapshot.chart;
    } else {
      table = summarySnapshot.table;
      chart = null;
    }
  }
  if (historicalSummary) {
    if (output === 'narrative') {
      table = null;
      chart = null;
    } else if (output === 'table') {
      table = historicalSummary.table;
      chart = null;
    } else if (output === 'chart') {
      table = null;
      chart = historicalSummary.chart;
    } else if (output === 'chart_table') {
      table = historicalSummary.table;
      chart = historicalSummary.chart;
    } else {
      chart = historicalSummary.chart;
      table = chart ? null : historicalSummary.table;
    }
  }
  const missingOutput = (
    (output === 'table' && !table)
    || (output === 'chart' && !chart)
    || (output === 'chart_table' && (!table || !chart))
  );
  return { table, chart, missingOutput };
}

export function alignAssistantPayloadToRequest(payload, request) {
  const { analysisRequest, evidence } = request;
  const canonicalComparison = canonicalLatestComparison(request);
  const canonicalRanking = canonicalRankingNarrative(request);
  const canonicalForecast = canonicalForecastResponse(request);
  const canonicalSummary = analysisRequest.operation === 'summarize'
    ? analysisRequest.time.mode === 'latest'
      ? canonicalLatestSnapshotResponse(request, { allowSummarize: true })
      : canonicalHistoricalSummaryFallback(request)
    : null;
  const isProviderFallbackPayload = payload.limitations.includes('provider-fallback');
  const summaryGroundedPayload = canonicalSummary
    && !isProviderFallbackPayload
    && !providerSummaryIsNumericallyGrounded(payload, request)
    ? {
        ...payload,
        answer: canonicalSummary.answer,
        highlights: canonicalSummary.highlights,
        confidence: canonicalSummary.confidence,
        dataCoverage: canonicalSummary.dataCoverage,
        methodNote: `${canonicalSummary.methodNote} ใช้คำตอบสำรองที่คำนวณจากหลักฐานโดยตรงเมื่อคำบรรยายจากโมเดลไม่ผ่านการตรวจสอบตัวเลข`,
        table: canonicalSummary.table,
        chart: canonicalSummary.chart,
      }
    : payload;
  const groundedPayload = canonicalComparison
    ? {
        ...summaryGroundedPayload,
        answer: canonicalComparison.answer,
        highlights: canonicalComparison.highlights,
        ...(['auto', 'table', 'chart_table'].includes(analysisRequest.output)
          ? { table: canonicalComparison.table }
          : {}),
        ...(['chart', 'chart_table'].includes(analysisRequest.output)
          ? { chart: canonicalComparison.chart }
          : {}),
        confidence: canonicalComparison.confidence,
        dataCoverage: canonicalComparison.dataCoverage,
      }
    : canonicalRanking
      ? {
          ...summaryGroundedPayload,
          answer: canonicalRanking.answer,
          highlights: canonicalRanking.highlights,
          methodNote: canonicalRanking.methodNote,
        }
      : canonicalForecast
        ? canonicalForecast
        : summaryGroundedPayload;
  const artifacts = normalizeRequestedArtifacts(groundedPayload, request);
  const coverage = requestCoverage({ analysisRequest, evidence });
  const noEvidence = pointCount(evidence) === 0;
  const forecastUnavailable = analysisRequest.operation === 'forecast'
    && (coverage.missingMetric || coverage.missingWindow);
  const noUsableForecast = analysisRequest.operation === 'forecast' && !canonicalForecast;
  const smallGroupSuppressed = evidence.constraints.includes('insufficient-small-group');
  const carriedForwardPresent = hasCarriedForward(evidence);
  const providerFallback = groundedPayload.limitations.includes('provider-fallback');
  const applicable = new Set([
    ...(noEvidence || coverage.missingMetric ? ['insufficient-evidence'] : []),
    ...(forecastUnavailable ? ['forecast-unavailable'] : []),
    ...(smallGroupSuppressed ? ['small-group-suppressed'] : []),
    ...(coverage.missingMetric ? ['metric-omitted-by-privacy-budget'] : []),
    ...(coverage.missingWindow ? ['time-window-unavailable'] : []),
    ...(['overview', 'room'].includes(analysisRequest.scope) ? ['aggregate-only'] : []),
    ...(analysisRequest.explain ? ['no-causal-evidence'] : []),
    ...(carriedForwardPresent ? ['carried-forward-present'] : []),
    ...(artifacts.missingOutput ? ['requested-output-unavailable'] : []),
    ...(providerFallback ? ['provider-fallback'] : []),
  ]);
  const limitations = [...new Set([
    ...groundedPayload.limitations.filter(item => applicable.has(item)),
    ...(forecastUnavailable ? ['forecast-unavailable'] : []),
    ...(smallGroupSuppressed ? ['small-group-suppressed'] : []),
    ...(analysisRequest.explain ? ['no-causal-evidence'] : []),
    ...(carriedForwardPresent ? ['carried-forward-present'] : []),
    ...(coverage.missingWindow ? ['time-window-unavailable'] : []),
    ...(['overview', 'room'].includes(analysisRequest.scope) ? ['aggregate-only'] : []),
    ...(artifacts.missingOutput ? ['requested-output-unavailable'] : []),
    ...(providerFallback ? ['provider-fallback'] : []),
  ])];

  let status;
  if (noEvidence || smallGroupSuppressed || noUsableForecast) status = 'insufficient';
  else if (
    coverage.missingMetric
    || coverage.missingWindow
    || artifacts.missingOutput
    || analysisRequest.explain
    || providerFallback
  ) status = 'partial';
  else status = 'answered';

  return {
    ...groundedPayload,
    table: artifacts.table,
    chart: artifacts.chart,
    status,
    confidence: status === 'insufficient'
      ? 'low'
      : status === 'partial' && groundedPayload.confidence === 'high'
        ? 'medium'
        : groundedPayload.confidence,
    limitations,
  };
}
