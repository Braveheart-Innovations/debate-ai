const { safeGet, deriveCapsFromMetadata } = require('./common');

// Env var: PERPLEXITY_API_KEY

async function discoverPerplexity(env) {
  const apiKey = env.PERPLEXITY_API_KEY;
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  let models = [];
  try {
    const data = await safeGet('https://api.perplexity.ai/models', { headers });
    if (Array.isArray(data.data)) {
      models = data.data.map(m => ({ id: m.id, name: m.id, _raw: m }));
    }
  } catch (_) {
    models = [
      { id: 'sonar', name: 'Sonar' },
      { id: 'sonar-pro', name: 'Sonar Pro' },
    ];
  }

  const mapCaps = (m) => {
    const meta = deriveCapsFromMetadata(m._raw);
    return ({
      ...m,
      supportsVision: true,
      supportsDocuments: true,
      supportsImageGeneration: false,
      supportsVideoGeneration: false,
      supportsVoiceInput: false,
      supportsVoiceOutput: false,
      supportsRealtime: false,
      supportsImageInput: true,
      ...Object.fromEntries(Object.entries(meta).filter(([,v])=>v===true)),
    });
  };

  return { provider: 'perplexity', models: models.map(mapCaps) };
}

module.exports = { discoverPerplexity };
