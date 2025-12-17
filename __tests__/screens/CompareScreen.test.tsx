import React from 'react';
import { Alert } from 'react-native';
import { act, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { createAppStore, showSheet } from '@/store';
import type { AppStore, RootState } from '@/store';
import type { AIConfig, ChatSession, Message } from '@/types';

const leftAI: AIConfig = {
  id: 'left-ai',
  provider: 'anthropic',
  name: 'Claude',
  model: 'claude-3-opus',
};

const rightAI: AIConfig = {
  id: 'right-ai',
  provider: 'openai',
  name: 'GPT-4',
  model: 'gpt-4-turbo',
};

const mockFeatureAccess = jest.fn();
const mockUseAIService = jest.fn();
const mockUseMergedAvailability = jest.fn();
const mockListSamples = jest.fn();
const mockFindCompareById = jest.fn();
const mockLoadCompareScript = jest.fn();
const mockPrimeNextCompareTurn = jest.fn();
const mockHasNextCompareTurn = jest.fn();

let mockHeaderProps: any;
let mockCompareSplitViewProps: any;
let mockDemoSamplesProps: any;
let mockChatInputProps: any;
let mockDemoBannerProps: any;

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialIcons: () => null,
  MaterialCommunityIcons: () => null,
}));

jest.mock('@/hooks/useFeatureAccess', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockFeatureAccess(...args),
  useFeatureAccess: (...args: unknown[]) => mockFeatureAccess(...args),
}));

jest.mock('@/providers/AIServiceProvider', () => ({
  useAIService: (...args: unknown[]) => mockUseAIService(...args),
}));

const mockUseMergedAvailabilityStrict = jest.fn();

jest.mock('@/hooks/multimodal/useModalityAvailability', () => ({
  useMergedModalityAvailability: (...args: unknown[]) => mockUseMergedAvailability(...args),
  useMergedModalityAvailabilityStrict: (...args: unknown[]) => mockUseMergedAvailabilityStrict(...args),
}));

const mockGenerateImage = jest.fn();

jest.mock('@/services/images/ImageService', () => ({
  ImageService: {
    generateImage: (...args: unknown[]) => mockGenerateImage(...args),
  },
}));

let mockImageModalProps: any;

jest.mock('@/components/organisms/chat/ImageGenerationModal', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    ImageGenerationModal: (props: any) => {
      mockImageModalProps = props;
      return React.createElement(Text, { testID: 'image-modal' }, 'modal');
    },
  };
});

jest.mock('@/services/demo/DemoContentService', () => ({
  DemoContentService: {
    listCompareSamples: (...args: unknown[]) => mockListSamples(...args),
    findCompareById: (...args: unknown[]) => mockFindCompareById(...args),
    getCompareSampleForProviders: jest.fn(),
  },
  __esModule: true,
  default: {
    listCompareSamples: (...args: unknown[]) => mockListSamples(...args),
    findCompareById: (...args: unknown[]) => mockFindCompareById(...args),
    getCompareSampleForProviders: jest.fn(),
  },
}));

jest.mock('@/services/demo/DemoPlaybackRouter', () => ({
  loadCompareScript: (...args: unknown[]) => mockLoadCompareScript(...args),
  primeNextCompareTurn: (...args: unknown[]) => mockPrimeNextCompareTurn(...args),
  hasNextCompareTurn: (...args: unknown[]) => mockHasNextCompareTurn(...args),
}));

jest.mock('@/services/demo/RecordController', () => ({
  RecordController: {
    isActive: jest.fn().mockReturnValue(false),
    recordUserMessage: jest.fn(),
    recordAssistantMessage: jest.fn(),
    recordAssistantChunk: jest.fn(),
    startCompare: jest.fn(),
    stop: jest.fn(),
  },
}));

jest.mock('@/services/chat/StorageService', () => ({
  StorageService: {
    loadSession: jest.fn(),
    saveSession: jest.fn(),
    enforceStorageLimits: jest.fn(),
  },
}));

jest.mock('@/services/chat', () => ({
  PromptBuilder: {
    appendPersonaGuidance: jest.fn((text: string) => text),
  },
}));

jest.mock('@/services/streaming/StreamingService', () => ({
  getStreamingService: () => ({
    streamResponse: jest.fn(),
    cancelAllStreams: jest.fn(),
  }),
}));

jest.mock('@/components/organisms/demo/CompareRecordPickerModal', () => ({
  CompareRecordPickerModal: () => null,
}));

