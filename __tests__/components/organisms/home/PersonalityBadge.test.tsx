import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { PersonalityBadge } from '@/components/organisms/home/PersonalityBadge';

jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

describe('PersonalityBadge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('triggers onPress with haptic feedback', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(
      <PersonalityBadge personalityName="Scholar" onPress={onPress} />
    );

    fireEvent.press(getByText('Scholar'));
    expect(onPress).toHaveBeenCalled();
    expect(require('expo-haptics').impactAsync).toHaveBeenCalled();
  });

  it('does not fire onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(
      <PersonalityBadge personalityName="Scholar" onPress={onPress} disabled />
    );

    fireEvent.press(getByText('Scholar'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
