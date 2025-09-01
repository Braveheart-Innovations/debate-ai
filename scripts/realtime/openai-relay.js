#!/usr/bin/env node
// Minimal OpenAI Realtime relay for mobile/web clients.
// Proxies a client WebSocket to OpenAI Realtime WS with required headers.
// Usage: OPENAI_API_KEY=sk-... node scripts/realtime/openai-relay.js

const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8787;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // optional fallback

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('OpenAI Realtime Relay running');
});

const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (client, req) => {
  try {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const model = url.searchParams.get('model') || 'gpt-4o-realtime-preview-2024-10-01';
    // Prefer user-provided key via subprotocol header: 'bearer,<sk-...>'
    let userKey = undefined;
    const proto = req.headers['sec-websocket-protocol'];
    if (proto) {
      const parts = String(proto).split(',').map(s => s.trim());
      // e.g., 'bearer,sk-abc' or 'sk-abc'
      const bearerIdx = parts.findIndex(p => p.toLowerCase() === 'bearer');
      if (bearerIdx >= 0 && parts[bearerIdx + 1]) userKey = parts[bearerIdx + 1];
      if (!userKey) {
        const sk = parts.find(p => p.startsWith('sk-'));
        if (sk) userKey = sk;
      }
    }
    const authKey = userKey || OPENAI_API_KEY;
    if (!authKey) {
      client.send(JSON.stringify({ type: 'relay.error', error: 'Missing API key: provide as subprotocol or set OPENAI_API_KEY' }));
      client.close();
      return;
    }

    const targetUrl = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;
    const upstream = new WebSocket(targetUrl, {
      headers: {
        Authorization: `Bearer ${authKey}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });

    upstream.on('open', () => client.send(JSON.stringify({ type: 'relay.open' })));
    upstream.on('message', (data) => client.readyState === WebSocket.OPEN && client.send(data));
    upstream.on('close', () => client.close());
    upstream.on('error', (err) => {
      try { client.send(JSON.stringify({ type: 'relay.error', error: String(err && err.message || err) })); } catch {}
      client.close();
    });

    client.on('message', (data) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data);
    });
    client.on('close', () => upstream.close());
  } catch (e) {
    try { client.send(JSON.stringify({ type: 'relay.error', error: String(e && e.message || e) })); } catch {}
    client.close();
  }
});

server.listen(PORT, () => {
  console.log(`Realtime relay listening on :${PORT}`);
});
