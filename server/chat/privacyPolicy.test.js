import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProviderMessages,
  createDisclosureReceipt,
  restoreProviderAliases,
  scanForSensitiveData,
  validatePrivacyChatRequest,
} from './privacyPolicy.js';

function request(overrides = {}) {
  return {
    model: 'z-ai/glm-5.2',
    utterance: 'สรุปแนวโน้มของ [[P1]]',
    conversationState: {
      topic: 'individual',
      subjectAliases: ['[[P1]]'],
      roomAliases: [],
      metrics: ['self'],
      dateRange: null,
      lastEvidenceId: null,
      recentTurns: [],
    },
    analysisRequest: {
      operation: 'trend',
      scope: 'subject',
      metrics: ['self'],
      statistic: 'trend',
      time: { mode: 'available_range', windows: [] },
      ranking: null,
      output: 'auto',
      explain: false,
      referent: { status: 'none', resolvedFromPrevious: false },
    },
    evidence: {
      schemaVersion: 1,
      intent: 'individual',
      source: {
        evidenceId: 'E1',
        datasetVersion: 'v1',
        verifiedAt: '2026-07-26T01:00:00.000Z',
        asOfDate: '2026-07-26',
        latestObservationDate: '2026-07-25',
      },
      metrics: [],
      subjects: [{
        alias: '[[P1]]',
        metrics: [{
          metric: 'self',
          points: [
            { week: 1, value: 2 },
            { week: 2, value: 3 },
          ],
        }],
      }],
      rooms: [],
      coverage: {
        from: '2026-07-01',
        to: '2026-07-25',
        totalSubjects: 250,
        includedSubjects: 1,
        observedPoints: 2,
      },
      constraints: ['verified-data-only', 'decision-support-only'],
      disclosure: {
        mode: 'deidentified',
        omittedFields: ['names', 'student-ids', 'free-text-notes', 'full-transcript'],
      },
    },
    ...overrides,
  };
}

function providerEvidence(messages) {
  const [, serialized] = messages[2].content.split('\n', 2);
  return JSON.parse(serialized);
}

test('accepts a strict alias-only evidence request and builds bounded provider messages', () => {
  const result = validatePrivacyChatRequest(request());
  assert.equal(result.ok, true);

  const messages = buildProviderMessages({
    systemPrompt: 'system',
    request: result.value,
  });
  assert.equal(messages.length, 4);
  assert.match(messages[2].content, /MINIMIZED_EVIDENCE/u);
  assert.doesNotMatch(JSON.stringify(messages), /studentId|Alpha Student|messages|context/u);
  assert.doesNotMatch(JSON.stringify(messages), /datasetVersion|"v1"/u);
  assert.doesNotMatch(JSON.stringify(messages), /\[\[P1\]\]|"E1"/u);
  assert.match(JSON.stringify(messages), /\[\[SUBJECT_ALIAS_1\]\]/u);
  assert.match(messages[3].content, /"operation":"trend"/u);
  assert.match(messages[2].content, /"populationSize":250/u);
  assert.doesNotMatch(messages[2].content, /totalSubjects|includedSubjects/u);

  const restored = restoreProviderAliases({
    answer: 'ผลของ [[SUBJECT_ALIAS_1]]',
    followUps: ['ดู [[SUBJECT_ALIAS_1]] ต่อ'],
    table: {
      title: 'แนวโน้ม [[SUB_SUBJECT_ALIAS_1]] และ [[SUBJECT_ALIAS_99]]',
    },
  }, result.value);
  assert.equal(restored.answer, 'ผลของ [[P1]]');
  assert.deepEqual(restored.followUps, ['ดู [[P1]] ต่อ']);
  assert.equal(restored.table.title, 'แนวโน้ม [[P1]] และ บุคคลที่ไม่เปิดเผย');

  const receipt = createDisclosureReceipt({
    request: result.value,
    providerMessages: messages,
    rosterRedactionCount: 2,
  });
  assert.equal(receipt.subjectCount, 1);
  assert.equal(receipt.historyTurnCount, 0);
  assert.equal(receipt.freeTextForwarded, false);
  assert.equal(receipt.rawIdentifiersSent, false);
  assert.equal(receipt.providerEgress, true);
  assert.equal(receipt.providerAttemptCount, 1);
  assert.equal(receipt.byteCount, receipt.evidenceMessageByteCount);
  assert.equal(receipt.redactionCount, 2);
  assert.ok(receipt.byteCount > 0);
  assert.equal(receipt.referenceDetails.source, 'model-provider');
  assert.equal(receipt.referenceDetails.operation, 'trend');
  assert.equal(receipt.referenceDetails.entities[0].scope, 'subject');
  assert.equal(receipt.referenceDetails.entities[0].alias, '[[P1]]');
  assert.equal(receipt.referenceDetails.entities[0].metrics[0].representation, 'points-and-derived');
  assert.deepEqual(
    receipt.referenceDetails.entities[0].metrics[0].points.map(point => point.value),
    [2, 3],
  );
  assert.doesNotMatch(
    JSON.stringify(receipt.referenceDetails),
    /datasetVersion|evidenceId|SUBJECT_ALIAS/u,
  );

  const localReceipt = createDisclosureReceipt({
    request: result.value,
    providerMessages: [],
    providerEgress: false,
  });
  assert.equal(localReceipt.mode, 'local-only');
  assert.equal(localReceipt.providerEgress, false);
  assert.equal(localReceipt.byteCount, 0);
  assert.equal(localReceipt.referenceDetails.source, 'server-local');
  assert.equal(localReceipt.referenceDetails.entities[0].metrics[0].representation, 'points');

  const retriedReceipt = createDisclosureReceipt({
    request: result.value,
    providerMessages: messages,
    attemptCount: 2,
  });
  assert.equal(retriedReceipt.providerAttemptCount, 2);
  assert.equal(retriedReceipt.byteCount, retriedReceipt.evidenceMessageByteCount * 2);
});

