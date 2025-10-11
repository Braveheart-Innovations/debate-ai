import AppendToPackService from '@/services/demo/AppendToPackService';
import { DemoContentService } from '@/services/demo/DemoContentService';

jest.mock('@/services/demo/DemoContentService', () => ({
  DemoContentService: {
    ingestRecording: jest.fn(),
  },
}));

const mockIngest = DemoContentService.ingestRecording as jest.MockedFunction<typeof DemoContentService.ingestRecording>;

describe('AppendToPackService', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    // @ts-expect-error override fetch
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('appends session when health check and post succeed', async () => {
    const responseSequence = [
      { ok: true },
      { ok: true, text: jest.fn() },
    ];
    mockIngest.mockImplementationOnce(() => { throw new Error('ingest fail'); });
    (global.fetch as jest.Mock).mockImplementation(async () => responseSequence.shift());

    const result = await AppendToPackService.append({ id: 'session-1' });
    expect(result).toEqual({ ok: true });
    expect(global.fetch).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:8889/health', expect.any(Object));
    expect(global.fetch).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:8889/append', expect.objectContaining({ method: 'POST' }));
    expect(mockIngest).toHaveBeenCalled();
  });

  it('returns packer unavailable error when health check fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
    const res = await AppendToPackService.append({}, 'http://localhost:9999/append');
    expect(res).toEqual({ ok: false, error: expect.stringContaining('Demo packer dev server not reachable') });
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:9999/health', expect.any(Object));
  });

  it('returns error when POST request fails', async () => {
    const responses = [
      { ok: true },
      { ok: false, status: 500, text: jest.fn().mockResolvedValue('server down') },
    ];
    (global.fetch as jest.Mock).mockImplementation(async () => responses.shift());
    const result = await AppendToPackService.append({});
    expect(result).toEqual({ ok: false, error: 'HTTP 500: server down' });
  });

  it('propagates fetch exceptions as error messages', async () => {
    const responses = [
      { ok: true },
    ];
    (global.fetch as jest.Mock)
      .mockImplementationOnce(async () => responses.shift())
      .mockImplementationOnce(async () => { throw new Error('boom'); });
    const result = await AppendToPackService.append({ id: 'x' });
    expect(result).toEqual({ ok: false, error: 'boom' });
  });
});
