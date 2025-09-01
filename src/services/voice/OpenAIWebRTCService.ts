// BYOK WebRTC Realtime (client-only) scaffold for OpenAI
// Flow (no backend required):
// 1) Read user's OpenAI key from SecureStore
// 2) POST /v1/realtime/sessions to mint an ephemeral session
// 3) Create RTCPeerConnection, getUserMedia (mic), create data channel
// 4) Create SDP offer; POST to /v1/realtime?model=... with Authorization: Bearer <ephemeral_secret>
// 5) Set remote description from response; start duplex audio

import APIKeyService from '../APIKeyService';

export interface EphemeralSession {
  client_secret?: { value: string; expires_at?: string };
  id?: string;
  model?: string;
  expires_at?: string;
}

export interface WebRTCStartOptions {
  model?: string;
  voice?: string;
  modalities?: Array<'audio' | 'text' | 'tool'>;
}

export class OpenAIWebRTCService {
  private ephemeral?: EphemeralSession;
  // private pc?: RTCPeerConnection; // Uncomment once react-native-webrtc is integrated

  async mintEphemeralSession(opts?: WebRTCStartOptions): Promise<EphemeralSession> {
    const apiKey = await APIKeyService.getKey('openai');
    if (!apiKey) throw new Error('OpenAI API key not configured');
    const body = {
      model: opts?.model || 'gpt-4o-realtime-preview-2024-10-01',
      voice: opts?.voice || 'verse',
      modalities: opts?.modalities || ['audio', 'text'],
    };
    const res = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'realtime=v1',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenAI session mint failed ${res.status}: ${text}`);
    }
    const data = (await res.json()) as EphemeralSession;
    this.ephemeral = data;
    return data;
  }

  getEphemeralToken(): string | undefined {
    return this.ephemeral?.client_secret?.value;
  }

  // Placeholder for WebRTC start; implement after adding react-native-webrtc
  async startWebRTC(opts?: WebRTCStartOptions): Promise<void> {
    if (!this.getEphemeralToken()) {
      await this.mintEphemeralSession(opts);
    }
    // TODO: create RTCPeerConnection, mic track, data channel
    // Create SDP offer and POST to:
    //   POST https://api.openai.com/v1/realtime?model=... (Content-Type: application/sdp)
    // with Authorization: Bearer <ephemeral>
    // Then setRemoteDescription with SDP answer and begin audio playback.
    throw new Error('WebRTC not integrated. Add react-native-webrtc to enable realtime voice.');
  }
}

export default OpenAIWebRTCService;
