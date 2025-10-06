import { act, waitFor } from '@testing-library/react-native';
import { renderHookWithProviders } from '../../test-utils/renderHookWithProviders';
import useFeatureAccess from '@/hooks/useFeatureAccess';
import { SubscriptionManager } from '@/services/subscription/SubscriptionManager';
import { onAuthStateChanged } from '@/services/firebase/auth';
import { getFirestore, collection, doc, onSnapshot } from '@react-native-firebase/firestore';
import type { RootState } from '@/store';

jest.mock('@/services/firebase/auth', () => ({
  onAuthStateChanged: jest.fn(),
}));

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: jest.fn(),
  collection: jest.fn(),
  doc: jest.fn(),
  onSnapshot: jest.fn(),
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

  const getFirestoreMock = getFirestore as jest.MockedFunction<typeof getFirestore>;
  const collectionMock = collection as jest.MockedFunction<typeof collection>;
  const docMock = doc as jest.MockedFunction<typeof doc>;
  const onSnapshotMock = onSnapshot as jest.MockedFunction<typeof onSnapshot>;

  beforeEach(() => {
    jest.clearAllMocks();
    onAuthStateChangedMock.mockImplementation(() => () => {});
    getFirestoreMock.mockReturnValue({ app: 'test-app' } as never);
    collectionMock.mockImplementation((_db, name: string) => ({ path: name }) as never);
    docMock.mockImplementation((_col, id: string) => ({ path: `users/${id}` }) as never);
    onSnapshotMock.mockImplementation(() => jest.fn());
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

  it('respects simulated premium override from auth state', async () => {
    jest.spyOn(SubscriptionManager, 'checkSubscriptionStatus').mockResolvedValue('demo');
    jest.spyOn(SubscriptionManager, 'getTrialDaysRemaining').mockResolvedValue(null);

    const { result } = renderHookWithProviders(() => useFeatureAccess(), {
      preloadedState: {
        auth: { ...baseAuthState, isPremium: true },
      },
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.membershipStatus).toBe('demo');
    expect(result.current.isPremium).toBe(true);
    expect(result.current.canAccessLiveAI).toBe(true);
    expect(result.current.isDemo).toBe(false);
  });

  it('subscribes to auth changes and handles firestore updates and errors', async () => {
    const checkStatusSpy = jest
      .spyOn(SubscriptionManager, 'checkSubscriptionStatus')
      .mockResolvedValue('trial');
    const trialDaysSpy = jest
      .spyOn(SubscriptionManager, 'getTrialDaysRemaining')
      .mockResolvedValue(7);

    const authUnsub = jest.fn();
    let authCallback: ((user: { uid: string } | null) => void) | undefined;
    onAuthStateChangedMock.mockImplementation(callback => {
      authCallback = callback;
      return authUnsub;
    });

    let snapshotHandler: ((snapshot: unknown) => void) | undefined;
    let snapshotErrorHandler: ((error: unknown) => void) | undefined;
    const snapshotUnsub = jest.fn();
    onSnapshotMock.mockImplementation((_ref, onNext, onError) => {
      snapshotHandler = onNext;
      snapshotErrorHandler = onError;
      return snapshotUnsub;
    });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result, unmount } = renderHookWithProviders(() => useFeatureAccess(), {
      preloadedState: { auth: { ...baseAuthState } },
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.membershipStatus).toBe('trial');

    checkStatusSpy.mockResolvedValueOnce('business');
    trialDaysSpy.mockResolvedValueOnce(null);

    await act(async () => {
      authCallback?.({ uid: 'user-42' } as never);
      await Promise.resolve();
    });

    expect(onSnapshotMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await snapshotHandler?.({} as never);
    });

    await waitFor(() => expect(result.current.membershipStatus).toBe('business'));

    await act(async () => {
      snapshotErrorHandler?.({ code: 'firestore/permission-denied' });
    });

    expect(result.current.membershipStatus).toBe('demo');
    expect(result.current.trialDaysRemaining).toBeNull();

    await act(async () => {
      snapshotErrorHandler?.({ code: 'unknown', message: 'boom' });
    });
    expect(consoleSpy).toHaveBeenCalledWith('FeatureAccess onSnapshot error', expect.anything());

    await act(async () => {
      authCallback?.(null);
    });
    expect(result.current.membershipStatus).toBe('demo');

    unmount();
    expect(snapshotUnsub).toHaveBeenCalled();
    expect(authUnsub).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
