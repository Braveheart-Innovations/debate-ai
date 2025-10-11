import OpenAIWebRTCService from '@/services/voice/OpenAIWebRTCService';
import APIKeyService from '@/services/APIKeyService';

jest.mock('@/services/APIKeyService', () => ({
  __esModule: true,
  default: { getKey: jest.fn() },
}));

type Track = { stop: jest.Mock };

class MockPeerConnection {
  ontrack: ((event: { streams: unknown[] }) => void) | null = null;
  createDataChannel = jest.fn(() => {
    throw new Error('channel unavailable');
  });
  addTrack = jest.fn();
  createOffer = jest.fn(async () => ({ sdp: 'offer-sdp' }));
  setLocalDescription = jest.fn(async (desc: unknown) => {
    this.localDescription = (desc || { sdp: 'offer-sdp' }) as { sdp?: string };
  });
  localDescription: { sdp?: string } | undefined;
  setRemoteDescription = jest.fn(async () => undefined);
  close = jest.fn();

  constructor(public config: unknown) {}
}

const peerInstances: MockPeerConnection[] = [];
const mockGetUserMedia = jest.fn();
const peerConstructorSpy = jest.fn();
function mockRTCPeerConnectionFactory(this: unknown, config: unknown) {
  const pc = new MockPeerConnection(config);
  peerConstructorSpy(config);
  peerInstances.push(pc);
  return pc;
}
function mockRTCSessionDescriptionFactory(
  this: { type: string; sdp: string },
  init: { type: string; sdp: string }
) {
  this.type = init.type;
  this.sdp = init.sdp;
}

jest.mock('react-native-webrtc', () => ({
  RTCPeerConnection: mockRTCPeerConnectionFactory,
  RTCSessionDescription: mockRTCSessionDescriptionFactory,
  mediaDevices: {
    getUserMedia: (...args: unknown[]) => mockGetUserMedia(...args),
  },
}));

const getKeyMock = APIKeyService.getKey as jest.Mock;

describe('OpenAIWebRTCService', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    peerInstances.splice(0, peerInstances.length);
    global.fetch = jest.fn();
    getKeyMock.mockResolvedValue('openai-secret');
    mockGetUserMedia.mockResolvedValue({
      id: 'local-stream',
      getTracks: () => [{ stop: jest.fn() } satisfies Track] as Track[],
    });
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  const getFetchMock = () => global.fetch as jest.Mock;

  it('throws if OpenAI API key is missing when minting an ephemeral session', async () => {
    getKeyMock.mockResolvedValueOnce(null);
    const service = new OpenAIWebRTCService();
    await expect(service.mintEphemeralSession()).rejects.toThrow('OpenAI API key not configured');
    expect(getFetchMock()).not.toHaveBeenCalled();
  });

  it('propagates OpenAI session mint failures with status text', async () => {
    const fetchMock = getFetchMock().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'invalid key',
    });
    const service = new OpenAIWebRTCService();
    await expect(service.mintEphemeralSession({ model: 'custom-model' })).rejects.toThrow(
      'OpenAI session mint failed 401: invalid key'
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/realtime/sessions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer openai-secret',
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'realtime=v1',
        }),
      })
    );
  });

  it('mints a session with defaults and stores the client secret', async () => {
    const session = {
      client_secret: { value: 'ephemeral-secret' },
      model: 'gpt-4o-realtime-preview-2024-10-01',
    };
    getFetchMock().mockResolvedValueOnce({
      ok: true,
      json: async () => session,
    });

    const service = new OpenAIWebRTCService();
    const result = await service.mintEphemeralSession();

    expect(result).toEqual(session);
    expect(service.getEphemeralToken()).toBe('ephemeral-secret');
    const [, requestInit] = getFetchMock().mock.calls[0];
    expect(JSON.parse((requestInit?.body as string) ?? '')).toEqual({
      model: 'gpt-4o-realtime-preview-2024-10-01',
      voice: 'verse',
      modalities: ['audio', 'text'],
    });
  });

  it('negotiates WebRTC when no token exists and captures streams', async () => {
    const session = {
      client_secret: { value: 'ephemeral-secret' },
      model: 'gpt-4o-realtime-preview-2024-10-01',
    };
    const fetchMock = getFetchMock()
      .mockResolvedValueOnce({ ok: true, json: async () => session })
      .mockResolvedValueOnce({ ok: true, text: async () => 'answer-sdp' });

    const localTracks = [{ stop: jest.fn() }];
    const localStream = { id: 'local', getTracks: () => localTracks };
    mockGetUserMedia.mockResolvedValueOnce(localStream);

    const service = new OpenAIWebRTCService();
    await service.startWebRTC({ voice: 'aria', modalities: ['audio'] });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.openai.com/v1/realtime/sessions',
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer ephemeral-secret',
          'Content-Type': 'application/sdp',
          'OpenAI-Beta': 'realtime=v1',
        }),
      })
    );

    const peer = peerInstances[0];
    expect(peer).toBeDefined();
    expect(peerConstructorSpy).toHaveBeenCalledWith({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    expect(peer.addTrack).toHaveBeenCalledTimes(localTracks.length);
    expect(service.getPeerConnection()).toBe(peer);
    expect(service.getLocalStream()).toBe(localStream);

    const remoteStream = { id: 'remote-stream' };
    peer.ontrack?.({ streams: [remoteStream] });
    expect(service.getRemoteStream()).toBe(remoteStream);
  });

  it('throws when minting succeeds but no client secret is provided', async () => {
    getFetchMock()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ model: 'gpt', id: 'missing-secret' }) });

    const service = new OpenAIWebRTCService();
    await expect(service.startWebRTC()).rejects.toThrow('Failed to mint ephemeral session');
  });

  it('propagates SDP exchange failures', async () => {
    const session = { client_secret: { value: 'token-123' }, model: 'gpt-4o' };
    getFetchMock()
      .mockResolvedValueOnce({ ok: true, json: async () => session })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'bad sdp' });

    const service = new OpenAIWebRTCService();
    await expect(service.startWebRTC()).rejects.toThrow('Realtime SDP exchange failed 500: bad sdp');
  });

  it('closes peer connection and stops local tracks on stop()', async () => {
    const session = {
      client_secret: { value: 'ephemeral-secret' },
      model: 'gpt-4o-realtime-preview-2024-10-01',
    };
    const fetchMock = getFetchMock()
      .mockResolvedValueOnce({ ok: true, json: async () => session })
      .mockResolvedValueOnce({ ok: true, text: async () => 'answer-sdp' });

    const trackStops = [jest.fn(), jest.fn()];
    const localStream = { id: 'local', getTracks: () => trackStops.map((stop) => ({ stop })) };
    mockGetUserMedia.mockResolvedValueOnce(localStream);

    const service = new OpenAIWebRTCService();
    await service.startWebRTC();
    const peer = peerInstances[0];
    expect(peer).toBeDefined();

    await service.stop();
    expect(peer?.close).toHaveBeenCalled();
    trackStops.forEach((stop) => expect(stop).toHaveBeenCalled());
    expect(service.getPeerConnection()).toBeUndefined();
    expect(service.getLocalStream()).toBeUndefined();
    expect(service.getRemoteStream()).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