jest.mock('@/components/organisms', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Header: (props: any) => {
      mockHeaderProps = props;
      return React.createElement(Text, { testID: 'header' }, 'header');
    },
    HeaderActions: () => React.createElement(Text, { testID: 'header-actions' }, 'actions'),
    CompareSplitView: (props: any) => {
      mockCompareSplitViewProps = props;
      return React.createElement(Text, { testID: 'compare-split' }, 'split');
    },
    CompareUserMessage: ({ message }: { message: Message }) => (
      React.createElement(Text, { testID: 'compare-user-message' }, message.content)
    ),
  };
});

jest.mock('@/components/organisms/chat', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    ChatInputBar: (props: any) => {
      mockChatInputProps = props;
      return React.createElement(Text, { testID: 'chat-input' }, 'chat-input');
    },
  };
});

jest.mock('@/components/organisms/demo/DemoSamplesBar', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    DemoSamplesBar: (props: any) => {
      mockDemoSamplesProps = props;
      return React.createElement(Text, { testID: 'demo-samples' }, props.label || 'Demo Samples');
    },
  };
});

jest.mock('@/components/molecules/subscription/DemoBanner', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    DemoBanner: (props: any) => {
      mockDemoBannerProps = props;
      return React.createElement(Text, { testID: 'demo-banner', onPress: props.onPress }, 'demo-banner');
    },
    __esModule: true,
    default: (props: any) => {
      mockDemoBannerProps = props;
      return React.createElement(Text, { testID: 'demo-banner', onPress: props.onPress }, 'demo-banner');
    },
  };
});

const CompareScreen = require('@/screens/CompareScreen').default;

type CompareRouteParams = {
  leftAI?: AIConfig;
  rightAI?: AIConfig;
  sessionId?: string;
  resuming?: boolean;
  demoSampleId?: string;
};

type RenderOptions = {
  params?: Partial<CompareRouteParams>;
  featureAccess?: Record<string, unknown>;
  preloadedState?: Partial<RootState>;
  aiServiceOverrides?: Partial<{
    getAdapter: jest.Mock;
    setPersonality: jest.Mock;
    sendMessage: jest.Mock;
  }>;
  store?: AppStore;
};

let navigation: { navigate: jest.Mock; goBack: jest.Mock };

const mergeState = <T extends Record<string, any>>(base: T, overrides?: Partial<T>): T => {
  if (!overrides) return base;
  const result: Record<string, any> = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const baseValue = (base as Record<string, any>)[key] ?? {};
      result[key] = mergeState(baseValue, value as Record<string, any>);
    } else {
      result[key] = value;
    }
  }
  return result as T;
};

const renderScreen = (options: RenderOptions = {}) => {
  const { params, featureAccess, preloadedState, aiServiceOverrides, store: providedStore } = options;

  const aiService = {
    getAdapter: jest.fn().mockReturnValue({ config: {} }),
    setPersonality: jest.fn(),
    sendMessage: jest.fn().mockResolvedValue({ response: 'response', modelUsed: 'model' }),
    ...aiServiceOverrides,
  };

  mockUseAIService.mockReturnValue({
    aiService,
    isInitialized: true,
    isLoading: false,
    error: null,
    reinitialize: jest.fn(),
  });

  mockFeatureAccess.mockReturnValue({ isDemo: false, ...featureAccess });

  let store: AppStore;
  if (providedStore) {
    store = providedStore;
  } else {
    const baseState = createAppStore().getState();
    const mergedState = mergeState(baseState, preloadedState ? preloadedState : undefined);
    store = createAppStore(mergedState);
  }

  const routeParams: CompareRouteParams = {
    leftAI,
    rightAI,
    ...params,
  };

  const route = { params: routeParams } as { params: CompareRouteParams };

  const renderResult = renderWithProviders(
    <CompareScreen navigation={navigation as any} route={route as any} />,
    { store }
  );

  return { renderResult, store: renderResult.store, aiService };
};

