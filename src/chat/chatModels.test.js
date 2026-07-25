import assert from 'node:assert/strict';
import test from 'node:test';

import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from './chatModels.js';

test('model selector exposes the six approved models with GLM 5.2 first', () => {
  assert.equal(DEFAULT_CHAT_MODEL, 'z-ai/glm-5.2');
  assert.deepEqual(CHAT_MODELS.map(model => model.id), [
    'z-ai/glm-5.2',
    'qwen/qwen3.7-plus',
    'xiaomi/mimo-v2.5',
    'deepseek/deepseek-v4-pro',
    'minimax/minimax-m3',
    'moonshotai/kimi-k2.7-code',
  ]);
  assert.equal(new Set(CHAT_MODELS.map(model => model.id)).size, CHAT_MODELS.length);
  assert.equal(new Set(CHAT_MODELS.map(model => model.logo)).size, CHAT_MODELS.length);
});
