import assert from 'node:assert/strict';
import test from 'node:test';

import {
  alignAssistantPayloadToRequest,
  createDeterministicAssistantPayload,
  createProviderFailureFallbackPayload,
  parseAssistantPayload,
} from './chatPolicy.js';

test('assistant payload is normalized before it reaches the browser', () => {
  const payload = parseAssistantPayload(JSON.stringify({
    answer: 'พบแนวโน้มเพิ่มขึ้น',
    highlights: ['หนึ่ง', 'สอง'],
    confidence: 'high',
    status: 'answered',
    limitations: [],
    dataCoverage: 'Wk 1-4',
    table: null,
    chart: {
      type: 'line',
      title: 'แนวโน้ม',
      xLabel: 'สัปดาห์',
      yLabel: 'คะแนน',
      series: [{ id: 'self', label: 'Self', color: 'blue' }],
      points: [
        { label: 'Wk 1', values: [1] },
        { label: 'Wk 2', values: [2] },
      ],
    },
    methodNote: null,
    followUps: ['ดูรายห้อง'],
  }));

  assert.equal(payload.chart.series[0].id, 'self');
  assert.deepEqual(payload.chart.points[1].values, [2]);
  assert.equal(payload.status, 'answered');
});

test('assistant payload rejects a placeholder-only answer', () => {
  assert.throws(
    () => parseAssistantPayload(JSON.stringify({
      answer: '...',
      highlights: ['…'],
      confidence: 'high',
      status: 'answered',
      limitations: [],
      dataCoverage: '...',
      table: null,
      chart: null,
      methodNote: '...',
      followUps: ['...'],
    })),
    /empty-assistant-answer/,
  );
});

test('assistant payload unwraps an accidental JSON object embedded in answer text', () => {
  const payload = parseAssistantPayload(JSON.stringify({
    answer: JSON.stringify({
      status: 'answered',
      summary: 'ข้อมูลล่าสุดมีค่า stress เท่ากับ 3.03',
    }),
    highlights: [],
    confidence: 'high',
    status: 'answered',
    limitations: [],
    dataCoverage: 'ข้อมูลสัปดาห์ 16',
    table: null,
    chart: null,
    methodNote: null,
    followUps: [],
  }));

  assert.equal(payload.answer, 'ข้อมูลล่าสุดมีค่า stress เท่ากับ 3.03');
});

test('assistant payload rejects model JSON-repair chatter inside response fields', () => {
  assert.throws(() => parseAssistantPayload(JSON.stringify({
    answer: 'ข้อมูลล่าสุดมีค่า stress เท่ากับ 3.03',
    highlights: [],
    confidence: 'high',
    status: 'answered',
    limitations: [],
    dataCoverage: 'ข้อมูลสัปดาห์ 16. The output is not valid JSON. Let me fix the JSON.',
    table: null,
    chart: null,
    methodNote: null,
    followUps: [],
  })), /invalid-structured-response/u);
});

test('assistant payload rejects literal punctuation-control words leaked by the model', () => {
  assert.throws(() => parseAssistantPayload(JSON.stringify({
    answer: 'self 1.94 comma buddy 2.06',
    highlights: ['ค่าที่ตรวจสอบได้'],
    confidence: 'high',
    status: 'answered',
    limitations: [],
    dataCoverage: 'latest evidence',
    table: null,
    chart: null,
    methodNote: null,
    followUps: [],
  })), /invalid-structured-response/u);
});

test('assistant payload removes placeholders from optional text fields', () => {
  const payload = parseAssistantPayload(JSON.stringify({
    answer: 'ข้อมูลยังไม่พอสำหรับสรุปแนวโน้ม กรุณาตรวจสอบช่วงวันที่ของข้อมูล',
    highlights: ['...', 'มีข้อมูลยืนยันถึงสัปดาห์ที่ 8'],
    confidence: 'low',
    status: 'partial',
    limitations: ['time-window-unavailable', 'unknown-value'],
    dataCoverage: '…',
    table: null,
    chart: null,
    methodNote: '-',
    followUps: ['TBD', 'ตรวจสอบข้อมูลรายห้องหรือไม่'],
  }));

  assert.deepEqual(payload.highlights, ['มีข้อมูลยืนยันถึงสัปดาห์ที่ 8']);
  assert.equal(payload.dataCoverage, '');
  assert.equal(payload.methodNote, null);
  assert.equal(payload.status, 'partial');
  assert.deepEqual(payload.limitations, ['time-window-unavailable']);
  assert.deepEqual(payload.followUps, ['ตรวจสอบข้อมูลรายห้องหรือไม่']);
});

test('assistant payload removes a table whose data cells are all blank', () => {
  const payload = parseAssistantPayload(JSON.stringify({
    answer: 'เปรียบเทียบค่าล่าสุดเรียบร้อยแล้ว',
    highlights: [],
    confidence: 'high',
    status: 'answered',
    limitations: [],
    dataCoverage: 'ข้อมูลสองราย ณ สัปดาห์ที่ 16',
    table: {
      title: 'ตารางข้อมูล',
      columns: ['ราย', 'ค่าล่าสุด'],
      rows: [['[[P1]]', ','], ['[[P2]]', '...']],
    },
    chart: null,
    methodNote: null,
    followUps: [],
  }));

  assert.equal(payload.table, null);
});

test('assistant tables preserve column positions and name missing cells explicitly', () => {
  const payload = parseAssistantPayload(JSON.stringify({
    answer: 'มีข้อมูลบางคอลัมน์', highlights: [], confidence: 'high', status: 'answered',
    limitations: [], dataCoverage: 'หนึ่งจุด', chart: null, methodNote: null, followUps: [],
    table: {
      title: 'ตารางข้อมูล',
      columns: ['ตัวชี้วัด', 'ค่า', 'สัปดาห์'],
      rows: [['concern_count', '31', '—']],
    },
  }));

  assert.deepEqual(payload.table.rows, [['concern_count', '31', 'ไม่มีข้อมูล']]);
});

test('assistant tables reject invalid headers instead of shifting row values', () => {
  const payload = parseAssistantPayload(JSON.stringify({
    answer: 'ตารางนี้มีหัวคอลัมน์เสีย', highlights: [], confidence: 'low', status: 'partial',
    limitations: ['requested-output-unavailable'], dataCoverage: 'หนึ่งแถว',
    chart: null, methodNote: null, followUps: [],
    table: {
      title: 'ตารางข้อมูล',
      columns: ['รายการ', '', 'stress'],
      rows: [['[[P1]]', 'ข้อมูลผิดตำแหน่ง', '4']],
    },
  }));

  assert.equal(payload.table, null);
});

