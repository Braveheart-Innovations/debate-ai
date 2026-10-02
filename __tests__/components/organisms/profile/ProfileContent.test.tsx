import { Alert } from 'react-native';
import { fireEvent, waitFor, act } from '@testing-library/react-native';
import type { LinearGradient } from 'expo-linear-gradient';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { createMockAuthState, createMockFeatureAccess, createMockUserProfile } from '@test-utils/fixtures';
import { requireDefined } from '@test-utils/queries';
import type { PropsOf } from '@test-utils/mockComponents';
import type {
  Button,
  KeyboardAvoider,
  ProfileAvatar,
  SettingRow,
  SheetHeader,
  Typography,
} from '@/components/molecules';
import type { EmailAuthForm } from '@/components/molecules/auth/EmailAuthForm';
import type { SocialAuthProviders } from '@/components/organisms/auth/SocialAuthProviders';
import type { UnlockEverythingBanner } from '@/components/organisms/subscription/UnlockEverythingBanner';
import type { TrialBanner } from '@/components/molecules/subscription/TrialBanner';
import type { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { ProfileContent } from '@/components/organisms/profile/ProfileContent';

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock ErrorService
const mockShowSuccess = jest.fn();
const mockShowInfo = jest.fn();
const mockShowError = jest.fn();
const mockHandleWithToast = jest.fn();
const mockOpenSubscriptionManagement = jest.fn();
const mockNavigate = jest.fn();
const mockPurchaseSubscription = jest.fn().mockResolvedValue({ success: true });
const mockRestorePurchases = jest.fn().mockResolvedValue({ success: true, restored: false });
const mockUpdateCurrentUserDisplayName = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('@/services/errors/ErrorService', () => ({
  ErrorService: {
    showSuccess: (...args: unknown[]) => mockShowSuccess(...args),
    showInfo: (...args: unknown[]) => mockShowInfo(...args),
    showError: (...args: unknown[]) => mockShowError(...args),
    handleWithToast: (...args: unknown[]) => mockHandleWithToast(...args),
  },
}));

jest.mock('@/services/subscription/subscriptionManagement', () => ({
  openSubscriptionManagement: (...args: unknown[]) => mockOpenSubscriptionManagement(...args),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: PropsOf<typeof LinearGradient>) => <>{children}</>,
}));

type FeatureAccess = ReturnType<typeof useFeatureAccess>;

/** Signed-in demo user who has not trialed; override per test. */

const mockUseFeatureAccess = jest.fn<FeatureAccess, []>(() => createMockFeatureAccess());

jest.mock('@/hooks/useFeatureAccess', () => ({
  useFeatureAccess: () => mockUseFeatureAccess(),
}));

jest.mock('@/components/molecules', () => {
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text, TouchableOpacity } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    KeyboardAvoider: ({ children }: PropsOf<typeof KeyboardAvoider>) =>
      React.createElement(React.Fragment, null, children),
    ProfileAvatar: (_props: PropsOf<typeof ProfileAvatar>) => null,
    Typography: ({ children }: PropsOf<typeof Typography>) => React.createElement(Text, null, children),
    Button: ({ title, onPress }: PropsOf<typeof Button>) =>
      React.createElement(
        TouchableOpacity,
        { onPress, testID: title },
        React.createElement(Text, { onPress }, title)
      ),
    SettingRow: ({ title, onPress }: PropsOf<typeof SettingRow>) =>
      React.createElement(
        TouchableOpacity,
        { onPress },
        React.createElement(Text, null, title)
      ),
    SheetHeader: stubComponent<typeof SheetHeader>('sheet-header'),
  };
});

jest.mock('@/components/molecules/auth/EmailAuthForm', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    EmailAuthForm: (_props: PropsOf<typeof EmailAuthForm>) =>
      React.createElement(Text, { testID: 'email-auth-form' }, 'Email Form'),
  };
});

jest.mock('@/components/organisms/auth/SocialAuthProviders', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SocialAuthProviders: (_props: PropsOf<typeof SocialAuthProviders>) =>
      React.createElement(Text, null, 'Social Providers'),
  };
});

jest.mock('@/components/organisms/subscription/UnlockEverythingBanner', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    UnlockEverythingBanner: (_props: PropsOf<typeof UnlockEverythingBanner>) =>
      React.createElement(Text, null, 'Unlock Banner'),
  };
});

jest.mock('@/components/molecules/subscription/TrialBanner', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    TrialBanner: (_props: PropsOf<typeof TrialBanner>) =>
      React.createElement(Text, null, 'Trial Banner'),
  };
});

