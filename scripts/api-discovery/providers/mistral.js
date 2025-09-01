const { safeGet, deriveCapsFromMetadata } = require('./common');

// Env var: MISTRAL_API_KEY

async function discoverMistral(env) {
  const apiKey = env.MISTRAL_API_KEY;
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  let models = [];
  try {
    const data = await safeGet('https://api.mistral.ai/v1/models', { headers });
    if (Array.isArray(data.data)) {
      models = data.data.map(m => ({ id: m.id, name: m.id, _raw: m }));
    }
  } catch (_) {}

  const mapCaps = (m) => {
    const meta = deriveCapsFromMetadata(m._raw);
    return {
      ...m,
      supportsVision: /(pixtral|vision|large|medium|mistral)/i.test(m.id),
      supportsDocuments: !/embed|codestral|devstral/i.test(m.id),
      supportsImageGeneration: /pixtral-image|image-gen/i.test(m.id),
      supportsVideoGeneration: /video|vid/i.test(m.id),
      supportsVoiceInput: false,
      supportsVoiceOutput: false,
      supportsRealtime: false,
      supportsImageInput: /(pixtral|vision)/i.test(m.id),
      ...Object.fromEntries(Object.entries(meta).filter(([,v])=>v===true)),
    };
  };

  return { provider: 'mistral', models: models.map(mapCaps) };
}

module.exports = { discoverMistral };