test('provider payload excludes the current free text and prior free-form turns', () => {
  const candidate = request({ utterance: 'UNIQUE_CURRENT_NARRATIVE' });
  candidate.conversationState.recentTurns = [{
    utterance: 'UNIQUE_PRIOR_UTTERANCE',
    answer: 'UNIQUE_PRIOR_ANSWER',
  }];
  candidate.evidence.source.datasetVersion = 'internal-cohort-2026';
  candidate.evidence.source.evidenceId = 'E12345678';
  const validated = validatePrivacyChatRequest(candidate);
  assert.equal(validated.ok, true);

  const serialized = JSON.stringify(buildProviderMessages({
    systemPrompt: 'system',
    request: validated.value,
  }));
  assert.doesNotMatch(serialized, /UNIQUE_CURRENT_NARRATIVE/u);
  assert.doesNotMatch(serialized, /UNIQUE_PRIOR_UTTERANCE/u);
  assert.doesNotMatch(serialized, /UNIQUE_PRIOR_ANSWER/u);
  assert.doesNotMatch(serialized, /internal-cohort-2026/u);
  assert.doesNotMatch(serialized, /12345678/u);
  assert.match(serialized, /ANALYSIS_REQUEST/u);
});

test('provider aliases are server-canonicalized so roster-like room labels do not leak', () => {
  const roomRequest = request();
  roomRequest.utterance = 'ดู [[R1]]';
  roomRequest.conversationState.topic = 'room';
  roomRequest.conversationState.subjectAliases = [];
  roomRequest.conversationState.roomAliases = ['[[R1]]'];
  roomRequest.analysisRequest = {
    operation: 'lookup',
    scope: 'room',
    metrics: ['self'],
    statistic: 'mean',
    time: { mode: 'latest', windows: [] },
    ranking: null,
    output: 'auto',
    explain: false,
    referent: { status: 'none', resolvedFromPrevious: false },
  };
  roomRequest.evidence.intent = 'room';
  roomRequest.evidence.subjects = [];
  roomRequest.evidence.rooms = [{
    alias: '[[R1]]',
    sampleSize: 5,
    metrics: [{ metric: 'self', value: 2 }],
  }];
  roomRequest.evidence.coverage.includedSubjects = 0;
  roomRequest.evidence.coverage.observedPoints = 1;
  const validated = validatePrivacyChatRequest(roomRequest);
  assert.equal(validated.ok, true);

  const serialized = JSON.stringify(buildProviderMessages({
    systemPrompt: 'system',
    request: validated.value,
  }));
  assert.doesNotMatch(serialized, /\[\[R1\]\]/u);
  assert.match(serialized, /\[\[GROUP_ALIAS_1\]\]/u);
});

