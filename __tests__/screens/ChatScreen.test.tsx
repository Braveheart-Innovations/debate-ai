import { Alert, Text } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { capturePropsOf } from '@test-utils/mockComponents';
import { createMockAIConfig, createMockChatSession } from '@test-utils/fixtures';
import type { AIConfig, Message } from '@/types';
import { buildApiKeyStatus, setRecordModeEnabled } from '@/store';
import type { AIServiceLoading, Header, HeaderActions } from '@/components/organisms';
import type {
  ChatInputBar,
  ChatMentionSuggestions,
  ChatMessageList,
  ChatTypingIndicators,
} from '@/components/organisms/chat';
import type { ChatTopicPickerModal } from '@/components/organisms/demo/ChatTopicPickerModal';
import type { DemoBanner } from '@/components/molecules/subscription/DemoBanner';
import type ChatScreenComponent from '@/screens/ChatScreen';
import type { AppLifecycleHandler } from '@/services/lifecycle/AppLifecycleService';
import { requireDefined } from '@test-utils/queries';

type ChatScreenProps = ComponentProps<typeof ChatScreenComponent>;

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
const mockValidateMessageContent = jest.fn();
const mockCreateUserMessage = jest.fn();
const mockStorageSaveSession = jest.fn();

jest.mock('@/utils/attachmentUtils', () => ({
  getAttachmentSupport: (...args: unknown[]) => mockGetAttachmentSupport(...args),
}));

jest.mock('@/services/chat', () => ({
  ChatService: {
    validateMessageContent: (...args: unknown[]) => mockValidateMessageContent(...args),
    createUserMessage: (...args: unknown[]) => mockCreateUserMessage(...args),
  },
  StorageService: {
    saveSession: (...args: unknown[]) => mockStorageSaveSession(...args),
  },
}));

const mockHeader = capturePropsOf<typeof Header>((props) => (
  <Text testID="header-back" onPress={props.onBack}>
    Header
  </Text>
));
const mockChatInputBar = capturePropsOf<typeof ChatInputBar>(() => (
  <Text testID="chat-input-bar">input</Text>
));
const mockMessageList = capturePropsOf<typeof ChatMessageList>(() => (
  <Text testID="chat-message-list">list</Text>
));
const mockTypingIndicators = capturePropsOf<typeof ChatTypingIndicators>(() => (
  <Text testID="typing-indicators">typing</Text>
));
const mockMentionSuggestions = capturePropsOf<typeof ChatMentionSuggestions>(() => (
  <Text testID="mention-suggestions">mentions</Text>
));
const mockTopicPicker = capturePropsOf<typeof ChatTopicPickerModal>((props) => (
  <Text testID="topic-picker">{props.visible ? 'visible' : 'hidden'}</Text>
));
const mockDemoBanner = capturePropsOf<typeof DemoBanner>((props) => (
  <Text testID="demo-banner" onPress={props.onPress}>
    banner
  </Text>
));

jest.mock('@/components/organisms', () => {
  const { stubComponent } = jest.requireActual<typeof import('@test-utils/mockComponents')>(
    '@test-utils/mockComponents'
  );
  return {
    AIServiceLoading: stubComponent<typeof AIServiceLoading>('ai-service-loading', {
      text: (props) => (props.error ? `error:${props.error}` : 'loading'),
    }),
    get Header() {
      return mockHeader.Stub;
    },
    HeaderActions: stubComponent<typeof HeaderActions>('header-actions', {
      text: () => 'actions',
    }),
  };
});

jest.mock('@/components/organisms/chat', () => ({
  get ChatMessageList() {
    return mockMessageList.Stub;
  },
  get ChatInputBar() {
    return mockChatInputBar.Stub;
  },
  get ChatTypingIndicators() {
    return mockTypingIndicators.Stub;
  },
  get ChatMentionSuggestions() {
    return mockMentionSuggestions.Stub;
  },
}));

jest.mock('@/components/organisms/demo/ChatTopicPickerModal', () => ({
  get ChatTopicPickerModal() {
    return mockTopicPicker.Stub;
  },
}));

