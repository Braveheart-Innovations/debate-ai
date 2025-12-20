import React from 'react';
import { Text, Alert } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';

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

jest.mock('@/services/iap/PurchaseService', () => ({
  PurchaseService: {
    purchaseSubscription: (...args: unknown[]) => mockPurchaseSubscription(...args),
    restorePurchases: () => mockRestorePurchases(),
  },
}));

const UpgradeScreen = require('@/screens/UpgradeScreen').default;

describe('UpgradeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGoBack.mockReset();
    mockPurchaseSubscription.mockResolvedValue({ success: true });
    mockRestorePurchases.mockResolvedValue({ success: true, restored: false });
    // Reset feature access mock
    mockFeatureAccess.hasUsedTrial = false;
    mockFeatureAccess.isInTrial = false;
    mockFeatureAccess.trialDaysRemaining = null;
    mockFeatureAccess.isPremium = false;
    mockFeatureAccess.canStartTrial = true;
  });

  it('renders feature list and navigates back via header', () => {
    const { getByText, getByTestId } = renderWithProviders(<UpgradeScreen />);

    // Header should render with title
    expect(getByTestId('header')).toBeTruthy();
    // Check for a premium feature in the list
    expect(getByText('Collaborate on ideas with multiple AIs at once')).toBeTruthy();

    fireEvent.press(getByTestId('header'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('calls purchaseSubscription when Subscribe Now is pressed', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getAllByText } = renderWithProviders(<UpgradeScreen />, {
      preloadedState: {
        auth: { isAuthenticated: true, user: null, loading: false, error: null },
      },
    });

    const subscribeButtons = getAllByText('Subscribe Now');
    fireEvent.press(subscribeButtons[0]);

    await waitFor(() => {
      expect(mockPurchaseSubscription).toHaveBeenCalledWith('monthly');
    });

    fireEvent.press(subscribeButtons[1]);

    await waitFor(() => {
      expect(mockPurchaseSubscription).toHaveBeenCalledWith('annual');
    });

    alertSpy.mockRestore();
  });

  it('calls restorePurchases when Restore Purchases is pressed', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByText } = renderWithProviders(<UpgradeScreen />);

    const restoreButton = getByText('Restore Purchases');
    fireEvent.press(restoreButton);

    await waitFor(() => {
      expect(mockRestorePurchases).toHaveBeenCalled();
    });

    alertSpy.mockRestore();
  });

  it('shows success alert on successful purchase', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockPurchaseSubscription.mockResolvedValueOnce({ success: true });

    const { getAllByText } = renderWithProviders(<UpgradeScreen />, {
      preloadedState: {
        auth: { isAuthenticated: true, user: null, loading: false, error: null },
      },
    });

    const subscribeButtons = getAllByText('Subscribe Now');
    fireEvent.press(subscribeButtons[0]);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Success', 'Thank you for your purchase!');
    });

    alertSpy.mockRestore();
  });

  it('shows error alert on failed purchase', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockPurchaseSubscription.mockResolvedValueOnce({ success: false, error: 'Payment failed' });

    const { getAllByText } = renderWithProviders(<UpgradeScreen />, {
      preloadedState: {
        auth: { isAuthenticated: true, user: null, loading: false, error: null },
      },
    });

    const subscribeButtons = getAllByText('Subscribe Now');
    fireEvent.press(subscribeButtons[0]);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Purchase Failed', 'Purchase could not be completed. Please try again.');
    });

    alertSpy.mockRestore();
  });
});
