import { act } from '@testing-library/react-native';
import type { DebateSession } from '@/services/debate';
import { DebateStatus } from '@/services/debate';
import type { AI } from '@/types';
import type { RootState } from '@/store';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';

const mockInitializeDebate = jest.fn();
const mockReset = jest.fn();
const mockGetSession = jest.fn();

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

jest.mock('@/services/aiAdapter', () => ({
  AIService: jest.fn().mockImplementation(() => ({ getAdapter: jest.fn() })),
}));

describe('useDebateSession', () => {
  const participants: AI[] = [
    { id: 'claude', provider: 'claude', name: 'Claude', model: 'claude-3' },
    { id: 'gpt4', provider: 'openai', name: 'GPT-4o', model: 'gpt-4o' },
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
    currentAIIndex: 0,
    totalRounds: 3,
    civility: 1,
    format: { id: 'oxford', name: 'Oxford', description: '', defaultRounds: 3, phases: [], baseTurns: [], guidance: { opening: '', rebuttal: '', closing: '' } },
    stances: {},
  };

  const baseState: Partial<RootState> = {
    settings: {
      theme: 'auto',
      fontSize: 'medium',
      apiKeys: { claude: 'key' },
      realtimeRelayUrl: undefined,
      verifiedProviders: [],
      verificationTimestamps: {},
      verificationModels: {},
      expertMode: {},
      hasCompletedOnboarding: false,
      recordModeEnabled: false,
    },
  } as Partial<RootState>;

  beforeEach(() => {
    mockInitializeDebate.mockResolvedValue(mockSession);
    mockGetSession.mockReturnValue(mockSession);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('initializes debate session and updates redux state', async () => {
    const { result, store } = renderHookWithProviders(() => require('@/hooks/debate/useDebateSession').useDebateSession(participants), {
      preloadedState: baseState,
    });

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
