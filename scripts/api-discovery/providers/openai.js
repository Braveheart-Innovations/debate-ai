const { safeGet, deriveCapsFromMetadata } = require('./common');

// Env var: OPENAI_API_KEY

async function discoverOpenAI(env) {
  const apiKey = env.OPENAI_API_KEY;
  const headers = apiKey
    ? { Authorization: `Bearer ${apiKey}` }
    : {};

  let models = [];
  try {
    // Official list endpoint
    const data = await safeGet('https://api.openai.com/v1/models', { headers });
    if (Array.isArray(data.data)) {
      models = data.data.map(m => ({ id: m.id, name: m.id, _raw: m }));
    }
  } catch (_) {
    // Ignore; fall back to heuristics/known set
  }

  // Augment with known image generation model(s) which may be omitted from /models
  const knownExtras = [
    { id: 'gpt-image-1', name: 'GPT Image 1', supportsImageGeneration: true },
  ];

  // Heuristics for capabilities
  const mapCaps = (m) => {
    const meta = deriveCapsFromMetadata(m._raw);
    return {
    ...m,
    supportsVision: /(gpt-4-vision|gpt-5|gpt-4o|gpt-4\.1)/.test(m.id),
    supportsDocuments: false, // Chat API does not accept PDFs directly; keep false
    supportsImageGeneration: /(gpt-image-1|dall-e-3|dall-e-2)/.test(m.id) || m.supportsImageGeneration,
    supportsVoiceInput: /(gpt-audio|realtime)/.test(m.id),
    supportsVoiceOutput: /(tts-)/.test(m.id),
    supportsVideoGeneration: /(sora|gpt-video)/i.test(m.id),
    supportsRealtime: /realtime/i.test(m.id),
    supportsImageInput: /(gpt-4-vision|gpt-5|gpt-4o|gpt-4\.1)/.test(m.id),
    // Merge with metadata positives
    ...Object.fromEntries(Object.entries(meta).filter(([,v])=>v===true)),
  }};

  const dedup = new Map();
  [...models, ...knownExtras].forEach(m => dedup.set(m.id, mapCaps(m)));
  return { provider: 'openai', models: [...dedup.values()] };
}

module.exports = { discoverOpenAI };