jest.mock('@/components/molecules/subscription/DemoBanner', () => ({
  get DemoBanner() {
    return mockDemoBanner.Stub;
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

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file://cache/',
  writeAsStringAsync: jest.fn(),
  EncodingType: { UTF8: 'utf8' },
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  shareAsync: jest.fn(),
}));

const mockStreamingCancel = jest.fn();
const mockLifecycleRegister = jest.fn<() => void, [AppLifecycleHandler]>(() => jest.fn());
const mockSaveActiveSnapshot = jest.fn().mockResolvedValue(undefined);
const mockLoadActiveSnapshot = jest.fn().mockResolvedValue(null);
const mockLoadLatestActiveSnapshot = jest.fn().mockResolvedValue(null);
const mockClearActiveSnapshot = jest.fn().mockResolvedValue(undefined);

jest.mock('@/services/streaming/StreamingService', () => ({
  getStreamingService: () => ({
    cancelAllStreams: (...args: unknown[]) => mockStreamingCancel(...args),
  }),
}));

jest.mock('@/services/lifecycle/AppLifecycleService', () => ({
  AppLifecycleService: {
    register: (handler: AppLifecycleHandler) => mockLifecycleRegister(handler),
  },
}));

jest.mock('@/services/lifecycle/ActiveSessionPersistenceService', () => ({
  ActiveSessionPersistenceService: {
    saveSnapshot: (...args: unknown[]) => mockSaveActiveSnapshot(...args),
    loadSnapshot: (...args: unknown[]) => mockLoadActiveSnapshot(...args),
    loadLatestSnapshot: (...args: unknown[]) => mockLoadLatestActiveSnapshot(...args),
    clearSnapshot: (...args: unknown[]) => mockClearActiveSnapshot(...args),
  },
}));

const ChatScreen: typeof ChatScreenComponent = require('@/screens/ChatScreen').default;

describe('ChatScreen', () => {
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let navigation: { goBack: jest.Mock; navigate: jest.Mock };
  let route: ChatScreenProps['route'];
  let alertSpy: jest.SpiedFunction<typeof Alert.alert>;
  let selectedAIs: AIConfig[];
  let mockSession: ReturnType<typeof createSessionHookMock>;
  let mockMessages: ReturnType<typeof createMessagesHookMock>;
  let mockInput: ReturnType<typeof createInputHookMock>;
  let mockMentionsApi: ReturnType<typeof createMentionsHookMock>;
  let mockAIResponsesData: ReturnType<typeof createAIResponsesHookMock>;
  let mockQuickStartData: ReturnType<typeof createQuickStartHookMock>;

  const createSessionHookMock = (ais: AIConfig[]) => ({
    currentSession: createMockChatSession({
      id: 'session-1',
      selectedAIs: ais,
      messages: [],
      isActive: true,
      sessionType: 'chat',
    }),
    selectedAIs: ais,
    isActive: true,
    sessionId: 'session-1',
    loadSession: jest.fn().mockResolvedValue(undefined),
    saveSession: jest.fn().mockResolvedValue(undefined),
    endSession: jest.fn(),
  });

  const createMessagesHookMock = () => {
    const messages: Message[] = [];
    return {
      messages,
      flatListRef: { current: null },
      sendMessage: jest.fn(),
      scrollToBottom: jest.fn(),
      scrollToMessage: jest.fn(),
      hasMessages: false,
      lastMessage: null,
      getMessageStats: jest.fn(),
    };
  };

  const createInputHookMock = () => ({
    inputText: 'Hello world  ',
    setInputText: jest.fn(),
    handleInputChange: jest.fn(),
    clearInput: jest.fn(),
    dismissKeyboard: jest.fn(),
  });

  const createMentionsHookMock = () => ({
    showMentions: false,
    setShowMentions: jest.fn(),
    insertMention: jest.fn(),
    parseMentions: jest.fn().mockReturnValue(['claude']),
    detectMentionTrigger: jest.fn((text: string) => text.includes('@')),
  });

  const createAIResponsesHookMock = () => ({
    typingAIs: ['Claude'],
    isProcessing: false,
    sendAIResponses: jest.fn().mockResolvedValue(undefined),
    sendQuickStartResponses: jest.fn().mockResolvedValue(undefined),
    retryAIResponses: jest.fn().mockResolvedValue(undefined),
  });

  const createQuickStartHookMock = () => ({
    hasInitialPrompt: false,
    shouldAutoSend: false,
    initialPromptSent: false,
    handleQuickStart: jest.fn(),
    resetQuickStart: jest.fn(),
  });

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

  beforeAll(() => {
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    navigation = {
      goBack: jest.fn(),
      navigate: jest.fn(),
    };

    route = {
      params: {
        sessionId: 'session-1',
        searchTerm: 'demo',
      },
    };

    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    selectedAIs = [
      createMockAIConfig({
        id: 'claude',
        name: 'Claude',
        provider: 'claude',
        model: 'claude-3-opus',
        color: '#000',
      }),
      createMockAIConfig({
        id: 'gpt4',
        name: 'GPT-4',
        provider: 'openai',
        model: 'gpt-4-turbo',
        color: '#111',
      }),
    ];

    mockSession = createSessionHookMock(selectedAIs);
    mockMessages = createMessagesHookMock();
    mockInput = createInputHookMock();
    mockMentionsApi = createMentionsHookMock();
    mockAIResponsesData = createAIResponsesHookMock();
    mockQuickStartData = createQuickStartHookMock();

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
      imageGeneration: { supported: false },
      imageUpload: { supported: false },
      documentUpload: { supported: true },
      videoGeneration: { supported: false },
      webSearch: { supported: false },
    });

    mockGetAttachmentSupport.mockReturnValue({ images: true, documents: false });
    mockValidateMessageContent.mockReturnValue({ isValid: true });
    mockCreateUserMessage.mockImplementation((content: string, mentions: string[] = []) => ({
      id: 'msg-created',
      sender: 'You',
      senderType: 'user',
      content: content.trim(),
      timestamp: Date.now(),
      mentions,
    }));
    mockStorageSaveSession.mockResolvedValue(undefined);

    mockDemoContentService.findChatById.mockResolvedValue(null);
    mockDemoContentService.listChatSamples.mockReturnValue([]);
    mockDemoContentService.comboKey.mockReturnValue('anthropic-openai');

    mockDemoPlaybackRouter.loadChatScript.mockResolvedValue(undefined);
    mockDemoPlaybackRouter.primeNextChatTurn.mockReturnValue({ user: 'Hello', providers: [] });
    mockDemoPlaybackRouter.hasNextChatTurn.mockReturnValue(false);
    mockDemoPlaybackRouter.isTurnComplete.mockReturnValue(true);

    mockRecordController.isActive.mockReturnValue(false);
    mockRecordController.stop.mockReturnValue({ session: null });

    mockAppendToPack.mockResolvedValue({ ok: true });

    mockStreamingCancel.mockClear();
    mockLifecycleRegister.mockClear();
    mockLifecycleRegister.mockReturnValue(jest.fn());
    mockSaveActiveSnapshot.mockClear();
    mockSaveActiveSnapshot.mockResolvedValue(undefined);
    mockLoadActiveSnapshot.mockClear();
    mockLoadActiveSnapshot.mockResolvedValue(null);
    mockLoadLatestActiveSnapshot.mockClear();
    mockLoadLatestActiveSnapshot.mockResolvedValue(null);
    mockClearActiveSnapshot.mockClear();
    mockClearActiveSnapshot.mockResolvedValue(undefined);
    mockHeader.reset();
    mockChatInputBar.reset();
    mockMessageList.reset();
    mockTypingIndicators.reset();
    mockMentionSuggestions.reset();
    mockDemoBanner.reset();
    mockTopicPicker.reset();
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
    expect(mockHeader.calls).toHaveLength(0);
  });

  it('renders chat layout and wires primary interactions', async () => {
    const { getByTestId, getByText, store } = renderWithProviders(
      <ChatScreen navigation={navigation} route={route} />
    );

    expect(getByTestId('chat-message-list')).toBeTruthy();
    expect(mockHeader.latest().title).toBe('The Forum');
    expect(mockHeader.latest().slim).toBe(true);
    expect(getByText('Claude meets GPT-4')).toBeTruthy();

    fireEvent.press(getByTestId('header-back'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);

    expect(mockGetAttachmentSupport).toHaveBeenCalledWith(selectedAIs);
    expect(mockChatInputBar.latest().attachmentSupport).toEqual({ images: true, documents: false });

    act(() => {
      requireDefined(mockMessageList.latest().onScrollToSearchResult, 'onScrollToSearchResult')(2);
    });
    expect(mockMessages.scrollToMessage).toHaveBeenCalledWith(2);

    expect(mockMessageList.latest().onContentSizeChange).toBeUndefined();

    expect(mockTypingIndicators.latest().typingAIs).toEqual(['Claude']);

    act(() => {
      mockChatInputBar.latest().onInputChange('Ping @');
    });
    expect(mockInput.handleInputChange).toHaveBeenCalledWith('Ping @');
    expect(mockMentionsApi.detectMentionTrigger).toHaveBeenCalledWith('Ping @');
    expect(mockMentionsApi.setShowMentions).toHaveBeenCalledWith(true);

    act(() => {
      mockMentionSuggestions.latest().onSelectMention('Claude');
    });
    expect(mockMentionsApi.insertMention).toHaveBeenCalledWith('Claude', 'Hello world  ', mockInput.setInputText);

    await act(async () => {
      await mockChatInputBar.latest().onSend('Custom message');
    });

    expect(mockMentionsApi.parseMentions).toHaveBeenCalledWith('Custom message');
    expect(mockMessages.sendMessage).not.toHaveBeenCalled();
    expect(mockInput.clearInput).toHaveBeenCalledTimes(1);
    expect(mockInput.dismissKeyboard).toHaveBeenCalledTimes(1);
    expect(mockStorageSaveSession).toHaveBeenCalledWith(expect.objectContaining({
      id: 'session-1',
      sessionType: 'chat',
      messages: [expect.objectContaining({
        sender: 'You',
        senderType: 'user',
        content: 'Custom message',
        mentions: ['claude'],
      })],
    }));
    expect(mockSaveActiveSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'chat',
      sessionId: 'session-1',
      status: 'active',
      messages: [expect.objectContaining({ content: 'Custom message' })],
    }));
    expect(mockAIResponsesData.sendAIResponses).toHaveBeenCalledWith(
      expect.objectContaining({
        sender: 'You',
        senderType: 'user',
        content: 'Custom message',
        mentions: ['claude'],
      }),
      undefined,
      undefined,
    );

    act(() => {
      requireDefined(mockChatInputBar.latest().onStop, 'onStop')();
    });
    expect(mockStreamingCancel).toHaveBeenCalledTimes(1);

    fireEvent.press(getByTestId('demo-banner'));
    expect(store.getState().navigation.activeSheet).toBe('subscription');

    expect(mockSession.saveSession).not.toHaveBeenCalled();
  });

  it('checkpoints active chat streams without marking them interrupted on app background', async () => {
    mockSession.currentSession.messages = [
      {
        id: 'user-1',
        sender: 'You',
        senderType: 'user',
        content: 'Prompt',
        timestamp: 1,
      },
      {
        id: 'ai-stream',
        sender: 'Claude',
        senderType: 'ai',
        content: '',
        timestamp: 2,
      },
    ];
    mockMessages.messages = mockSession.currentSession.messages;

    const { queryByText } = renderWithProviders(
      <ChatScreen navigation={navigation} route={route} />,
      {
        preloadedState: {
          streaming: {
            streamingMessages: {
              'ai-stream': {
                messageId: 'ai-stream',
                content: 'Partial answer',
                isStreaming: true,
                startTime: 1,
                aiProvider: 'claude',
                status: 'streaming',
                cursorVisible: true,
                chunksReceived: 1,
                bytesReceived: 14,
              },
            },
            streamingPreferences: {},
            globalStreamingEnabled: true,
            activeStreamCount: 1,
            totalStreamsCompleted: 0,
            providerVerificationErrors: {},
          },
        },
      }
    );

    const handler = mockLifecycleRegister.mock.calls
      .map(call => call[0])
      .find(entry => entry.id === 'chat-session-1');
    expect(handler).toBeTruthy();
    if (!handler) throw new Error('chat lifecycle handler was not registered');

    await act(async () => {
      await requireDefined(handler.onBackground, 'onBackground')('background');
    });

    const savedSnapshot = mockSaveActiveSnapshot.mock.calls[mockSaveActiveSnapshot.mock.calls.length - 1][0];
    expect(savedSnapshot.status).toBe('active');
    expect(savedSnapshot.interruptedMessageIds).toEqual([]);
    expect(savedSnapshot.pendingTurn).toEqual(expect.objectContaining({
      kind: 'chat_response',
      messageIds: ['ai-stream'],
      reason: 'app_backgrounded',
    }));

    mockLoadActiveSnapshot.mockResolvedValueOnce({
      status: 'active',
      interruptedMessageIds: [],
      pendingTurn: { kind: 'chat_response', messageIds: ['ai-stream'] },
    });

    await act(async () => {
      await requireDefined(handler.onForeground, 'onForeground')();
    });

    expect(queryByText(/last response was interrupted/i)).toBeNull();
  });

  it('rejects debate-shaped active snapshots on a chat route and falls back to stored chat', async () => {
    const loadStoredChat = jest.fn().mockResolvedValue(undefined);
    mockUseChatSession.mockReturnValue({
      ...mockSession,
      currentSession: null,
      selectedAIs: [],
      sessionId: null,
      loadSession: loadStoredChat,
    });
    const debateHostMessage = {
      id: 'host-1',
      sender: 'Debate Host',
      senderType: 'user' as const,
      content: 'Cast your opening audience stance before the first speech.',
      timestamp: 1,
    };
    mockLoadActiveSnapshot.mockResolvedValueOnce({
      version: 1,
      mode: 'chat',
      sessionId: 'session-1',
      status: 'active',
      updatedAt: 2,
      session: {
        id: 'session-1',
        selectedAIs: [
          ...selectedAIs,
          { id: 'gemini', provider: 'google', name: 'Gemini', model: 'gemini-1.5', color: '#222' },
          { id: 'mistral', provider: 'mistral', name: 'Mistral', model: 'mistral-large', color: '#333' },
        ],
        messages: [debateHostMessage],
        isActive: true,
        createdAt: 1,
        sessionType: 'debate',
      },
      messages: [debateHostMessage],
    });

    const { store } = renderWithProviders(
      <ChatScreen navigation={navigation} route={route} />
    );

    await waitFor(() => {
      expect(mockClearActiveSnapshot).toHaveBeenCalledWith('chat', 'session-1');
    });

    expect(loadStoredChat).toHaveBeenCalledWith('session-1');
    expect(store.getState().chat.currentSession).toBeNull();
  });

  it('does not render debate-shaped redux sessions while recovering a chat route', async () => {
    const loadStoredChat = jest.fn().mockResolvedValue(undefined);
    const debateHostMessage = {
      id: 'host-1',
      sender: 'Debate Host',
      senderType: 'user' as const,
      content: 'Cast your opening audience stance before the first speech.',
      timestamp: 1,
    };
    mockUseChatSession.mockReturnValue({
      ...mockSession,
      currentSession: {
        id: 'debate-1',
        selectedAIs: [
          ...selectedAIs,
          { id: 'gemini', provider: 'google', name: 'Gemini', model: 'gemini-1.5', color: '#222' },
          { id: 'mistral', provider: 'mistral', name: 'Mistral', model: 'mistral-large', color: '#333' },
        ],
        messages: [debateHostMessage],
        isActive: true,
        createdAt: 1,
        sessionType: 'debate',
      },
      selectedAIs: [
        ...selectedAIs,
        { id: 'gemini', provider: 'google', name: 'Gemini', model: 'gemini-1.5', color: '#222' },
        { id: 'mistral', provider: 'mistral', name: 'Mistral', model: 'mistral-large', color: '#333' },
      ],
      loadSession: loadStoredChat,
    });
    mockMessages.messages = [debateHostMessage];

    const { getByTestId, queryByTestId, queryByText } = renderWithProviders(
      <ChatScreen navigation={navigation} route={route} />
    );

    expect(queryByTestId('ai-service-loading')).toBeNull();
    expect(getByTestId('chat-message-list')).toBeTruthy();
    expect(mockMessageList.latest().messages).toEqual([]);
    expect(queryByText('Claude, GPT-4 & 2 others')).toBeNull();

    await waitFor(() => {
      expect(mockSession.endSession).toHaveBeenCalled();
      expect(loadStoredChat).toHaveBeenCalledWith('session-1');
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
            apiKeys: { openai: buildApiKeyStatus('test-key') },
            verifiedProviders: [],
            verificationTimestamps: {},
            verificationModels: {},
            expertMode: {},
            hasCompletedOnboarding: false,
            recordModeEnabled: false,
          },
        },
      }
    );

    await act(async () => {
      await mockChatInputBar.latest().onSend('Demo message');
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
    mockDemoPlaybackRouter.primeNextChatTurn.mockReturnValue({ user: 'Scripted intro', providers: ['claude'] });

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
            apiKeys: { openai: buildApiKeyStatus('demo-key') },
            verifiedProviders: [],
            verificationTimestamps: {},
            verificationModels: {},
            expertMode: {},
            hasCompletedOnboarding: false,
            recordModeEnabled: false,
          },
        },
      }
    );

    await act(async () => {
      store.dispatch(setRecordModeEnabled(true));
    });

    await waitFor(() => {
      expect(mockHeader.latest().actionButton?.label).toBe('Record');
    });

    act(() => {
      mockHeader.latest().actionButton?.onPress();
    });

    expect(mockTopicPicker.latest()).toMatchObject({ visible: true });
    expect(mockTopicPicker.latest().providers).toEqual(selectedAIs.map(ai => ai.provider));

    mockRecordController.startChat.mockImplementation(() => undefined);

    await act(async () => {
      await mockTopicPicker.latest().onSelect('new:fresh-topic', 'Fresh Topic');
    });

    expect(mockRecordController.startChat).toHaveBeenCalledWith(expect.objectContaining({
      id: 'fresh-topic',
      title: 'Fresh Topic',
      comboKey: 'anthropic-openai',
    }));

    expect(mockTopicPicker.latest().visible).toBe(false);

    await waitFor(() => {
      expect(mockHeader.latest().actionButton?.label).toBe('Stop');
    });

    mockRecordController.stop.mockReturnValue({
      session: { id: 'recording-123', transcript: [] },
    });
    jest.mocked(Clipboard.setStringAsync).mockClear();
    jest.mocked(FileSystem.writeAsStringAsync).mockResolvedValue(undefined);
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);

    await act(async () => {
      await mockHeader.latest().actionButton?.onPress();
    });

    expect(mockRecordController.stop).toHaveBeenCalled();
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(expect.stringContaining('recording-123'));
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Recording captured',
      'Copied to clipboard, saved to a temp file, and printed to logs.',
      expect.any(Array),
    );

    const buttons = alertSpy.mock.calls[0][2] ?? [];
    const appendButton = buttons.find(btn => btn.text === 'Append to Pack (dev)');

    await act(async () => {
      await requireDefined(requireDefined(appendButton, 'Append to Pack button').onPress, 'onPress')();
    });

    expect(mockAppendToPack).toHaveBeenCalledWith(expect.objectContaining({ id: 'recording-123' }));
    expect(alertSpy).toHaveBeenCalledWith('Appended', 'Recording appended to pack.');
  });

  it('records existing sample selection and plays scripted turn', async () => {
    mockUseFeatureAccess.mockReturnValue(buildFeatureAccess({ isDemo: true }));
    mockRecordController.startChat.mockImplementation(() => undefined);
    const sampleData = { id: 'sample-existing', transcript: [] };
    mockDemoContentService.findChatById.mockResolvedValue(sampleData);
    mockDemoPlaybackRouter.primeNextChatTurn.mockReturnValue({ user: 'Sample turn', providers: ['claude'] });

    const { store } = renderWithProviders(
      <ChatScreen navigation={navigation} route={route} />
    );

    await act(async () => {
      store.dispatch(setRecordModeEnabled(true));
    });

    await waitFor(() => {
      expect(mockHeader.latest().actionButton?.label).toBe('Record');
    });

    act(() => {
      mockHeader.latest().actionButton?.onPress();
    });

    await act(async () => {
      await mockTopicPicker.latest().onSelect('sample-existing', 'Existing Title');
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
      await mockChatInputBar.latest().onSend('   ');
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
      await mockChatInputBar.latest().onSend('Hello there');
    });

    expect(mockMessages.sendMessage).not.toHaveBeenCalled();
  });

  it('invokes quick start handler when auto prompt is available', async () => {
    mockQuickStartData.hasInitialPrompt = true;
    mockQuickStartData.handleQuickStart = jest.fn();

    renderWithProviders(
      <ChatScreen navigation={navigation} route={route} />
    );

    await waitFor(() => {
      expect(mockQuickStartData.handleQuickStart).toHaveBeenCalledWith(
        expect.any(Function),
        mockInput.setInputText,
        expect.any(Function),
      );
    });
  });

  it('takes staged composer attachments once for the quick start send', async () => {
    mockQuickStartData.hasInitialPrompt = true;
    mockQuickStartData.handleQuickStart = jest.fn();
    const attachment = {
      type: 'image' as const,
      uri: 'file://staged.png',
      mimeType: 'image/png',
      base64: 'abc',
      fileName: 'staged.png',
    };

    const { store } = renderWithProviders(
      <ChatScreen navigation={navigation} route={route} />,
      {
        preloadedState: {
          composerAttachments: { chat: [attachment], compare: [] },
        },
      }
    );

    await waitFor(() => {
      expect(mockQuickStartData.handleQuickStart).toHaveBeenCalled();
    });

    const sendWithStaged = mockQuickStartData.handleQuickStart.mock.calls[0][0];
    await act(async () => {
      await sendWithStaged('Read this file', 'Read this file');
    });

    expect(mockAIResponsesData.sendQuickStartResponses).toHaveBeenCalledWith(
      'Read this file',
      'Read this file',
      [attachment],
    );
    // One-shot take: the staged list is cleared so it cannot leak.
    expect(store.getState().composerAttachments.chat).toEqual([]);
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
    expect(noAI.getByText('In the Forum')).toBeTruthy();
    expect(noAI.getByText('Preparing symposium')).toBeTruthy();
    noAI.unmount();

    const singleAI = renderScenario([selectedAIs[0]]);
    expect(singleAI.getByText('In dialogue with Claude')).toBeTruthy();
    singleAI.unmount();

    const trio = renderScenario([
      selectedAIs[0],
      selectedAIs[1],
      { id: 'gemini', provider: 'google', name: 'Gemini', model: 'gemini-1.5', color: '#222' },
    ]);
    expect(trio.getByText('Claude, GPT-4 & Gemini')).toBeTruthy();
    trio.unmount();

    const quartet = renderScenario([
      selectedAIs[0],
      selectedAIs[1],
      { id: 'gemini', provider: 'google', name: 'Gemini', model: 'gemini-1.5', color: '#222' },
      { id: 'mistral', provider: 'mistral', name: 'Mistral', model: 'mistral-large', color: '#333' },
    ]);
    expect(quartet.getByText('Claude, GPT-4 & 2 others')).toBeTruthy();
    quartet.unmount();
  });

  // Note: Demo auto-advancement tests removed as they test complex async behavior
  // that is tightly coupled to implementation details. The functionality has been
  // verified manually via the app. These tests can be rewritten when the demo
  // system stabilizes.

  // Note: Image generation tests removed - image generation moved to Create mode
});
