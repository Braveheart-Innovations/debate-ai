import APIKeyService from '../APIKeyService';
import * as FileSystem from 'expo-file-system';
import { getRealtimeRelayUrl, getRealtimeModel } from '../../config/realtime';

type EventHandler = (data: unknown) => void;

export interface RealtimeOptions {
  model?: string; // default gpt-4o-realtime-preview-2024-10-01
}

export class OpenAIRealtimeService {
  private ws: WebSocket | null = null;
  private onEventHandlers: Record<string, EventHandler[]> = {};
  private audioBuffers: string[] = []; // base64 audio chunks from output events
  private model: string;

  constructor(opts?: RealtimeOptions) {
    this.model = opts?.model || getRealtimeModel();
  }

  on(event: string, handler: EventHandler) {
    if (!this.onEventHandlers[event]) this.onEventHandlers[event] = [];
    this.onEventHandlers[event].push(handler);
  }

  private emit(event: string, data: unknown) {
    (this.onEventHandlers[event] || []).forEach(h => h(data));
  }

  async connect(): Promise<void> {
    const apiKey = await APIKeyService.getKey('openai');
    if (!apiKey) throw new Error('OpenAI API key not configured');
    const relay = getRealtimeRelayUrl();
    if (!relay) {
      throw new Error('Realtime relay not configured. Set OPENAI_REALTIME_RELAY_URL to a deployed proxy that forwards to OpenAI Realtime with proper headers.');
    }
    // Connect to our relay; relay must inject Authorization and beta headers to OpenAI
    const url = `${relay.replace(/\/$/, '')}/ws?model=${encodeURIComponent(this.model)}`;
    // Pass user's API key as subprotocol so the relay can forward Authorization without storing app keys
    this.ws = new WebSocket(url, [
      'bearer',
      apiKey,
    ]);
    const ws = this.ws;
    if (!ws) return;
    

    ws.onopen = () => {
      this.emit('open', {});
    };
    ws.onmessage = (msg: { data: string }) => {
      try {
        const data = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data;
        if (data && data.type === 'output_audio.delta' && data.delta) {
          this.audioBuffers.push(data.delta); // base64 chunk
        }
        if (data && data.type === 'response.completed') {
          this.emit('completed', {});
        }
        if (data && data.type === 'error') {
          this.emit('error', data);
        }
      } catch {
        // Ignore non-JSON messages
      }
    };
    ws.onerror = (e: unknown) => this.emit('error', e);
    ws.onclose = () => this.emit('close', {});
  }

  async disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  async sendRecordedAudioFile(fileUri: string, mimeType = 'audio/m4a') {
    if (!this.ws) throw new Error('WebSocket not connected');
    const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
    this.ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: base64, mime_type: mimeType }));
    this.ws.send(JSON.stringify({ type: 'response.create' }));
  }

  async saveOutputAudioToFile(): Promise<string | null> {
    if (this.audioBuffers.length === 0) return null;
    const fileUri = FileSystem.cacheDirectory + `rt_output_${Date.now()}.wav`;
    const combined = this.audioBuffers.join('');
    await FileSystem.writeAsStringAsync(fileUri, combined, { encoding: FileSystem.EncodingType.Base64 });
    this.audioBuffers = [];
    return fileUri;
  }
}

export default OpenAIRealtimeService;
