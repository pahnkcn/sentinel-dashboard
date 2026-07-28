import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_OPENROUTER_MODEL } from './chatModels.js';
import { handleSentinelChat } from './index.js';

const PROVIDER_MESSAGES = Object.freeze([
  { role: 'system', content: 'MINIMIZED_EVIDENCE\n{"metrics":[{"metric":"self","value":2}]}' },
  { role: 'user', content: 'ANALYSIS_REQUEST\n{"operation":"summarize"}' },
]);

const FALLBACK_PAYLOAD = Object.freeze({
  answer: 'สรุปจากหลักฐานในเซิร์ฟเวอร์',
  highlights: [],
  confidence: 'medium',
  status: 'partial',
  limitations: ['provider-fallback'],
  dataCoverage: 'ข้อมูลล่าสุดหนึ่งจุด',
  table: null,
  chart: null,
  methodNote: 'คำตอบสำรองจากหลักฐานโดยตรง',
  followUps: [],
});

function assistantPayload() {
  return {
    answer: 'สรุปข้อมูลจากผู้ให้บริการสำเร็จ',
    highlights: [],
    confidence: 'high',
    status: 'answered',
    limitations: [],
    dataCoverage: 'ข้อมูลล่าสุดหนึ่งจุด',
    table: null,
    chart: null,
    methodNote: null,
    followUps: [],
  };
}

function analysisRequest(operation = 'summarize') {
  return {
    operation,
    scope: 'overview',
    metrics: ['self'],
    statistic: 'latest',
    time: { mode: 'latest', windows: [] },
    ranking: null,
    output: 'auto',
    explain: false,
    referent: { status: 'none', resolvedFromPrevious: false },
  };
}

function sanitizedRequest(operation = 'summarize') {
  return {
    analysisRequest: analysisRequest(operation),
    evidence: {
      metrics: [{ metric: 'self', value: 2, week: 16 }],
      subjects: [],
      rooms: [],
      constraints: ['verified-data-only'],
      coverage: {
        from: '2026-01-01',
        to: '2026-04-22',
        totalSubjects: 100,
        includedSubjects: 0,
        observedPoints: 1,
      },
      disclosure: { omittedFields: ['names', 'student-ids'] },
    },
  };
}

function requestFor(operation = 'summarize') {
  return {
    method: 'POST',
    body: { model: DEFAULT_OPENROUTER_MODEL, operation },
    is: type => type === 'application/json',
    get: () => null,
  };
}

function responseRecorder() {
  return {
    body: null,
    headers: new Map(),
    jsonCalls: 0,
    statusCode: null,
    set(name, value) {
      this.headers.set(name, String(value));
      return this;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      this.jsonCalls += 1;
      return this;
    },
  };
}

function dependenciesFor(operation = 'summarize', overrides = {}) {
  const request = sanitizedRequest(operation);
  return {
    authorize: async () => ({ uid: 'test-user' }),
    consumeRequestRateLimit: () => null,
    validateRequest: body => ({ ok: true, value: body }),
    sanitizeRequest: async () => ({
      request,
      redactionCount: 0,
      assertProviderSafe() {},
    }),
    createDeterministicPayload: () => null,
    getApiKey: () => 'test-api-key',
    buildMessages: () => PROVIDER_MESSAGES,
    consumeProviderRateLimit: () => null,
    createFallbackPayload: () => FALLBACK_PAYLOAD,
    alignPayload: payload => payload,
    restoreAliases: payload => payload,
    loggerInstance: { error() {}, warn() {} },
    ...overrides,
  };
}

function providerResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  };
}

