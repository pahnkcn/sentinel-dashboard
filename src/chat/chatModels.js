export const CHAT_MODELS = Object.freeze([
  {
    id: 'z-ai/glm-5.2',
    label: 'GLM 5.2',
    provider: 'Z.ai',
    logo: 'zai',
    selectedTone: 'border-blue-300 bg-blue-50/80 shadow-blue-100',
  },
  {
    id: 'qwen/qwen3.7-plus',
    label: 'Qwen 3.7 Plus',
    provider: 'Qwen',
    logo: 'qwen',
    selectedTone: 'border-violet-300 bg-violet-50/80 shadow-violet-100',
  },
  {
    id: 'xiaomi/mimo-v2.5',
    label: 'MiMo V2.5',
    provider: 'Xiaomi',
    logo: 'xiaomimimo',
    selectedTone: 'border-orange-300 bg-orange-50/80 shadow-orange-100',
  },
  {
    id: 'deepseek/deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    provider: 'DeepSeek',
    logo: 'deepseek',
    selectedTone: 'border-cyan-300 bg-cyan-50/80 shadow-cyan-100',
  },
  {
    id: 'minimax/minimax-m3',
    label: 'MiniMax M3',
    provider: 'MiniMax',
    logo: 'minimax',
    selectedTone: 'border-rose-300 bg-rose-50/80 shadow-rose-100',
  },
  {
    id: 'moonshotai/kimi-k2.7-code',
    label: 'Kimi K2.7 Code',
    provider: 'MoonshotAI',
    logo: 'kimi',
    selectedTone: 'border-slate-400 bg-slate-100/90 shadow-slate-200',
  },
]);

export const DEFAULT_CHAT_MODEL = CHAT_MODELS[0].id;
