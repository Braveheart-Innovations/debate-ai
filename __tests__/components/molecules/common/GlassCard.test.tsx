import React from 'react';
import { Text } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children: React.ReactNode }) => children,
}));

const { GlassCard } = require('@/components/molecules/common/GlassCard');

describe('GlassCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders children correctly', () => {
    const { getByText } = renderWithProviders(
      <GlassCard>
        <Text>Test Content</Text>
      </GlassCard>
    );

    expect(getByText('Test Content')).toBeTruthy();
  });

  it('handles onPress when provided', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(
      <GlassCard onPress={onPress}>
        <Text>Pressable Card</Text>
      </GlassCard>
    );

    fireEvent.press(getByText('Pressable Card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(
      <GlassCard onPress={onPress} disabled>
        <Text>Disabled Card</Text>
      </GlassCard>
    );

    fireEvent.press(getByText('Disabled Card'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders without onPress as static card', () => {
    const { getByText } = renderWithProviders(
      <GlassCard>
        <Text>Static Card</Text>
      </GlassCard>
    );

    expect(getByText('Static Card')).toBeTruthy();
  });

  it('applies different padding sizes', () => {
    const paddingSizes = ['none', 'sm', 'md', 'lg'] as const;

    paddingSizes.forEach(padding => {
      const { getByText } = renderWithProviders(
        <GlassCard padding={padding}>
          <Text>Card with {padding} padding</Text>
        </GlassCard>
      );

      expect(getByText(`Card with ${padding} padding`)).toBeTruthy();
    });
  });
});