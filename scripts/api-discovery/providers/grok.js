const { safeGet, deriveCapsFromMetadata } = require('./common');

// Env var: GROK_API_KEY (xAI)

async function discoverGrok(env) {
  const apiKey = env.GROK_API_KEY;
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  let models = [];
  try {
    const data = await safeGet('https://api.x.ai/v1/models', { headers });
    if (Array.isArray(data.data)) {
      models = data.data.map(m => ({ id: m.id, name: m.id, _raw: m }));
    }
  } catch (_) {
    models = [
      { id: 'grok-4', name: 'Grok 4' },
      { id: 'grok-3', name: 'Grok 3' },
      { id: 'grok-3-fast', name: 'Grok 3 Fast' },
    ];
  }

  const mapCaps = (m) => {
    const meta = deriveCapsFromMetadata(m._raw);
    return ({
      ...m,
      supportsVision: true,
      supportsDocuments: true,
      supportsImageGeneration: /image/i.test(m.id),
      supportsVideoGeneration: /video/i.test(m.id),
      supportsVoiceInput: false,
      supportsVoiceOutput: false,
      supportsRealtime: false,
      supportsImageInput: true,
      ...Object.fromEntries(Object.entries(meta).filter(([,v])=>v===true)),
    });
  };

  return { provider: 'grok', models: models.map(mapCaps) };
}

module.exports = { discoverGrok };
