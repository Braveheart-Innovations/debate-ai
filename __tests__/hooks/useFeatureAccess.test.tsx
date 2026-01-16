import { act, waitFor } from '@testing-library/react-native';
import { renderHookWithProviders } from '../../test-utils/renderHookWithProviders';
import useFeatureAccess from '@/hooks/useFeatureAccess';
import { onAuthStateChanged } from '@/services/firebase/auth';
import { getFirestore, collection, doc, onSnapshot } from '@react-native-firebase/firestore';

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
  const getFirestoreMock = getFirestore as jest.MockedFunction<typeof getFirestore>;
  const collectionMock = collection as jest.MockedFunction<typeof collection>;
  const docMock = doc as jest.MockedFunction<typeof doc>;
  const onSnapshotMock = onSnapshot as jest.MockedFunction<typeof onSnapshot>;

  // Helper to create mock Firestore timestamp
  const createTimestamp = (ms: number) => ({
    toMillis: () => ms,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    onAuthStateChangedMock.mockImplementation(() => () => {});
    getFirestoreMock.mockReturnValue({ app: 'test-app' } as never);
    collectionMock.mockImplementation((_db, name: string) => ({ path: name }) as never);
    docMock.mockImplementation((_col, id: string) => ({ path: `users/${id}` }) as never);
    onSnapshotMock.mockImplementation(() => jest.fn());
  });

  it('starts with demo state and loading true', () => {
    const { result } = renderHookWithProviders(() => useFeatureAccess());

    // Initial state before any auth callback
    expect(result.current.membershipStatus).toBe('demo');
    expect(result.current.isPremium).toBe(false);
    expect(result.current.isDemo).toBe(true);
    expect(result.current.loading).toBe(true);
  });

  it('resets to demo state when user is not authenticated', async () => {
    let authCallback: ((user: { uid: string } | null) => void) | undefined;
    onAuthStateChangedMock.mockImplementation(callback => {
      authCallback = callback;
      return jest.fn();
    });

    const { result } = renderHookWithProviders(() => useFeatureAccess());

    await act(async () => {
      authCallback?.(null);
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.membershipStatus).toBe('demo');
    expect(result.current.isPremium).toBe(false);
    expect(result.current.isDemo).toBe(true);
  });

  it('reads subscription data directly from Firestore snapshot', async () => {
    let authCallback: ((user: { uid: string } | null) => void) | undefined;
    onAuthStateChangedMock.mockImplementation(callback => {
      authCallback = callback;
      return jest.fn();
    });

    let snapshotHandler: ((snapshot: unknown) => void) | undefined;
    onSnapshotMock.mockImplementation((_ref, onNext) => {
      snapshotHandler = onNext;
      return jest.fn();
    });

    const { result } = renderHookWithProviders(() => useFeatureAccess());

    // Simulate user login
    await act(async () => {
      authCallback?.({ uid: 'user-123' });
    });

    // Simulate Firestore snapshot with trial data
    await act(async () => {
      snapshotHandler?.({
        data: () => ({
          membershipStatus: 'trial',
          trialEndDate: createTimestamp(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
          hasUsedTrial: true,
        }),
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.membershipStatus).toBe('trial');
    expect(result.current.isInTrial).toBe(true);
    expect(result.current.isPremium).toBe(true); // Trial users have premium access
    expect(result.current.canAccessLiveAI).toBe(true);
    expect(result.current.trialDaysRemaining).toBeGreaterThanOrEqual(4);
    expect(result.current.trialDaysRemaining).toBeLessThanOrEqual(6);
    expect(result.current.hasUsedTrial).toBe(true);
    expect(result.current.canStartTrial).toBe(false); // Already used trial
  });

  it('correctly derives premium status from snapshot', async () => {
    let authCallback: ((user: { uid: string } | null) => void) | undefined;
    onAuthStateChangedMock.mockImplementation(callback => {
      authCallback = callback;
      return jest.fn();
    });

    let snapshotHandler: ((snapshot: unknown) => void) | undefined;
    onSnapshotMock.mockImplementation((_ref, onNext) => {
      snapshotHandler = onNext;
      return jest.fn();
    });

    const { result } = renderHookWithProviders(() => useFeatureAccess());

    await act(async () => {
      authCallback?.({ uid: 'user-123' });
    });

    await act(async () => {
      snapshotHandler?.({
        data: () => ({
          membershipStatus: 'premium',
          hasUsedTrial: true,
        }),
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.membershipStatus).toBe('premium');
    expect(result.current.isPremium).toBe(true);
    expect(result.current.isInTrial).toBe(false);
    expect(result.current.isDemo).toBe(false);
    expect(result.current.canAccessLiveAI).toBe(true);
  });

  it('handles demo user who can start trial', async () => {
    let authCallback: ((user: { uid: string } | null) => void) | undefined;
    onAuthStateChangedMock.mockImplementation(callback => {
      authCallback = callback;
      return jest.fn();
    });

    let snapshotHandler: ((snapshot: unknown) => void) | undefined;
    onSnapshotMock.mockImplementation((_ref, onNext) => {
      snapshotHandler = onNext;
      return jest.fn();
    });

    const { result } = renderHookWithProviders(() => useFeatureAccess());

    await act(async () => {
      authCallback?.({ uid: 'user-123' });
    });

    await act(async () => {
      snapshotHandler?.({
        data: () => ({
          membershipStatus: 'demo',
          hasUsedTrial: false,
        }),
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.membershipStatus).toBe('demo');
    expect(result.current.isDemo).toBe(true);
    expect(result.current.hasUsedTrial).toBe(false);
    expect(result.current.canStartTrial).toBe(true);
  });

  it('handles permission-denied error gracefully', async () => {
    let authCallback: ((user: { uid: string } | null) => void) | undefined;
    onAuthStateChangedMock.mockImplementation(callback => {
      authCallback = callback;
      return jest.fn();
    });

    let snapshotErrorHandler: ((error: unknown) => void) | undefined;
    onSnapshotMock.mockImplementation((_ref, _onNext, onError) => {
      snapshotErrorHandler = onError;
      return jest.fn();
    });

    const { result } = renderHookWithProviders(() => useFeatureAccess());

    await act(async () => {
      authCallback?.({ uid: 'user-123' });
    });

    await act(async () => {
      snapshotErrorHandler?.({ code: 'firestore/permission-denied' });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.membershipStatus).toBe('demo');
    expect(result.current.isDemo).toBe(true);
  });

  it('logs other snapshot errors and resets to demo', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    let authCallback: ((user: { uid: string } | null) => void) | undefined;
    onAuthStateChangedMock.mockImplementation(callback => {
      authCallback = callback;
      return jest.fn();
    });

    let snapshotErrorHandler: ((error: unknown) => void) | undefined;
    onSnapshotMock.mockImplementation((_ref, _onNext, onError) => {
      snapshotErrorHandler = onError;
      return jest.fn();
    });

    const { result } = renderHookWithProviders(() => useFeatureAccess());

    await act(async () => {
      authCallback?.({ uid: 'user-123' });
    });

    await act(async () => {
      snapshotErrorHandler?.({ code: 'unknown-error', message: 'Something went wrong' });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(consoleSpy).toHaveBeenCalledWith(
      'useFeatureAccess onSnapshot error:',
      expect.anything()
    );
    expect(result.current.membershipStatus).toBe('demo');

    consoleSpy.mockRestore();
  });

  it('cleans up listeners on unmount', async () => {
    const authUnsub = jest.fn();
    let authCallback: ((user: { uid: string } | null) => void) | undefined;
    onAuthStateChangedMock.mockImplementation(callback => {
      authCallback = callback;
      return authUnsub;
    });

    const snapshotUnsub = jest.fn();
    onSnapshotMock.mockImplementation(() => snapshotUnsub);

    const { unmount } = renderHookWithProviders(() => useFeatureAccess());

    await act(async () => {
      authCallback?.({ uid: 'user-123' });
    });

    unmount();

    expect(authUnsub).toHaveBeenCalled();
    expect(snapshotUnsub).toHaveBeenCalled();
  });

  it('refresh is a no-op (data syncs via onSnapshot)', async () => {
    let authCallback: ((user: { uid: string } | null) => void) | undefined;
    onAuthStateChangedMock.mockImplementation(callback => {
      authCallback = callback;
      return jest.fn();
    });

    let snapshotHandler: ((snapshot: unknown) => void) | undefined;
    onSnapshotMock.mockImplementation((_ref, onNext) => {
      snapshotHandler = onNext;
      return jest.fn();
    });

    const { result } = renderHookWithProviders(() => useFeatureAccess());

    await act(async () => {
      authCallback?.({ uid: 'user-123' });
    });

    await act(async () => {
      snapshotHandler?.({
        data: () => ({ membershipStatus: 'premium', hasUsedTrial: true }),
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // refresh() should not throw and should be a no-op
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.membershipStatus).toBe('premium');
  });

  it('handles document that does not exist yet (new user)', async () => {
    let authCallback: ((user: { uid: string } | null) => void) | undefined;
    onAuthStateChangedMock.mockImplementation(callback => {
      authCallback = callback;
      return jest.fn();
    });

    let snapshotHandler: ((snapshot: unknown) => void) | undefined;
    onSnapshotMock.mockImplementation((_ref, onNext) => {
      snapshotHandler = onNext;
      return jest.fn();
    });

    const { result } = renderHookWithProviders(() => useFeatureAccess());

    await act(async () => {
      authCallback?.({ uid: 'new-user-123' });
    });

    // Simulate snapshot with no data (document doesn't exist)
    await act(async () => {
      snapshotHandler?.({
        data: () => null,
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.membershipStatus).toBe('demo');
    expect(result.current.hasUsedTrial).toBe(false);
    expect(result.current.canStartTrial).toBe(true);
  });
});
