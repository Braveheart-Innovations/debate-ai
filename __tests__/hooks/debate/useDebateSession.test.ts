import { act, waitFor } from '@testing-library/react-native';
import type { DebateSession } from '@/services/debate';
import { DebateStatus } from '@/services/debate';
import type { AI } from '@/types';
import { buildApiKeyStatus } from '@/store';
import type { RootStateOverrides } from '../../../test-utils/services/state';
import { createMockAIConfig } from '../../../test-utils/fixtures';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';
import { getFormat, getPresetForFormat } from '@/config/debate/formats';
import { useDebateSession } from '@/hooks/debate/useDebateSession';

const mockInitializeDebate = jest.fn();
const mockReset = jest.fn();
const mockGetSession = jest.fn();

// Mock the AIServiceProvider context hook - must be before debate mock
const mockAIService = { getAdapter: jest.fn() };
jest.mock('@/providers/AIServiceProvider', () => ({
  useAIService: () => ({
    aiService: mockAIService,
    isInitialized: true,
    isLoading: false,
    error: null,
    reinitialize: jest.fn(),
  }),
}));

jest.mock('@/services/debate', () => {
  const actual = jest.requireActual('@/services/debate');
  return {
    ...actual,
    DebateOrchestrator: jest.fn().mockImplementation(() => ({
      initializeDebate: mockInitializeDebate,
      reset: mockReset,
      getSession: mockGetSession,
    })),
  };
});

describe('useDebateSession', () => {
  const participants: AI[] = [
    createMockAIConfig({ model: 'claude-3' }),
    createMockAIConfig({ id: 'gpt4', provider: 'openai', name: 'GPT-4o', model: 'gpt-4o' }),
  ];

  const mockSession: DebateSession = {
    id: 'debate_123',
    topic: 'AI in education',
    participants,
    personalities: {},
    startTime: Date.now(),
    status: DebateStatus.ACTIVE,
    currentRound: 1,
    messageCount: 0,
    messageIndex: 0,
    currentAIIndex: 0,
    totalRounds: 3,
    totalMessages: 6,
    civility: 1,
    format: getFormat('oxford'),
    preset: getPresetForFormat('oxford', 'short'),
    presetId: 'short',
    stances: {},
  };

  const baseState: RootStateOverrides = {
    settings: {
      apiKeys: { claude: buildApiKeyStatus('key') },
    },
  };

  beforeEach(() => {
    mockInitializeDebate.mockResolvedValue(mockSession);
    mockGetSession.mockReturnValue(mockSession);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('initializes debate session and updates redux state', async () => {
    const { result, store } = renderHookWithProviders(() => useDebateSession(participants), {
      preloadedState: baseState,
    });

    await waitFor(() => expect(result.current.orchestrator).not.toBeNull());

    await act(async () => {
      await result.current.initializeSession('AI in education', participants);
    });

    expect(mockInitializeDebate).toHaveBeenCalledWith('AI in education', participants, {}, undefined);
    expect(result.current.session?.id).toBe('debate_123');
    expect(result.current.status).toBe(DebateStatus.ACTIVE);
    expect(result.current.isInitialized).toBe(true);

    const chatSession = store.getState().chat.currentSession;
    expect(chatSession?.sessionType).toBe('debate');
    expect(store.getState().debateStats.currentDebate?.topic).toBe('AI in education');

    act(() => {
      result.current.resetSession();
    });

    expect(mockReset).toHaveBeenCalled();
    expect(result.current.session).toBeNull();
    expect(result.current.status).toBe(DebateStatus.IDLE);
  });
});