function mockFetch(t, implementation) {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (...args) => {
    calls += 1;
    return implementation(...args);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  return () => calls;
}

test('HTTP 402 is returned without retrying or using deterministic fallback', async t => {
  const fetchCalls = mockFetch(t, async () => providerResponse(402, {
    error: { code: 'insufficient_credits' },
  }));
  let fallbackCalls = 0;
  const response = responseRecorder();

  await handleSentinelChat(requestFor(), response, dependenciesFor('summarize', {
    createFallbackPayload: () => {
      fallbackCalls += 1;
      return FALLBACK_PAYLOAD;
    },
  }));

  assert.equal(fetchCalls(), 1);
  assert.equal(fallbackCalls, 0);
  assert.equal(response.statusCode, 402);
  assert.deepEqual(response.body, { error: { code: 'chat-credit-exhausted' } });
  assert.equal(response.jsonCalls, 1);
});

test('summary timeout makes one provider attempt and returns a truthful fallback receipt', async t => {
  const fetchCalls = mockFetch(t, async () => {
    const error = new Error('simulated timeout');
    error.name = 'TimeoutError';
    throw error;
  });
  let fallbackCalls = 0;
  const response = responseRecorder();

  await handleSentinelChat(requestFor(), response, dependenciesFor('summarize', {
    createFallbackPayload: () => {
      fallbackCalls += 1;
      return FALLBACK_PAYLOAD;
    },
  }));

  const receipt = response.body.disclosureReceipt;
  const messageBytes = Buffer.byteLength(JSON.stringify(PROVIDER_MESSAGES), 'utf8');
  assert.equal(fetchCalls(), 1);
  assert.equal(fallbackCalls, 1);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.route, 'provider-failure-fallback');
  assert.equal(response.body.attempts, 1);
  assert.equal(response.body.usage.totalTokens, null);
  assert.equal(receipt.providerEgress, true);
  assert.equal(receipt.providerAttemptCount, 1);
  assert.equal(receipt.evidenceMessageByteCount, messageBytes);
  assert.equal(receipt.byteCount, messageBytes);
  assert.equal(response.jsonCalls, 1);
});

test('summary provider failure falls back after one transport attempt', async t => {
  const fetchCalls = mockFetch(t, async () => providerResponse(503, {
    error: { code: 'provider_unavailable' },
  }));
  const response = responseRecorder();

  await handleSentinelChat(requestFor(), response, dependenciesFor());

  assert.equal(fetchCalls(), 1);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.route, 'provider-failure-fallback');
  assert.equal(response.body.attempts, 1);
  assert.equal(response.body.disclosureReceipt.providerAttemptCount, 1);
  assert.equal(response.jsonCalls, 1);
});

test('retryable non-summary provider failure reports both attempts and evidence bytes', async t => {
  let providerCall = 0;
  const fetchCalls = mockFetch(t, async () => {
    providerCall += 1;
    if (providerCall === 1) {
      return providerResponse(503, { error: { code: 'provider_unavailable' } });
    }
    return providerResponse(200, {
      model: DEFAULT_OPENROUTER_MODEL,
      usage: { total_tokens: 17 },
      choices: [{
        finish_reason: 'stop',
        message: { content: JSON.stringify(assistantPayload()) },
      }],
    });
  });
  let fallbackCalls = 0;
  const response = responseRecorder();

  await handleSentinelChat(requestFor('lookup'), response, dependenciesFor('lookup', {
    createFallbackPayload: () => {
      fallbackCalls += 1;
      return FALLBACK_PAYLOAD;
    },
  }));

  const receipt = response.body.disclosureReceipt;
  assert.equal(fetchCalls(), 2);
  assert.equal(fallbackCalls, 0);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.route, 'deidentified-evidence');
  assert.equal(response.body.attempts, 2);
  assert.equal(response.body.usage.totalTokens, 17);
  assert.equal(receipt.providerEgress, true);
  assert.equal(receipt.providerAttemptCount, 2);
  assert.equal(receipt.byteCount, receipt.evidenceMessageByteCount * 2);
  assert.equal(response.jsonCalls, 1);
});

test('provider rate-limit fallback is local-only and never calls the provider', async () => {
  let providerCalls = 0;
  let fallbackCalls = 0;
  const response = responseRecorder();

  await handleSentinelChat(requestFor(), response, dependenciesFor('summarize', {
    consumeProviderRateLimit: () => 23,
    requestProvider: async () => {
      providerCalls += 1;
      throw new Error('provider must not be called');
    },
    createFallbackPayload: () => {
      fallbackCalls += 1;
      return FALLBACK_PAYLOAD;
    },
  }));

  const receipt = response.body.disclosureReceipt;
  assert.equal(providerCalls, 0);
  assert.equal(fallbackCalls, 1);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.route, 'provider-rate-limit-fallback');
  assert.equal(response.body.attempts, 0);
  assert.equal(receipt.mode, 'local-only');
  assert.equal(receipt.providerEgress, false);
  assert.equal(receipt.providerAttemptCount, 0);
  assert.equal(receipt.evidenceMessageByteCount, 0);
  assert.equal(receipt.byteCount, 0);
  assert.equal(response.jsonCalls, 1);
});