test('rejects legacy context and message payloads rather than forwarding unknown fields', () => {
  assert.deepEqual(
    validatePrivacyChatRequest({ ...request(), context: { raw: 'secret' } }),
    { ok: false, code: 'invalid-body' },
  );
  assert.deepEqual(
    validatePrivacyChatRequest({ ...request(), messages: [{ role: 'user', content: 'secret' }] }),
    { ok: false, code: 'invalid-body' },
  );
});

test('rejects arbitrary evidence text, identifiers and free-text notes', () => {
  const arbitraryField = request();
  arbitraryField.evidence.subjects[0].name = 'Alpha Student';
  assert.equal(validatePrivacyChatRequest(arbitraryField).code, 'invalid-evidence');

  assert.equal(
    validatePrivacyChatRequest({ ...request(), utterance: 'ติดต่อ test@example.com' }).code,
    'privacy-sensitive-data',
  );
  assert.equal(scanForSensitiveData('บันทึกสุขภาพ: private narrative').ok, false);

  const outOfRange = request();
  outOfRange.evidence.subjects[0].metrics[0].points[0].value = 99;
  assert.equal(validatePrivacyChatRequest(outOfRange).code, 'invalid-evidence');
});

test('enforces intent-specific subject, room and point budgets', () => {
  const overview = request();
  overview.evidence.intent = 'overview';
  overview.conversationState.topic = 'overview';
  assert.equal(validatePrivacyChatRequest(overview).code, 'privacy-budget-exceeded');

  const smallRoom = request();
  smallRoom.evidence.intent = 'room';
  smallRoom.conversationState.topic = 'room';
  smallRoom.evidence.subjects = [];
  smallRoom.evidence.coverage.includedSubjects = 0;
  smallRoom.evidence.rooms = [{ alias: '[[R1]]', sampleSize: 4, metrics: [] }];
  assert.equal(validatePrivacyChatRequest(smallRoom).code, 'invalid-evidence');

  const excessiveRanking = request();
  excessiveRanking.evidence.intent = 'ranking';
  excessiveRanking.conversationState.topic = 'ranking';
  excessiveRanking.evidence.subjects = Array.from({ length: 6 }, (_, index) => ({
    alias: `[[P${index + 1}]]`,
    metrics: [{ metric: 'self', value: 4, rank: Math.min(index + 1, 5) }],
  }));
  excessiveRanking.evidence.coverage.includedSubjects = 6;
  assert.equal(validatePrivacyChatRequest(excessiveRanking).code, 'invalid-evidence');

  const misplacedRoom = request();
  misplacedRoom.evidence.rooms = [{ alias: '[[R1]]', sampleSize: 5, metrics: [] }];
  assert.equal(validatePrivacyChatRequest(misplacedRoom).code, 'privacy-budget-exceeded');

  const misplacedMetric = request();
  misplacedMetric.evidence.metrics = [{ metric: 'self', value: 2 }];
  misplacedMetric.evidence.coverage.observedPoints = 3;
  assert.equal(validatePrivacyChatRequest(misplacedMetric).code, 'privacy-budget-exceeded');
});

test('rejects duplicate metric entries and dishonest observed-point coverage', () => {
  const duplicate = request();
  duplicate.evidence.subjects[0].metrics = [
    { metric: 'self', value: 2 },
    { metric: 'self', value: 3 },
  ];
  duplicate.evidence.coverage.observedPoints = 2;
  assert.equal(validatePrivacyChatRequest(duplicate).code, 'invalid-evidence');

  const mismatchedCoverage = request();
  mismatchedCoverage.evidence.coverage.observedPoints = 1;
  assert.equal(validatePrivacyChatRequest(mismatchedCoverage).code, 'privacy-budget-exceeded');
});

test('keeps only two sanitized semantic-memory turns', () => {
  const tooMuchHistory = request();
  tooMuchHistory.conversationState.recentTurns = [1, 2, 3].map(index => ({
    utterance: `คำถาม ${index}`,
    answer: `คำตอบ ${index}`,
  }));
  assert.equal(validatePrivacyChatRequest(tooMuchHistory).code, 'invalid-conversation-state');
});

