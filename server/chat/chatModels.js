export const DEFAULT_OPENROUTER_MODEL = 'z-ai/glm-5.2';

export const SUPPORTED_OPENROUTER_MODELS = Object.freeze([
  DEFAULT_OPENROUTER_MODEL,
  'qwen/qwen3.7-plus',
  'xiaomi/mimo-v2.5',
  'deepseek/deepseek-v4-pro',
  'minimax/minimax-m3',
  'moonshotai/kimi-k2.7-code',
]);

const SUPPORTED_MODEL_IDS = new Set(SUPPORTED_OPENROUTER_MODELS);

export function isSupportedOpenRouterModel(value) {
  return typeof value === 'string' && SUPPORTED_MODEL_IDS.has(value.trim());
}
