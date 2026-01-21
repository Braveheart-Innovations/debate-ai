import React from 'react';
import { Text, Alert } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';

// Mock ErrorService
const mockShowSuccess = jest.fn();
const mockShowInfo = jest.fn();
const mockShowError = jest.fn();
const mockShowWarning = jest.fn();
const mockHandleWithToast = jest.fn();
jest.mock('@/services/errors/ErrorService', () => ({
  ErrorService: {
    showSuccess: (...args: unknown[]) => mockShowSuccess(...args),
    showInfo: (...args: unknown[]) => mockShowInfo(...args),
    showError: (...args: unknown[]) => mockShowError(...args),
    showWarning: (...args: unknown[]) => mockShowWarning(...args),
    handleWithToast: (...args: unknown[]) => mockHandleWithToast(...args),
  },
}));

const mockHeader = jest.fn(({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) => (
  <Text testID="header" onPress={onBack}>
    {title} {subtitle}
  </Text>
));
const mockHeaderActions = jest.fn(() => null);

const mockGoBack = jest.fn();

jest.mock('@/components/organisms', () => ({
  Header: (props: any) => mockHeader(props),
  HeaderActions: () => mockHeaderActions(),
  TrialTermsSheet: () => null,
}));

const MockUnlockEverythingBanner = () => (
  <Text testID="unlock-everything-banner">Unlock Everything</Text>
);

jest.mock('@/components/organisms/subscription/UnlockEverythingBanner', () => ({
  UnlockEverythingBanner: () => <MockUnlockEverythingBanner />,
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
}));

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children }: { children: React.ReactNode }) => <View testID="gradient">{children}</View>,
  };
});

const mockGradientButton = jest.fn(({ title, onPress }: { title: string; onPress: () => void }) => (
  <Text accessibilityRole="button" onPress={onPress}>
    {title}
  </Text>
));
const mockButton = jest.fn(({ title, onPress }: { title: string; onPress: () => void }) => (
  <Text accessibilityRole="button" onPress={onPress}>
    {title}
  </Text>
));

jest.mock('@/components/molecules', () => {
  const { Text } = require('react-native');
  return {
    GradientButton: (props: any) => mockGradientButton(props),
    Button: (props: any) => mockButton(props),
    Typography: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
  };
});

// Mock useFeatureAccess hook
const mockFeatureAccess = {
  hasUsedTrial: false,
  isInTrial: false,
  trialDaysRemaining: null,
  isPremium: false,
  canStartTrial: true,
};

jest.mock('@/hooks/useFeatureAccess', () => ({
  useFeatureAccess: () => mockFeatureAccess,
}));

// Mock PurchaseService to avoid actual purchase flow
const mockPurchaseSubscription = jest.fn();
const mockRestorePurchases = jest.fn();
const mockOnPurchaseError = jest.fn(() => jest.fn()); // Returns unsubscribe function

jest.mock('@/services/iap/PurchaseService', () => ({
  PurchaseService: {
    purchaseSubscription: (...args: unknown[]) => mockPurchaseSubscription(...args),
    restorePurchases: () => mockRestorePurchases(),
    onPurchaseError: (callback: unknown) => mockOnPurchaseError(callback),
  },
}));

const UpgradeScreen = require('@/screens/UpgradeScreen').default;

describe('UpgradeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGoBack.mockReset();
    mockShowSuccess.mockClear();
    mockShowInfo.mockClear();
    mockShowError.mockClear();
    mockShowWarning.mockClear();
    mockHandleWithToast.mockClear();
    mockPurchaseSubscription.mockResolvedValue({ success: true });
    mockRestorePurchases.mockResolvedValue({ success: true, restored: false });
    // Reset feature access mock
    mockFeatureAccess.hasUsedTrial = false;
    mockFeatureAccess.isInTrial = false;
    mockFeatureAccess.trialDaysRemaining = null;
    mockFeatureAccess.isPremium = false;
    mockFeatureAccess.canStartTrial = true;
  });

  it('renders UnlockEverythingBanner and navigates back via header', () => {
    const { getByTestId } = renderWithProviders(<UpgradeScreen />);

    // Header should render with title
    expect(getByTestId('header')).toBeTruthy();
    // Check that UnlockEverythingBanner is rendered
    expect(getByTestId('unlock-everything-banner')).toBeTruthy();

    fireEvent.press(getByTestId('header'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('calls purchaseSubscription when plan card button is pressed', async () => {
    const { getAllByText } = renderWithProviders(<UpgradeScreen />, {
      preloadedState: {
        auth: { isAuthenticated: true, user: null, loading: false, error: null },
      },
    });

    // With canStartTrial=true and authenticated, plan cards show "Start Free Trial"
    // Index 0 is the big primary CTA button (opens terms sheet)
    // Index 1 is monthly plan card, Index 2 is annual plan card
    const subscribeButtons = getAllByText('Start Free Trial');
    fireEvent.press(subscribeButtons[1]); // Monthly plan card

    await waitFor(() => {
      expect(mockPurchaseSubscription).toHaveBeenCalledWith('monthly');
    });

    fireEvent.press(subscribeButtons[2]); // Annual plan card

    await waitFor(() => {
      expect(mockPurchaseSubscription).toHaveBeenCalledWith('annual');
    });
  });

  it('calls restorePurchases when Restore Purchases is pressed (authenticated)', async () => {
    const { getByText } = renderWithProviders(<UpgradeScreen />, {
      preloadedState: {
        auth: { isAuthenticated: true, user: null, loading: false, error: null },
      },
    });

    const restoreButton = getByText('Restore Purchases');
    fireEvent.press(restoreButton);

    await waitFor(() => {
      expect(mockRestorePurchases).toHaveBeenCalled();
    });
  });

  it('shows success toast on successful purchase', async () => {
    mockPurchaseSubscription.mockResolvedValueOnce({ success: true });

    const { getAllByText } = renderWithProviders(<UpgradeScreen />, {
      preloadedState: {
        auth: { isAuthenticated: true, user: null, loading: false, error: null },
      },
    });

    // Index 1 is the monthly plan card button (Index 0 is the primary CTA)
    const subscribeButtons = getAllByText('Start Free Trial');
    fireEvent.press(subscribeButtons[1]);

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith('Thank you for your purchase!', 'subscription');
    });
  });

  it('shows error toast on failed purchase', async () => {
    mockPurchaseSubscription.mockResolvedValueOnce({ success: false, userMessage: 'Payment failed' });

    const { getAllByText } = renderWithProviders(<UpgradeScreen />, {
      preloadedState: {
        auth: { isAuthenticated: true, user: null, loading: false, error: null },
      },
    });

    // Index 1 is the monthly plan card button (Index 0 is the primary CTA)
    const subscribeButtons = getAllByText('Start Free Trial');
    fireEvent.press(subscribeButtons[1]);

    // Now uses ErrorService.showError instead of handleWithToast
    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled();
    });
  });
});
