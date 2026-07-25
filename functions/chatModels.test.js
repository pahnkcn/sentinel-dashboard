import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_OPENROUTER_MODEL,
  isSupportedOpenRouterModel,
  SUPPORTED_OPENROUTER_MODELS,
} from './chatModels.js';

test('chat model allowlist contains the six approved OpenRouter models', () => {
  assert.equal(DEFAULT_OPENROUTER_MODEL, 'z-ai/glm-5.2');
  assert.deepEqual(SUPPORTED_OPENROUTER_MODELS, [
    'z-ai/glm-5.2',
    'qwen/qwen3.7-plus',
    'xiaomi/mimo-v2.5',
    'deepseek/deepseek-v4-pro',
    'minimax/minimax-m3',
    'moonshotai/kimi-k2.7-code',
  ]);
});

test('chat model allowlist rejects arbitrary and malformed model ids', () => {
  assert.equal(isSupportedOpenRouterModel('qwen/qwen3.7-plus'), true);
  assert.equal(isSupportedOpenRouterModel(' qwen/qwen3.7-plus '), true);
  assert.equal(isSupportedOpenRouterModel('openrouter/auto'), false);
  assert.equal(isSupportedOpenRouterModel('qwen/qwen3.7-plus:free'), false);
  assert.equal(isSupportedOpenRouterModel(null), false);
});
