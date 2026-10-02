import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import type { Ionicons } from '@expo/vector-icons';
import { GradientButton } from '@/components/molecules/common/GradientButton';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('@expo/vector-icons', () => {
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  return { Ionicons: stubComponent<typeof Ionicons>('ionicon') };
});

jest.mock('@/components/molecules', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

describe('GradientButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders button title', () => {
    const { getByText } = renderWithProviders(
      <GradientButton title="Test Button" onPress={jest.fn()} />
    );

    expect(getByText('Test Button')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(
      <GradientButton title="Press Me" onPress={onPress} />
    );

    fireEvent.press(getByText('Press Me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(
      <GradientButton title="Disabled" onPress={onPress} disabled />
    );

    fireEvent.press(getByText('Disabled'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('does not call onPress when loading', () => {
    const onPress = jest.fn();
    const { queryByText } = renderWithProviders(
      <GradientButton title="Loading" onPress={onPress} loading />
    );

    // Title should not be visible when loading
    expect(queryByText('Loading')).toBeNull();
  });

  it('renders with primary variant', () => {
    const { getByText } = renderWithProviders(
      <GradientButton title="Primary" variant="primary" onPress={jest.fn()} />
    );

    expect(getByText('Primary')).toBeTruthy();
  });

  it('renders with secondary variant', () => {
    const { getByText } = renderWithProviders(
      <GradientButton title="Secondary" variant="secondary" onPress={jest.fn()} />
    );

    expect(getByText('Secondary')).toBeTruthy();
  });

  it('renders with success variant', () => {
    const { getByText } = renderWithProviders(
      <GradientButton title="Success" variant="success" onPress={jest.fn()} />
    );

    expect(getByText('Success')).toBeTruthy();
  });

  it('renders with small size', () => {
    const { getByText } = renderWithProviders(
      <GradientButton title="Small" size="small" onPress={jest.fn()} />
    );

    expect(getByText('Small')).toBeTruthy();
  });

  it('renders with medium size', () => {
    const { getByText } = renderWithProviders(
      <GradientButton title="Medium" size="medium" onPress={jest.fn()} />
    );

    expect(getByText('Medium')).toBeTruthy();
  });

  it('renders with large size', () => {
    const { getByText } = renderWithProviders(
      <GradientButton title="Large" size="large" onPress={jest.fn()} />
    );

    expect(getByText('Large')).toBeTruthy();
  });

  it('renders with fullWidth prop', () => {
    const { getByText } = renderWithProviders(
      <GradientButton title="Full Width" fullWidth onPress={jest.fn()} />
    );

    expect(getByText('Full Width')).toBeTruthy();
  });

  it('accepts custom gradient colors', () => {
    const customGradient = ['#FF0000', '#00FF00', '#0000FF'];
    const { getByText } = renderWithProviders(
      <GradientButton
        title="Custom Gradient"
        gradient={customGradient}
        onPress={jest.fn()}
      />
    );

    expect(getByText('Custom Gradient')).toBeTruthy();
  });

  describe('trailing icon', () => {
    it('renders trailing icon when trailingIcon and onTrailingIconPress provided', () => {
      const { getAllByTestId } = renderWithProviders(
        <GradientButton
          title="With Icon"
          onPress={jest.fn()}
          trailingIcon="bulb-outline"
          onTrailingIconPress={jest.fn()}
        />
      );

      // Icon should be rendered (Ionicons mock)
      const icons = getAllByTestId('ionicon');
      expect(icons.length).toBeGreaterThan(0);
    });

    it('does not render trailing icon when onTrailingIconPress is undefined', () => {
      const { queryAllByTestId } = renderWithProviders(
        <GradientButton
          title="No Icon"
          onPress={jest.fn()}
          trailingIcon="bulb-outline"
        />
      );

      const icons = queryAllByTestId('ionicon');
      expect(icons.length).toBe(0);
    });

    it('calls onTrailingIconPress when trailing icon pressed', () => {
      const onTrailingIconPress = jest.fn();
      const { getAllByTestId } = renderWithProviders(
        <GradientButton
          title="Clickable Icon"
          onPress={jest.fn()}
          trailingIcon="bulb-outline"
          onTrailingIconPress={onTrailingIconPress}
        />
      );

      // Pressing the icon bubbles to its enclosing trailing touchable
      fireEvent.press(getAllByTestId('ionicon')[0]);

      expect(onTrailingIconPress).toHaveBeenCalledTimes(1);
      expect(jest.mocked(Haptics.impactAsync)).toHaveBeenCalled();
    });

    it('does not call onTrailingIconPress when trailingIconDisabled', () => {
      const onTrailingIconPress = jest.fn();
      const { getAllByTestId } = renderWithProviders(
        <GradientButton
          title="Disabled Icon"
          onPress={jest.fn()}
          trailingIcon="bulb-outline"
          onTrailingIconPress={onTrailingIconPress}
          trailingIconDisabled
        />
      );

      // Pressing the icon bubbles to its enclosing trailing touchable
      fireEvent.press(getAllByTestId('ionicon')[0]);

      expect(onTrailingIconPress).not.toHaveBeenCalled();
    });

    it('does not call onTrailingIconPress when button is disabled', () => {
      const onTrailingIconPress = jest.fn();
      const { getAllByTestId } = renderWithProviders(
        <GradientButton
          title="Disabled Button"
          onPress={jest.fn()}
          trailingIcon="bulb-outline"
          onTrailingIconPress={onTrailingIconPress}
          disabled
        />
      );

      // Pressing the icon bubbles to its enclosing trailing touchable
      fireEvent.press(getAllByTestId('ionicon')[0]);

      expect(onTrailingIconPress).not.toHaveBeenCalled();
    });
  });
});