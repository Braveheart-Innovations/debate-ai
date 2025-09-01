const { safeGet, deriveCapsFromMetadata } = require('./common');

// Env var: ANTHROPIC_API_KEY

async function discoverAnthropic(env) {
  const apiKey = env.ANTHROPIC_API_KEY;
  const headers = apiKey
    ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    : { 'anthropic-version': '2023-06-01' };

  let models = [];
  try {
    // Some Anthropic deployments expose /v1/models; if not, this will 404 and we fall back.
    const data = await safeGet('https://api.anthropic.com/v1/models', { headers });
    if (Array.isArray(data.data)) {
      models = data.data.map(m => ({ id: m.id, name: m.display_name || m.id }));
    }
  } catch (_) {
    // Fallback to a minimal known set; update as needed during releases.
    models = [
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
      { id: 'claude-4-sonnet-20250514', name: 'Claude 4 Sonnet' },
      { id: 'claude-4.1-opus-20250805', name: 'Claude 4.1 Opus' },
    ];
  }

  const mapCaps = (m) => {
    const meta = deriveCapsFromMetadata(m._raw);
    return {
      ...m,
      supportsVision: true,
      supportsDocuments: !/opus-20240229|haiku-20240307/.test(m.id),
      supportsImageGeneration: false,
      supportsVideoGeneration: false,
      supportsVoiceInput: false,
      supportsVoiceOutput: false,
      supportsRealtime: false,
      supportsImageInput: true,
      ...Object.fromEntries(Object.entries(meta).filter(([,v])=>v===true)),
    };
  };

  return { provider: 'claude', models: models.map(mapCaps) };
}

module.exports = { discoverAnthropic };