test('requires an exact structured analysis request with bounded windows and ranking', () => {
  const missing = request();
  delete missing.analysisRequest;
  assert.equal(validatePrivacyChatRequest(missing).code, 'invalid-analysis-request');

  const unknown = request();
  unknown.analysisRequest.freeText = 'explain everything';
  assert.equal(validatePrivacyChatRequest(unknown).code, 'invalid-analysis-request');

  const badWindow = request();
  badWindow.analysisRequest.time = {
    mode: 'week_windows',
    windows: [{ fromWeek: 9, toWeek: 4 }],
  };
  assert.equal(validatePrivacyChatRequest(badWindow).code, 'invalid-analysis-request');

  const rankWithoutPolicy = request();
  rankWithoutPolicy.analysisRequest.operation = 'rank';
  assert.equal(validatePrivacyChatRequest(rankWithoutPolicy).code, 'invalid-analysis-request');

  const rankingOnNonRank = request();
  rankingOnNonRank.analysisRequest.ranking = { direction: 'desc', limit: 5 };
  assert.equal(validatePrivacyChatRequest(rankingOnNonRank).code, 'invalid-analysis-request');
});

test('analysis metrics and scope must be represented by the minimized evidence', () => {
  const missingMetric = request();
  missingMetric.analysisRequest.metrics = ['stress'];
  assert.equal(validatePrivacyChatRequest(missingMetric).code, 'invalid-analysis-request');

  const wrongScope = request();
  wrongScope.analysisRequest.scope = 'overview';
  assert.equal(validatePrivacyChatRequest(wrongScope).code, 'invalid-analysis-request');

  const forecast = request();
  forecast.analysisRequest = {
    ...forecast.analysisRequest,
    operation: 'forecast',
    statistic: 'forecast',
    time: { mode: 'forecast_horizon', windows: [] },
  };
  forecast.evidence.intent = 'prediction';
  forecast.evidence.subjects[0].metrics = [{
    metric: 'self_forecast',
    points: [{ week: 3, value: 3.25 }],
  }];
  forecast.evidence.coverage.observedPoints = 1;
  assert.equal(validatePrivacyChatRequest(forecast).ok, true);

  forecast.analysisRequest.time.windows = [{ fromWeek: 17, toWeek: 20 }];
  forecast.evidence.subjects[0].metrics[0].points = [
    { week: 17, value: 3.25 },
    { week: 18, value: 3.5 },
  ];
  forecast.evidence.coverage.observedPoints = 2;
  assert.equal(validatePrivacyChatRequest(forecast).ok, true);

  const forecastMasqueradingAsObserved = request();
  forecastMasqueradingAsObserved.evidence.subjects[0].metrics = [{
    metric: 'self_forecast',
    points: [{ week: 3, value: 3.25 }],
  }];
  forecastMasqueradingAsObserved.evidence.coverage.observedPoints = 1;
  assert.equal(
    validatePrivacyChatRequest(forecastMasqueradingAsObserved).code,
    'invalid-analysis-request',
  );

  const extraMetric = request();
  extraMetric.evidence.subjects[0].metrics.push({
    metric: 'buddy',
    points: [{ week: 2, value: 2 }],
  });
  extraMetric.evidence.coverage.observedPoints = 3;
  assert.equal(validatePrivacyChatRequest(extraMetric).code, 'invalid-analysis-request');

  const unavailableWindow = request();
  unavailableWindow.conversationState.topic = 'overview';
  unavailableWindow.conversationState.subjectAliases = [];
  unavailableWindow.analysisRequest = {
    ...unavailableWindow.analysisRequest,
    operation: 'trend',
    scope: 'overview',
    metrics: ['stress'],
    statistic: 'mean',
    time: { mode: 'week_windows', windows: [{ fromWeek: 90, toWeek: 99 }] },
    output: 'table',
  };
  unavailableWindow.evidence.intent = 'overview';
  unavailableWindow.evidence.subjects = [];
  unavailableWindow.evidence.metrics = [];
  unavailableWindow.evidence.coverage.includedSubjects = 0;
  unavailableWindow.evidence.coverage.observedPoints = 0;
  assert.equal(validatePrivacyChatRequest(unavailableWindow).ok, true);
});