test('response contract removes irrelevant limitations and corrects unsupported partial status', () => {
  const payload = {
    answer: 'Mock Student 0002 มีค่าล่าสุดสูงกว่า',
    highlights: [],
    confidence: 'high',
    status: 'partial',
    limitations: ['time-window-unavailable', 'aggregate-only'],
    dataCoverage: 'สัปดาห์ 0-16',
    table: null,
    chart: null,
    methodNote: null,
    followUps: [],
  };
  const aligned = alignAssistantPayloadToRequest(payload, {
    analysisRequest: {
      operation: 'compare', scope: 'subject', metrics: ['stress'],
      time: { mode: 'latest', windows: [] }, output: 'auto', explain: false,
    },
    evidence: {
      metrics: [], rooms: [], constraints: [],
      subjects: [{ metrics: [{ metric: 'stress', points: [{ week: 16, value: 5 }] }] }],
    },
  });

  assert.equal(aligned.status, 'answered');
  assert.deepEqual(aligned.limitations, []);
});

test('response contract marks missing forecasts and requested artifacts deterministically', () => {
  const basePayload = {
    answer: 'ยังไม่มีหลักฐานพยากรณ์',
    highlights: [],
    confidence: 'high',
    status: 'answered',
    limitations: [],
    dataCoverage: 'สัปดาห์ 0-16',
    table: null,
    chart: null,
    methodNote: null,
    followUps: [],
  };
  const forecast = alignAssistantPayloadToRequest(basePayload, {
    analysisRequest: {
      operation: 'forecast', scope: 'subject', metrics: ['stress'],
      time: { mode: 'forecast_horizon', windows: [] }, output: 'chart', explain: false,
    },
    evidence: {
      metrics: [], rooms: [], constraints: [],
      subjects: [{ metrics: [{ metric: 'stress', points: [{ week: 16, value: 5 }] }] }],
    },
  });

  assert.equal(forecast.status, 'insufficient');
  assert.equal(forecast.confidence, 'low');
  assert.deepEqual(forecast.limitations, [
    'forecast-unavailable',
    'requested-output-unavailable',
  ]);
});

test('status words alone are rejected as non-answers', () => {
  assert.throws(() => parseAssistantPayload(JSON.stringify({
    answer: 'partial',
    highlights: [],
    confidence: 'low',
    status: 'partial',
    limitations: ['insufficient-evidence'],
    dataCoverage: 'ข้อมูลไม่ครบ',
    table: null,
    chart: null,
    methodNote: null,
    followUps: [],
  })), /empty-assistant-answer/u);
});

test('rank responses use a deterministic compact table for bounded metric sets', () => {
  const aligned = alignAssistantPayloadToRequest({
    answer: 'จัดอันดับ grit จากน้อยไปมาก',
    highlights: [], confidence: 'high', status: 'answered', limitations: [],
    dataCoverage: 'สามราย', methodNote: null, followUps: [], chart: null,
    table: { title: 'broken', columns: ['อันดับ'], rows: [['wrong']] },
  }, {
    analysisRequest: {
      operation: 'rank', scope: 'subject', metrics: ['grit'],
      time: { mode: 'latest', windows: [] }, output: 'auto', explain: false,
    },
    evidence: {
      metrics: [], rooms: [], constraints: [],
      subjects: [
        { alias: '[[P1]]', metrics: [{ metric: 'grit', value: 13, rank: 1 }] },
        { alias: '[[P2]]', metrics: [{ metric: 'grit', value: 14, rank: 2 }] },
      ],
    },
  });

  assert.deepEqual(aligned.table, {
    title: 'อันดับรายการจากหลักฐานที่เปิดเผย',
    columns: ['อันดับ', 'รายการ', 'grit'],
    rows: [['1', '[[P1]]', '13'], ['2', '[[P2]]', '14']],
  });
});

test('latest two-subject comparisons use a deterministic contradiction-free answer', () => {
  const aligned = alignAssistantPayloadToRequest({
    answer: 'ทั้งสองคนมีค่าเท่ากันคือ 1 และ 2',
    highlights: [], confidence: 'high', status: 'answered', limitations: [],
    dataCoverage: 'สองราย', methodNote: null, followUps: [], chart: null, table: null,
  }, {
    analysisRequest: {
      operation: 'compare', statistic: 'latest', scope: 'subject', metrics: ['self'],
      time: { mode: 'latest', windows: [] }, output: 'auto', explain: false,
    },
    evidence: {
      metrics: [], rooms: [], constraints: [],
      subjects: [
        { alias: '[[P1]]', metrics: [{ metric: 'self', points: [{ week: 16, value: 1 }] }] },
        { alias: '[[P2]]', metrics: [{ metric: 'self', points: [{ week: 16, value: 2 }] }] },
      ],
    },
  });

  assert.match(aligned.answer, /\[\[P2\]\].*สูงกว่า/u);
  assert.doesNotMatch(aligned.answer, /เท่ากัน/u);
  assert.deepEqual(aligned.table.rows, [
    ['[[P1]]', '1', 'สัปดาห์ 16'],
    ['[[P2]]', '2', 'สัปดาห์ 16'],
  ]);
});

test('explicit multi-subject trend tables are computed from observed points deterministically', () => {
  const makeMetric = (metric, values) => ({
    metric,
    points: values.map((item, week) => (
      typeof item === 'object'
        ? { week, value: item.value, carriedForward: true }
        : { week, value: item }
    )),
  });
  const subjects = [
    {
      alias: '[[P1]]',
      metrics: [
        makeMetric('self', [1, 2, 3]),
        makeMetric('buddy', [2, 2, 2]),
        makeMetric('command', [3, 2, 1]),
      ],
    },
    {
      alias: '[[P2]]',
      metrics: [
        makeMetric('self', [1, { value: 4 }, 3]),
        makeMetric('buddy', [1, 2, 2]),
        makeMetric('command', [2, 2, 3]),
      ],
    },
    {
      alias: '[[P3]]',
      metrics: [
        makeMetric('self', [3, 2, 2]),
        makeMetric('buddy', [3, 3, 2]),
        makeMetric('command', [1, 2, 3]),
      ],
    },
  ];
  const aligned = alignAssistantPayloadToRequest({
    answer: 'สรุปแนวโน้มครบแล้ว',
    highlights: [], confidence: 'high', status: 'answered', limitations: [],
    dataCoverage: 'สามราย สามตัวชี้วัด', methodNote: null, followUps: [],
    chart: {
      type: 'line', title: 'ไม่ควรแสดง', xLabel: '', yLabel: '',
      series: [{ id: 'x', label: 'x', color: 'blue' }],
      points: [{ label: '1', values: [1] }],
    },
    table: { title: 'model table', columns: ['x', 'y'], rows: [['bad', ',']] },
  }, {
    analysisRequest: {
      operation: 'trend', statistic: 'trend', scope: 'subject',
      metrics: ['self', 'buddy', 'command'],
      time: { mode: 'available_range', windows: [] },
      output: 'table', explain: false,
    },
    evidence: { metrics: [], rooms: [], constraints: [], subjects },
  });

  assert.equal(aligned.table.rows.length, 9);
  assert.deepEqual(aligned.table.rows[3], [
    '[[P2]]', 'self', '1', '3', '2', '1', 'สัปดาห์ 0-2', '2',
  ]);
  assert.equal(aligned.chart, null);
  assert.deepEqual(aligned.limitations, ['carried-forward-present']);
});

