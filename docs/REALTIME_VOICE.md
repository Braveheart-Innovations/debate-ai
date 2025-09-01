# Realtime Voice Integration (BYOK)

This guide documents how to run advanced, low‑latency voice with OpenAI and Google Gemini in this app using a BYOK (Bring Your Own Key) model.

## Overview
- Transport options
  - OpenAI: WebRTC (preferred) or WebSocket relay (fallback)
  - Gemini: WebSocket (Live API)
- Keys live only on device (SecureStore). No shared app keys.
- Optional server helpers (ephemeral tokens) are supported, but not required for OpenAI WebRTC.

## Prerequisites
- Install Expo WebRTC (for OpenAI WebRTC):
  - `npx expo install expo-webrtc`
- iOS permissions: ensure `NSMicrophoneUsageDescription` is set (Expo config injects a default if provided in app.json).
- Android: `RECORD_AUDIO` is requested automatically in the managed workflow.

## OpenAI Realtime (WebRTC)
- Service: `src/services/voice/OpenAIWebRTCService.ts`
- Flow (all on device, BYOK):
  1) Read user OpenAI key from SecureStore
  2) POST `https://api.openai.com/v1/realtime/sessions` (Authorization: Bearer <user key>) to mint an ephemeral session
  3) Create RTCPeerConnection via `expo-webrtc`, add microphone track
  4) Create offer, POST SDP to `https://api.openai.com/v1/realtime?model=...` (Authorization: Bearer <ephemeral>)
  5) Apply SDP answer and start duplex audio
- UI: In Voice modal, toggle “Advanced (Realtime)” to use WebRTC; Whisper STT is the fallback.

### Optional: WS Relay fallback
- When WebRTC is not available, a tiny relay can proxy WS headers on behalf of the mobile client.
- Script: `scripts/realtime/openai-relay.js` (Node). It accepts the user’s OpenAI key via WS subprotocol and forwards to OpenAI Realtime.
- App setting: “Realtime Relay URL” under Settings → API Configuration; or set `EXPO_PUBLIC_OPENAI_REALTIME_RELAY_URL`.

## Google Gemini Realtime (Live API, WebSocket)
- Service: `src/services/voice/GeminiRealtimeService.ts`
- Docs: `docs/realtime/GEMINI_LIVE_WS.md`
- Endpoint (Developer API, global):
  - `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent`
- Auth: Ephemeral token (BYOK) minted server‑side via `v1alpha authTokens:create`, then used by client as `?access_token=<token>` in the WS URL.
- First message must be `setup` with fields like:
  - `model`: e.g., `models/gemini-live-2.5-flash-preview`
  - `responseModalities`: `['TEXT', 'AUDIO']`
  - `generationConfig`, `tools`, `speechConfig.voiceConfig.prebuilt_voice_config.voice_name`
- Streaming audio input: send base64 PCM16 LE mono 16k chunks as `realtimeInput.audioChunk`.
- Audio output: PCM16 LE mono 24k; prepare to play or resample.

## Settings
- Realtime Relay URL (OpenAI WS fallback only): stored in Redux settings and editable in Settings UI; not required for WebRTC.

## Environment Variables (optional)
- `EXPO_PUBLIC_OPENAI_REALTIME_RELAY_URL`: WS relay base (e.g., `wss://relay.example.com`)
- `EXPO_PUBLIC_OPENAI_REALTIME_MODEL`: default realtime model for OpenAI
- `EXPO_PUBLIC_GEMINI_LIVE_WS`: override Gemini Live WS endpoint

## Testing Checklist
- Typecheck/lint: `npm run typecheck && npm run lint`
- OpenAI WebRTC
  - Ensure OpenAI key is saved in Settings
  - Toggle Advanced in Voice modal → observe duplex audio
- OpenAI WS fallback (optional)
  - Run relay: `OPENAI_API_KEY=... node scripts/realtime/openai-relay.js`
  - Set relay URL in Settings; toggle Advanced
- Gemini Live WS
  - Mint ephemeral token using your backend (v1alpha `authTokens:create`)
  - Connect with `GeminiRealtimeService` using `?access_token=<token>` and send `setup`

## Troubleshooting
- Expo Go cannot load `expo-webrtc`; use a custom dev client or release build
- If RTC offer/answer fails, confirm ephemeral token is valid and `OpenAI-Beta: realtime=v1` (OpenAI) or correct Gemini endpoint is used
- For Gemini audio, ensure you resample to 16k PCM16 LE mono for input and handle 24k output

## Security Notes
- BYOK: user keys are stored on device in SecureStore and never shared
- For Gemini, use ephemeral tokens minted by a trusted backend; never embed master keys in the app

