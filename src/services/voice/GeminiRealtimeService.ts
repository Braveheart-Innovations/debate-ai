import { getGeminiLiveWsEndpoint, GeminiLiveSetup } from '../../config/geminiRealtime';

type MessageHandler = (msg: Record<string, unknown>) => void;

export interface GeminiRealtimeOptions {
  accessToken: string; // Ephemeral token minted by backend (v1alpha authTokens:create)
  model: string; // e.g., models/gemini-live-2.5-flash-preview
  setup?: Omit<GeminiLiveSetup['setup'], 'model'>;
}

/**
 * Gemini Realtime (Live API) WebSocket client (BYOK via ephemeral token)
 * - Connects to the global WS endpoint with ?access_token=
 * - Sends a setup message first
 * - Supports clientContent (text), realtimeInput (audio PCM16 16k), and toolResponse
 */
export class GeminiRealtimeService {
  private ws: WebSocket | null = null;
  private onMessageHandlers: MessageHandler[] = [];

  onMessage(handler: MessageHandler) { this.onMessageHandlers.push(handler); }

  async connect(opts: GeminiRealtimeOptions): Promise<void> {
    const base = getGeminiLiveWsEndpoint();
    const url = `${base}?access_token=${encodeURIComponent(opts.accessToken)}`;
    this.ws = new WebSocket(url);

    await new Promise<void>((resolve, reject) => {
      const ws = this.ws!;
      const open = () => { ws.removeEventListener('error', err); resolve(); };
      const err = (e: unknown) => { try { ws.close(); } catch { /* ignore */ } reject(new Error(String((e as { message?: string })?.message || 'WS error'))); };
      ws.addEventListener('open', open, { once: true });
      ws.addEventListener('error', err, { once: true });
    });

    // Send setup
    const setup: GeminiLiveSetup = {
      setup: {
        model: opts.model,
        ...(opts.setup || {}),
      },
    };
    this.sendJson(setup);

    // Start message pump
    this.ws.addEventListener('message', (evt: MessageEvent) => {
      try {
        const data = typeof evt.data === 'string' ? JSON.parse(evt.data) : evt.data;
        this.onMessageHandlers.forEach(h => h(data as Record<string, unknown>));
      } catch { /* ignore non-JSON */ }
    });
  }

  private ensureOpen(): WebSocket {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('Gemini WS not connected');
    return this.ws;
  }

  private sendJson(obj: unknown) {
    const ws = this.ensureOpen();
    ws.send(JSON.stringify(obj));
  }

  /**
   * Send discrete user text turns. This interrupts current generation.
   */
  sendClientText(text: string) {
    this.sendJson({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }] } });
  }

  /**
   * Stream PCM16 LE mono 16kHz audio chunks to the model.
   * The API expects base64-encoded bytes within realtimeInput.
   */
  sendRealtimeAudioChunk(pcm16k: ArrayBuffer) {
    // Encode to base64
    const bytes = new Uint8Array(pcm16k);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bytes).toString('base64');
    this.sendJson({ realtimeInput: { audioChunk: { data: b64, mimeType: 'audio/pcm;rate=16000' } } });
  }

  /**
   * Send tool/function results back to the model
   */
  sendToolResponse(functionResponses: Array<Record<string, unknown>>) {
    this.sendJson({ toolResponse: { functionResponses } });
  }

  /**
   * Gracefully close the connection
   */
  async close(): Promise<void> {
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
    this.onMessageHandlers = [];
  }
}

export default GeminiRealtimeService;