test('exact two-subject latest comparisons can be answered without provider egress', () => {
  const request = {
    analysisRequest: {
      operation: 'compare', statistic: 'latest', scope: 'subject', metrics: ['stress'],
      time: { mode: 'latest', windows: [] }, output: 'chart_table', explain: false,
    },
    evidence: {
      metrics: [], rooms: [], constraints: [],
      subjects: [
        { alias: '[[P1]]', metrics: [{ metric: 'stress', value: 2, week: 16 }] },
        { alias: '[[P2]]', metrics: [{ metric: 'stress', value: 4, week: 16 }] },
      ],
    },
  };
  const payload = createDeterministicAssistantPayload(request);

  assert.match(payload.answer, /\[\[P2\]\].*สูงกว่า/u);
  assert.equal(payload.table.rows.length, 2);
  assert.equal(payload.chart.points[1].values[0], 4);
  assert.equal(payload.status, 'answered');
});

test('trend tables over the response row budget fail visibly instead of truncating entities', () => {
  const metrics = ['self', 'buddy', 'command', 'depression', 'anxiety'];
  const aligned = alignAssistantPayloadToRequest({
    answer: 'มีข้อมูลมากเกินกว่าตารางเดียว',
    highlights: [], confidence: 'high', status: 'answered', limitations: [],
    dataCoverage: 'ห้าราย ห้าตัวชี้วัด', methodNote: null, followUps: [], chart: null,
    table: { title: 'ตารางที่โมเดลตัดทอน', columns: ['รายการ'], rows: [['ไม่ครบ']] },
  }, {
    analysisRequest: {
      operation: 'trend', statistic: 'trend', scope: 'subject', metrics,
      time: { mode: 'available_range', windows: [] }, output: 'table', explain: false,
    },
    evidence: {
      metrics: [], rooms: [], constraints: [],
      subjects: Array.from({ length: 5 }, (_, index) => ({
        alias: `[[P${index + 1}]]`,
        metrics: metrics.map(metric => ({
          metric,
          points: [{ week: 1, value: 1 }, { week: 2, value: 2 }],
        })),
      })),
    },
  });

  assert.equal(aligned.table, null);
  assert.equal(aligned.status, 'partial');
  assert.deepEqual(aligned.limitations, ['requested-output-unavailable']);
});

test('causal trend questions receive a descriptive local answer with an explicit causal limit', () => {
  const payload = createDeterministicAssistantPayload({
    analysisRequest: {
      operation: 'trend', statistic: 'change', scope: 'subject', metrics: ['stress'],
      time: {
        mode: 'recent_vs_previous',
        windows: [{ fromWeek: 0, toWeek: 8 }, { fromWeek: 9, toWeek: 16 }],
      },
      output: 'auto', explain: true,
    },
    evidence: {
      metrics: [], rooms: [], constraints: [],
      subjects: [{
        alias: '[[P1]]',
        metrics: [{
          metric: 'stress',
          points: [
            { week: 0, value: 2 },
            { week: 4, value: 3 },
            { week: 8, value: 4 },
            { week: 16, value: 5 },
          ],
        }],
      }],
    },
  });

  assert.match(payload.answer, /ระบุสาเหตุไม่ได้/u);
  assert.match(payload.answer, /สัปดาห์ 0-8.*เปลี่ยนแปลง 2/u);
  assert.equal(payload.status, 'partial');
  assert.deepEqual(payload.limitations, ['no-causal-evidence']);
});

test('ranking narratives preserve evidence order and remove invented scoring formulas', () => {
  const aligned = alignAssistantPayloadToRequest({
    answer: 'คำนวณค่าเฉลี่ยใหม่แล้ว ห้องสองสูงที่สุด',
    highlights: ['สูตรใหม่'], confidence: 'high', status: 'answered', limitations: [],
    dataCoverage: 'สามห้อง', methodNote: 'ใช้ค่าเฉลี่ยเลขคณิต', followUps: [],
    chart: null, table: null,
  }, {
    analysisRequest: {
      operation: 'rank', statistic: 'priority', scope: 'room',
      metrics: ['self', 'buddy', 'command'],
      time: { mode: 'latest', windows: [] },
      ranking: { direction: 'risk_first', limit: 3 }, output: 'auto', explain: false,
    },
    evidence: {
      metrics: [], subjects: [], constraints: [],
      rooms: [
        { alias: '[[R1]]', metrics: [{ metric: 'self', value: 3 }, { metric: 'buddy', value: 2 }, { metric: 'command', value: 2 }] },
        { alias: '[[R2]]', metrics: [{ metric: 'self', value: 2 }, { metric: 'buddy', value: 3 }, { metric: 'command', value: 3 }] },
        { alias: '[[R3]]', metrics: [{ metric: 'self', value: 2 }, { metric: 'buddy', value: 2 }, { metric: 'command', value: 2 }] },
      ],
    },
  });

  assert.match(aligned.answer, /1\) \[\[R1\]\], 2\) \[\[R2\]\], 3\) \[\[R3\]\]/u);
  assert.doesNotMatch(aligned.answer, /ค่าเฉลี่ย/u);
  assert.doesNotMatch(aligned.methodNote, /ค่าเฉลี่ยเลขคณิต/u);
});

test('forecast narratives and artifacts use supplied forecast points without magnitude labels', () => {
  const aligned = alignAssistantPayloadToRequest({
    answer: 'คะแนนจะลดลงเล็กน้อย', highlights: ['ลดลงเล็กน้อย'],
    confidence: 'high', status: 'answered', limitations: [], dataCoverage: 'ข้อมูล',
    table: null, chart: null, methodNote: 'model', followUps: [],
  }, {
    analysisRequest: {
      operation: 'forecast', statistic: 'forecast', scope: 'subject', metrics: ['self'],
      time: { mode: 'forecast_horizon', windows: [{ fromWeek: 17, toWeek: 20 }] },
      output: 'chart', explain: false,
    },
    evidence: {
      metrics: [], rooms: [], constraints: [],
      subjects: [{
        alias: '[[P1]]',
        metrics: [
          { metric: 'self', points: [{ week: 16, value: 2 }] },
          {
            metric: 'self_forecast',
            points: [
              { week: 17, value: 1.95 }, { week: 18, value: 1.93 },
              { week: 19, value: 1.92 }, { week: 20, value: 1.91 },
            ],
          },
        ],
      }],
    },
  });

  assert.doesNotMatch(aligned.answer, /เล็กน้อย/u);
  assert.match(aligned.answer, /1\.95 เป็น 1\.91 ลดลง 0\.04/u);
  assert.deepEqual(aligned.chart.points.map(point => point.values[0]), [1.95, 1.93, 1.92, 1.91]);
  assert.equal(aligned.table, null);
});

