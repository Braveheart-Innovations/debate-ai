import { getModelById } from '@/config/modelConfigs';
import { getProviderCapabilities } from '@/config/providerCapabilities';
import {
  getModalityAvailability,
  mergeAvailabilities,
  useModalityAvailability,
  useMergedModalityAvailability,
} from '@/hooks/multimodal/useModalityAvailability';
import type { AIProvider } from '@/types';

jest.mock('@/config/modelConfigs', () => ({
  getModelById: jest.fn(),
}));

jest.mock('@/config/providerCapabilities', () => ({
  getProviderCapabilities: jest.fn(),
}));

describe('useModalityAvailability', () => {
  const getModelByIdMock = getModelById as jest.MockedFunction<typeof getModelById>;
  const getProviderCapabilitiesMock = getProviderCapabilities as jest.MockedFunction<typeof getProviderCapabilities>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('derives availability flags for a single provider/model pair', () => {
    getModelByIdMock.mockReturnValue({
      supportsImageInput: true,
      supportsDocuments: true,
      supportsVoiceInput: false,
      supportsVoiceOutput: true,
      supportsRealtime: true,
      supportsVision: false,
    } as never);

    getProviderCapabilitiesMock.mockReturnValue({
      imageGeneration: {
        supported: true,
        models: ['dalle-3'],
        sizes: ['1024x1024'],
      },
      videoGeneration: {
        supported: true,
        models: ['sora'],
        resolutions: ['4k'],
      },
    });

    const availability = getModalityAvailability('openai', 'gpt-4o');

    expect(getModelByIdMock).toHaveBeenCalledWith('openai', 'gpt-4o');
    expect(getProviderCapabilitiesMock).toHaveBeenCalledWith('openai');
    expect(availability.imageUpload.supported).toBe(true);
    expect(availability.documentUpload.supported).toBe(true);
    expect(availability.voiceInput.supported).toBe(true);
    expect(availability.voiceOutput.supported).toBe(true);
    expect(availability.realtime.supported).toBe(true);
    expect(availability.imageGeneration).toEqual({
      supported: true,
      models: ['dalle-3'],
      sizes: ['1024x1024'],
    });
    expect(availability.videoGeneration).toEqual({
      supported: true,
      models: ['sora'],
      resolutions: ['4k'],
    });

    const hookAvailability = useModalityAvailability('openai', 'gpt-4o');
    expect(hookAvailability).toEqual(availability);
  });

  it('merges availability across multiple selections and deduplicates metadata', () => {
    type ModelDescriptor = ReturnType<typeof getModelByIdMock>;

    getModelByIdMock.mockImplementation((providerId: string, modelId: string) => {
      const base: ModelDescriptor = {
        supportsImageInput: false,
        supportsDocuments: false,
        supportsVoiceInput: false,
        supportsVoiceOutput: false,
        supportsRealtime: false,
      } as never;

      if (modelId === 'vision') {
        return { ...base, supportsImageInput: true, supportsRealtime: true };
      }
      if (modelId === 'documents') {
        return { ...base, supportsDocuments: true, supportsVoiceInput: true };
      }
      return base;
    });

    getProviderCapabilitiesMock.mockImplementation((provider: AIProvider) => {
      if (provider === 'openai') {
        return {
          imageGeneration: { supported: true, models: ['dalle-3'], sizes: ['1024x1024'] },
          videoGeneration: { supported: false },
        };
      }
      if (provider === 'google') {
        return {
          imageGeneration: { supported: false },
          videoGeneration: { supported: true, models: ['veo'], resolutions: ['1080p'] },
        };
      }
      return { imageGeneration: { supported: false }, videoGeneration: { supported: false } };
    });

    const merged = mergeAvailabilities([
      { provider: 'openai', model: 'vision' },
      { provider: 'google', model: 'documents' },
    ]);

    expect(merged.imageUpload.supported).toBe(true);
    expect(merged.documentUpload.supported).toBe(true);
    expect(merged.voiceInput.supported).toBe(true);
    expect(merged.voiceOutput.supported).toBe(false);
    expect(merged.realtime.supported).toBe(true);
    expect(merged.imageGeneration.supported).toBe(true);
    expect(merged.imageGeneration.models).toEqual(['dalle-3']);
    expect(merged.videoGeneration.supported).toBe(true);
    expect(merged.videoGeneration.models).toEqual(['veo']);
    expect(merged.videoGeneration.resolutions).toEqual(['1080p']);

    const hookMerged = useMergedModalityAvailability([
      { provider: 'openai', model: 'vision' },
      { provider: 'google', model: 'documents' },
    ]);

    expect(hookMerged).toEqual(merged);
  });
});
