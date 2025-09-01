const { safeGet, deriveCapsFromMetadata } = require('./common');

// Env var: TOGETHER_API_KEY

async function discoverTogether(env) {
  const apiKey = env.TOGETHER_API_KEY;
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  let models = [];
  try {
    const data = await safeGet('https://api.together.xyz/v1/models', { headers });
    if (Array.isArray(data.data)) {
      models = data.data.map(m => ({ id: m.id, name: m.display_name || m.id, _raw: m }));
    }
  } catch (_) {}

  const mapCaps = (m) => {
    const meta = deriveCapsFromMetadata(m._raw);
    return ({
      ...m,
      supportsVision: /llama-3\.1|qwen|vision|vl/i.test(m.id),
      supportsDocuments: true,
      supportsImageGeneration: /(flux|sdxl|stable-diffusion|image)/i.test(m.id),
      supportsVideoGeneration: /(video|luma|kling|genmo|pika|sora)/i.test(m.id),
      supportsVoiceInput: false,
      supportsVoiceOutput: false,
      supportsRealtime: false,
      supportsImageInput: /vision|vl/i.test(m.id),
      ...Object.fromEntries(Object.entries(meta).filter(([,v])=>v===true)),
    });
  };
  return { provider: 'together', models: models.map(mapCaps) };
}

module.exports = { discoverTogether };
