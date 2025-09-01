#!/usr/bin/env node
// Dev-only: Mint an ephemeral session using a BYOK OpenAI key.
// Usage: OPENAI_API_KEY=sk-... node scripts/realtime/check-openai-webrtc-session.mjs

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error('Set OPENAI_API_KEY in env to run this check.');
  process.exit(1);
}

const body = {
  model: process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-10-01',
  voice: 'verse',
  modalities: ['audio', 'text']
};

fetch('https://api.openai.com/v1/realtime/sessions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'OpenAI-Beta': 'realtime=v1',
  },
  body: JSON.stringify(body),
}).then(async (res) => {
  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Body:', text);
}).catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});

