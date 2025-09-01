#!/usr/bin/env node
// Dev-only: quick check of OpenAI Realtime WS using Node 'ws'.
// Reads OPENAI_API_KEY from env; connects and requests a text response.

import WebSocket from 'ws';

const key = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-10-01';

if (!key) {
  console.error('Set OPENAI_API_KEY in env to run this check.');
  process.exit(1);
}

const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;
const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${key}`, 'OpenAI-Beta': 'realtime=v1' } });

ws.on('open', () => {
  console.log('Realtime WS connected. Sending test request...');
  ws.send(JSON.stringify({ type: 'response.create', response: { modalities: ['text'], instructions: 'Say hello.' } }));
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(String(data));
    console.log('Event:', msg.type);
    if (msg.type === 'response.output_text.delta' && msg.delta) {
      process.stdout.write(msg.delta);
    }
    if (msg.type === 'response.completed') {
      console.log('\nCompleted.');
      ws.close();
    }
    if (msg.type === 'error') {
      console.error('Error:', msg);
    }
  } catch {
    // ignore
  }
});

ws.on('error', (e) => {
  console.error('WS error', e);
});

ws.on('close', () => process.exit(0));

