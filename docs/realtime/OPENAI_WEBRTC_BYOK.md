OpenAI Realtime (WebRTC) — BYOK On‑Device

Goal
- Use the user’s OpenAI API key stored on device (SecureStore) to mint a short‑lived Realtime session and establish a WebRTC call directly to OpenAI. No app/server keys; no relay in the audio path.

High‑level Flow
1) Read the user’s OpenAI key from SecureStore on device.
2) POST /v1/realtime/sessions with Authorization: Bearer <user key> to mint an ephemeral session (few minutes TTL).
3) Create RTCPeerConnection, add microphone track (getUserMedia), and a data channel (e.g., "oai-events").
4) Create SDP offer; POST it to /v1/realtime?model=... with Authorization: Bearer <ephemeral_secret>, Content‑Type: application/sdp.
5) Receive SDP answer; setRemoteDescription; duplex audio + JSON events start flowing.

BYOK Considerations
- The user’s key is used only to create the ephemeral session; the WebRTC session itself runs on the ephemeral token.
- Keys never leave the device except to talk to OpenAI; none are stored on your servers.

What’s in this repo
- Service: src/services/voice/OpenAIWebRTCService.ts
  - mintEphemeralSession() — implemented
  - startWebRTC() — implemented using react-native-webrtc
- Dev script: scripts/realtime/check-openai-webrtc-session.mjs to validate session minting.

Next Steps to Enable in App
- Add react-native-webrtc and use OpenAIWebRTCService.startWebRTC():
  - Create RTCPeerConnection; set audio constraints for AEC/NS/AGC.
  - Attach mic; create data channel; create offer.
  - POST offer SDP with Authorization: Bearer <ephemeral>; set answer.
  - Play remote audio track.
- Wire Voice modal’s "Advanced (Realtime)" toggle to use WebRTC when available; fall back to Whisper STT.

Tool/Function Calling (Advanced Mode)
- Include tools when minting the session or via response.create over the data channel.
- Handle tool_call → tool_result events on the data channel.

Testing
- Run check‑openai-webrtc-session.mjs with OPENAI_API_KEY to confirm session minting.
- Add a small dev screen to attempt offer/answer once webrtc is installed.
