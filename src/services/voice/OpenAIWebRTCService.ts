// BYOK WebRTC Realtime (client-only) scaffold for OpenAI
// Flow (no backend required):
// 1) Read user's OpenAI key from SecureStore
// 2) POST /v1/realtime/sessions to mint an ephemeral session
// 3) Create RTCPeerConnection, getUserMedia (mic), create data channel
// 4) Create SDP offer; POST to /v1/realtime?model=... with Authorization: Bearer <ephemeral_secret>
// 5) Set remote description from response; start duplex audio

import APIKeyService from '../APIKeyService';
import { RTCPeerConnection, RTCSessionDescription, mediaDevices } from 'react-native-webrtc';

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
  private pc?: unknown;
  private remoteStream?: unknown;
  private localStream?: unknown;

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
    const token = this.getEphemeralToken();
    if (!token) throw new Error('Failed to mint ephemeral session');

    // Create PC
    const PC = RTCPeerConnection as unknown as new (config?: unknown) => unknown & {
      ontrack: ((ev: { streams: unknown[] }) => void) | null;
      createDataChannel: (label: string) => unknown;
      addTrack: (track: unknown, stream: unknown) => unknown;
      createOffer: (opts?: unknown) => Promise<{ sdp?: string } & unknown>;
      setLocalDescription: (desc: unknown) => Promise<void>;
      localDescription?: { sdp?: string };
      setRemoteDescription: (desc: unknown) => Promise<void>;
      close: () => void;
    };
    const pc = new PC({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    this.pc = pc;

    // Handle remote tracks
    pc.ontrack = (event: { streams: unknown[] }) => {
      this.remoteStream = (event.streams && event.streams[0]) || undefined;
    };

    // Create data channel for events/tools (optional)
    try { pc.createDataChannel('oai-events'); } catch { /* ignore */ }

    // Get mic
    const local = await mediaDevices.getUserMedia({ audio: true });
    this.localStream = local as unknown;
    const ls = this.localStream as unknown as { getTracks?: () => unknown[] };
    try { ls.getTracks?.()?.forEach((t: unknown) => pc.addTrack(t, this.localStream as unknown)); } catch { /* ignore */ }

    // Create offer
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);

    // Post SDP to OpenAI
    const model = opts?.model || this.ephemeral?.model || 'gpt-4o-realtime-preview-2024-10-01';
    const res = await fetch(`https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/sdp',
        'OpenAI-Beta': 'realtime=v1',
      },
      body: (pc.localDescription?.sdp) || offer.sdp || '',
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Realtime SDP exchange failed ${res.status}: ${text}`);
    }
    const answerSdp = await res.text();
    const SDesc = RTCSessionDescription as unknown as new (init: { type: string; sdp: string }) => unknown;
    await pc.setRemoteDescription(new SDesc({ type: 'answer', sdp: answerSdp }));
  }

  getRemoteStream(): unknown { return this.remoteStream; }
  getLocalStream(): unknown { return this.localStream; }
  getPeerConnection(): unknown { return this.pc; }

  async stop(): Promise<void> {
    try { (this.pc as { close?: () => void } | undefined)?.close?.(); } catch { /* ignore */ }
    try {
      const ls = this.localStream as unknown as { getTracks?: () => Array<{ stop?: () => void }> };
      ls.getTracks?.()?.forEach((t) => t.stop?.());
    } catch { /* ignore */ }
    this.pc = undefined;
    this.localStream = undefined;
    this.remoteStream = undefined;
  }
}

export default OpenAIWebRTCService;
