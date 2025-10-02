import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ContinueButton } from '@/components/organisms/compare/ContinueButton';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

describe('ContinueButton', () => {
  it('calls onPress when enabled', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(
      <ContinueButton onPress={onPress} side="left" />
    );

    fireEvent.press(getByText('Continue with this AI'));
    expect(onPress).toHaveBeenCalled();
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(
      <ContinueButton onPress={onPress} side="right" isDisabled />
    );

    fireEvent.press(getByText('Continue with this AI'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('applies accent color to text when provided', () => {
    const { getByText } = renderWithProviders(
      <ContinueButton onPress={jest.fn()} side="left" accentColor="#112233" />
    );

    const text = getByText('Continue with this AI');
    const styleArray = Array.isArray(text.props.style) ? text.props.style : [text.props.style];
    expect(styleArray.some((style) => style?.color === '#112233')).toBe(true);
  });
});
