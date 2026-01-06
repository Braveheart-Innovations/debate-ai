import { getModelById } from '@/config/modelConfigs';
import { getProviderCapabilities } from '@/config/providerCapabilities';
import {
  getModalityAvailability,
  mergeAvailabilities,
  mergeAvailabilitiesStrict,
  useModalityAvailability,
  useMergedModalityAvailability,
  useMergedModalityAvailabilityStrict,
  useImageGenerationAvailability,
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
    expect(availability.imageGeneration.supported).toBe(true);
    expect(availability.imageGeneration.models).toEqual(['dalle-3']);
    expect(availability.imageGeneration.sizes).toEqual(['1024x1024']);
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
      } as never;

      if (modelId === 'vision') {
        return { ...base, supportsImageInput: true };
      }
      if (modelId === 'documents') {
        return { ...base, supportsDocuments: true };
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

  describe('mergeAvailabilitiesStrict', () => {
    it('requires ALL providers to support image generation (AND logic)', () => {
      type ModelDescriptor = ReturnType<typeof getModelByIdMock>;

      getModelByIdMock.mockImplementation(() => {
        return { supportsImageInput: true } as ModelDescriptor;
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
            imageGeneration: { supported: true, models: ['imagen'], sizes: ['1024x1024'] },
            videoGeneration: { supported: false },
          };
        }
        return { imageGeneration: { supported: false }, videoGeneration: { supported: false } };
      });

      const merged = mergeAvailabilitiesStrict([
        { provider: 'openai', model: 'gpt-4o' },
        { provider: 'google', model: 'gemini-pro' },
      ]);

      // Both support image generation, so it should be enabled
      expect(merged.imageGeneration.supported).toBe(true);
      expect(merged.imageGeneration.models).toContain('dalle-3');
      expect(merged.imageGeneration.models).toContain('imagen');
    });

    it('disables image generation if ANY provider does not support it', () => {
      type ModelDescriptor = ReturnType<typeof getModelByIdMock>;

      getModelByIdMock.mockImplementation(() => {
        return { supportsImageInput: true } as ModelDescriptor;
      });

      getProviderCapabilitiesMock.mockImplementation((provider: AIProvider) => {
        if (provider === 'openai') {
          return {
            imageGeneration: { supported: true, models: ['dalle-3'], sizes: ['1024x1024'] },
            videoGeneration: { supported: false },
          };
        }
        // Claude does not support image generation
        if (provider === 'claude') {
          return {
            imageGeneration: { supported: false },
            videoGeneration: { supported: false },
          };
        }
        return { imageGeneration: { supported: false }, videoGeneration: { supported: false } };
      });

      const merged = mergeAvailabilitiesStrict([
        { provider: 'openai', model: 'gpt-4o' },
        { provider: 'claude', model: 'claude-3-opus' },
      ]);

      // OpenAI supports image gen but Claude doesn't, so it should be disabled
      expect(merged.imageGeneration.supported).toBe(false);
      expect(merged.imageGeneration.models).toEqual([]);
    });

    it('still uses OR logic for input modalities', () => {
      type ModelDescriptor = ReturnType<typeof getModelByIdMock>;

      getModelByIdMock.mockImplementation((providerId: string, modelId: string) => {
        if (modelId === 'vision-model') {
          return { supportsImageInput: true, supportsDocuments: false } as ModelDescriptor;
        }
        if (modelId === 'doc-model') {
          return { supportsImageInput: false, supportsDocuments: true } as ModelDescriptor;
        }
        return { supportsImageInput: false, supportsDocuments: false } as ModelDescriptor;
      });

      getProviderCapabilitiesMock.mockReturnValue({
        imageGeneration: { supported: false },
        videoGeneration: { supported: false },
      });

      const merged = mergeAvailabilitiesStrict([
        { provider: 'openai', model: 'vision-model' },
        { provider: 'google', model: 'doc-model' },
      ]);

      // Input modalities should use OR logic
      expect(merged.imageUpload.supported).toBe(true);
      expect(merged.documentUpload.supported).toBe(true);
    });

    it('returns all false for empty array', () => {
      const merged = mergeAvailabilitiesStrict([]);

      expect(merged.imageUpload.supported).toBe(false);
      expect(merged.documentUpload.supported).toBe(false);
      expect(merged.imageGeneration.supported).toBe(false);
      expect(merged.videoGeneration.supported).toBe(false);
    });

    it('hook variant returns same result as function', () => {
      type ModelDescriptor = ReturnType<typeof getModelByIdMock>;

      getModelByIdMock.mockImplementation(() => {
        return { supportsImageInput: true } as ModelDescriptor;
      });

      getProviderCapabilitiesMock.mockImplementation((provider: AIProvider) => {
        if (provider === 'openai' || provider === 'grok') {
          return {
            imageGeneration: { supported: true, models: ['model1'], sizes: ['1024x1024'] },
            videoGeneration: { supported: false },
          };
        }
        return { imageGeneration: { supported: false }, videoGeneration: { supported: false } };
      });

      const items = [
        { provider: 'openai', model: 'gpt-4o' },
        { provider: 'grok', model: 'grok-2' },
      ];

      const functionResult = mergeAvailabilitiesStrict(items);
      const hookResult = useMergedModalityAvailabilityStrict(items);

      expect(hookResult).toEqual(functionResult);
    });
  });

  describe('useImageGenerationAvailability', () => {
    it('returns unavailable when no AIs selected', () => {
      const result = useImageGenerationAvailability([], 'chat');

      expect(result.isAvailable).toBe(false);
      expect(result.mode).toBe('single');
      expect(result.reason).toBe('No AI selected');
    });

    it('returns single mode for single AI with image generation support', () => {
      getProviderCapabilitiesMock.mockReturnValue({
        imageGeneration: { supported: true, supportsImageInput: true },
        videoGeneration: { supported: false },
      });

      const result = useImageGenerationAvailability(
        [{ provider: 'openai', model: 'gpt-4o' }],
        'chat'
      );

      expect(result.isAvailable).toBe(true);
      expect(result.mode).toBe('single');
    });

    it('returns unavailable for single AI without image generation support', () => {
      getProviderCapabilitiesMock.mockReturnValue({
        imageGeneration: { supported: false },
        videoGeneration: { supported: false },
      });

      const result = useImageGenerationAvailability(
        [{ provider: 'claude', model: 'claude-3-opus' }],
        'chat'
      );

      expect(result.isAvailable).toBe(false);
      expect(result.mode).toBe('single');
      expect(result.reason).toContain('does not support image generation');
    });

    it('returns single mode for multi-AI chat using first AI for generation', () => {
      getProviderCapabilitiesMock.mockImplementation((provider: AIProvider) => {
        if (provider === 'openai') {
          return {
            imageGeneration: { supported: true, supportsImageInput: true },
            videoGeneration: { supported: false },
          };
        }
        if (provider === 'google') {
          return {
            imageGeneration: { supported: true, supportsImageInput: true },
            videoGeneration: { supported: false },
          };
        }
        return { imageGeneration: { supported: false }, videoGeneration: { supported: false } };
      });

      const result = useImageGenerationAvailability(
        [
          { provider: 'openai', model: 'gpt-4o' },
          { provider: 'google', model: 'gemini-pro' },
        ],
        'chat'
      );

      // Multi-AI chat now uses single mode (first AI generates, user refines via Refine button)
      expect(result.isAvailable).toBe(true);
      expect(result.mode).toBe('single');
    });

    it('returns available when multi-AI chat first provider supports image gen', () => {
      getProviderCapabilitiesMock.mockImplementation((provider: AIProvider) => {
        if (provider === 'openai') {
          return {
            imageGeneration: { supported: true, supportsImageInput: true },
            videoGeneration: { supported: false },
          };
        }
        if (provider === 'grok') {
          // Grok supports image gen but NOT img2img - doesn't matter for initial gen
          return {
            imageGeneration: { supported: true, supportsImageInput: false },
            videoGeneration: { supported: false },
          };
        }
        return { imageGeneration: { supported: false }, videoGeneration: { supported: false } };
      });

      const result = useImageGenerationAvailability(
        [
          { provider: 'openai', model: 'gpt-4o' },
          { provider: 'grok', model: 'grok-2-image-1212' },
        ],
        'chat'
      );

      // First provider (openai) supports image gen, so it's available
      expect(result.isAvailable).toBe(true);
      expect(result.mode).toBe('single');
    });

    it('returns compare mode for compare screen when all support image gen', () => {
      getProviderCapabilitiesMock.mockImplementation((provider: AIProvider) => {
        if (provider === 'openai' || provider === 'grok') {
          return {
            imageGeneration: { supported: true, supportsImageInput: provider === 'openai' },
            videoGeneration: { supported: false },
          };
        }
        return { imageGeneration: { supported: false }, videoGeneration: { supported: false } };
      });

      const result = useImageGenerationAvailability(
        [
          { provider: 'openai', model: 'gpt-4o' },
          { provider: 'grok', model: 'grok-2-image-1212' },
        ],
        'compare'
      );

      // Compare mode requires ALL to support image gen
      expect(result.isAvailable).toBe(true);
      expect(result.mode).toBe('compare');
    });

    it('returns unavailable for compare mode when any provider lacks image gen', () => {
      getProviderCapabilitiesMock.mockImplementation((provider: AIProvider) => {
        if (provider === 'openai') {
          return {
            imageGeneration: { supported: true, supportsImageInput: true },
            videoGeneration: { supported: false },
          };
        }
        // Claude does not support image generation
        return { imageGeneration: { supported: false }, videoGeneration: { supported: false } };
      });

      const result = useImageGenerationAvailability(
        [
          { provider: 'openai', model: 'gpt-4o' },
          { provider: 'claude', model: 'claude-3-opus' },
        ],
        'compare'
      );

      expect(result.isAvailable).toBe(false);
      expect(result.mode).toBe('compare');
      expect(result.reason).toContain('claude');
    });

    it('includes provider info in result', () => {
      getProviderCapabilitiesMock.mockImplementation((provider: AIProvider) => {
        if (provider === 'openai') {
          return {
            imageGeneration: { supported: true, supportsImageInput: true },
            videoGeneration: { supported: false },
          };
        }
        if (provider === 'google') {
          return {
            imageGeneration: { supported: true, supportsImageInput: true },
            videoGeneration: { supported: false },
          };
        }
        return { imageGeneration: { supported: false }, videoGeneration: { supported: false } };
      });

      const result = useImageGenerationAvailability(
        [
          { provider: 'openai', model: 'gpt-4o' },
          { provider: 'google', model: 'gemini-pro' },
        ],
        'chat'
      );

      expect(result.providers).toHaveLength(2);
      expect(result.providers[0]).toEqual({
        provider: 'openai',
        supportsImageGen: true,
        supportsImg2Img: true,
      });
      expect(result.providers[1]).toEqual({
        provider: 'google',
        supportsImageGen: true,
        supportsImg2Img: true,
      });
    });
  });
});
