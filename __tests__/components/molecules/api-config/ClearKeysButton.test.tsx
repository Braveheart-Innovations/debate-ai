import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import * as Haptics from 'expo-haptics';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
  },
  NotificationFeedbackType: {
    Success: 'success',
    Error: 'error',
  },
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

const { ClearKeysButton } = require('@/components/molecules/api-config/ClearKeysButton');

describe('ClearKeysButton', () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders when isVisible is true', () => {
    const { getByText } = renderWithProviders(
      <ClearKeysButton onPress={mockOnPress} isVisible={true} />
    );

    expect(getByText('Clear All Keys')).toBeTruthy();
  });

  it('does not render when isVisible is false', () => {
    const { queryByTestId } = renderWithProviders(
      <ClearKeysButton onPress={mockOnPress} isVisible={false} testID="clear-keys-button" />
    );

    expect(queryByTestId('clear-keys-button')).toBeNull();
  });

  it('shows default title and subtitle', () => {
    const { getByText } = renderWithProviders(
      <ClearKeysButton onPress={mockOnPress} isVisible={true} />
    );

    expect(getByText('Clear All Keys')).toBeTruthy();
    expect(getByText('Remove all configured API keys')).toBeTruthy();
  });

  it('shows custom title and subtitle', () => {
    const { getByText } = renderWithProviders(
      <ClearKeysButton
        onPress={mockOnPress}
        isVisible={true}
        title="Custom Title"
        subtitle="Custom subtitle"
      />
    );

    expect(getByText('Custom Title')).toBeTruthy();
    expect(getByText('Custom subtitle')).toBeTruthy();
  });

  it('shows default icon', () => {
    const { getByText } = renderWithProviders(
      <ClearKeysButton onPress={mockOnPress} isVisible={true} />
    );

    expect(getByText('🗑️')).toBeTruthy();
  });

  it('shows custom icon', () => {
    const { getByText } = renderWithProviders(
      <ClearKeysButton
        onPress={mockOnPress}
        isVisible={true}
        icon="⚠️"
      />
    );

    expect(getByText('⚠️')).toBeTruthy();
  });

  it('shows confirmation alert when pressed', () => {
    const { getByText } = renderWithProviders(
      <ClearKeysButton onPress={mockOnPress} isVisible={true} />
    );

    fireEvent.press(getByText('Clear All Keys'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Clear All API Keys',
      'This will remove all configured API keys. Are you sure?',
      expect.any(Array)
    );
  });

  it('triggers haptic feedback when pressed', () => {
    const { getByText } = renderWithProviders(
      <ClearKeysButton onPress={mockOnPress} isVisible={true} />
    );

    fireEvent.press(getByText('Clear All Keys'));

    expect(Haptics.impactAsync).toHaveBeenCalledWith(
      Haptics.ImpactFeedbackStyle.Light
    );
  });

  it('does not show alert when disabled', () => {
    const { getByText } = renderWithProviders(
      <ClearKeysButton
        onPress={mockOnPress}
        isVisible={true}
        disabled={true}
      />
    );

    fireEvent.press(getByText('Clear All Keys'));

    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('applies testID when provided', () => {
    const { getByTestId } = renderWithProviders(
      <ClearKeysButton
        onPress={mockOnPress}
        isVisible={true}
        testID="clear-keys-button"
      />
    );

    expect(getByTestId('clear-keys-button')).toBeTruthy();
  });

  it('uses custom confirm title and message', () => {
    const { getByText } = renderWithProviders(
      <ClearKeysButton
        onPress={mockOnPress}
        isVisible={true}
        confirmTitle="Custom Confirm Title"
        confirmMessage="Custom confirm message"
      />
    );

    fireEvent.press(getByText('Clear All Keys'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Custom Confirm Title',
      'Custom confirm message',
      expect.any(Array)
    );
  });
});