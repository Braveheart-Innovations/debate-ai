import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import * as Haptics from 'expo-haptics';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
}));

const { IconButton } = require('@/components/molecules/common/IconButton');

describe('IconButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with custom icon', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(
      <IconButton icon="★" onPress={onPress} />
    );

    expect(getByText('★')).toBeTruthy();
  });

  it('renders increment type icon', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(
      <IconButton type="increment" onPress={onPress} />
    );

    expect(getByText('+')).toBeTruthy();
  });

  it('renders decrement type icon', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(
      <IconButton type="decrement" onPress={onPress} />
    );

    expect(getByText('−')).toBeTruthy();
  });

  it('calls onPress with haptic feedback', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(
      <IconButton icon="✓" onPress={onPress} />
    );

    fireEvent.press(getByText('✓'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('does not call onPress or trigger haptic when disabled', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(
      <IconButton icon="✓" onPress={onPress} disabled />
    );

    fireEvent.press(getByText('✓'));

    expect(onPress).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it('applies custom size', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(
      <IconButton icon="○" onPress={onPress} size={48} />
    );

    expect(getByText('○')).toBeTruthy();
  });

  it('uses default size when not specified', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(
      <IconButton icon="○" onPress={onPress} />
    );

    expect(getByText('○')).toBeTruthy();
  });
});