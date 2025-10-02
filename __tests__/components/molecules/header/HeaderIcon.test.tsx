import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import * as Haptics from 'expo-haptics';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialIcons: () => null,
  MaterialCommunityIcons: () => null,
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const { HeaderIcon } = require('@/components/molecules/header/HeaderIcon');

describe('HeaderIcon', () => {
  it('renders with ionicons library', () => {
    const onPress = jest.fn();
    const result = renderWithProviders(
      <HeaderIcon name="menu" onPress={onPress} />
    );
    expect(result).toBeTruthy();
  });

  it('calls onPress with haptic feedback', () => {
    const onPress = jest.fn();
    const { getByTestId } = renderWithProviders(
      <HeaderIcon name="menu" onPress={onPress} testID="header-icon" />
    );

    fireEvent.press(getByTestId('header-icon'));
    expect(onPress).toHaveBeenCalled();
    expect(Haptics.impactAsync).toHaveBeenCalled();
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByTestId } = renderWithProviders(
      <HeaderIcon name="menu" onPress={onPress} disabled testID="header-icon" />
    );

    fireEvent.press(getByTestId('header-icon'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows badge when provided', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(
      <HeaderIcon name="notifications" onPress={onPress} badge={5} />
    );
    expect(getByText('5')).toBeTruthy();
  });

  it('shows 99+ for badges over 99', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(
      <HeaderIcon name="notifications" onPress={onPress} badge={150} />
    );
    expect(getByText('99+')).toBeTruthy();
  });
});