jest.mock('@/services/firebase/auth', () => ({
  signOut: jest.fn(),
  signInWithEmail: jest.fn(),
  signUpWithEmail: jest.fn(),
  toAuthUser: jest.fn((user: { uid: string; email: string | null }) => ({ uid: user.uid, email: user.email })),
  sendCurrentUserEmailVerification: jest.fn(),
  refreshCurrentUserEmailVerification: jest.fn(),
  updateCurrentUserDisplayName: (...args: unknown[]) => mockUpdateCurrentUserDisplayName(...args),
}));

const mockDeleteAccount = jest.fn();
jest.mock('@/services/firebase/accountDeletion', () => ({
  deleteAccount: () => mockDeleteAccount(),
}));

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: jest.fn(),
  doc: jest.fn(),
  setDoc: jest.fn(),
  getDoc: jest.fn(() => ({ data: () => null })),
  serverTimestamp: jest.fn(() => Date.now()),
}));

jest.mock('@/services/iap/PurchaseService', () => ({
  __esModule: true,
  default: {
    purchaseSubscription: (...args: unknown[]) => mockPurchaseSubscription(...args),
    restorePurchases: (...args: unknown[]) => mockRestorePurchases(...args),
  },
}));

const authenticatedState = {
  auth: createMockAuthState({
    isAuthenticated: true,
    user: {
      uid: 'test-user-id',
      email: 'test@example.com',
      displayName: null,
      photoURL: null,
      emailVerified: true,
    },
    userProfile: createMockUserProfile({
      email: 'test@example.com',
      displayName: 'Test User',
      createdAt: Date.now(),
      membershipStatus: 'premium',
      preferences: {},
    }),
  }),
};

/** Presses the destructive button of the delete-account confirmation alert. */
const confirmDeleteAccount = async () => {
  const [, , buttons] = requireDefined(jest.mocked(Alert.alert).mock.calls[0], 'Alert.alert call');
  const confirmButton = requireDefined(
    requireDefined(buttons, 'alert buttons').find((b) => b.text === 'Delete Account'),
    'Delete Account button'
  );
  const onPress = requireDefined(confirmButton.onPress, 'Delete Account onPress');
  await act(async () => {
    await onPress();
  });
};

