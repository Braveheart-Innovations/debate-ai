import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import type { AIConfig, Message } from '@/types';
import { addMessage, endStreaming, setRecordModeEnabled, updateMessage } from '@/store';
import type { RootState } from '@/store';

const mockUseAIService = jest.fn();

jest.mock('@/providers/AIServiceProvider', () => ({
  useAIService: (...args: unknown[]) => mockUseAIService(...args),
}));

const mockUseChatSession = jest.fn();
const mockUseChatMessages = jest.fn();
const mockUseChatInput = jest.fn();
const mockUseAIResponses = jest.fn();
const mockUseMentions = jest.fn();
const mockUseQuickStart = jest.fn();

jest.mock('@/hooks/chat', () => ({
  useChatSession: (...args: unknown[]) => mockUseChatSession(...args),
  useChatMessages: (...args: unknown[]) => mockUseChatMessages(...args),
  useChatInput: (...args: unknown[]) => mockUseChatInput(...args),
  useAIResponsesWithStreaming: (...args: unknown[]) => mockUseAIResponses(...args),
  useMentions: (...args: unknown[]) => mockUseMentions(...args),
  useQuickStart: (...args: unknown[]) => mockUseQuickStart(...args),
}));

const mockMergedAvailability = jest.fn();

jest.mock('@/hooks/multimodal/useModalityAvailability', () => ({
  useMergedModalityAvailability: (...args: unknown[]) => mockMergedAvailability(...args),
}));

const mockUseFeatureAccess = jest.fn();

jest.mock('@/hooks/useFeatureAccess', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockUseFeatureAccess(...args),
  useFeatureAccess: (...args: unknown[]) => mockUseFeatureAccess(...args),
}));

const mockGetAttachmentSupport = jest.fn();

jest.mock('@/utils/attachmentUtils', () => ({
  getAttachmentSupport: (...args: unknown[]) => mockGetAttachmentSupport(...args),
}));

let mockHeaderProps: any;
let mockChatInputBarProps: any;
let mockMessageListProps: any;
let mockTypingIndicatorsProps: any;
let mockMentionSuggestionsProps: any;
let mockDemoBannerProps: any;
let mockDemoSamplesBarProps: any;
let mockImageModalProps: any;
let mockTopicPickerProps: any;

jest.mock('@/components/organisms', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    AIServiceLoading: ({ error }: { error?: string }) =>
      React.createElement(Text, { testID: 'ai-service-loading' }, error ? `error:${error}` : 'loading'),
    Header: (props: any) => {
      mockHeaderProps = props;
      return React.createElement(Text, { testID: 'header-back', onPress: props.onBack }, 'Header');
    },
    HeaderActions: () => React.createElement(Text, null, 'actions'),
  };
});

jest.mock('@/components/organisms/chat', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    ChatMessageList: (props: any) => {
      mockMessageListProps = props;
      return React.createElement(Text, { testID: 'chat-message-list' }, 'list');
    },
    ChatInputBar: (props: any) => {
      mockChatInputBarProps = props;
      return React.createElement(Text, { testID: 'chat-input-bar' }, 'input');
    },
    ChatTypingIndicators: (props: any) => {
      mockTypingIndicatorsProps = props;
      return React.createElement(Text, { testID: 'typing-indicators' }, 'typing');
    },
    ChatMentionSuggestions: (props: any) => {
      mockMentionSuggestionsProps = props;
      return React.createElement(Text, { testID: 'mention-suggestions' }, 'mentions');
    },
    ChatWarnings: () => React.createElement(Text, { testID: 'chat-warnings' }, 'warnings'),
  };
});

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

jest.mock('@/components/organisms/demo/DemoSamplesBar', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    DemoSamplesBar: (props: any) => {
      mockDemoSamplesBarProps = props;
      return React.createElement(Text, { testID: 'demo-samples', onPress: () => props.onSelect?.(props.samples?.[0]?.id) }, 'samples');
    },
  };
});

jest.mock('@/components/organisms/demo/ChatTopicPickerModal', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    ChatTopicPickerModal: (props: any) => {
      mockTopicPickerProps = props;
      return React.createElement(Text, { testID: 'topic-picker' }, props.visible ? 'visible' : 'hidden');
    },
  };
});

jest.mock('@/components/molecules/subscription/DemoBanner', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    DemoBanner: (props: any) => {
      mockDemoBannerProps = props;
      return React.createElement(Text, { testID: 'demo-banner', onPress: props.onPress }, 'banner');
    },
  };
});