const createResumedSession = (overrides: Partial<ChatSession> = {}): ChatSession & { hasDiverged?: boolean; continuedWithAI?: string } => ({
  id: 'compare-session',
  selectedAIs: [leftAI, rightAI],
  messages: [
    { id: 'm1', sender: 'You', senderType: 'user', content: 'Prompt', timestamp: 1 },
    { id: 'm2', sender: leftAI.name, senderType: 'ai', content: 'Left answer', timestamp: 2 },
    { id: 'm3', sender: rightAI.name, senderType: 'ai', content: 'Right answer', timestamp: 3 },
  ],
  isActive: false,
  createdAt: Date.now(),
  sessionType: 'comparison',
  topic: 'Topic',
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  navigation = { navigate: jest.fn(), goBack: jest.fn() };
  mockHeaderProps = undefined;
  mockCompareSplitViewProps = undefined;
  mockDemoSamplesProps = undefined;
  mockChatInputProps = undefined;
  mockDemoBannerProps = undefined;
  mockImageModalProps = undefined;
  mockListSamples.mockResolvedValue([]);
  mockFindCompareById.mockResolvedValue(null);
  mockLoadCompareScript.mockReset();
  mockPrimeNextCompareTurn.mockReset().mockReturnValue({ user: 'Next message' });
  mockHasNextCompareTurn.mockReset().mockReturnValue(false);
  mockGenerateImage.mockReset().mockResolvedValue([
    { url: 'https://example.com/image.png', mimeType: 'image/png' },
  ]);
  mockUseMergedAvailability.mockImplementation(() => ({
    imageUpload: { supported: true },
    documentUpload: { supported: false },
    voiceInput: { supported: false },
    voiceOutput: { supported: false },
    realtime: { supported: false },
    imageGeneration: { supported: true },
    videoGeneration: { supported: false },
  }));
  mockUseMergedAvailabilityStrict.mockImplementation(() => ({
    imageUpload: { supported: true },
    documentUpload: { supported: false },
    voiceInput: { supported: false },
    voiceOutput: { supported: false },
    realtime: { supported: false },
    imageGeneration: { supported: true },
    videoGeneration: { supported: false },
  }));
});

