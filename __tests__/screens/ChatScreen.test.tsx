import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import type { AIConfig } from '@/types';
import { setRecordModeEnabled } from '@/store';

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
    DemoSamplesBar: () => React.createElement(Text, { testID: 'demo-samples' }, 'samples'),
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
      <ChatScreen navigation={navigation} route={route} />
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
  });
});
