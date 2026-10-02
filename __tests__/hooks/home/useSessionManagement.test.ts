import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';
import { resolveProviderModelId } from '@/config/modelConfigs';
import { useSessionManagement } from '@/hooks/home/useSessionManagement';
import type { RootStateOverrides } from '../../../test-utils/services/state';
import { createMockAIConfig } from '../../../test-utils/fixtures';
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
  const mockValidateSessionAIs = jest.mocked(SessionService.validateSessionAIs);
  const mockPrepareSessionData = jest.mocked(SessionService.prepareSessionData);
  const mockCalculateSessionLimits = jest.mocked(SessionService.calculateSessionLimits);
  const mockValidateSessionConfiguration = jest.mocked(SessionService.validateSessionConfiguration);

  const selectedAIs: AIConfig[] = [
    createMockAIConfig({ model: 'claude-3-opus', personality: 'default', color: '#f5f5f5' }),
  ];

  const baseState: RootStateOverrides = {
    chat: {
      aiPersonalities: { claude: 'analyst' },
      selectedModels: { claude: 'claude-3-sonnet' },
    },
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    mockValidateSessionAIs.mockImplementation(() => undefined);
    mockPrepareSessionData.mockImplementation((ais, personalities, models) => ({
      selectedAIs: ais,
      aiPersonalities: personalities,
      selectedModels: models ?? {},
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
    const resolvedModelId = resolveProviderModelId('claude', 'claude-3-sonnet') || 'claude-3-sonnet';

    expect(mockValidateSessionAIs).toHaveBeenCalledWith(selectedAIs);
    expect(mockPrepareSessionData).toHaveBeenCalledWith([
      {
        ...selectedAIs[0],
        model: resolvedModelId,
      },
    ], { claude: 'analyst' }, { claude: 'claude-3-sonnet' });

    const state = store.getState();
    expect(state.chat.sessions).toHaveLength(1);
    expect(state.chat.sessions[0].selectedAIs[0].model).toBe(resolvedModelId);
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