describe('CompareScreen', () => {
  it('renders header and resumed comparison state with divergent session', async () => {
    const session = createResumedSession({ hasDiverged: true, continuedWithAI: leftAI.name });
    const preloadedState: Partial<RootState> = {
      chat: {
        currentSession: session,
      } as any,
    };

    renderScreen({ params: { resuming: true }, preloadedState });

    expect(mockHeaderProps).toBeDefined();
    expect(mockHeaderProps.subtitle).toBe(`${leftAI.name} vs ${rightAI.name}`);
    expect(mockCompareSplitViewProps).toBeDefined();
    expect(mockCompareSplitViewProps.viewMode).toBe('left-only');
    expect(mockCompareSplitViewProps.leftMessages[0].content).toBe('Left answer');
    expect(mockCompareSplitViewProps.continuedSide).toBe('left');
    expect(mockChatInputProps.placeholder).toContain(leftAI.name);
  });

  it('navigates back when a required AI is missing', () => {
    renderScreen({ params: { rightAI: undefined } });
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('dispatches subscription sheet when demo banner is pressed', async () => {
    const store = createAppStore();
    const dispatchSpy = jest.spyOn(store, 'dispatch');

    renderScreen({ featureAccess: { isDemo: true }, store });

    await act(async () => {
      mockDemoBannerProps.onPress();
    });

    expect(dispatchSpy).toHaveBeenCalledWith(showSheet({ sheet: 'subscription' }));
  });

  it('loads demo sample and sends scripted turn on selection', async () => {
    const sample = { id: 'sample-1', title: 'Demo Sample' };
    mockListSamples.mockResolvedValue([sample]);
    mockFindCompareById.mockResolvedValue(sample);

    const { aiService } = renderScreen({ featureAccess: { isDemo: true } });

    await waitFor(() => expect(mockDemoSamplesProps).toBeDefined());

    await act(async () => {
      await mockDemoSamplesProps.onSelect('sample-1');
    });

    expect(mockFindCompareById).toHaveBeenCalledWith('sample-1');
    expect(mockLoadCompareScript).toHaveBeenCalledWith(sample);
    expect(mockPrimeNextCompareTurn).toHaveBeenCalled();
    await waitFor(() => {
      expect(aiService.sendMessage).toHaveBeenCalledTimes(2);
      expect(aiService.sendMessage).toHaveBeenCalledWith(leftAI.provider, expect.any(String), expect.any(Array), false, undefined, undefined, leftAI.model);
      expect(aiService.sendMessage).toHaveBeenCalledWith(rightAI.provider, expect.any(String), expect.any(Array), false, undefined, undefined, rightAI.model);
    });
  });

  it('prompts before starting over', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    renderScreen();

    act(() => {
      mockHeaderProps.onBack();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Start Over',
      expect.stringContaining('end the current comparison'),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel' }),
        expect.objectContaining({ text: 'Start Over', onPress: expect.any(Function) }),
      ]),
    );

    alertSpy.mockRestore();
  });

  describe('parallel image generation', () => {
    it('enables image generation when both providers support it', () => {
      mockUseMergedAvailabilityStrict.mockReturnValue({
        imageUpload: { supported: true },
        documentUpload: { supported: false },
        voiceInput: { supported: false },
        imageGeneration: { supported: true },
        videoGeneration: { supported: false },
      });

      renderScreen();

      expect(mockChatInputProps.imageGenerationEnabled).toBe(true);
    });

    it('disables image generation when one provider does not support it', () => {
      mockUseMergedAvailabilityStrict.mockReturnValue({
        imageUpload: { supported: true },
        documentUpload: { supported: false },
        voiceInput: { supported: false },
        imageGeneration: { supported: false }, // Strict merge returns false
        videoGeneration: { supported: false },
      });

      renderScreen();

      expect(mockChatInputProps.imageGenerationEnabled).toBe(false);
    });

    it('opens image modal when onOpenImageModal is called', async () => {
      renderScreen();

      await act(async () => {
        mockChatInputProps.onOpenImageModal();
      });

      await waitFor(() => {
        expect(mockImageModalProps.visible).toBe(true);
      });
    });

    it('generates images from both providers in parallel', async () => {
      const leftImage = { url: 'https://left.ai/image.png', mimeType: 'image/png' };
      const rightImage = { url: 'https://right.ai/image.png', mimeType: 'image/png' };

      mockGenerateImage
        .mockResolvedValueOnce([leftImage])
        .mockResolvedValueOnce([rightImage]);

      renderScreen({
        preloadedState: {
          settings: {
            apiKeys: { anthropic: 'left-key', openai: 'right-key' },
          } as any,
        },
      });

      await act(async () => {
        mockChatInputProps.onOpenImageModal();
      });

      await act(async () => {
        await mockImageModalProps.onGenerate({ prompt: 'A beautiful sunset', size: 'square' });
      });

      // Should call ImageService for both providers
      expect(mockGenerateImage).toHaveBeenCalledTimes(2);
      expect(mockGenerateImage).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: leftAI.provider,
          apiKey: 'left-key',
          prompt: 'A beautiful sunset',
        })
      );
      expect(mockGenerateImage).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: rightAI.provider,
          apiKey: 'right-key',
          prompt: 'A beautiful sunset',
        })
      );
    });

    it('handles image generation errors gracefully for each provider', async () => {
      mockGenerateImage
        .mockResolvedValueOnce([{ url: 'https://left.ai/image.png', mimeType: 'image/png' }])
        .mockRejectedValueOnce(new Error('Right provider failed'));

      renderScreen({
        preloadedState: {
          settings: {
            apiKeys: { anthropic: 'left-key', openai: 'right-key' },
          } as any,
        },
      });

      await act(async () => {
        mockChatInputProps.onOpenImageModal();
      });

      await act(async () => {
        await mockImageModalProps.onGenerate({ prompt: 'Test image', size: 'square' });
      });

      // Both providers should be called
      expect(mockGenerateImage).toHaveBeenCalledTimes(2);

      // Split view should show success on left and error on right
      await waitFor(() => {
        // Left should have successful image
        expect(mockCompareSplitViewProps.leftMessages.some(
          (m: Message) => m.attachments?.some(a => a.uri?.includes('left.ai'))
        )).toBe(true);
        // Right should have error message
        expect(mockCompareSplitViewProps.rightMessages.some(
          (m: Message) => m.content?.includes('Image generation failed')
        )).toBe(true);
      });
    });

    it('closes image modal after generation starts', async () => {
      renderScreen({
        preloadedState: {
          settings: {
            apiKeys: { anthropic: 'left-key', openai: 'right-key' },
          } as any,
        },
      });

      await act(async () => {
        mockChatInputProps.onOpenImageModal();
      });

      expect(mockImageModalProps.visible).toBe(true);

      await act(async () => {
        await mockImageModalProps.onGenerate({ prompt: 'Test', size: 'square' });
      });

      await waitFor(() => {
        expect(mockImageModalProps.visible).toBe(false);
      });
    });

    it('shows subscription sheet when generating images in demo mode', async () => {
      const store = createAppStore();
      const dispatchSpy = jest.spyOn(store, 'dispatch');

      renderScreen({ featureAccess: { isDemo: true }, store });

      await act(async () => {
        mockChatInputProps.onOpenImageModal();
      });

      await act(async () => {
        await mockImageModalProps.onGenerate({ prompt: 'Test', size: 'square' });
      });

      expect(dispatchSpy).toHaveBeenCalledWith(showSheet({ sheet: 'subscription' }));
      expect(mockGenerateImage).not.toHaveBeenCalled();
    });
  });
});
