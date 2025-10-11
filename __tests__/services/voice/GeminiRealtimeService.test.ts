import { getGeminiLiveWsEndpoint } from '@/config/geminiRealtime';
import GeminiRealtimeService from '@/services/voice/GeminiRealtimeService';

jest.mock('@/config/geminiRealtime', () => ({
  getGeminiLiveWsEndpoint: jest.fn(() => 'wss://gemini.example/ws'),
}));

type Listener = { handler: (event: any) => void; once: boolean };

class MockWebSocket {
  static OPEN = 1;
  readyState = MockWebSocket.OPEN;
  sent: string[] = [];
  closed = false;
  listeners: Record<string, Listener[]> = {};

  constructor(public url: string) {
    mockConstructor(url);
    mockSockets.push(this);
  }

  addEventListener(event: string, handler: (event: any) => void, options?: { once?: boolean }) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push({ handler, once: Boolean(options?.once) });
  }

  removeEventListener(event: string, handler: (event: any) => void) {
    this.listeners[event] = (this.listeners[event] || []).filter(({ handler: h }) => h !== handler);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.closed = true;
  }

  emit(event: string, data: any) {
    const listeners = [...(this.listeners[event] || [])];
    listeners.forEach(listener => {
      listener.handler(data);
      if (listener.once) {
        this.removeEventListener(event, listener.handler);
      }
    });
  }
}

const mockConstructor = jest.fn();
const mockSockets: MockWebSocket[] = [];

describe('GeminiRealtimeService', () => {
  const originalWebSocket = global.WebSocket;

  beforeAll(() => {
    // @ts-expect-error override global for test
    global.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterAll(() => {
    global.WebSocket = originalWebSocket;
  });

  beforeEach(() => {
    mockConstructor.mockClear();
    mockSockets.splice(0, mockSockets.length);
    jest.clearAllMocks();
  });

  it('connects to Gemini Live endpoint and sends setup payload', async () => {
    const service = new GeminiRealtimeService();
    const onMessage = jest.fn();
    service.onMessage(onMessage);

    const connectPromise = service.connect({
      accessToken: 'token-123',
      model: 'models/gemini-live-2.5-flash-preview',
      setup: { responseModalities: ['TEXT'] },
    });

    expect(mockConstructor).toHaveBeenCalledWith(
      'wss://gemini.example/ws?access_token=token-123',
    );
    const socket = mockSockets[0];
    socket.emit('open', {});
    await connectPromise;

    expect(socket.sent).toHaveLength(1);
    const payload = JSON.parse(socket.sent[0]);
    expect(payload.setup.model).toBe('models/gemini-live-2.5-flash-preview');
    expect(payload.setup.responseModalities).toEqual(['TEXT']);

    socket.emit('message', { data: JSON.stringify({ event: 'update' }) });
    expect(onMessage).toHaveBeenCalledWith({ event: 'update' });
  });

  it('rejects connection when WebSocket errors before open', async () => {
    const service = new GeminiRealtimeService();
    const connectPromise = service.connect({
      accessToken: 'bad-token',
      model: 'models/test',
    });
    const socket = mockSockets[0];
    socket.emit('error', { message: 'boom' });
    await expect(connectPromise).rejects.toThrow('boom');
    expect(socket.closed).toBe(true);
  });

  it('sends client text, audio, and tool responses', async () => {
    const service = new GeminiRealtimeService();
    const connectPromise = service.connect({
      accessToken: 'token',
      model: 'models/test',
    });
    const socket = mockSockets[0];
    socket.emit('open', {});
    await connectPromise;

    service.sendClientText('Hello Gemini');
    expect(JSON.parse(socket.sent.pop() as string)).toEqual({
      clientContent: { turns: [{ role: 'user', parts: [{ text: 'Hello Gemini' }] }] },
    });

    const buffer = new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer;
    service.sendRealtimeAudioChunk(buffer);
    const audioPayload = JSON.parse(socket.sent.pop() as string);
    expect(audioPayload.realtimeInput.audioChunk.data).toBe('3q2+7w==');
    expect(audioPayload.realtimeInput.audioChunk.mimeType).toBe('audio/pcm;rate=16000');

    service.sendToolResponse([{ id: 'tool-1', output: 'done' }]);
    expect(JSON.parse(socket.sent.pop() as string)).toEqual({
      toolResponse: { functionResponses: [{ id: 'tool-1', output: 'done' }] },
    });
  });

  it('throws when attempting to send after connection is closed', async () => {
    const service = new GeminiRealtimeService();
    const connectPromise = service.connect({
      accessToken: 'token',
      model: 'models/test',
    });
    const socket = mockSockets[0];
    socket.emit('open', {});
    await connectPromise;

    await service.close();
    expect(() => service.sendClientText('hi')).toThrow('Gemini WS not connected');
  });

  it('uses configured endpoint helper during connection', async () => {
    const service = new GeminiRealtimeService();
    const promise = service.connect({ accessToken: 'tok', model: 'models/test' });
    mockSockets[0].emit('open', {});
    await promise;
    expect(getGeminiLiveWsEndpoint).toHaveBeenCalled();
  });
});
