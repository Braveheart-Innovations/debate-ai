import { act, waitFor } from '@testing-library/react-native';
import { renderHookWithProviders } from '../../test-utils/renderHookWithProviders';
import useFeatureAccess from '@/hooks/useFeatureAccess';
import { SubscriptionManager } from '@/services/subscription/SubscriptionManager';
import { onAuthStateChanged } from '@/services/firebase/auth';
import type { RootState } from '@/store';

jest.mock('@/services/firebase/auth', () => ({
  onAuthStateChanged: jest.fn(),
}));

describe('useFeatureAccess', () => {
  const onAuthStateChangedMock = onAuthStateChanged as jest.MockedFunction<typeof onAuthStateChanged>;

  const baseAuthState: RootState['auth'] = {
    user: null,
    isAuthenticated: false,
    isPremium: false,
    authLoading: false,
    authModalVisible: false,
    userProfile: null,
    isAnonymous: false,
    lastAuthMethod: null,
    socialAuthLoading: false,
    socialAuthError: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    onAuthStateChangedMock.mockImplementation(() => () => {});
  });

  it('hydrates membership state from SubscriptionManager on mount', async () => {
    const checkStatusSpy = jest
      .spyOn(SubscriptionManager, 'checkSubscriptionStatus')
      .mockResolvedValue('premium');
    const trialDaysSpy = jest
      .spyOn(SubscriptionManager, 'getTrialDaysRemaining')
      .mockResolvedValue(5);

    const { result } = renderHookWithProviders(() => useFeatureAccess(), {
      preloadedState: { auth: { ...baseAuthState } },
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(checkStatusSpy).toHaveBeenCalledTimes(1);
    expect(trialDaysSpy).toHaveBeenCalledTimes(1);
    expect(result.current.membershipStatus).toBe('premium');
    expect(result.current.isPremium).toBe(true);
    expect(result.current.canAccessLiveAI).toBe(true);
    expect(result.current.isDemo).toBe(false);
    expect(result.current.trialDaysRemaining).toBe(5);
  });

  it('refresh re-fetches subscription data and updates derived flags', async () => {
    const checkStatusSpy = jest
      .spyOn(SubscriptionManager, 'checkSubscriptionStatus')
      .mockResolvedValue('premium');
    const trialDaysSpy = jest
      .spyOn(SubscriptionManager, 'getTrialDaysRemaining')
      .mockResolvedValue(null);

    const { result } = renderHookWithProviders(() => useFeatureAccess(), {
      preloadedState: { auth: { ...baseAuthState } },
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.membershipStatus).toBe('premium');

    checkStatusSpy.mockResolvedValueOnce('trial');
    trialDaysSpy.mockResolvedValueOnce(2);

    await act(async () => {
      await result.current.refresh();
    });

    expect(checkStatusSpy).toHaveBeenCalledTimes(2);
    expect(trialDaysSpy).toHaveBeenCalledTimes(2);
    expect(result.current.membershipStatus).toBe('trial');
    expect(result.current.isInTrial).toBe(true);
    expect(result.current.isPremium).toBe(false);
    expect(result.current.canAccessLiveAI).toBe(true);
    expect(result.current.trialDaysRemaining).toBe(2);
  });
});