test('latest comparison selects the newest week instead of the final array element', () => {
  const payload = createDeterministicAssistantPayload({
    analysisRequest: {
      operation: 'compare', statistic: 'latest', scope: 'subject', metrics: ['stress'],
      time: { mode: 'latest', windows: [] }, output: 'auto', explain: false,
    },
    evidence: {
      metrics: [], rooms: [], constraints: [],
      subjects: [
        {
          alias: '[[P1]]',
          metrics: [{ metric: 'stress', points: [{ week: 16, value: 4 }, { week: 4, value: 1 }] }],
        },
        {
          alias: '[[P2]]',
          metrics: [{ metric: 'stress', points: [{ week: 4, value: 5 }, { week: 16, value: 2 }] }],
        },
      ],
    },
  });

  assert.match(payload.answer, /\[\[P1\]\].*ล่าสุด 4/u);
  assert.match(payload.highlights[0], /สัปดาห์ 16/u);
});

test('forecast artifacts include only the requested horizon', () => {
  const payload = createDeterministicAssistantPayload({
    analysisRequest: {
      operation: 'forecast', statistic: 'forecast', scope: 'subject', metrics: ['self'],
      time: { mode: 'forecast_horizon', windows: [{ fromWeek: 18, toWeek: 19 }] },
      output: 'chart_table', explain: false,
    },
    evidence: {
      metrics: [], rooms: [], constraints: [],
      subjects: [{
        alias: '[[P1]]',
        metrics: [{
          metric: 'self_forecast',
          points: [
            { week: 17, value: 2.1 }, { week: 18, value: 2.2 },
            { week: 19, value: 2.3 }, { week: 20, value: 2.4 },
          ],
        }],
      }],
    },
  });

  assert.deepEqual(payload.table.rows.map(row => row[2]), ['สัปดาห์ 18', 'สัปดาห์ 19']);
  assert.deepEqual(payload.chart.points.map(point => point.label), ['สัปดาห์ 18', 'สัปดาห์ 19']);
});

test('high-dimensional trends return a complete table and an explicit chart limit locally', () => {
  const metrics = ['self', 'buddy', 'command', 'depression', 'anxiety'];
  const request = {
    analysisRequest: {
      operation: 'compare', statistic: 'trend', scope: 'subject', metrics,
      time: { mode: 'available_range', windows: [] }, output: 'chart_table', explain: false,
    },
    evidence: {
      metrics: [], rooms: [], constraints: [],
      subjects: Array.from({ length: 3 }, (_, index) => ({
        alias: `[[P${index + 1}]]`,
        metrics: metrics.map((metric, metricIndex) => ({
          metric,
          points: [{ week: 1, value: 1 }, { week: 2, value: 1 + metricIndex / 10 }],
        })),
      })),
    },
  };
  const local = createDeterministicAssistantPayload(request);
  const aligned = alignAssistantPayloadToRequest(local, request);

  assert.equal(aligned.table.rows.length, 15);
  assert.equal(aligned.chart, null);
  assert.equal(aligned.status, 'partial');
  assert.deepEqual(aligned.limitations, ['requested-output-unavailable']);
});

test('requests with no disclosed evidence fail locally with concrete limitations', () => {
  const request = {
    analysisRequest: {
      operation: 'trend', statistic: 'mean', scope: 'overview', metrics: ['stress'],
      time: { mode: 'week_windows', windows: [{ fromWeek: 90, toWeek: 99 }] },
      output: 'table', explain: false,
    },
    evidence: { metrics: [], subjects: [], rooms: [], constraints: [] },
  };
  const local = createDeterministicAssistantPayload(request);
  const aligned = alignAssistantPayloadToRequest(local, request);

  assert.match(aligned.answer, /ไม่มีหลักฐาน/u);
  assert.equal(aligned.status, 'insufficient');
  assert.deepEqual(aligned.limitations, [
    'insufficient-evidence',
    'time-window-unavailable',
    'aggregate-only',
  ]);
  assert.deepEqual(aligned.table.rows[0], [
    'ภาพรวม', 'stress', 'ไม่มีข้อมูล', 'ไม่มีข้อมูล', 'ไม่มีข้อมูล', 'ไม่มีข้อมูล',
    'สัปดาห์ 90-99', '0',
  ]);
});

test('window means are computed locally and expose a missing comparison window', () => {
  const request = {
    analysisRequest: {
      operation: 'compare', statistic: 'mean', scope: 'overview', metrics: ['stress'],
      time: {
        mode: 'week_windows',
        windows: [{ fromWeek: 0, toWeek: 4 }, { fromWeek: 5, toWeek: 7 }],
      },
      output: 'table', explain: false,
    },
    evidence: {
      subjects: [], rooms: [], constraints: [],
      metrics: [{
        metric: 'stress',
        points: [
          { week: 0, value: 2 }, { week: 2, value: 4 }, { week: 4, value: 6 },
        ],
      }],
    },
  };
  const payload = createDeterministicAssistantPayload(request);

  assert.equal(payload.table.rows[0][3], '4');
  assert.equal(payload.table.rows[1][3], 'ไม่มีข้อมูล');
  assert.equal(payload.status, 'partial');
  assert.equal(payload.confidence, 'medium');
  assert.deepEqual(payload.limitations, ['time-window-unavailable']);
  assert.match(payload.answer, /เปรียบเทียบค่าเฉลี่ยไม่ครบ/u);
});

test('multi-metric latest comparisons are local and contradiction-free', () => {
  const request = {
    analysisRequest: {
      operation: 'compare', statistic: 'latest', scope: 'subject',
      metrics: ['cd_risc', 'grit'],
      time: { mode: 'latest', windows: [] }, output: 'table', explain: false,
    },
    evidence: {
      metrics: [], rooms: [], constraints: [],
      subjects: [
        {
          alias: '[[P1]]',
          metrics: [
            { metric: 'cd_risc', value: 17, week: 16 },
            { metric: 'grit', value: 22, week: 16 },
          ],
        },
        {
          alias: '[[P2]]',
          metrics: [
            { metric: 'cd_risc', value: 22, week: 16 },
            { metric: 'grit', value: 22, week: 16 },
          ],
        },
      ],
    },
  };
  const payload = createDeterministicAssistantPayload(request);

  assert.match(payload.answer, /cd_risc: \[\[P2\]\] มีค่าสูงกว่า/u);
  assert.match(payload.answer, /grit: ทุกอันเท่ากันที่ 22/u);
  assert.doesNotMatch(payload.answer, /grit:.*\[\[P2\]\].*สูงกว่า/u);
  assert.deepEqual(payload.table.rows, [
    ['[[P1]]', '17', '22'],
    ['[[P2]]', '22', '22'],
  ]);
});

