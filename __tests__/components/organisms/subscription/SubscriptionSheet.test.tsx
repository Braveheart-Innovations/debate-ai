import { Text } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import type { PropsOf } from '@test-utils/mockComponents';
import type { Button, GradientButton, SheetHeader, Typography } from '@/components/molecules';
import type { UnlockEverythingBanner } from '@/components/organisms/subscription/UnlockEverythingBanner';
import type { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { SubscriptionSheet } from '@/components/organisms/subscription/SubscriptionSheet';
import { createMockFeatureAccess } from '@test-utils/fixtures';

const mockGradientButton = jest.fn(({ title, onPress, disabled }: PropsOf<typeof GradientButton>) => (
  <Text accessibilityRole="button" onPress={disabled ? undefined : onPress}>
    {title}
  </Text>
));

const mockButton = jest.fn(({ title, onPress }: PropsOf<typeof Button>) => (
  <Text accessibilityRole="button" onPress={onPress}>
    {title}
  </Text>
));

jest.mock('@/components/molecules', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SheetHeader: ({ title }: PropsOf<typeof SheetHeader>) => React.createElement(Text, null, title),
    GradientButton: (props: PropsOf<typeof GradientButton>) => mockGradientButton(props),
    Button: (props: PropsOf<typeof Button>) => mockButton(props),
    Typography: ({ children }: PropsOf<typeof Typography>) => React.createElement(Text, null, children),
  };
});

jest.mock('@/components/organisms/subscription/UnlockEverythingBanner', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    UnlockEverythingBanner: (_props: PropsOf<typeof UnlockEverythingBanner>) =>
      React.createElement(Text, null, 'Banner'),
  };
});

const mockPurchaseSubscription = jest.fn().mockResolvedValue({ success: true });
const mockRefresh = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
const mockShowInfo = jest.fn();
const mockShowError = jest.fn();

type FeatureAccess = ReturnType<typeof useFeatureAccess>;

/** Signed-in demo user; override per test. */
const createFeatureAccess = (overrides: Partial<FeatureAccess> = {}): FeatureAccess =>
  createMockFeatureAccess({ refresh: mockRefresh, ...overrides });

const mockUseFeatureAccess = jest.fn<FeatureAccess, []>(() => createFeatureAccess({ canStartTrial: true }));

jest.mock('@/services/iap/PurchaseService', () => ({
  PurchaseService: { purchaseSubscription: (...args: unknown[]) => mockPurchaseSubscription(...args) },
}));

jest.mock('@/services/errors/ErrorService', () => ({
  ErrorService: {
    showInfo: (...args: unknown[]) => mockShowInfo(...args),
    showError: (...args: unknown[]) => mockShowError(...args),
  },
}));

jest.mock('@/hooks/useFeatureAccess', () => ({
  useFeatureAccess: () => mockUseFeatureAccess(),
}));

describe('SubscriptionSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRefresh.mockResolvedValue(undefined);
    mockPurchaseSubscription.mockResolvedValue({ success: true });
    mockUseFeatureAccess.mockReturnValue(createFeatureAccess({ canStartTrial: true }));
  });

  it('launches the trial billing flow without showing success or closing the sheet', async () => {
    const onClose = jest.fn();
    const { getByText } = renderWithProviders(<SubscriptionSheet onClose={onClose} />);

    fireEvent.press(getByText('Start 1 week Free Trial'));

    await waitFor(() => expect(mockPurchaseSubscription).toHaveBeenCalledWith('monthly', { includeTrialOffer: true }));
    expect(onClose).not.toHaveBeenCalled();
    expect(mockShowInfo).not.toHaveBeenCalled();
  });

  it('subscribes without a trial offer when the user is not trial eligible', async () => {
    mockUseFeatureAccess.mockReturnValue(createFeatureAccess({ canStartTrial: false }));
    const onClose = jest.fn();
    const { getByText } = renderWithProviders(<SubscriptionSheet onClose={onClose} />);

    fireEvent.press(getByText('Subscribe Now'));

    await waitFor(() => expect(mockPurchaseSubscription).toHaveBeenCalledWith('monthly', { includeTrialOffer: false }));
  });

  it('closes when choosing Maybe later', () => {
    const onClose = jest.fn();
    const { getByText } = renderWithProviders(<SubscriptionSheet onClose={onClose} />);

    fireEvent.press(getByText('Maybe later'));
    expect(onClose).toHaveBeenCalled();
  });
});
