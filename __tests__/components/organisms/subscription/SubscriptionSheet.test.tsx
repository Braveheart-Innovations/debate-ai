import React from 'react';
import { Text } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { SubscriptionSheet } from '@/components/organisms/subscription/SubscriptionSheet';

const mockGradientButton = jest.fn(({ title, onPress, disabled }: any) => (
  <Text accessibilityRole="button" onPress={disabled ? undefined : onPress}>
    {title}
  </Text>
));

const mockButton = jest.fn(({ title, onPress }: any) => (
  <Text accessibilityRole="button" onPress={onPress}>
    {title}
  </Text>
));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    SheetHeader: ({ title }: any) => React.createElement(Text, null, title),
    GradientButton: (props: any) => mockGradientButton(props),
    Button: (props: any) => mockButton(props),
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

jest.mock('@/components/organisms/subscription/UnlockEverythingBanner', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    UnlockEverythingBanner: () => React.createElement(Text, null, 'Banner'),
  };
});

const mockPurchaseSubscription = jest.fn().mockResolvedValue({ success: true });

jest.mock('@/services/iap/PurchaseService', () => ({
  PurchaseService: { purchaseSubscription: (...args: any[]) => mockPurchaseSubscription(...args) },
}));

describe('SubscriptionSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts trial and closes sheet', async () => {
    const onClose = jest.fn();
    const { getByText } = renderWithProviders(<SubscriptionSheet onClose={onClose} />);

    fireEvent.press(getByText('Start 7‑Day Free Trial'));

    await waitFor(() => expect(mockPurchaseSubscription).toHaveBeenCalledWith('monthly'));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when choosing Maybe later', () => {
    const onClose = jest.fn();
    const { getByText } = renderWithProviders(<SubscriptionSheet onClose={onClose} />);

    fireEvent.press(getByText('Maybe later'));
    expect(onClose).toHaveBeenCalled();
  });
});