test('forecasts without supplied forecast evidence fail locally', () => {
  const request = {
    analysisRequest: {
      operation: 'forecast', statistic: 'forecast', scope: 'overview', metrics: ['stress'],
      time: { mode: 'forecast_horizon', windows: [{ fromWeek: 17, toWeek: 20 }] },
      output: 'chart_table', explain: false,
    },
    evidence: {
      subjects: [], rooms: [], constraints: [],
      metrics: [{
        metric: 'stress',
        points: [{ week: 14, value: 3 }, { week: 16, value: 4 }],
      }],
    },
  };
  const payload = createDeterministicAssistantPayload(request);

  assert.equal(payload.status, 'insufficient');
  assert.equal(payload.confidence, 'low');
  assert.deepEqual(payload.limitations, ['forecast-unavailable']);
  assert.equal(payload.table, null);
  assert.equal(payload.chart, null);
});

test('overview summaries remain provider-bound for natural-language synthesis', () => {
  const payload = createDeterministicAssistantPayload({
    analysisRequest: {
      operation: 'summarize', statistic: 'latest', scope: 'overview',
      metrics: ['self', 'stress'],
      time: { mode: 'latest', windows: [] }, output: 'narrative', explain: false,
    },
    evidence: {
      subjects: [], rooms: [], constraints: [],
      metrics: [
        { metric: 'self', value: 2, week: 16 },
        { metric: 'stress', value: 4, week: 16 },
      ],
    },
  });

  assert.equal(payload, null);
});

test('forecast points outside the requested horizon do not trigger provider egress', () => {
  const payload = createDeterministicAssistantPayload({
    analysisRequest: {
      operation: 'forecast', statistic: 'forecast', scope: 'subject', metrics: ['self'],
      time: { mode: 'forecast_horizon', windows: [{ fromWeek: 18, toWeek: 19 }] },
      output: 'chart', explain: false,
    },
    evidence: {
      metrics: [], rooms: [], constraints: [],
      subjects: [{
        alias: '[[P1]]',
        metrics: [
          { metric: 'self', points: [{ week: 16, value: 2 }] },
          { metric: 'self_forecast', points: [{ week: 17, value: 2.1 }] },
        ],
      }],
    },
  });

  assert.equal(payload.status, 'insufficient');
  assert.deepEqual(payload.limitations, ['forecast-unavailable']);
  assert.match(payload.answer, /ไม่มีค่า forecast.*ในช่วงที่ร้องขอ/u);
});

test('provider summaries keep AI narrative but use canonical latest table and chart', () => {
  const aligned = alignAssistantPayloadToRequest({
    answer: 'บทสรุปจากโมเดล: cd_risc 26.9 และ grit 21.97',
    highlights: ['ค่าล่าสุดสองตัว'],
    confidence: 'high',
    status: 'partial',
    limitations: ['aggregate-only'],
    dataCoverage: 'ข้อมูลภาพรวม',
    table: {
      title: 'model table', columns: ['metric', 'value'],
      rows: [['cd_risc', '999'], ['grit', '999']],
    },
    chart: {
      type: 'bar', title: 'model chart', xLabel: 'metric', yLabel: 'value',
      series: [
        { id: 'cd', label: 'cd_risc', color: 'blue' },
        { id: 'grit', label: 'grit', color: 'amber' },
      ],
      points: [
        { label: 'cd_risc', values: [26.9, null] },
        { label: 'grit', values: [null, 21.97] },
      ],
    },
    methodNote: 'model synthesis',
    followUps: [],
  }, {
    analysisRequest: {
      operation: 'summarize', statistic: 'latest', scope: 'overview',
      metrics: ['cd_risc', 'grit'],
      time: { mode: 'latest', windows: [] }, output: 'chart_table', explain: false,
    },
    evidence: {
      subjects: [], rooms: [], constraints: [],
      metrics: [
        { metric: 'cd_risc', value: 26.9, week: 16 },
        { metric: 'grit', value: 21.97, week: 16 },
      ],
    },
  });

  assert.equal(aligned.answer, 'บทสรุปจากโมเดล: cd_risc 26.9 และ grit 21.97');
  assert.equal(aligned.status, 'answered');
  assert.deepEqual(aligned.limitations, ['aggregate-only']);
  assert.deepEqual(aligned.table.rows, [
    ['ภาพรวม', 'cd_risc', '26.9', 'สัปดาห์ 16'],
    ['ภาพรวม', 'grit', '21.97', 'สัปดาห์ 16'],
  ]);
  assert.deepEqual(aligned.chart.series, [
    { id: 'latest_value', label: 'ค่าล่าสุด', color: 'blue' },
  ]);
  assert.deepEqual(aligned.chart.points.map(point => point.values), [[26.9], [21.97]]);
});

test('ungrounded provider summary numbers fall back to exact evidence narration', () => {
  const request = {
    analysisRequest: {
      operation: 'summarize', statistic: 'latest', scope: 'overview',
      metrics: ['cd_risc', 'grit'],
      time: { mode: 'latest', windows: [] }, output: 'auto', explain: false,
    },
    evidence: {
      subjects: [], rooms: [], constraints: [],
      metrics: [
        { metric: 'cd_risc', value: 26.9, week: 16 },
        { metric: 'grit', value: 21.97, week: 16 },
      ],
    },
  };
  const hallucinated = alignAssistantPayloadToRequest({
    answer: 'latest overview: cd_risc 26.97',
    highlights: ['cd_risc 26.97'],
    confidence: 'high', status: 'answered', limitations: [],
    dataCoverage: 'week 16', table: null, chart: null,
    methodNote: 'model synthesis', followUps: [],
  }, request);

  assert.doesNotMatch(hallucinated.answer, /26\.97/u);
  assert.match(hallucinated.answer, /cd_risc 26\.9/u);
  assert.match(hallucinated.answer, /grit 21\.97/u);
  assert.match(hallucinated.methodNote, /คำตอบสำรอง/u);

  const emptyNarrative = alignAssistantPayloadToRequest({
    answer: 'latest overview',
    highlights: ['cd_risc 26.9', 'grit 21.97'],
    confidence: 'high', status: 'answered', limitations: [],
    dataCoverage: 'week 16', table: null, chart: null,
    methodNote: null, followUps: [],
  }, request);
  assert.match(emptyNarrative.answer, /cd_risc 26\.9/u);
});

