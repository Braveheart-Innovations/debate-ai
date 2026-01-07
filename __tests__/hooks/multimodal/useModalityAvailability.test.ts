import {
  getModalityAvailability,
  mergeAvailabilities,
  mergeAvailabilitiesStrict,
  useModalityAvailability,
  useMergedModalityAvailability,
  useMergedModalityAvailabilityStrict,
} from '@/hooks/multimodal/useModalityAvailability';
import * as modelConfigs from '@/config/modelConfigs';
import * as providerCapabilities from '@/config/providerCapabilities';

// Mock the config modules
jest.mock('@/config/modelConfigs');
jest.mock('@/config/providerCapabilities');

const mockGetModelById = modelConfigs.getModelById as jest.MockedFunction<typeof modelConfigs.getModelById>;
const mockGetProviderCapabilities = providerCapabilities.getProviderCapabilities as jest.MockedFunction<
  typeof providerCapabilities.getProviderCapabilities
>;

describe('useModalityAvailability - Web Search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getModalityAvailability', () => {
    it('should return webSearch supported when model has supportsWebSearch flag', () => {
      mockGetModelById.mockReturnValue({
        id: 'gpt-5',
        name: 'GPT-5',
        description: 'Latest model',
        contextLength: 272000,
        supportsWebSearch: true,
        supportsVision: true,
        supportsDocuments: true,
      });

      mockGetProviderCapabilities.mockReturnValue({
        streaming: true,
        imageGeneration: { supported: false },
      });

      const result = getModalityAvailability('openai', 'gpt-5');

      expect(result.webSearch.supported).toBe(true);
    });

    it('should return webSearch not supported when model lacks supportsWebSearch flag', () => {
      mockGetModelById.mockReturnValue({
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        description: 'Older model',
        contextLength: 16000,
        supportsWebSearch: false,
      });

      mockGetProviderCapabilities.mockReturnValue({
        streaming: true,
        imageGeneration: { supported: false },
      });

      const result = getModalityAvailability('openai', 'gpt-3.5-turbo');

      expect(result.webSearch.supported).toBe(false);
    });

    it('should return webSearch not supported when flag is undefined', () => {
      mockGetModelById.mockReturnValue({
        id: 'claude-3-opus',
        name: 'Claude 3 Opus',
        description: 'Claude model',
        contextLength: 200000,
        // supportsWebSearch not defined
      });

      mockGetProviderCapabilities.mockReturnValue({
        streaming: true,
        imageGeneration: { supported: false },
      });

      const result = getModalityAvailability('claude', 'claude-3-opus');

      expect(result.webSearch.supported).toBe(false);
    });
  });

  describe('mergeAvailabilities - Web Search AND Logic', () => {
    it('should return webSearch supported only when ALL models support it', () => {
      mockGetModelById
        .mockReturnValueOnce({
          id: 'gpt-5',
          name: 'GPT-5',
          description: 'Model 1',
          contextLength: 272000,
          supportsWebSearch: true,
        })
        .mockReturnValueOnce({
          id: 'gemini-2.5-pro',
          name: 'Gemini 2.5 Pro',
          description: 'Model 2',
          contextLength: 1048576,
          supportsWebSearch: true,
        });

      mockGetProviderCapabilities.mockReturnValue({
        streaming: true,
        imageGeneration: { supported: false },
      });

      const result = mergeAvailabilities([
        { provider: 'openai', model: 'gpt-5' },
        { provider: 'google', model: 'gemini-2.5-pro' },
      ]);

      expect(result.webSearch.supported).toBe(true);
    });

    it('should return webSearch not supported when ANY model does not support it', () => {
      mockGetModelById
        .mockReturnValueOnce({
          id: 'gpt-5',
          name: 'GPT-5',
          description: 'Model 1',
          contextLength: 272000,
          supportsWebSearch: true,
        })
        .mockReturnValueOnce({
          id: 'claude-3-opus',
          name: 'Claude 3 Opus',
          description: 'Model 2',
          contextLength: 200000,
          supportsWebSearch: false,
        });

      mockGetProviderCapabilities.mockReturnValue({
        streaming: true,
        imageGeneration: { supported: false },
      });

      const result = mergeAvailabilities([
        { provider: 'openai', model: 'gpt-5' },
        { provider: 'claude', model: 'claude-3-opus' },
      ]);

      expect(result.webSearch.supported).toBe(false);
    });
  });

  describe('React Hooks', () => {
    it('should return web search availability for single provider', () => {
      mockGetModelById.mockReturnValue({
        id: 'gpt-5',
        name: 'GPT-5',
        description: 'Model',
        contextLength: 272000,
        supportsWebSearch: true,
      });

      mockGetProviderCapabilities.mockReturnValue({
        streaming: true,
        imageGeneration: { supported: false },
      });

      const result = useModalityAvailability('openai', 'gpt-5');

      expect(result.webSearch.supported).toBe(true);
    });
  });
});
