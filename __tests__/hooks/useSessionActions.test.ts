import { act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useSessionActions } from '@/hooks/history/useSessionActions';
import { createMockSession } from '../../test-utils/hooks/historyFixtures';
import { renderHookWithProviders } from '../../test-utils/renderHookWithProviders';
import type { ChatSession } from '@/types';

const mockUseFeatureAccess = jest.fn();
const mockShowTrialCTA = jest.fn();
const mockDeleteSession = jest.fn();
const mockLoadSession = jest.fn();

jest.mock('@/hooks/useFeatureAccess', () => ({
  __esModule: true,
  default: () => mockUseFeatureAccess(),
}));

jest.mock('@/utils/demoGating', () => ({
  showTrialCTA: (...args: unknown[]) => mockShowTrialCTA(...args),
}));

jest.mock('@/services/chat', () => ({
  StorageService: {
    deleteSession: (...args: unknown[]) => mockDeleteSession(...args),
  },
}));

jest.mock('@/store', () => {
  const actual = jest.requireActual('@/store');
  return {
    ...actual,
    loadSession: (...args: unknown[]) => {
      mockLoadSession(...args);
      return { type: 'chat/loadSession', payload: args[0] };
    },
  };
});

describe('useSessionActions', () => {
  const navigation = { navigate: jest.fn() } as unknown as Parameters<typeof useSessionActions>[0];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFeatureAccess.mockReturnValue({ isDemo: false });
  });

  it('confirms deletion and triggers refresh', async () => {
    mockDeleteSession.mockResolvedValue(undefined);
    const onRefresh = jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert');

    const { result } = renderHookWithProviders(() => useSessionActions(navigation, onRefresh));

    const deletePromise = result.current.deleteSession('session-1');
    const [, , buttons] = alertSpy.mock.calls[0];
    await act(async () => {
      await buttons?.find(btn => btn.text === 'Delete')?.onPress?.();
    });

    await expect(deletePromise).resolves.toBeUndefined();
    expect(mockDeleteSession).toHaveBeenCalledWith('session-1');
    expect(onRefresh).toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('surfaces deletion errors to the user', async () => {
    mockDeleteSession.mockRejectedValue(new Error('boom'));
    const alertSpy = jest.spyOn(Alert, 'alert');

    const { result } = renderHookWithProviders(() => useSessionActions(navigation));

    const deletePromise = result.current.deleteSession('session-2');
    const [, , initialButtons] = alertSpy.mock.calls[0];
    await act(async () => {
      await initialButtons?.find(btn => btn.text === 'Delete')?.onPress?.();
    });

    const [, errorMessage, errorButtons] = alertSpy.mock.calls[1];
    expect(errorMessage).toContain('Failed to delete the conversation');
    errorButtons?.find(btn => btn.text === 'OK')?.onPress?.();

    await expect(deletePromise).resolves.toBeUndefined();
    expect(alertSpy).toHaveBeenCalledTimes(2);

    alertSpy.mockRestore();
  });

  it('gates resume in demo mode', () => {
    mockUseFeatureAccess.mockReturnValue({ isDemo: true });
    const session = createMockSession();

    const { result } = renderHookWithProviders(() => useSessionActions(navigation));

    act(() => {
      result.current.resumeSession(session);
    });

    expect(mockShowTrialCTA).toHaveBeenCalled();
    expect(mockLoadSession).not.toHaveBeenCalled();
  });

  it('provides comparison resume options for divergent sessions', () => {
    mockUseFeatureAccess.mockReturnValue({ isDemo: false });
    const comparisonSession: ChatSession = {
      ...createMockSession({ sessionType: 'comparison' }),
      hasDiverged: true,
      continuedWithAI: 'Claude',
      selectedAIs: [
        { id: 'left', name: 'Lefty', provider: 'anthropic', model: 'claude' },
        { id: 'right', name: 'Righty', provider: 'openai', model: 'gpt4' },
      ],
    } as ChatSession & { hasDiverged: boolean; continuedWithAI: string };

    const alertSpy = jest.spyOn(Alert, 'alert');
    const { result } = renderHookWithProviders(() => useSessionActions(navigation));

    act(() => {
      result.current.resumeSession(comparisonSession);
    });

    const [, , buttons] = alertSpy.mock.calls[0];
    act(() => {
      buttons?.find(btn => btn.text === 'Resume Chat')?.onPress?.();
    });

    expect(mockLoadSession).toHaveBeenCalledWith(comparisonSession);

    alertSpy.mockRestore();
  });
});
