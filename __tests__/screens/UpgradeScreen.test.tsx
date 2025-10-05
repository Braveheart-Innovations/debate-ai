import React from 'react';
import { Text, Alert } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
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
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
}));

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
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
  const React = require('react');
  const { Text } = require('react-native');
  return {
    GradientButton: (props: any) => mockGradientButton(props),
    Button: (props: any) => mockButton(props),
    Typography: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
  };
});

const UpgradeScreen = require('@/screens/UpgradeScreen').default;

describe('UpgradeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGoBack.mockReset();
  });

  it('renders feature list and handles subscription actions', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { getByText, getAllByText, getByTestId } = renderWithProviders(<UpgradeScreen />);

    expect(getByText('Unlock Premium')).toBeTruthy();
    expect(getByText('All Signature Styles + Seasonal Packs')).toBeTruthy();
    expect(getByTestId('gradient')).toBeTruthy();

    const subscribeButtons = getAllByText('Subscribe Now');
    fireEvent.press(subscribeButtons[0]);
    expect(alertSpy).toHaveBeenCalledWith('Subscribe', expect.stringContaining('monthly'));

    fireEvent.press(subscribeButtons[1]);
    expect(alertSpy).toHaveBeenCalledWith('Subscribe', expect.stringContaining('yearly'));

    const restoreButton = getByText('Restore Purchases');
    fireEvent.press(restoreButton);
    expect(alertSpy).toHaveBeenCalledWith('Restore', expect.any(String));

    fireEvent.press(getByTestId('header'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);

    alertSpy.mockRestore();
  });
});
