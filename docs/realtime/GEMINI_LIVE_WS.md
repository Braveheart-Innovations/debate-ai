Gemini Realtime (Live API) — WebSocket (BYOK with Ephemeral Tokens)

Summary
- Transport: Secure WebSocket (wss) to Google’s Live API. No direct WebRTC endpoint from Google.
- Auth: Short‑lived ephemeral tokens minted by a trusted backend (v1alpha authTokens:create). Do not embed long‑lived keys in clients.
- Models: Use Live API compatible models (e.g., models/gemini-live-2.5-flash-preview). Non‑Live models will fail.
- Audio: Input = PCM16 LE mono 16kHz; Output = PCM16 LE mono 24kHz (prepare resampling).

Endpoint
- Developer API (global):
  wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent
- Vertex AI (regional): wss://{region}-aiplatform.googleapis.com/...

Auth (Ephemeral Token)
- Backend mints a token via POST v1alpha authTokens:create and returns token.name to client.
- Client connects to WS with ?access_token=<token> or Authorization: Token <token>.

Session Setup (first message)
- Send a JSON object with a single key: setup
  {
    "setup": {
      "model": "models/gemini-live-2.5-flash-preview",
      "generationConfig": { "temperature": 0.9, "topP": 0.95 },
      "responseModalities": ["TEXT", "AUDIO"],
      "systemInstruction": { ... },
      "tools": [ ... ],
      "speechConfig": {
        "voiceConfig": { "prebuilt_voice_config": { "voice_name": "Aoede" } }
      }
    }
  }

Client Messages
- setup: as above (first message only, model immutable)
- clientContent: discrete turns that interrupt current generation
  { "clientContent": { "turns": [{ "role": "user", "parts": [{ "text": "Hello" }] }] } }
- realtimeInput: streaming audio chunks (base64 PCM16 16k)
  { "realtimeInput": { "audioChunk": { "data": "...", "mimeType": "audio/pcm;rate=16000" } } }
- toolResponse: function results after a toolCall
  { "toolResponse": { "functionResponses": [ { name, id, response } ] } }

Server Messages (examples)
- serverContent: streaming text/audio parts from the model
- toolCall: functionCalls[] describing requested tool invocations
- transcription: incremental transcripts (if enabled)
- goAway: connection close warning; use session resumption to reconnect

Resilience
- Connection TTL ≈ 10 minutes. Use session resumption: store latest resumption handle and reconnect with it in setup.

Client Implementation
- See src/services/voice/GeminiRealtimeService.ts for a minimal WS client:
  - connect({ accessToken, model, setup }) → sends setup and emits parsed messages
  - sendClientText(text) → discrete turns
  - sendRealtimeAudioChunk(pcm16k) → stream audio chunks
  - sendToolResponse(functionResponses) → reply to tool calls

Audio Handling
- Microphone input likely needs downsampling to 16kHz mono PCM16 LE before sending to realtimeInput.
- Output audio comes as 24kHz PCM16; wrap into WAV or stream to an audio sink for playback.

