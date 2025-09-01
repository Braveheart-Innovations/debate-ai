OpenAI Realtime Voice (Mobile/Web) Setup

Overview
- OpenAI Realtime requires WebSocket headers (Authorization + OpenAI-Beta) that React Native cannot set directly.
- Use a lightweight relay that your client connects to; the relay connects to OpenAI and proxies messages.

Relay (Node)
- Example relay: scripts/realtime/openai-relay.js
  - Start locally: OPENAI_API_KEY=sk-... node scripts/realtime/openai-relay.js
  - Deploy: Fly.io, Render, Railway, or Vercel Node
  - Exposes ws path: wss://your-host/ws?model=gpt-4o-realtime-preview-2024-10-01

Client Configuration
- Set env var: OPENAI_REALTIME_RELAY_URL=wss://your-host
- Optional: OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview-2024-10-01
- In the app, Advanced (Realtime) in Voice modal enables push-to-talk.

Protocol Summary
- Client flow:
  1) Connect WS to relay.
  2) Send input audio chunks: { type: 'input_audio_buffer.append', audio: base64, mime_type: 'audio/m4a' }
  3) Commit buffer: { type: 'input_audio_buffer.commit' }
  4) Create response: { type: 'response.create', modalities: ['audio','text'] }
  5) Receive output audio deltas: response.output_audio.delta; accumulate base64; save as wav when done.

Notes
- BYOK: Clients still require OpenAI key in SecureStore for Whisper/STT. Realtime uses server OPENAI_API_KEY.
- Security: Lock down relay by origin, auth, or ephemeral tokens if deploying broadly.
- Fallback: If relay not set, Voice uses Whisper STT only.