const mockGenerateImage = jest.fn();

jest.mock('@/services/images/ImageService', () => ({
  ImageService: {
    generateImage: (...args: unknown[]) => mockGenerateImage(...args),
  },
}));

const mockDemoContentService = {
  findChatById: jest.fn(),
  listChatSamples: jest.fn(),
  comboKey: jest.fn(),
};

jest.mock('@/services/demo/DemoContentService', () => ({
  __esModule: true,
  DemoContentService: mockDemoContentService,
  default: mockDemoContentService,
}));

const mockDemoPlaybackRouter = {
  loadChatScript: jest.fn(),
  primeNextChatTurn: jest.fn(),
  hasNextChatTurn: jest.fn(),
  isTurnComplete: jest.fn(),
};

jest.mock('@/services/demo/DemoPlaybackRouter', () => ({
  loadChatScript: (...args: unknown[]) => mockDemoPlaybackRouter.loadChatScript(...args),
  primeNextChatTurn: (...args: unknown[]) => mockDemoPlaybackRouter.primeNextChatTurn(...args),
  hasNextChatTurn: (...args: unknown[]) => mockDemoPlaybackRouter.hasNextChatTurn(...args),
  isTurnComplete: (...args: unknown[]) => mockDemoPlaybackRouter.isTurnComplete(...args),
}));

const mockRecordController = {
  isActive: jest.fn(),
  startChat: jest.fn(),
  stop: jest.fn(),
  recordUserMessage: jest.fn(),
};

jest.mock('@/services/demo/RecordController', () => ({
  RecordController: mockRecordController,
}));

const mockAppendToPack = jest.fn();

jest.mock('@/services/demo/AppendToPackService', () => ({
  __esModule: true,
  default: {
    append: (...args: unknown[]) => mockAppendToPack(...args),
  },
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file://cache/',
  writeAsStringAsync: jest.fn(),
  EncodingType: { UTF8: 'utf8' },
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  shareAsync: jest.fn(),
}));

const Clipboard = require('expo-clipboard');
const FileSystem = require('expo-file-system');
const Sharing = require('expo-sharing');

const mockShowTrialCTA = jest.fn();

jest.mock('@/utils/demoGating', () => ({
  showTrialCTA: (...args: unknown[]) => mockShowTrialCTA(...args),
}));

const mockStreamingCancel = jest.fn();

jest.mock('@/services/streaming/StreamingService', () => ({
  getStreamingService: () => ({
    cancelAllStreams: (...args: unknown[]) => mockStreamingCancel(...args),
  }),
}));

const ChatScreen = require('@/screens/ChatScreen').default;

