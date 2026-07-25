import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REQUIRED_OPENROUTER_MODEL,
  createOpenRouterRequestBody,
  normalizeProviderOnly,
  parseModelNarrative,
  requestOpenRouter,
  validateModelSetting,
} from './openRouterClient.js';

const messages = [{
  role: 'user',
  content: '{"operation":"summarize","scope":"overview"}',
}];
const contextJson = JSON.stringify({
  source: { recordCounts: { students: 25 } },
  facts: { self: { latestMean: 2.5, observedCount: 25 } },
});

test('request body enforces exact model, ZDR, data denial, and no fallbacks', () => {
  const body = createOpenRouterRequestBody({
    model: REQUIRED_OPENROUTER_MODEL,
    messages,
    contextJson,
    providerOnly: 'example-provider/secure',
    reasoningEffort: 'high',
  });

  assert.equal(body.model, 'z-ai/glm-5.2');
  assert.deepEqual(body.provider, {
    allow_fallbacks: false,
    require_parameters: true,
    data_collection: 'deny',
    zdr: true,
    only: ['example-provider/secure'],
  });
  assert.deepEqual(body.reasoning, { effort: 'high', exclude: true });
  assert.equal(body.response_format.json_schema.strict, true);
  assert.deepEqual(
    Object.keys(body.response_format.json_schema.schema.properties),
    ['answer', 'confidence', 'followUps'],
  );
  assert.equal(body.max_tokens, 800);
  assert.equal(body.messages.at(-1).content, messages[0].content);
  assert.match(body.messages[1].content, /^MINIMIZED_VERIFIED_FACTS\n/u);
});

test('model and provider settings fail closed', () => {
  assert.equal(validateModelSetting(' z-ai/glm-5.2 '), 'z-ai/glm-5.2');
  assert.throws(
    () => validateModelSetting('openrouter/auto'),
    error => error.publicCode === 'chat-config-invalid',
  );
  assert.throws(
    () => normalizeProviderOnly(''),
    error => error.publicCode === 'chat-config-invalid',
  );
  assert.equal(normalizeProviderOnly('provider/region'), 'provider/region');
  assert.throws(
    () => normalizeProviderOnly('provider slug'),
    error => error.publicCode === 'chat-config-invalid',
  );
});

test('model narrative parser requires the exact three-field schema', () => {
  const valid = {
    answer: 'แนวโน้มภาพรวมควรได้รับการทบทวนร่วมกับข้อมูลที่ยืนยันแล้ว',
    confidence: 'medium',
    followUps: ['ต้องการทบทวนเฉพาะแนวโน้มที่มีข้อมูลเพียงพอหรือไม่'],
  };
  assert.equal(parseModelNarrative(JSON.stringify(valid)).answer, valid.answer);

  for (const invalid of [
    { ...valid, extra: true },
    { answer: valid.answer, confidence: 'medium' },
    { ...valid, confidence: 'certain' },
    { ...valid, followUps: null },
    { ...valid, followUps: ['หนึ่ง', 'สอง', 'สาม', 'สี่'] },
    { ...valid, answer: '...' },
    { ...valid, followUps: ['placeholder'] },
  ]) {
    assert.throws(
      () => parseModelNarrative(JSON.stringify(invalid)),
      /invalid-model-narrative/u,
    );
  }
  assert.throws(
    () => parseModelNarrative('```json\n{}\n```'),
    /invalid-model-narrative/u,
  );
});

test('request parses structured output without exposing API response internals', async () => {
  let request;
  const payload = {
    answer: 'ค่าเฉลี่ยล่าสุดมาจากข้อมูลสังเคราะห์',
    confidence: 'high',
    followUps: [],
  };
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        model: REQUIRED_OPENROUTER_MODEL,
        provider: 'example-provider',
        usage: { total_tokens: 123 },
        choices: [{
          message: { content: JSON.stringify(payload) },
        }],
      }),
    };
  };

  const result = await requestOpenRouter({
    apiKey: 'synthetic-test-key',
    messages,
    contextJson,
    model: REQUIRED_OPENROUTER_MODEL,
    providerOnly: 'example-provider/secure',
    fetchImpl,
  });

  assert.equal(request.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer synthetic-test-key');
  assert.deepEqual(
    Object.keys(request.options.headers).sort(),
    ['Authorization', 'Content-Type'],
  );
  assert.equal(result.payload.answer, payload.answer);
  assert.equal(result.usage.totalTokens, 123);
  assert.equal(result.provider, 'example-provider');
});
