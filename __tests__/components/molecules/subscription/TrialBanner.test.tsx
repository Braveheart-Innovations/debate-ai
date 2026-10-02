import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

const mockOpenSubscriptionManagement = jest.fn();
jest.mock('@/services/subscription/subscriptionManagement', () => ({
  openSubscriptionManagement: (...args: unknown[]) => mockOpenSubscriptionManagement(...args),
}));

const mockFeatureAccess = jest.fn();
jest.mock('@/hooks/useFeatureAccess', () => ({
  __esModule: true,
  default: mockFeatureAccess,
  useFeatureAccess: mockFeatureAccess,
}));

jest.mock('@/components/molecules', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

const { TrialBanner } = require('@/components/molecules/subscription/TrialBanner') as typeof import('@/components/molecules/subscription/TrialBanner');

describe('TrialBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders when in trial', () => {
    mockFeatureAccess.mockReturnValue({
      isInTrial: true,
      trialDaysRemaining: 5,
    });

    const { getByText } = renderWithProviders(<TrialBanner />);
    expect(getByText('5 days left in trial')).toBeTruthy();
  });

  it('does not render when not in trial', () => {
    mockFeatureAccess.mockReturnValue({
      isInTrial: false,
      trialDaysRemaining: null,
    });

    const { queryByTestId } = renderWithProviders(<TrialBanner testID="trial-banner" />);
    expect(queryByTestId('trial-banner')).toBeNull();
  });

  it('shows special message for last day', () => {
    mockFeatureAccess.mockReturnValue({
      isInTrial: true,
      trialDaysRemaining: 1,
    });

    const { getByText } = renderWithProviders(<TrialBanner />);
    expect(getByText('Trial ends tomorrow')).toBeTruthy();
  });

  it('opens subscription management when pressed', () => {
    mockFeatureAccess.mockReturnValue({
      isInTrial: true,
      trialDaysRemaining: 3,
    });

    const { getByText } = renderWithProviders(<TrialBanner />);
    fireEvent.press(getByText('Manage →'));
    expect(mockOpenSubscriptionManagement).toHaveBeenCalledTimes(1);
  });
});
