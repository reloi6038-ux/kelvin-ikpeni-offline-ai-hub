// server/config/ai.js
// Central place to resolve AI provider settings.
// The actual API calls live in server/services/aiService.js.

const PROVIDERS = {
  gemini:   { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', authStyle: 'query' },
  openai:   { baseUrl: 'https://api.openai.com/v1', authStyle: 'bearer' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', authStyle: 'bearer' },
  none:     null
};

function getAIConfig() {
  const provider = (process.env.AI_PROVIDER || 'none').toLowerCase();
  const meta = PROVIDERS[provider];

  if (!meta) {
    return { enabled: false, provider: 'none' };
  }

  if (!process.env.AI_API_KEY) {
    return { enabled: false, provider, reason: 'AI_API_KEY missing' };
  }

  return {
    enabled: true,
    provider,
    baseUrl: process.env.AI_BASE_URL || meta.baseUrl,
    authStyle: meta.authStyle,
    apiKey: process.env.AI_API_KEY,
    model: process.env.AI_MODEL || 'gemini-2.0-flash'
  };
}

module.exports = { getAIConfig };