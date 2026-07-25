const MAX_MESSAGE_COUNT = 12;
const MAX_MESSAGE_LENGTH = 3_000;
const MAX_CONTEXT_BYTES = 350_000;
const MAX_ANSWER_LENGTH = 8_000;
const ALLOWED_COLORS = new Set(['blue', 'emerald', 'amber', 'rose', 'violet', 'slate']);
const ALLOWED_CHART_TYPES = new Set(['line', 'bar', 'area']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function boundedStrings(value, maxItems, maxLength) {
  return Array.isArray(value)
    ? value
        .map(item => boundedString(item, maxLength))
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
      description: 'A concise Thai answer grounded only in the supplied dashboard context.',
    },
    highlights: {
      type: 'array',
      maxItems: 6,
      items: { type: 'string' },
    },
    confidence: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
    },
    dataCoverage: {
      type: 'string',
      description: 'Which verified dates, weeks, students, or rooms support the answer.',
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
      description: 'Calculation or prediction method and its important limitation.',
    },
    followUps: {
      type: 'array',
      maxItems: 3,
      items: { type: 'string' },
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

function uniqueSubjects(context) {
  const profiles = [
    ...(Array.isArray(context?.relevantStudents) ? context.relevantStudents : []),
    ...(Array.isArray(context?.detailedStudents) ? context.detailedStudents : []),
  ];
  const byId = new Map();
  for (const profile of profiles) {
    if (
      isObject(profile)
      && typeof profile.id === 'string'
      && typeof profile.name === 'string'
      && !byId.has(profile.id)
    ) {
      byId.set(profile.id, { id: profile.id, name: profile.name });
    }
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceTerms(value, replacements) {
  let output = String(value ?? '');
  for (const [term, replacement] of replacements) {
    if (term.length < 3) continue;
    output = output.replace(new RegExp(escapeRegExp(term), 'giu'), replacement);
  }
  return output;
}

function sensitiveDetailTerms(context) {
  const terms = [];
  const fields = [
    'region',
    'school',
    'familyHistory',
    'financialBurden',
    'physicalIssueDetail',
    'mentalIssueDetail',
  ];
  for (const profile of context?.detailedStudents ?? []) {
    for (const field of fields) {
      const value = profile?.demographics?.[field];
      if (typeof value === 'string' && value.trim().length >= 3) terms.push(value.trim());
    }
    if (typeof profile?.drawingNote === 'string' && profile.drawingNote.trim().length >= 3) {
      terms.push(profile.drawingNote.trim());
    }
  }
  return terms;
}

function numericAssessment(assessment) {
  if (!isObject(assessment)) return null;
  return {
    week: Number.isFinite(assessment.week) ? assessment.week : null,
    depression: Number.isFinite(assessment.dass_d) ? assessment.dass_d : null,
    anxiety: Number.isFinite(assessment.dass_a) ? assessment.dass_a : null,
    stress: Number.isFinite(assessment.dass_s) ? assessment.dass_s : null,
    cdRisc: Number.isFinite(assessment.cd_risc) ? assessment.cd_risc : null,
    grit: Number.isFinite(assessment.grit) ? assessment.grit : null,
  };
}

function deidentifiedCompactProfile(profile, alias) {
  return {
    subject: alias,
    room: boundedString(profile?.room, 100) || null,
    mentalSeverity: Number.isFinite(profile?.mentalSeverity)
      ? profile.mentalSeverity
      : null,
    latestObservation: isObject(profile?.latestObservation)
      ? profile.latestObservation
      : null,
    latestAssessment: isObject(profile?.latestAssessment)
      ? profile.latestAssessment
      : null,
    selfTrendDirection: Number.isFinite(profile?.selfTrendDirection)
      ? profile.selfTrendDirection
      : null,
  };
}

function deidentifiedDetailedProfile(profile, alias) {
  return {
    ...deidentifiedCompactProfile(profile, alias),
    fourColorTrend: Array.isArray(profile?.fourColorTrend)
      ? profile.fourColorTrend.map(point => ({
          date: boundedString(point?.date, 10),
          self: Number.isFinite(point?.self) ? point.self : null,
          buddy: Number.isFinite(point?.buddy) ? point.buddy : null,
          command: Number.isFinite(point?.command) ? point.command : null,
          buddyCarriedForward: point?.isBuddyCF === true,
          commandCarriedForward: point?.isCommandCF === true,
        }))
      : [],
    assessments: Array.isArray(profile?.assessments)
      ? profile.assessments.map(numericAssessment).filter(Boolean)
      : [],
    latestResilience: isObject(profile?.latestResilience)
      ? {
          week: Number.isFinite(profile.latestResilience.week)
            ? profile.latestResilience.week
            : null,
          cdRisc: Number.isFinite(profile.latestResilience.cd_risc)
            ? profile.latestResilience.cd_risc
            : null,
          grit: Number.isFinite(profile.latestResilience.grit)
            ? profile.latestResilience.grit
            : null,
        }
      : null,
    prediction: isObject(profile?.prediction) ? profile.prediction : null,
  };
}

export function createFusionRequestView({ context, messages }) {
  const subjects = uniqueSubjects(context);
  const aliases = subjects.map((subject, index) => ({
    ...subject,
    alias: `subject_${String(index + 1).padStart(3, '0')}`,
  }));
  const aliasById = new Map(aliases.map(item => [item.id, item.alias]));
  const replacements = aliases
    .flatMap(item => [
      [item.name, item.alias],
      [item.id, item.alias],
    ])
    .concat(sensitiveDetailTerms(context).map(term => [term, '[redacted_detail]']))
    .sort(([left], [right]) => right.length - left.length);

  const fusionContext = {
    source: context?.source ?? null,
    glossary: context?.glossary ?? null,
    overview: context?.overview ?? null,
    roomSummaries: context?.roomSummaries ?? [],
    relevantSubjects: (context?.relevantStudents ?? []).map(profile => (
      deidentifiedCompactProfile(profile, aliasById.get(profile.id) ?? 'subject_unknown')
    )),
    detailedSubjects: (context?.detailedStudents ?? []).map(profile => (
      deidentifiedDetailedProfile(profile, aliasById.get(profile.id) ?? 'subject_unknown')
    )),
    prediction: context?.prediction ?? null,
    retrieval: {
      includedRelevantStudentCount:
        context?.retrieval?.includedRelevantStudentCount ?? 0,
      includedDetailedStudentCount:
        context?.retrieval?.includedDetailedStudentCount ?? 0,
      detailedStudentLimit: context?.retrieval?.detailedStudentLimit ?? 0,
    },
    constraints: [
      ...(Array.isArray(context?.constraints) ? context.constraints : []),
      'Subject aliases are pseudonyms. Do not infer or search for real identities.',
      'External web search is not needed and must not be used for this closed-dataset task.',
    ],
  };

  return {
    aliases,
    context: fusionContext,
    contextJson: JSON.stringify(fusionContext),
    messages: messages.map(message => ({
      role: message.role,
      content: replaceTerms(message.content, replacements),
    })),
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

  const answer = boundedString(payload.answer, MAX_ANSWER_LENGTH);
  if (!answer) throw new Error('empty-assistant-answer');

  return {
    answer,
    highlights: boundedStrings(payload.highlights, 6, 500),
    confidence: ['high', 'medium', 'low'].includes(payload.confidence)
      ? payload.confidence
      : 'low',
    dataCoverage: boundedString(payload.dataCoverage, 500),
    table: normalizeTable(payload.table),
    chart: normalizeChart(payload.chart),
    methodNote: boundedString(payload.methodNote, 1_000) || null,
    followUps: boundedStrings(payload.followUps, 3, 240),
  };
}
