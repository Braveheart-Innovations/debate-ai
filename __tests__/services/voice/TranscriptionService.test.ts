import TranscriptionService from '@/services/voice/TranscriptionService';
import APIKeyService from '@/services/APIKeyService';

jest.mock('@/services/APIKeyService');

const mockGetKey = APIKeyService.getKey as jest.MockedFunction<typeof APIKeyService.getKey>;

describe('TranscriptionService', () => {
  const originalFetch = global.fetch;
  const originalFormData = global.FormData;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetKey.mockResolvedValue('openai-secret');

    class MockFormData {
      private entries: Array<{ key: string; value: any }> = [];
      append(key: string, value: any) {
        this.entries.push({ key, value });
      }
      getAll() {
        return this.entries;
      }
    }

    // @ts-expect-error override
    global.FormData = MockFormData;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    // @ts-expect-error restore FormData
    global.FormData = originalFormData;
  });

  it('throws when API key is missing', async () => {
    mockGetKey.mockResolvedValueOnce(null);
    await expect(TranscriptionService.transcribeWithOpenAI('file://audio.m4a')).rejects.toThrow(
      'OpenAI API key not configured',
    );
  });

  it('throws when API response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: jest.fn().mockResolvedValue('bad request'),
    });
    await expect(TranscriptionService.transcribeWithOpenAI('file://audio.m4a')).rejects.toThrow(
      'Transcription failed: 400 bad request',
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/audio/transcriptions',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer openai-secret' },
      }),
    );
  });

  it('returns transcription text on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ text: 'Transcribed content' }),
    });

    const text = await TranscriptionService.transcribeWithOpenAI('file://audio.m4a', 'audio/m4a', 'clip.m4a');
    expect(text).toBe('Transcribed content');
    expect(global.fetch).toHaveBeenCalled();
  });
});