test('provider summaries cannot swap values between named metrics', () => {
  const request = {
    analysisRequest: {
      operation: 'summarize', statistic: 'latest', scope: 'overview',
      metrics: ['self', 'stress'],
      time: { mode: 'latest', windows: [] }, output: 'narrative', explain: false,
    },
    evidence: {
      subjects: [], rooms: [], constraints: [],
      metrics: [
        { metric: 'self', value: 2, week: 16 },
        { metric: 'stress', value: 4, week: 16 },
      ],
    },
  };
  const aligned = alignAssistantPayloadToRequest({
    answer: 'Latest summary: self 4 and stress 2.',
    highlights: ['self 4', 'stress 2'],
    confidence: 'high', status: 'answered', limitations: [],
    dataCoverage: 'week 16', table: null, chart: null,
    methodNote: 'model synthesis', followUps: [],
  }, request);

  assert.doesNotMatch(aligned.answer, /self 4/u);
  assert.doesNotMatch(aligned.answer, /stress 2/u);
  assert.match(aligned.answer, /self 2/u);
  assert.match(aligned.answer, /stress 4/u);
  assert.match(aligned.methodNote, /คำตอบสำรอง/u);
});

test('grounding treats ASCII week ranges as positive endpoints', () => {
  const request = {
    analysisRequest: {
      operation: 'summarize', statistic: 'trend', scope: 'overview', metrics: ['self'],
      time: { mode: 'available_range', windows: [] }, output: 'narrative', explain: false,
    },
    evidence: {
      subjects: [], rooms: [], constraints: [],
      metrics: [{
        metric: 'self',
        points: [
          { week: 1, value: 2 },
          { week: 2, value: 2 },
          { week: 3, value: 2 },
          { week: 4, value: 2 },
        ],
      }],
    },
  };
  const answer = 'Across weeks 1-4, self remained at 2.';
  const aligned = alignAssistantPayloadToRequest({
    answer,
    highlights: ['self 2'],
    confidence: 'high', status: 'answered', limitations: [],
    dataCoverage: 'weeks 1-4', table: null, chart: null,
    methodNote: 'descriptive summary', followUps: [],
  }, request);

  assert.equal(aligned.answer, answer);
  assert.doesNotMatch(aligned.methodNote, /คำตอบสำรอง/u);
});

test('grounding preserves a live-style summary with dates, cohort sizes and known scales', () => {
  const request = {
    analysisRequest: {
      operation: 'summarize', statistic: 'latest', scope: 'overview',
      metrics: ['concern_count', 'self', 'buddy', 'command'],
      time: { mode: 'latest', windows: [] }, output: 'auto', explain: false,
    },
    evidence: {
      source: {
        verifiedAt: '2026-07-26T07:56:00.000Z',
        asOfDate: '2026-07-26',
        latestObservationDate: '2026-07-26',
      },
      coverage: {
        from: '2026-07-26', to: '2026-07-26', totalSubjects: 250,
        includedSubjects: 0, observedPoints: 4,
      },
      subjects: [], rooms: [], constraints: [],
      metrics: [
        { metric: 'concern_count', value: 31 },
        { metric: 'self', value: 1.94, week: 16 },
        { metric: 'buddy', value: 2.06, week: 16 },
        { metric: 'command', value: 2.06, week: 16 },
      ],
    },
  };
  const answer = 'ข้อมูล ณ วันที่ 2026-07-26 แสดงค่าล่าสุดของภาพรวมสุขภาพจิตในกลุ่มประชากร 250 คน ดังนี้: concern_count เท่ากับ 31, self เท่ากับ 1.94 (สัปดาห์ที่ 16), buddy เท่ากับ 2.06 (สัปดาห์ที่ 16), และ command เท่ากับ 2.06 (สัปดาห์ที่ 16) ค่า self, buddy และ command อยู่บนสเกล 1-4 ซึ่งค่าที่สูงขึ้นหมายถึงระดับความกังวลที่มากขึ้น';
  const aligned = alignAssistantPayloadToRequest({
    answer,
    highlights: [
      'concern_count 31 ณ วันที่ 2026-07-26',
      'self 1.94 สัปดาห์ 16 จากกลุ่มตัวอย่าง 250 คน',
      'buddy 2.06 สัปดาห์ 16 จากกลุ่มตัวอย่าง 250 คน',
      'command 2.06 สัปดาห์ 16 จากกลุ่มตัวอย่าง 250 คน',
    ],
    confidence: 'high', status: 'answered', limitations: ['aggregate-only'],
    dataCoverage: 'ข้อมูลครอบคลุมวันที่ 2026-07-26 ถึง 2026-07-26 ประชากรกลุ่ม 250 คน จุดข้อมูลที่สังเกตได้ 4 จุด',
    table: null, chart: null,
    methodNote: 'สรุปค่าล่าสุดจาก MINIMIZED_EVIDENCE โดยตรง ไม่มีการคำนวณแนวโน้มเพราะข้อมูลมีเพียงจุดเดียวต่อเมตริก',
    followUps: [],
  }, request);

  assert.equal(aligned.answer, answer);
  assert.doesNotMatch(aligned.methodNote, /คำตอบสำรอง/u);
});

test('grounding preserves an exact cross-metric difference without allowing value swaps', () => {
  const request = {
    analysisRequest: {
      operation: 'summarize', statistic: 'latest', scope: 'overview',
      metrics: ['self', 'buddy', 'command'],
      time: { mode: 'latest', windows: [] }, output: 'narrative', explain: false,
    },
    evidence: {
      subjects: [], rooms: [], constraints: [],
      metrics: [
        { metric: 'self', value: 1.94, week: 16 },
        { metric: 'buddy', value: 2.06, week: 16 },
        { metric: 'command', value: 2.06, week: 16 },
      ],
    },
  };
  const answer = 'self 1.94, buddy 2.06 และ command 2.06 โดย buddy และ command สูงกว่า self อยู่ 0.12';
  const aligned = alignAssistantPayloadToRequest({
    answer,
    highlights: ['buddy และ command สูงกว่า self อยู่ 0.12'],
    confidence: 'high', status: 'answered', limitations: ['aggregate-only'],
    dataCoverage: 'สัปดาห์ 16', table: null, chart: null,
    methodNote: 'เปรียบเทียบผลต่างโดยตรง', followUps: [],
  }, request);

  assert.equal(aligned.answer, answer);
  assert.doesNotMatch(aligned.methodNote, /คำตอบสำรอง/u);
});