describe('ProfileContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteAccount.mockReset();
    mockShowSuccess.mockClear();
    mockShowInfo.mockClear();
    mockShowError.mockClear();
    mockHandleWithToast.mockClear();
    mockOpenSubscriptionManagement.mockClear();
    mockNavigate.mockClear();
    mockPurchaseSubscription.mockClear();
    mockRestorePurchases.mockClear();
    mockUpdateCurrentUserDisplayName.mockReset();
    mockUseFeatureAccess.mockReturnValue(createMockFeatureAccess({ trialDaysRemaining: 0 }));
  });

  it('renders signed-out view and opens email auth form', async () => {
    const preloadedState = { auth: createMockAuthState() };

    const { getByText, queryByTestId } = renderWithProviders(
      <ProfileContent onClose={jest.fn()} />,
      { preloadedState }
    );

    expect(getByText('Sign in with Email')).toBeTruthy();
    fireEvent.press(getByText('Sign in with Email'));

    await waitFor(() => expect(queryByTestId('email-auth-form')).toBeTruthy());
  });

  it('opens platform subscription management from the manage row', () => {
    mockUseFeatureAccess.mockReturnValue(
      createMockFeatureAccess({ isPremium: true, isDemo: false, hasUsedTrial: true })
    );

    const { getByText } = renderWithProviders(
      <ProfileContent onClose={jest.fn()} />,
      { preloadedState: authenticatedState }
    );

    fireEvent.press(getByText('Manage Subscription'));

    expect(mockOpenSubscriptionManagement).toHaveBeenCalledTimes(1);
  });

  it('lets expired-trial users open the subscription screen from profile', () => {
    mockUseFeatureAccess.mockReturnValue(
      createMockFeatureAccess({ hasUsedTrial: true })
    );

    const onClose = jest.fn();
    const { getByText } = renderWithProviders(
      <ProfileContent onClose={onClose} />,
      { preloadedState: authenticatedState }
    );

    fireEvent.press(getByText('Upgrade to Premium'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('Subscription');
  });

  it('uses the trial offer only when starting a trial from profile', async () => {
    mockPurchaseSubscription.mockResolvedValueOnce({ success: true, pending: true });
    mockUseFeatureAccess.mockReturnValue(
      createMockFeatureAccess({ canStartTrial: true })
    );

    const { getByTestId } = renderWithProviders(
      <ProfileContent onClose={jest.fn()} />,
      { preloadedState: authenticatedState }
    );

    fireEvent.press(getByTestId('Start 1 week Free Trial'));

    await waitFor(() => {
      expect(mockPurchaseSubscription).toHaveBeenCalledWith('monthly', { includeTrialOffer: true });
    });
    expect(mockShowInfo).not.toHaveBeenCalled();
  });

  it('shows purchase service errors directly when trial start is unavailable', async () => {
    mockPurchaseSubscription.mockResolvedValueOnce({
      success: false,
      errorCode: 'E_BILLING_UNAVAILABLE',
      userMessage: 'In-app purchases are not available on this device. Please check your device settings.',
    });
    mockUseFeatureAccess.mockReturnValue(
      createMockFeatureAccess({ canStartTrial: true })
    );

    const { getByTestId } = renderWithProviders(
      <ProfileContent onClose={jest.fn()} />,
      { preloadedState: authenticatedState }
    );

    fireEvent.press(getByTestId('Start 1 week Free Trial'));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith(
        'In-app purchases are not available on this device. Please check your device settings.',
        'subscription'
      );
    });
    expect(mockHandleWithToast).not.toHaveBeenCalled();
  });

  it('updates display name from the profile page', async () => {
    mockUpdateCurrentUserDisplayName.mockResolvedValue({
      uid: 'test-user-id',
      email: 'test@example.com',
      displayName: 'Store Tester',
      photoURL: null,
      emailVerified: true,
      providerId: 'password',
    });

    const { getByLabelText, store } = renderWithProviders(
      <ProfileContent onClose={jest.fn()} />,
      { preloadedState: authenticatedState }
    );

    fireEvent.press(getByLabelText('Edit display name'));
    fireEvent.changeText(getByLabelText('Display name'), '  Store Tester  ');
    fireEvent.press(getByLabelText('Save display name'));

    await waitFor(() => {
      expect(mockUpdateCurrentUserDisplayName).toHaveBeenCalledWith('Store Tester');
    });

    expect(store.getState().auth.userProfile?.displayName).toBe('Store Tester');
    expect(store.getState().auth.user?.displayName).toBe('Store Tester');
    expect(mockShowSuccess).toHaveBeenCalledWith('Display name updated.', 'profile');
  });

  describe('Delete Account', () => {
    it('shows delete account button for authenticated users', () => {
      const { getByText } = renderWithProviders(
        <ProfileContent onClose={jest.fn()} />,
        { preloadedState: authenticatedState }
      );

      expect(getByText('Delete Account')).toBeTruthy();
    });

    it('shows confirmation alert when delete button is pressed', () => {
      const { getByText } = renderWithProviders(
        <ProfileContent onClose={jest.fn()} />,
        { preloadedState: authenticatedState }
      );

      fireEvent.press(getByText('Delete Account'));

      expect(Alert.alert).toHaveBeenCalledWith(
        'Delete Account',
        expect.stringContaining('permanently delete'),
        expect.arrayContaining([
          expect.objectContaining({ text: 'Cancel' }),
          expect.objectContaining({ text: 'Delete Account', style: 'destructive' }),
        ])
      );
    });

    it('calls deleteAccount service when confirmed', async () => {
      mockDeleteAccount.mockResolvedValue({ success: true });

      const onClose = jest.fn();
      const { getByText } = renderWithProviders(
        <ProfileContent onClose={onClose} />,
        { preloadedState: authenticatedState }
      );

      fireEvent.press(getByText('Delete Account'));

      // Invoke the confirm callback from the Alert.alert call
      await confirmDeleteAccount();

      expect(mockDeleteAccount).toHaveBeenCalled();
    });

    it('shows success message on successful deletion', async () => {
      mockDeleteAccount.mockResolvedValue({ success: true });

      const onClose = jest.fn();
      const { getByText } = renderWithProviders(
        <ProfileContent onClose={onClose} />,
        { preloadedState: authenticatedState }
      );

      fireEvent.press(getByText('Delete Account'));

      await confirmDeleteAccount();

      await waitFor(() => {
        expect(mockShowSuccess).toHaveBeenCalledWith(
          'Your account has been permanently deleted.',
          'account'
        );
      });
    });

    it('shows re-authentication message when required', async () => {
      mockDeleteAccount.mockResolvedValue({
        success: false,
        requiresRecentLogin: true,
        message: 'Re-authentication required'
      });

      const { getByText } = renderWithProviders(
        <ProfileContent onClose={jest.fn()} />,
        { preloadedState: authenticatedState }
      );

      fireEvent.press(getByText('Delete Account'));

      await confirmDeleteAccount();

      await waitFor(() => {
        expect(mockShowInfo).toHaveBeenCalledWith(
          'For security, please sign out and sign back in before deleting your account.',
          'account'
        );
      });
    });

    it('shows error message on deletion failure', async () => {
      mockDeleteAccount.mockResolvedValue({
        success: false,
        message: 'Failed to delete'
      });

      const { getByText } = renderWithProviders(
        <ProfileContent onClose={jest.fn()} />,
        { preloadedState: authenticatedState }
      );

      fireEvent.press(getByText('Delete Account'));

      await confirmDeleteAccount();

      await waitFor(() => {
        expect(mockHandleWithToast).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Failed to delete' }),
          { feature: 'account' }
        );
      });
    });
  });
});
