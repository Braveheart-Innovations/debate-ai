const { safeGet, deriveCapsFromMetadata } = require('./common');

// Env var: GOOGLE_API_KEY (alias: GEMINI_API_KEY)

async function discoverGoogle(env) {
  const key = env.GOOGLE_API_KEY || env.GEMINI_API_KEY;
  let models = [];
  try {
    const base = 'https://generativelanguage.googleapis.com/v1beta/models';
    const url = key ? `${base}?key=${encodeURIComponent(key)}` : base;
    const data = await safeGet(url);
    if (Array.isArray(data.models)) {
      models = data.models.map(m => {
        const id = m.name?.split('/').pop() || m.name || '';
        const methods = m.supportedGenerationMethods || m.generationMethods || [];
        const desc = m.description || '';
        const supportsImageGen = methods.includes('imageGeneration') || /image-generation|imagen/i.test(id + ' ' + desc);
        const supportsVideoGen = methods.includes('videoGeneration') || /video|veo/i.test(id + ' ' + desc);
        const supportsTTS = methods.includes('textToSpeech') || /tts|text to speech/i.test(desc);
        const supportsASR = methods.includes('speechToText') || /speech to text|asr/i.test(desc);
        const supportsRealtime = methods.includes('realtime') || /live|realtime/i.test(desc);
        return {
          id,
          name: m.displayName || m.name,
          _raw: m,
          supportsImageGeneration: supportsImageGen,
          supportsVideoGeneration: supportsVideoGen,
          supportsVoiceOutput: supportsTTS,
          supportsVoiceInput: supportsASR,
          supportsRealtime,
        };
      });
    }
  } catch (_) {}

  const mapCaps = (m) => {
    const meta = deriveCapsFromMetadata(m._raw);
    return {
      ...m,
      supportsVision: true,
      supportsDocuments: true,
      supportsImageGeneration: /imagen|image|pix|photo/i.test(m.id) || m.supportsImageGeneration,
      supportsVideoGeneration: /video|veo|viv|vid/i.test(m.id) || m.supportsVideoGeneration,
      supportsVoiceInput: /speech|audio|asr/i.test(m.id) || m.supportsVoiceInput,
      supportsVoiceOutput: /tts|audio|speech/i.test(m.id) || m.supportsVoiceOutput,
      supportsRealtime: /live|realtime/i.test(m.id) || m.supportsRealtime,
      supportsImageInput: true,
      ...Object.fromEntries(Object.entries(meta).filter(([,v])=>v===true)),
    };
  };

  return { provider: 'google', models: models.map(mapCaps) };
}

module.exports = { discoverGoogle };