describe('ChatScreen', () => {
  let navigation: { goBack: jest.Mock; navigate: jest.Mock };
  let route: { params: { sessionId: string; searchTerm?: string } };
  let alertSpy: jest.SpyInstance;
  let selectedAIs: AIConfig[];
  let mockSession: any;
  let mockMessages: any;
  let mockInput: any;
  let mockMentionsApi: any;
  let mockAIResponsesData: any;
  let mockQuickStartData: any;

  const buildFeatureAccess = (overrides: Record<string, unknown> = {}) => ({
    loading: false,
    membershipStatus: 'demo',
    trialDaysRemaining: null,
    canAccessLiveAI: false,
    isInTrial: false,
    isPremium: false,
    isDemo: false,
    refresh: jest.fn(),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    navigation = {
      goBack: jest.fn(),
      navigate: jest.fn(),
    } as { goBack: jest.Mock; navigate: jest.Mock };

    route = {
      params: {
        sessionId: 'session-1',
        searchTerm: 'demo',
      },
    };

    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    selectedAIs = [
      {
        id: 'claude',
        name: 'Claude',
        provider: 'anthropic',
        model: 'claude-3-opus',
        color: '#000',
      },
      {
        id: 'gpt4',
        name: 'GPT-4',
        provider: 'openai',
        model: 'gpt-4-turbo',
        color: '#111',
      },
    ];

    mockSession = {
      currentSession: {
        id: 'session-1',
        selectedAIs,
        messages: [],
        isActive: true,
        sessionType: 'chat',
      },
      selectedAIs,
      isActive: true,
      sessionId: 'session-1',
      loadSession: jest.fn().mockResolvedValue(undefined),
      saveSession: jest.fn().mockResolvedValue(undefined),
      endSession: jest.fn(),
    };

    mockMessages = {
      messages: [],
      flatListRef: { current: null },
      sendMessage: jest.fn(),
      scrollToBottom: jest.fn(),
      scrollToMessage: jest.fn(),
      hasMessages: false,
      lastMessage: null,
      getMessageStats: jest.fn(),
    };

    mockInput = {
      inputText: 'Hello world  ',
      setInputText: jest.fn(),
      handleInputChange: jest.fn(),
      clearInput: jest.fn(),
      dismissKeyboard: jest.fn(),
    };

    mockMentionsApi = {
      showMentions: false,
      setShowMentions: jest.fn(),
      insertMention: jest.fn(),
      parseMentions: jest.fn().mockReturnValue(['claude']),
      detectMentionTrigger: jest.fn((text: string) => text.includes('@')),
    };

    mockAIResponsesData = {
      typingAIs: ['Claude'],
      isProcessing: false,
      sendAIResponses: jest.fn().mockResolvedValue(undefined),
      sendQuickStartResponses: jest.fn().mockResolvedValue(undefined),
    };

    mockQuickStartData = {
      hasInitialPrompt: false,
      shouldAutoSend: false,
      initialPromptSent: false,
      handleQuickStart: jest.fn(),
      resetQuickStart: jest.fn(),
    };

    mockUseChatSession.mockReturnValue(mockSession);
    mockUseChatMessages.mockReturnValue(mockMessages);
    mockUseChatInput.mockReturnValue(mockInput);
    mockUseMentions.mockReturnValue(mockMentionsApi);
    mockUseAIResponses.mockReturnValue(mockAIResponsesData);
    mockUseQuickStart.mockReturnValue(mockQuickStartData);

    mockUseFeatureAccess.mockReturnValue(buildFeatureAccess());

    mockUseAIService.mockReturnValue({
      aiService: {},
      isInitialized: true,
      isLoading: false,
      error: undefined,
    });

    mockMergedAvailability.mockReturnValue({
      imageGeneration: { supported: true },
      imageUpload: { supported: false },
      documentUpload: { supported: true },
      videoGeneration: { supported: false },
      voiceInput: { supported: true },
    });

    mockGetAttachmentSupport.mockReturnValue({ images: true, documents: false });

    mockDemoContentService.findChatById.mockResolvedValue(null);
    mockDemoContentService.listChatSamples.mockReturnValue([]);
    mockDemoContentService.comboKey.mockReturnValue('anthropic-openai');

    mockDemoPlaybackRouter.loadChatScript.mockResolvedValue(undefined);
    mockDemoPlaybackRouter.primeNextChatTurn.mockReturnValue({ user: 'Hello', providers: [] });
    mockDemoPlaybackRouter.hasNextChatTurn.mockReturnValue(false);
    mockDemoPlaybackRouter.isTurnComplete.mockReturnValue(true);

    mockRecordController.isActive.mockReturnValue(false);
    mockRecordController.stop.mockReturnValue({ session: null });

    mockGenerateImage.mockResolvedValue([
      {
        url: 'https://example.com/image.png',
        mimeType: 'image/png',
      },
    ]);

    mockAppendToPack.mockResolvedValue({ ok: true });

    mockStreamingCancel.mockClear();
    mockHeaderProps = undefined;
    mockChatInputBarProps = undefined;
    mockMessageListProps = undefined;
    mockTypingIndicatorsProps = undefined;
    mockMentionSuggestionsProps = undefined;
    mockDemoBannerProps = undefined;
    mockDemoSamplesBarProps = undefined;
    mockImageModalProps = undefined;
    mockTopicPickerProps = undefined;
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('renders loading state while AI service initializes', () => {
    mockUseAIService.mockReturnValue({
      aiService: null,
      isInitialized: false,
      isLoading: true,
      error: 'not-ready',
    });

    const { getByTestId } = renderWithProviders(
      <ChatScreen navigation={navigation} route={route} />
    );

    expect(getByTestId('ai-service-loading')).toBeTruthy();
    expect(mockHeaderProps).toBeUndefined();
  });

  it('renders chat layout and wires primary interactions', async () => {
    const { getByTestId, store } = renderWithProviders(
      <ChatScreen navigation={navigation} route={route} />
    );

    expect(getByTestId('chat-message-list')).toBeTruthy();
    expect(mockHeaderProps.title).toBe('AI Conversation');
    expect(mockHeaderProps.subtitle).toBe('Claude meets GPT-4');

    fireEvent.press(getByTestId('header-back'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);

    expect(mockGetAttachmentSupport).toHaveBeenCalledWith(selectedAIs);
    expect(mockChatInputBarProps.attachmentSupport).toEqual({ images: true, documents: false });
    expect(mockChatInputBarProps.imageGenerationEnabled).toBe(true);

    act(() => {
      mockMessageListProps.onScrollToSearchResult(2);
    });
    expect(mockMessages.scrollToMessage).toHaveBeenCalledWith(2);

    expect(mockTypingIndicatorsProps.typingAIs).toEqual(['Claude']);

    act(() => {
      mockChatInputBarProps.onInputChange('Ping @');
    });
    expect(mockInput.handleInputChange).toHaveBeenCalledWith('Ping @');
    expect(mockMentionsApi.detectMentionTrigger).toHaveBeenCalledWith('Ping @');
    expect(mockMentionsApi.setShowMentions).toHaveBeenCalledWith(true);

    act(() => {
      mockMentionSuggestionsProps.onSelectMention('Claude');
    });
    expect(mockMentionsApi.insertMention).toHaveBeenCalledWith('Claude', 'Hello world  ', mockInput.setInputText);

    await act(async () => {
      await mockChatInputBarProps.onSend('Custom message');
    });

    expect(mockMentionsApi.parseMentions).toHaveBeenCalledWith('Custom message');
    expect(mockMessages.sendMessage).toHaveBeenCalledWith('Custom message', ['claude'], undefined);
    expect(mockInput.clearInput).toHaveBeenCalledTimes(1);
    expect(mockInput.dismissKeyboard).toHaveBeenCalledTimes(1);
    expect(mockAIResponsesData.sendAIResponses).toHaveBeenCalledTimes(1);

    await act(async () => {
      mockChatInputBarProps.onOpenImageModal();
    });

    await waitFor(() => {
      expect(mockImageModalProps.visible).toBe(true);
      expect(mockImageModalProps.initialPrompt).toBe('Hello world');
    });

    act(() => {
      mockImageModalProps.onClose();
    });

    await waitFor(() => {
      expect(mockImageModalProps.visible).toBe(false);
    });

    act(() => {
      mockChatInputBarProps.onStop();
    });
    expect(mockStreamingCancel).toHaveBeenCalledTimes(1);

    fireEvent.press(getByTestId('demo-banner'));
    expect(store.getState().navigation.activeSheet).toBe('subscription');

    await waitFor(() => {
      expect(mockSession.saveSession).toHaveBeenCalledTimes(1);
    });
  });

  it('prevents sending messages in demo mode and opens subscription sheet', async () => {
    mockUseFeatureAccess.mockReturnValue(buildFeatureAccess({ isDemo: true }));

    const { store } = renderWithProviders(
      <ChatScreen navigation={navigation} route={route} />,
      {
        preloadedState: {
          settings: {
            theme: 'auto',
            fontSize: 'medium',
            apiKeys: { openai: 'test-key' },
            realtimeRelayUrl: undefined,
            verifiedProviders: [],
            verificationTimestamps: {},
            verificationModels: {},
            expertMode: {},
            hasCompletedOnboarding: false,
            recordModeEnabled: false,
          },
        } as Partial<RootState>,
      }
    );

    await act(async () => {
      await mockChatInputBarProps.onSend('Demo message');
    });

    expect(store.getState().navigation.activeSheet).toBe('subscription');
    expect(mockMessages.sendMessage).not.toHaveBeenCalled();
    expect(mockAIResponsesData.sendAIResponses).not.toHaveBeenCalled();
  });

  it('auto plays provided demo sample when in demo mode', async () => {
    mockUseFeatureAccess.mockReturnValue(buildFeatureAccess({ isDemo: true }));
    route.params.demoSampleId = 'sample-123';

    const demoSample = { id: 'sample-123', transcript: [] };
    mockDemoContentService.findChatById.mockResolvedValue(demoSample);
    mockDemoPlaybackRouter.primeNextChatTurn.mockReturnValue({ user: 'Scripted intro', providers: ['anthropic'] });

    renderWithProviders(
      <ChatScreen navigation={navigation} route={route} />
    );

    await waitFor(() => {
      expect(mockDemoContentService.findChatById).toHaveBeenCalledWith('sample-123');
    });

    await waitFor(() => {
      expect(mockMessages.sendMessage).toHaveBeenCalledWith('Scripted intro', expect.arrayContaining(['claude']));
    });

    expect(mockAIResponsesData.sendAIResponses).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Scripted intro', sender: 'You' })
    );
  });

  it('opens topic picker in record mode and starts new recording', async () => {
    const { store } = renderWithProviders(
      <ChatScreen navigation={navigation} route={route} />,
      {
        preloadedState: {
          settings: {
            theme: 'auto',
            fontSize: 'medium',
            apiKeys: { openai: 'demo-key' },
            realtimeRelayUrl: undefined,
            verifiedProviders: [],
            verificationTimestamps: {},
            verificationModels: {},
            expertMode: {},
            hasCompletedOnboarding: false,
            recordModeEnabled: false,
          },
        } as Partial<RootState>,
      }
    );

    await act(async () => {
      store.dispatch(setRecordModeEnabled(true));
    });

    await waitFor(() => {
      expect(mockHeaderProps.actionButton?.label).toBe('Record');
    });

    act(() => {
      mockHeaderProps.actionButton.onPress();
    });

    expect(mockTopicPickerProps).toMatchObject({ visible: true });
    expect(mockTopicPickerProps.providers).toEqual(selectedAIs.map(ai => ai.provider));

    mockRecordController.startChat.mockImplementation(() => undefined);

    await act(async () => {
      await mockTopicPickerProps.onSelect('new:fresh-topic', 'Fresh Topic');
    });

    expect(mockRecordController.startChat).toHaveBeenCalledWith(expect.objectContaining({
      id: 'fresh-topic',
      title: 'Fresh Topic',
      comboKey: 'anthropic-openai',
    }));

    expect(mockTopicPickerProps.visible).toBe(false);

    await waitFor(() => {
      expect(mockHeaderProps.actionButton.label).toBe('Stop');
    });

    mockRecordController.stop.mockReturnValue({
      session: { id: 'recording-123', transcript: [] },
    } as any);
    (Clipboard.setStringAsync as jest.Mock).mockClear();
    (FileSystem.writeAsStringAsync as jest.Mock).mockResolvedValue(undefined);
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);

    await act(async () => {
      await mockHeaderProps.actionButton.onPress();
    });

    expect(mockRecordController.stop).toHaveBeenCalled();
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(expect.stringContaining('recording-123'));
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Recording captured',
      'Copied to clipboard, saved to a temp file, and printed to logs.',
      expect.any(Array),
    );

    const buttons = alertSpy.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    const appendButton = buttons.find(btn => btn.text === 'Append to Pack (dev)');

    await act(async () => {
      await appendButton?.onPress?.();
    });

    expect(mockAppendToPack).toHaveBeenCalledWith(expect.objectContaining({ id: 'recording-123' }));
    expect(alertSpy).toHaveBeenCalledWith('Appended', 'Recording appended to pack.');
  });

  it('prompts trial upgrade when generating images in demo mode', async () => {
    mockUseFeatureAccess.mockReturnValue(buildFeatureAccess({ isDemo: true }));
    mockShowTrialCTA.mockImplementation((navigateFn: (screen: string, params?: Record<string, unknown>) => void) => {
      navigateFn('Subscription');
    });

    renderWithProviders(
      <ChatScreen navigation={navigation} route={route} />
    );

    await act(async () => {
      mockChatInputBarProps.onOpenImageModal();
    });

    await act(async () => {
      await mockImageModalProps.onGenerate({ prompt: 'sketch', size: 'square' });
    });

    expect(mockShowTrialCTA).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ message: expect.stringContaining('Image generation requires') }));
    expect(navigation.navigate).toHaveBeenCalledWith('Subscription', undefined);
    expect(mockGenerateImage).not.toHaveBeenCalled();
  });

  it('records existing sample selection and plays scripted turn', async () => {
    mockUseFeatureAccess.mockReturnValue(buildFeatureAccess({ isDemo: true }));
    mockRecordController.startChat.mockImplementation(() => undefined);
    const sampleData = { id: 'sample-existing', transcript: [] };
    mockDemoContentService.findChatById.mockResolvedValue(sampleData as any);
    mockDemoPlaybackRouter.primeNextChatTurn.mockReturnValue({ user: 'Sample turn', providers: ['anthropic'] });

    const { store } = renderWithProviders(
      <ChatScreen navigation={navigation} route={route} />
    );

    await act(async () => {
      store.dispatch(setRecordModeEnabled(true));
    });

    await waitFor(() => {
      expect(mockHeaderProps.actionButton?.label).toBe('Record');
    });

    act(() => {
      mockHeaderProps.actionButton.onPress();
    });

    await act(async () => {
      await mockTopicPickerProps.onSelect('sample-existing', 'Existing Title');
    });

    expect(mockRecordController.startChat).toHaveBeenCalledWith(expect.objectContaining({
      id: expect.stringContaining('sample-existing_rec_'),
      title: 'Existing Title',
    }));
    expect(mockMessages.sendMessage).toHaveBeenCalledWith('Sample turn', expect.any(Array));
  });

  it('prevents sending blank messages', async () => {
    renderWithProviders(
      <ChatScreen navigation={navigation} route={route} />
    );

    await act(async () => {
      await mockChatInputBarProps.onSend('   ');
    });

    expect(mockMessages.sendMessage).not.toHaveBeenCalled();
  });

  it('skips send when session is unavailable', async () => {
    const sessionless = {
      ...mockSession,
      currentSession: null,
      selectedAIs: [],
    };
    mockUseChatSession.mockReturnValue(sessionless);

    renderWithProviders(
      <ChatScreen navigation={navigation} route={route} />
    );

    await act(async () => {
      await mockChatInputBarProps.onSend('Hello there');
    });

    expect(mockMessages.sendMessage).not.toHaveBeenCalled();
  });

  it('handles image generation lifecycle including retry and cancel', async () => {
    const originalAbortController = global.AbortController;
    const abortSpy = jest.fn();
    (global as any).AbortController = jest.fn(() => ({ abort: abortSpy, signal: Symbol('signal') })) as unknown as typeof AbortController;

    mockUseFeatureAccess.mockReturnValue(buildFeatureAccess({ isDemo: false }));
    mockGenerateImage.mockResolvedValue([
      { url: 'https://example.com/image.png', mimeType: 'image/png' },
    ]);

    const { store } = renderWithProviders(
      <ChatScreen navigation={navigation} route={route} />,
      {
        preloadedState: {
          settings: {
            theme: 'auto',
            fontSize: 'medium',
            apiKeys: { openai: 'test-key' },
            realtimeRelayUrl: undefined,
            verifiedProviders: [],
            verificationTimestamps: {},
            verificationModels: {},
            expertMode: {},
            hasCompletedOnboarding: false,
            recordModeEnabled: false,
          },
        } as Partial<RootState>,
      }
    );

    const dispatchSpy = jest.spyOn(store, 'dispatch');

    await act(async () => {
      mockChatInputBarProps.onOpenImageModal();
    });

    await act(async () => {
      await mockImageModalProps.onGenerate({ prompt: 'Create art', size: 'portrait' });
    });

    expect(mockGenerateImage).toHaveBeenCalledWith(expect.objectContaining({ size: '1024x1536', prompt: 'Create art' }));
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: addMessage.type, payload: expect.objectContaining({ content: 'Generating image…' }) }));
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: updateMessage.type,
      payload: expect.objectContaining({ attachments: [expect.objectContaining({ uri: 'https://example.com/image.png' })] }),
    }));

    const generatedAction = dispatchSpy.mock.calls.find(([action]) => action.type === addMessage.type);
    const messageId = generatedAction?.[0].payload.id as string;

    mockGenerateImage.mockClear();
    mockGenerateImage.mockResolvedValue([
      { url: 'https://example.com/second.png', mimeType: 'image/png' },
    ]);

    await act(async () => {
      await mockMessageListProps.onRetryImage({
        id: messageId,
        metadata: {
          providerMetadata: {
            imageParams: { prompt: 'Retry it', size: 'landscape' },
          },
        },
      } as any);
    });

    expect(mockGenerateImage).toHaveBeenCalledWith(expect.objectContaining({ size: '1536x1024', prompt: 'Retry it' }));

    act(() => {
      mockMessageListProps.onCancelImage({ id: messageId } as any);
    });

    expect(abortSpy).toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: updateMessage.type,
      payload: expect.objectContaining({ content: 'Generation cancelled.' }),
    }));

    mockGenerateImage.mockClear();
    mockGenerateImage.mockResolvedValue([
      { mimeType: 'image/png' } as any,
    ]);

    await act(async () => {
      await mockMessageListProps.onRetryImage({
        id: messageId,
        metadata: {
          providerMetadata: {
            imageParams: { prompt: 'No uri variant', size: 'auto' },
          },
        },
      } as any);
    });

    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: updateMessage.type,
      payload: expect.objectContaining({ content: 'Image generated.' }),
    }));

    (global as any).AbortController = originalAbortController;
  });

  it('surfaces image generation errors when provider fails', async () => {
    mockUseFeatureAccess.mockReturnValue(buildFeatureAccess({ isDemo: false }));
    mockGenerateImage.mockRejectedValueOnce(new Error('Service down'));

    const { store } = renderWithProviders(
      <ChatScreen navigation={navigation} route={route} />,
      {
        preloadedState: {
          settings: {
            theme: 'auto',
            fontSize: 'medium',
            apiKeys: { openai: 'demo-key' },
            realtimeRelayUrl: undefined,
            verifiedProviders: [],
            verificationTimestamps: {},
            verificationModels: {},
            expertMode: {},
            hasCompletedOnboarding: false,
            recordModeEnabled: false,
          },
        } as Partial<RootState>,
      }
    );

    const dispatchSpy = jest.spyOn(store, 'dispatch');

    await act(async () => {
      mockChatInputBarProps.onOpenImageModal();
    });

    await act(async () => {
      await mockImageModalProps.onGenerate({ prompt: 'Failure case', size: 'auto' });
    });

    expect(mockGenerateImage).toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: updateMessage.type,
      payload: expect.objectContaining({ content: expect.stringContaining('Failed to generate image: Service down') }),
    }));
  });

  it('invokes quick start handler when auto prompt is available', async () => {
    mockQuickStartData.hasInitialPrompt = true;
    mockQuickStartData.handleQuickStart = jest.fn();

    renderWithProviders(
      <ChatScreen navigation={navigation} route={route} />
    );

    await waitFor(() => {
      expect(mockQuickStartData.handleQuickStart).toHaveBeenCalledWith(
        mockAIResponsesData.sendQuickStartResponses,
        mockInput.setInputText,
        expect.any(Function),
      );
    });
  });

  it('loads demo samples and primes playback when a sample is selected', async () => {
    mockUseFeatureAccess.mockReturnValue(buildFeatureAccess({ isDemo: true }));
    const sampleList = [{ id: 'sample-abc', title: 'Sample ABC' }];
    const sampleData = { id: 'sample-abc', transcript: [] };
    mockDemoContentService.listChatSamples.mockResolvedValueOnce(sampleList);
    mockDemoContentService.findChatById.mockResolvedValue(sampleData as any);
    mockDemoPlaybackRouter.primeNextChatTurn.mockReturnValue({ user: 'Scripted sample', providers: ['anthropic'] });

    renderWithProviders(
      <ChatScreen navigation={navigation} route={route} />
    );

    await waitFor(() => {
      expect(mockDemoSamplesBarProps?.samples).toEqual(sampleList);
    });

    await act(async () => {
      await mockDemoSamplesBarProps.onSelect('sample-abc');
    });

    expect(mockDemoContentService.findChatById).toHaveBeenCalledWith('sample-abc');
    expect(mockDemoPlaybackRouter.primeNextChatTurn).toHaveBeenCalled();
    expect(mockMessages.sendMessage).toHaveBeenCalledWith('Scripted sample', expect.any(Array));
  });

  it('derives header subtitle from selected AI count', () => {
    const renderScenario = (ais: AIConfig[]) => {
      const override = {
        ...mockSession,
        selectedAIs: ais,
        currentSession: {
          ...mockSession.currentSession,
          selectedAIs: ais,
        },
      };
      mockUseChatSession.mockReturnValue(override);
      const result = renderWithProviders(
        <ChatScreen navigation={navigation} route={route} />
      );
      mockUseChatSession.mockReturnValue(mockSession);
      return result;
    };

    const noAI = renderScenario([]);
    expect(mockHeaderProps.subtitle).toBe('Preparing symposium');
    noAI.unmount();

    const singleAI = renderScenario([selectedAIs[0]]);
    expect(mockHeaderProps.subtitle).toBe('In dialogue with Claude');
    singleAI.unmount();

    const trio = renderScenario([
      selectedAIs[0],
      selectedAIs[1],
      { id: 'gemini', provider: 'google', name: 'Gemini', model: 'gemini-1.5', color: '#222' },
    ]);
    expect(mockHeaderProps.subtitle).toBe('Claude, GPT-4 & 1 more');
    trio.unmount();

    const quartet = renderScenario([
      selectedAIs[0],
      selectedAIs[1],
      { id: 'gemini', provider: 'google', name: 'Gemini', model: 'gemini-1.5', color: '#222' },
      { id: 'mistral', provider: 'mistral', name: 'Mistral', model: 'mistral-large', color: '#333' },
    ]);
    expect(mockHeaderProps.subtitle).toBe('Claude, GPT-4 & 2 others');
    quartet.unmount();
  });

  it('advances scripted chat turn after streaming responses complete', async () => {
    jest.useFakeTimers();
    const streamingState = {
      streamingMessages: {
        m1: {
          messageId: 'm1',
          content: '',
          isStreaming: true,
          startTime: 0,
          aiProvider: 'anthropic',
          cursorVisible: true,
          chunksReceived: 0,
          bytesReceived: 0,
        },
      },
      streamingPreferences: {
        claude: { enabled: true, supported: true },
        openai: { enabled: true, supported: true },
        google: { enabled: true, supported: true },
        mistral: { enabled: true, supported: true },
        perplexity: { enabled: true, supported: true },
        cohere: { enabled: true, supported: true },
        together: { enabled: true, supported: true },
        deepseek: { enabled: true, supported: true },
        grok: { enabled: true, supported: true },
      },
      globalStreamingEnabled: true,
      streamingSpeed: 'natural',
      activeStreamCount: 1,
      totalStreamsCompleted: 0,
      providerVerificationErrors: {},
    };

    mockUseFeatureAccess.mockReturnValue(buildFeatureAccess({ isDemo: true }));
    mockDemoPlaybackRouter.hasNextChatTurn.mockReturnValue(true);
    mockDemoPlaybackRouter.isTurnComplete.mockReturnValue(true);
    mockDemoPlaybackRouter.primeNextChatTurn.mockReturnValue({ user: 'Next scripted', providers: ['anthropic'] });

    try {
      const { store } = renderWithProviders(
        <ChatScreen navigation={navigation} route={route} />,
        { preloadedState: { streaming: streamingState } as Partial<RootState> }
      );

      await act(async () => {
        store.dispatch(endStreaming({ messageId: 'm1' }));
      });

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(mockMessages.sendMessage).toHaveBeenCalledWith('Next scripted', expect.any(Array));
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('falls back to advance scripted turn without active streams', async () => {
    jest.useFakeTimers();
    mockUseFeatureAccess.mockReturnValue(buildFeatureAccess({ isDemo: true }));
    mockDemoPlaybackRouter.hasNextChatTurn.mockReturnValue(true);
    mockDemoPlaybackRouter.isTurnComplete.mockReturnValue(true);
    mockDemoPlaybackRouter.primeNextChatTurn.mockReturnValue({ user: 'Fallback scripted', providers: [] });
    mockMessages.messages = [
      { id: 'ai-last', senderType: 'ai', content: 'Answer', timestamp: 1 } as Message,
    ];

    try {
      renderWithProviders(
        <ChatScreen navigation={navigation} route={route} />,
        {
          preloadedState: {
            streaming: {
              streamingMessages: {},
              streamingPreferences: {
                claude: { enabled: true, supported: true },
                openai: { enabled: true, supported: true },
                google: { enabled: true, supported: true },
                mistral: { enabled: true, supported: true },
                perplexity: { enabled: true, supported: true },
                cohere: { enabled: true, supported: true },
                together: { enabled: true, supported: true },
                deepseek: { enabled: true, supported: true },
                grok: { enabled: true, supported: true },
              },
              globalStreamingEnabled: true,
              streamingSpeed: 'natural',
              activeStreamCount: 0,
              totalStreamsCompleted: 0,
              providerVerificationErrors: {},
            },
          } as Partial<RootState>,
        }
      );

      await act(async () => {
        jest.advanceTimersByTime(400);
      });

      await waitFor(() => {
        expect(mockMessages.sendMessage).toHaveBeenCalledWith('Fallback scripted', expect.any(Array));
      });
    } finally {
      jest.useRealTimers();
      mockMessages.messages = [];
    }
  });
});
