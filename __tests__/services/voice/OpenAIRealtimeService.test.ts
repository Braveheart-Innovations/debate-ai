import { getRealtimeRelayUrl, getRealtimeModel } from '@/config/realtime';
import APIKeyService from '@/services/APIKeyService';
import * as FileSystem from 'expo-file-system';
import OpenAIRealtimeService from '@/services/voice/OpenAIRealtimeService';

jest.mock('@/services/APIKeyService');
jest.mock('@/config/realtime', () => ({
  getRealtimeRelayUrl: jest.fn(() => 'wss://relay.example'),
  getRealtimeModel: jest.fn(() => 'gpt-4o-realtime-preview-2024-10-01'),
}));
jest.mock('expo-file-system', () => ({
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
  cacheDirectory: '/cache/',
}));

type SentMessage = string;

class MockWebSocket {
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: any }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  sent: SentMessage[] = [];
  closed = false;

  constructor(public url: string, public protocols?: string[]) {
    mockConstructor(url, protocols);
    mockSockets.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.closed = true;
  }
}

const mockConstructor = jest.fn();
const mockSockets: MockWebSocket[] = [];

(APIKeyService.getKey as jest.Mock).mockResolvedValue('openai-secret');

describe('OpenAIRealtimeService', () => {
  const originalWebSocket = global.WebSocket;

  beforeAll(() => {
    // @ts-expect-error override global WS
    global.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterAll(() => {
    global.WebSocket = originalWebSocket;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockSockets.splice(0, mockSockets.length);
    (APIKeyService.getKey as jest.Mock).mockResolvedValue('openai-secret');
    (getRealtimeRelayUrl as jest.Mock).mockReturnValue('wss://relay.example/');
    (getRealtimeModel as jest.Mock).mockReturnValue('gpt-4o-realtime-preview-2024-10-01');
  });

  it('throws when API key is missing', async () => {
    (APIKeyService.getKey as jest.Mock).mockResolvedValue(null);
    const service = new OpenAIRealtimeService();
    await expect(service.connect()).rejects.toThrow('OpenAI API key not configured');
  });

  it('throws when relay URL is missing', async () => {
    (getRealtimeRelayUrl as jest.Mock).mockReturnValue(undefined);
    const service = new OpenAIRealtimeService();
    await expect(service.connect()).rejects.toThrow('Realtime relay not configured');
  });

  it('connects to relay using bearer protocol and emits lifecycle events', async () => {
    const service = new OpenAIRealtimeService();
    const onOpen = jest.fn();
    const onError = jest.fn();
    const onClose = jest.fn();
    const onCompleted = jest.fn();

    service.on('open', onOpen);
    service.on('error', onError);
    service.on('close', onClose);
    service.on('completed', onCompleted);

    await service.connect();
    expect(mockConstructor).toHaveBeenCalledWith(
      'wss://relay.example/ws?model=gpt-4o-realtime-preview-2024-10-01',
      ['bearer', 'openai-secret'],
    );

    const socket = mockSockets[0];
    socket.onopen?.({});
    expect(onOpen).toHaveBeenCalled();

    socket.onmessage?.({ data: JSON.stringify({ type: 'output_audio.delta', delta: 'chunk1' }) });
    socket.onmessage?.({ data: JSON.stringify({ type: 'response.completed' }) });
    expect(onCompleted).toHaveBeenCalled();

    socket.onerror?.({ message: 'boom' });
    expect(onError).toHaveBeenCalledWith({ message: 'boom' });

    socket.onclose?.({});
    expect(onClose).toHaveBeenCalled();
  });

  it('sends recorded audio and creates response requests', async () => {
    const service = new OpenAIRealtimeService();
    await service.connect();
    const socket = mockSockets[0];
    socket.onopen?.({});

    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('base64data');
    await service.sendRecordedAudioFile('file://audio.m4a', 'audio/m4a');

    expect(socket.sent[0]).toContain('"type":"input_audio_buffer.append"');
    expect(socket.sent[1]).toContain('"type":"response.create"');
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith('file://audio.m4a', { encoding: 'base64' });
  });

  it('saves output audio buffers to file', async () => {
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(42);
    const service = new OpenAIRealtimeService();
    await service.connect();
    const socket = mockSockets[0];
    socket.onopen?.({});

    socket.onmessage?.({ data: JSON.stringify({ type: 'output_audio.delta', delta: 'abc' }) });
    socket.onmessage?.({ data: JSON.stringify({ type: 'output_audio.delta', delta: '123' }) });

    const path = await service.saveOutputAudioToFile();
    expect(path).toBe('/cache/rt_output_42.wav');
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      '/cache/rt_output_42.wav',
      'abc123',
      { encoding: FileSystem.EncodingType.Base64 },
    );

    expect(await service.saveOutputAudioToFile()).toBeNull();
    dateSpy.mockRestore();
  });

  it('throws when sending audio without connection', async () => {
    const service = new OpenAIRealtimeService();
    await expect(service.sendRecordedAudioFile('file://audio.m4a')).rejects.toThrow('WebSocket not connected');
  });
});