test('allows an explicitly requested small room to fail closed with no room evidence', () => {
  const suppressed = request();
  suppressed.conversationState.topic = 'room';
  suppressed.conversationState.subjectAliases = [];
  suppressed.conversationState.roomAliases = [];
  suppressed.analysisRequest = {
    ...suppressed.analysisRequest,
    operation: 'lookup',
    scope: 'room',
    metrics: ['self'],
    statistic: 'latest',
    time: { mode: 'latest', windows: [] },
  };
  suppressed.evidence.intent = 'room';
  suppressed.evidence.subjects = [];
  suppressed.evidence.rooms = [];
  suppressed.evidence.coverage.includedSubjects = 0;
  suppressed.evidence.coverage.observedPoints = 0;
  suppressed.evidence.constraints.push('insufficient-small-group');

  const validated = validatePrivacyChatRequest(suppressed);
  assert.equal(validated.ok, true);
  const serialized = JSON.stringify(buildProviderMessages({
    systemPrompt: 'system',
    request: validated.value,
  }));
  assert.match(serialized, /insufficient-small-group/u);
  assert.doesNotMatch(serialized, /\[\[GROUP_ALIAS_/u);
});

test('aggregate sample sizes are retained and must satisfy k-anonymity', () => {
  const aggregate = request();
  aggregate.evidence.subjects[0].metrics[0].points[0].sampleSize = 5;
  const validated = validatePrivacyChatRequest(aggregate);
  assert.equal(validated.ok, true);
  assert.equal(validated.value.evidence.subjects[0].metrics[0].points[0].sampleSize, 5);

  const tooSmall = request();
  tooSmall.evidence.subjects[0].metrics[0].points[0].sampleSize = 4;
  assert.equal(validatePrivacyChatRequest(tooSmall).code, 'invalid-evidence');
});

test('different structured operations produce different identifier-free provider requests', () => {
  const summary = request({ utterance: 'UNIQUE_PRIVATE_SUMMARY_TEXT' });
  summary.analysisRequest = {
    ...summary.analysisRequest,
    operation: 'summarize',
    statistic: 'latest',
    time: { mode: 'latest', windows: [] },
    output: 'narrative',
  };
  const chart = request({ utterance: 'UNIQUE_PRIVATE_CHART_TEXT' });
  chart.analysisRequest = {
    ...chart.analysisRequest,
    operation: 'trend',
    statistic: 'trend',
    time: { mode: 'available_range', windows: [] },
    output: 'chart',
  };

  const summaryValidated = validatePrivacyChatRequest(summary);
  const chartValidated = validatePrivacyChatRequest(chart);
  assert.equal(summaryValidated.ok, true);
  assert.equal(chartValidated.ok, true);
  const summaryMessages = buildProviderMessages({ systemPrompt: 'system', request: summaryValidated.value });
  const chartMessages = buildProviderMessages({ systemPrompt: 'system', request: chartValidated.value });
  const summaryPayload = JSON.stringify(summaryMessages);
  const chartPayload = JSON.stringify(chartMessages);

  assert.notEqual(summaryMessages[3].content, chartMessages[3].content);
  assert.match(summaryMessages[3].content, /"operation":"summarize"/u);
  assert.match(chartMessages[3].content, /"output":"chart"/u);
  assert.doesNotMatch(summaryPayload, /UNIQUE_PRIVATE_SUMMARY_TEXT|"v1"|"E1"/u);
  assert.doesNotMatch(chartPayload, /UNIQUE_PRIVATE_CHART_TEXT|"v1"|"E1"/u);
});

test('provider-only derived trends and requested window summaries are server computed', () => {
  const candidate = request({ utterance: 'UNIQUE_PRIVATE_TREND_TEXT' });
  candidate.analysisRequest.time = {
    mode: 'week_windows',
    windows: [
      { fromWeek: 1, toWeek: 3 },
      { fromWeek: 3, toWeek: 4 },
    ],
  };
  candidate.evidence.subjects[0].metrics[0].points = [
    { week: 1, value: 2 },
    { week: 2, value: 4, carriedForward: true },
    { week: 3, value: 3 },
    { week: 4, value: 4 },
  ];
  candidate.evidence.coverage.observedPoints = 4;

  const validated = validatePrivacyChatRequest(candidate);
  assert.equal(validated.ok, true);
  assert.equal(validated.value.evidence.subjects[0].metrics[0].derived, undefined);

  const messages = buildProviderMessages({ systemPrompt: 'system', request: validated.value });
  const serialized = JSON.stringify(messages);
  const derived = providerEvidence(messages).subjects[0].metrics[0].derived;

  assert.deepEqual(derived.trend, {
    first: 2,
    last: 4,
    min: 2,
    max: 4,
    mean: 3,
    change: 2,
    slopePerWeek: 0.6429,
    fromWeek: 1,
    toWeek: 4,
    observedPoints: 3,
  });
  assert.deepEqual(derived.windowSummaries, [
    {
      first: 2,
      last: 3,
      min: 2,
      max: 3,
      mean: 2.5,
      change: 1,
      slopePerWeek: 0.5,
      fromWeek: 1,
      toWeek: 3,
      observedPoints: 2,
    },
    {
      first: 3,
      last: 4,
      min: 3,
      max: 4,
      mean: 3.5,
      change: 1,
      slopePerWeek: 1,
      fromWeek: 3,
      toWeek: 4,
      observedPoints: 2,
    },
  ]);
  assert.doesNotMatch(serialized, /UNIQUE_PRIVATE_TREND_TEXT|\[\[P1\]\]|"v1"|"E1"/u);
  assert.match(serialized, /\[\[SUBJECT_ALIAS_1\]\]/u);
});

test('historical AI summaries send derived statistics without raw weekly points', () => {
  const candidate = request();
  candidate.analysisRequest.operation = 'summarize';
  candidate.analysisRequest.statistic = 'trend';
  candidate.analysisRequest.time = { mode: 'available_range', windows: [] };

  const validated = validatePrivacyChatRequest(candidate);
  assert.equal(validated.ok, true, validated.code);
  const messages = buildProviderMessages({
    systemPrompt: 'system',
    request: validated.value,
  });
  const providerMetric = providerEvidence(messages).subjects[0].metrics[0];

  assert.equal(providerMetric.points, undefined);
  assert.deepEqual(providerMetric.derived.trend, {
    first: 2,
    last: 3,
    min: 2,
    max: 3,
    mean: 2.5,
    change: 1,
    slopePerWeek: 1,
    fromWeek: 1,
    toWeek: 2,
    observedPoints: 2,
  });

  const receipt = createDisclosureReceipt({
    request: validated.value,
    providerMessages: messages,
  });
  const referencedMetric = receipt.referenceDetails.entities[0].metrics[0];
  assert.equal(referencedMetric.representation, 'derived');
  assert.equal(referencedMetric.points, undefined);
  assert.equal(referencedMetric.derived.trend.mean, 2.5);
});

test('latest AI summaries also send derived statistics without raw weekly points', () => {
  const candidate = request();
  candidate.analysisRequest.operation = 'summarize';
  candidate.analysisRequest.statistic = 'latest';
  candidate.analysisRequest.time = { mode: 'latest', windows: [] };

  const validated = validatePrivacyChatRequest(candidate);
  assert.equal(validated.ok, true, validated.code);
  const providerMetric = providerEvidence(buildProviderMessages({
    systemPrompt: 'system',
    request: validated.value,
  })).subjects[0].metrics[0];

  assert.equal(providerMetric.points, undefined);
  assert.deepEqual(providerMetric.derived.trend, {
    first: 2,
    last: 3,
    min: 2,
    max: 3,
    mean: 2.5,
    change: 1,
    slopePerWeek: 1,
    fromWeek: 1,
    toWeek: 2,
    observedPoints: 2,
  });
});

test('latest AI summaries retain scalar metrics without adding raw point arrays', () => {
  const candidate = request();
  candidate.analysisRequest.operation = 'summarize';
  candidate.analysisRequest.statistic = 'latest';
  candidate.analysisRequest.time = { mode: 'latest', windows: [] };
  candidate.evidence.subjects[0].metrics[0] = {
    metric: 'self',
    value: 3,
    week: 2,
  };
  candidate.evidence.coverage.observedPoints = 1;

  const validated = validatePrivacyChatRequest(candidate);
  assert.equal(validated.ok, true, validated.code);
  const providerMetric = providerEvidence(buildProviderMessages({
    systemPrompt: 'system',
    request: validated.value,
  })).subjects[0].metrics[0];

  assert.deepEqual(providerMetric, { metric: 'self', value: 3, week: 2 });
});

test('date-based provider trends use elapsed weeks without inventing week labels', () => {
  const candidate = request();
  candidate.evidence.subjects[0].metrics[0].points = [
    { date: '2026-01-01', value: 2 },
    { date: '2026-01-15', value: 3 },
  ];
  const validated = validatePrivacyChatRequest(candidate);
  assert.equal(validated.ok, true);

  const derived = providerEvidence(buildProviderMessages({
    systemPrompt: 'system',
    request: validated.value,
  })).subjects[0].metrics[0].derived;
  assert.deepEqual(derived.trend, {
    first: 2,
    last: 3,
    min: 2,
    max: 3,
    mean: 2.5,
    change: 1,
    slopePerWeek: 0.5,
    fromWeek: null,
    toWeek: null,
    observedPoints: 2,
  });
  assert.deepEqual(derived.windowSummaries, []);
});
