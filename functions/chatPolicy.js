const MAX_MESSAGE_COUNT = 12;
const MAX_MESSAGE_LENGTH = 3_000;
const MAX_CONTEXT_BYTES = 350_000;
const MAX_ANSWER_LENGTH = 8_000;
const ALLOWED_COLORS = new Set(['blue', 'emerald', 'amber', 'rose', 'violet', 'slate']);
const ALLOWED_CHART_TYPES = new Set(['line', 'bar', 'area']);
const PLACEHOLDER_TEXT = /^(?:[\s.…·•*_~—–-]+|tbd|todo|placeholder|null|undefined)$/iu;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function meaningfulString(value, maxLength) {
  const text = boundedString(value, maxLength);
  return text && !PLACEHOLDER_TEXT.test(text) ? text : '';
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
          maxItems: 4,
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
                maxItems: 4,
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
    'dataCoverage',
    'table',
    'chart',
    'methodNote',
    'followUps',
  ],
});

export function validateChatRequest(body) {
  if (!isObject(body)) return { ok: false, code: 'invalid-body' };
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { ok: false, code: 'missing-messages' };
  }

  const messages = body.messages.slice(-MAX_MESSAGE_COUNT).map(message => {
    if (!isObject(message) || !['user', 'assistant'].includes(message.role)) return null;
    const content = boundedString(message.content, MAX_MESSAGE_LENGTH);
    return content ? { role: message.role, content } : null;
  });
  if (messages.some(message => message === null)) {
    return { ok: false, code: 'invalid-message' };
  }
  if (messages.at(-1)?.role !== 'user') {
    return { ok: false, code: 'last-message-must-be-user' };
  }
  if (!isObject(body.context)) return { ok: false, code: 'invalid-context' };

  const contextJson = JSON.stringify(body.context);
  if (Buffer.byteLength(contextJson, 'utf8') > MAX_CONTEXT_BYTES) {
    return { ok: false, code: 'context-too-large' };
  }

  return {
    ok: true,
    value: {
      messages,
      context: body.context,
      contextJson,
    },
  };
}

function normalizeTable(table) {
  if (!isObject(table)) return null;
  const columns = boundedStrings(table.columns, 8, 80);
  if (columns.length === 0) return null;

  const rows = Array.isArray(table.rows)
    ? table.rows.slice(0, 20).map(row => {
        const normalized = boundedStrings(row, columns.length, 160);
        return Array.from({ length: columns.length }, (_, index) => normalized[index] ?? '');
      })
    : [];

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
        .slice(0, 4)
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

  const answer = meaningfulString(payload.answer, MAX_ANSWER_LENGTH);
  if (!answer) throw new Error('empty-assistant-answer');

  return {
    answer,
    highlights: meaningfulStrings(payload.highlights, 6, 500),
    confidence: ['high', 'medium', 'low'].includes(payload.confidence)
      ? payload.confidence
      : 'low',
    dataCoverage: meaningfulString(payload.dataCoverage, 500),
    table: normalizeTable(payload.table),
    chart: normalizeChart(payload.chart),
    methodNote: meaningfulString(payload.methodNote, 1_000) || null,
    followUps: meaningfulStrings(payload.followUps, 3, 240),
  };
}
