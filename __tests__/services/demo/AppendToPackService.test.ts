import AppendToPackService from '@/services/demo/AppendToPackService';
import { DemoContentService } from '@/services/demo/DemoContentService';

jest.mock('@/services/demo/DemoContentService', () => ({
  DemoContentService: {
    ingestRecording: jest.fn(),
  },
}));

const mockIngest = jest.mocked(DemoContentService.ingestRecording);

const okResponse = (): Response => new Response(null, { status: 200 });

describe('AppendToPackService', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('appends session when health check and post succeed', async () => {
    mockIngest.mockImplementationOnce(() => { throw new Error('ingest fail'); });
    fetchSpy
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(okResponse());

    const result = await AppendToPackService.append({ id: 'session-1' });
    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:8889/health', expect.any(Object));
    expect(fetchSpy).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:8889/append', expect.objectContaining({ method: 'POST' }));
    expect(mockIngest).toHaveBeenCalled();
  });

  it('returns packer unavailable error when health check fails', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 503 }));
    const res = await AppendToPackService.append({}, 'http://localhost:9999/append');
    expect(res).toEqual({ ok: false, error: expect.stringContaining('Demo packer dev server not reachable') });
    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:9999/health', expect.any(Object));
  });

  it('returns error when POST request fails', async () => {
    fetchSpy
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(new Response('server down', { status: 500 }));
    const result = await AppendToPackService.append({});
    expect(result).toEqual({ ok: false, error: 'HTTP 500: server down' });
  });

  it('propagates fetch exceptions as error messages', async () => {
    fetchSpy
      .mockResolvedValueOnce(okResponse())
      .mockRejectedValueOnce(new Error('boom'));
    const result = await AppendToPackService.append({ id: 'x' });
    expect(result).toEqual({ ok: false, error: 'boom' });
  });
});
