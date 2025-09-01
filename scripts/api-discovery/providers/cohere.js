const { safeGet, deriveCapsFromMetadata } = require('./common');

// Env var: COHERE_API_KEY

async function discoverCohere(env) {
  const apiKey = env.COHERE_API_KEY;
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  let models = [];
  try {
    const data = await safeGet('https://api.cohere.com/v1/models', { headers });
    if (Array.isArray(data.models)) {
      models = data.models.map(m => ({ id: m.name || m.id || m.model, name: m.display_name || m.name || m.id, _raw: m }));
    }
  } catch (_) {
    models = [
      { id: 'command-r-plus', name: 'Command R Plus' },
      { id: 'command-r', name: 'Command R' },
      { id: 'command-light', name: 'Command Light' },
    ];
  }

  const mapCaps = (m) => {
    const meta = require('./common').deriveCapsFromMetadata(m._raw);
    return {
      ...m,
      supportsVision: /vision|aya-vision/i.test(m.id) || /image/i.test(m.id),
      supportsDocuments: !/embed|rerank/i.test(m.id),
      supportsImageGeneration: false,
      supportsVideoGeneration: false,
      supportsVoiceInput: false,
      supportsVoiceOutput: false,
      supportsRealtime: false,
      supportsImageInput: /vision/i.test(m.id),
      ...Object.fromEntries(Object.entries(meta).filter(([,v])=>v===true)),
    };
  };
  return { provider: 'cohere', models: models.map(mapCaps) };
}

module.exports = { discoverCohere };
