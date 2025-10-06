import { act } from '@testing-library/react-native';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';
import { useSessionManagement } from '@/hooks/home/useSessionManagement';
import type { RootState } from '@/store';
import type { AIConfig } from '@/types';
import { SessionService } from '@/services/home/SessionService';

jest.mock('@/services/home/SessionService', () => ({
  SessionService: {
    validateSessionAIs: jest.fn(),
    prepareSessionData: jest.fn(),
    calculateSessionLimits: jest.fn(),
    validateSessionConfiguration: jest.fn(),
  },
}));

describe('useSessionManagement', () => {
  const mockValidateSessionAIs = SessionService.validateSessionAIs as jest.MockedFunction<typeof SessionService.validateSessionAIs>;
  const mockPrepareSessionData = SessionService.prepareSessionData as jest.MockedFunction<typeof SessionService.prepareSessionData>;
  const mockCalculateSessionLimits = SessionService.calculateSessionLimits as jest.MockedFunction<typeof SessionService.calculateSessionLimits>;
  const mockValidateSessionConfiguration = SessionService.validateSessionConfiguration as jest.MockedFunction<typeof SessionService.validateSessionConfiguration>;

  const selectedAIs: AIConfig[] = [
    {
      id: 'claude',
      provider: 'claude',
      name: 'Claude',
      model: 'claude-3-opus',
      personality: 'default',
      color: '#f5f5f5',
    },
  ];

  const baseState: Partial<RootState> = {
    chat: {
      currentSession: null,
      sessions: [],
      typingAIs: [],
      isLoading: false,
      aiPersonalities: { claude: 'analyst' },
      selectedModels: { claude: 'claude-3-sonnet' },
    },
  } as Partial<RootState>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    mockValidateSessionAIs.mockImplementation(() => undefined);
    mockPrepareSessionData.mockImplementation((ais, personalities, models) => ({
      selectedAIs: ais,
      aiPersonalities: personalities,
      selectedModels: models,
    }));
    mockCalculateSessionLimits.mockReturnValue(3);
    mockValidateSessionConfiguration.mockReturnValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('validates, prepares and dispatches session creation', () => {
    const { result, store } = renderHookWithProviders(() => useSessionManagement(), {
      preloadedState: baseState,
    });

    const sessionId = result.current.createSession(selectedAIs);

    expect(mockValidateSessionAIs).toHaveBeenCalledWith(selectedAIs);
    expect(mockPrepareSessionData).toHaveBeenCalledWith([
      {
        ...selectedAIs[0],
        model: 'claude-3-sonnet',
      },
    ], { claude: 'analyst' }, { claude: 'claude-3-sonnet' });

    const state = store.getState();
    expect(state.chat.sessions).toHaveLength(1);
    expect(state.chat.sessions[0].selectedAIs[0].model).toBe('claude-3-sonnet');
    expect(sessionId).toBe(`session_${Date.now()}`);
  });

  it('delegates validation helpers to SessionService', () => {
    const { result } = renderHookWithProviders(() => useSessionManagement(), {
      preloadedState: baseState,
    });

    expect(result.current.validateSession(selectedAIs)).toBe(true);
    expect(mockValidateSessionConfiguration).toHaveBeenCalledWith(selectedAIs, { claude: 'analyst' });

    expect(result.current.canCreateSession(selectedAIs)).toBe(true);
    expect(mockValidateSessionAIs).toHaveBeenCalledTimes(1);

    mockValidateSessionAIs.mockImplementationOnce(() => {
      throw new Error('invalid');
    });

    expect(result.current.canCreateSession([])).toBe(false);
    expect(mockValidateSessionAIs).toHaveBeenCalledTimes(2);
  });

  it('calculates session limits via service', () => {
    const { result } = renderHookWithProviders(() => useSessionManagement(), {
      preloadedState: baseState,
    });

    expect(result.current.getSessionLimits(true, 5)).toBe(3);
    expect(mockCalculateSessionLimits).toHaveBeenCalledWith(5);
  });
});