test('summary grounding requires a substantive metric value, not a coincidental date number', () => {
  const request = {
    analysisRequest: {
      operation: 'summarize', statistic: 'trend', scope: 'overview', metrics: ['self'],
      time: { mode: 'available_range', windows: [] }, output: 'narrative', explain: false,
    },
    evidence: {
      subjects: [], rooms: [], constraints: [],
      metrics: [{
        metric: 'self',
        points: [{ week: 1, value: 1.8 }, { week: 4, value: 2.1 }],
      }],
    },
  };
  const aligned = alignAssistantPayloadToRequest({
    answer: 'สรุปช่วงวันที่ 2026-04-12 ถึง 2026-07-26 โดยอ้างอิง self จากหลักฐาน',
    highlights: ['ครอบคลุมช่วงย้อนหลัง'],
    confidence: 'high', status: 'answered', limitations: [],
    dataCoverage: '2026-04-12 ถึง 2026-07-26', table: null, chart: null,
    methodNote: 'สรุปจากหลักฐาน', followUps: [],
  }, request);

  assert.match(aligned.answer, /self.*1\.8.*2\.1/u);
  assert.match(aligned.methodNote, /คำตอบสำรอง/u);
});

test('summary grounding rejects a generic aggregate claim backed only by a scale endpoint', () => {
  const request = {
    analysisRequest: {
      operation: 'summarize', statistic: 'trend', scope: 'overview', metrics: ['self'],
      time: { mode: 'available_range', windows: [] }, output: 'narrative', explain: false,
    },
    evidence: {
      subjects: [], rooms: [], constraints: [],
      metrics: [{
        metric: 'self',
        points: [{ week: 1, value: 2 }, { week: 2, value: 3 }],
      }],
    },
  };
  const aligned = alignAssistantPayloadToRequest({
    answer: 'self เริ่มที่ 2 และล่าสุด 3\nค่าเฉลี่ยรวมคือ 4',
    highlights: [],
    confidence: 'high', status: 'answered', limitations: [],
    dataCoverage: '2 จุด', table: null, chart: null,
    methodNote: 'สรุปจากหลักฐาน', followUps: [],
  }, request);

  assert.doesNotMatch(aligned.answer, /ค่าเฉลี่ยรวมคือ 4/u);
  assert.match(aligned.answer, /self.*2.*3/u);
  assert.match(aligned.methodNote, /คำตอบสำรอง/u);
});

test('generic mean claims must match the computed mean rather than another allowed fact', () => {
  const request = {
    analysisRequest: {
      operation: 'summarize', statistic: 'trend', scope: 'overview', metrics: ['self'],
      time: { mode: 'available_range', windows: [] }, output: 'narrative', explain: false,
    },
    evidence: {
      subjects: [], rooms: [], constraints: [],
      metrics: [{
        metric: 'self',
        points: [{ week: 1, value: 2 }, { week: 2, value: 3 }],
      }],
    },
  };
  const payload = mean => ({
    answer: `self เริ่มที่ 2 และล่าสุด 3\nค่าเฉลี่ยรวมคือ ${mean}`,
    highlights: [],
    confidence: 'high', status: 'answered', limitations: [],
    dataCoverage: '2 จุด', table: null, chart: null,
    methodNote: 'สรุปจากหลักฐาน', followUps: [],
  });

  const wrong = alignAssistantPayloadToRequest(payload(1), request);
  assert.doesNotMatch(wrong.answer, /ค่าเฉลี่ยรวมคือ 1/u);
  assert.match(wrong.methodNote, /คำตอบสำรอง/u);

  const correctAnswer = payload(2.5).answer;
  const correct = alignAssistantPayloadToRequest(payload(2.5), request);
  assert.equal(correct.answer, correctAnswer);
  assert.doesNotMatch(correct.methodNote, /คำตอบสำรอง/u);
});

test('summary grounding still allows scale endpoints in an explicit scale context', () => {
  const request = {
    analysisRequest: {
      operation: 'summarize', statistic: 'trend', scope: 'overview', metrics: ['self'],
      time: { mode: 'available_range', windows: [] }, output: 'narrative', explain: false,
    },
    evidence: {
      subjects: [], rooms: [], constraints: [],
      metrics: [{
        metric: 'self',
        points: [{ week: 1, value: 2 }, { week: 2, value: 3 }],
      }],
    },
  };
  const answer = 'self เริ่มที่ 2 และล่าสุด 3\nสเกล 1-4';
  const aligned = alignAssistantPayloadToRequest({
    answer,
    highlights: [],
    confidence: 'high', status: 'answered', limitations: [],
    dataCoverage: '2 จุด', table: null, chart: null,
    methodNote: 'สรุปจากหลักฐาน', followUps: [],
  }, request);

  assert.equal(aligned.answer, answer);
  assert.doesNotMatch(aligned.methodNote, /คำตอบสำรอง/u);
});

test('summary grounding rejects undeclared cumulative or average semantics for scalar evidence', () => {
  const request = {
    analysisRequest: {
      operation: 'summarize', statistic: 'trend', scope: 'overview',
      metrics: ['psychiatric_care', 'physical_concern_count'],
      time: { mode: 'available_range', windows: [] }, output: 'narrative', explain: false,
    },
    evidence: {
      subjects: [], rooms: [], constraints: [],
      coverage: { observedPoints: 2, totalSubjects: 250 },
      metrics: [
        { metric: 'psychiatric_care', value: 10 },
        { metric: 'physical_concern_count', value: 11 },
      ],
    },
  };
  const mislabeled = alignAssistantPayloadToRequest({
    answer: 'psychiatric_care 10 และ physical_concern_count 11 เป็นค่าสะสม',
    highlights: ['ค่าสะสม psychiatric_care 10'],
    confidence: 'high', status: 'answered', limitations: [],
    dataCoverage: '2 จุด', table: null, chart: null,
    methodNote: 'รายงานเป็นค่าเฉลี่ย', followUps: [],
  }, request);
  assert.doesNotMatch(mislabeled.answer, /ค่าสะสม/u);
  assert.match(mislabeled.methodNote, /คำตอบสำรอง/u);

  const negated = alignAssistantPayloadToRequest({
    answer: 'psychiatric_care 10 และ physical_concern_count 11 โดยไม่ได้ระบุว่าเป็นค่าเฉลี่ยหรืออัตรา',
    highlights: ['psychiatric_care 10', 'physical_concern_count 11'],
    confidence: 'high', status: 'answered', limitations: [],
    dataCoverage: '2 จุด', table: null, chart: null,
    methodNote: 'ไม่ใช่อัตราหรือค่าเฉลี่ย', followUps: [],
  }, request);
  assert.match(negated.answer, /ไม่ได้ระบุว่าเป็นค่าเฉลี่ยหรืออัตรา/u);
  assert.doesNotMatch(negated.methodNote, /คำตอบสำรอง/u);
});

test('summary grounding rejects constant claims when observed min and max differ', () => {
  const request = {
    analysisRequest: {
      operation: 'summarize', statistic: 'trend', scope: 'overview', metrics: ['buddy'],
      time: { mode: 'available_range', windows: [] }, output: 'narrative', explain: false,
    },
    evidence: {
      subjects: [], rooms: [], constraints: [],
      metrics: [{
        metric: 'buddy',
        points: [
          { week: 2, value: 2.06 },
          { week: 8, value: 1.96 },
          { week: 16, value: 2.06 },
        ],
      }],
    },
  };
  const constantClaim = alignAssistantPayloadToRequest({
    answer: 'buddy คงที่ที่ 2.06 ตลอดช่วง',
    highlights: ['buddy คงที่'],
    confidence: 'high', status: 'answered', limitations: [],
    dataCoverage: '3 จุด', table: null, chart: null,
    methodNote: 'descriptive', followUps: [],
  }, request);
  assert.doesNotMatch(constantClaim.answer, /คงที่/u);
  assert.match(constantClaim.methodNote, /คำตอบสำรอง/u);

  const qualified = alignAssistantPayloadToRequest({
    answer: 'buddy ไม่ได้คงที่ทุกจุด: ต่ำสุด 1.96 และสูงสุด 2.06',
    highlights: ['buddy 1.96 ถึง 2.06'],
    confidence: 'high', status: 'answered', limitations: [],
    dataCoverage: '3 จุด', table: null, chart: null,
    methodNote: 'descriptive', followUps: [],
  }, request);
  assert.match(qualified.answer, /ไม่ได้คงที่ทุกจุด/u);
  assert.doesNotMatch(qualified.methodNote, /คำตอบสำรอง/u);
});

test('historical summary artifacts cannot retain ungrounded provider values', () => {
  const request = {
    analysisRequest: {
      operation: 'summarize', statistic: 'trend', scope: 'overview', metrics: ['self'],
      time: { mode: 'available_range', windows: [] }, output: 'auto', explain: false,
    },
    evidence: {
      subjects: [], rooms: [], constraints: [],
      metrics: [{
        metric: 'self',
        points: [{ week: 1, value: 1.8 }, { week: 4, value: 2.1 }],
      }],
    },
  };
  const aligned = alignAssistantPayloadToRequest({
    answer: 'Across weeks 1-4, self changed from 1.8 to 2.1.',
    highlights: ['self changed by 0.3'],
    confidence: 'high', status: 'answered', limitations: [],
    dataCoverage: 'weeks 1-4',
    table: {
      title: 'model table', columns: ['metric', 'value'], rows: [['self', '999']],
    },
    chart: null,
    methodNote: 'descriptive summary', followUps: [],
  }, request);

  assert.doesNotMatch(JSON.stringify(aligned), /999/u);
  assert.equal(aligned.table, null);
  assert.deepEqual(aligned.chart.points.map(point => point.values[0]), [1.8, 2.1]);
  assert.equal(aligned.answer, 'Across weeks 1-4, self changed from 1.8 to 2.1.');
  assert.doesNotMatch(aligned.methodNote, /คำตอบสำรอง/u);
});

test('scalar observations support local window means without becoming forecasts', () => {
  const payload = createDeterministicAssistantPayload({
    analysisRequest: {
      operation: 'compare', statistic: 'mean', scope: 'subject', metrics: ['stress'],
      time: {
        mode: 'week_windows',
        windows: [{ fromWeek: 0, toWeek: 4 }, { fromWeek: 5, toWeek: 7 }],
      },
      output: 'table', explain: false,
    },
    evidence: {
      metrics: [], rooms: [], constraints: [],
      subjects: [{
        alias: '[[P1]]',
        metrics: [{ metric: 'stress', value: 3, week: 2 }],
      }],
    },
  });

  assert.equal(payload.status, 'partial');
  assert.equal(payload.table.rows[0][3], '3');
  assert.equal(payload.table.rows[0][7], '1');
  assert.equal(payload.table.rows[1][3], 'ไม่มีข้อมูล');
});

test('mixed forecasts report every requested metric that has no usable forecast', () => {
  const request = {
    analysisRequest: {
      operation: 'forecast', statistic: 'forecast', scope: 'subject',
      metrics: ['self', 'stress'],
      time: { mode: 'forecast_horizon', windows: [{ fromWeek: 17, toWeek: 18 }] },
      output: 'chart_table', explain: false,
    },
    evidence: {
      metrics: [], rooms: [], constraints: [],
      subjects: [{
        alias: '[[P1]]',
        metrics: [
          { metric: 'self', points: [{ week: 16, value: 2 }] },
          {
            metric: 'self_forecast',
            points: [{ week: 17, value: 2.1 }, { week: 18, value: 2.2 }],
          },
          { metric: 'stress', points: [{ week: 16, value: 4 }] },
        ],
      }],
    },
  };
  const local = createDeterministicAssistantPayload(request);
  const aligned = alignAssistantPayloadToRequest(local, request);

  assert.match(aligned.answer, /ไม่มีค่า forecast.*\[\[P1\]\] stress_forecast/u);
  assert.equal(aligned.status, 'partial');
  assert.equal(aligned.confidence, 'medium');
  assert.ok(aligned.limitations.includes('forecast-unavailable'));
  assert.deepEqual(aligned.chart.points.map(point => point.values[0]), [2.1, 2.2]);
});

test('historical summaries have a transparent deterministic provider fallback', () => {
  const request = {
    analysisRequest: {
      operation: 'summarize', statistic: 'trend', scope: 'overview', metrics: ['self'],
      time: { mode: 'available_range', windows: [] }, output: 'narrative', explain: false,
    },
    evidence: {
      subjects: [], rooms: [], constraints: [],
      metrics: [{
        metric: 'self',
        points: [{ week: 1, value: 1.8 }, { week: 4, value: 2.1 }],
      }],
    },
  };
  const fallback = createProviderFailureFallbackPayload(request);
  const aligned = alignAssistantPayloadToRequest(fallback, request);

  assert.equal(aligned.status, 'partial');
  assert.equal(aligned.confidence, 'medium');
  assert.ok(aligned.limitations.includes('provider-fallback'));
  assert.ok(aligned.limitations.includes('aggregate-only'));
  assert.match(aligned.answer, /self.*1\.8.*2\.1/u);
  assert.doesNotMatch(aligned.answer, /ควรทบทวนเร็วที่สุด/u);
  assert.match(aligned.methodNote, /โมเดลภายนอก/u);
});
