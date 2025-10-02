import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { ProviderCard } from '@/components/organisms/api-config/ProviderCard';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import type { AIProvider } from '@/config/aiProviders';
import * as Haptics from 'expo-haptics';
import { Linking, Alert } from 'react-native';

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(View, props, children),
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    Typography: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(Text, props, children),
    GradientButton: ({
      title,
      onPress,
      disabled,
      testID,
    }: {
      title: string;
      onPress: () => void;
      disabled?: boolean;
      testID?: string;
    }) => (
      React.createElement(
        TouchableOpacity,
        {
          onPress: disabled ? undefined : onPress,
          disabled,
          testID: testID ?? `gradient-button-${title}`,
        },
        React.createElement(Text, null, title)
      )
    ),
  };
});

jest.mock('@/components/organisms/subscription/ActualPricing', () => ({
  ActualPricing: ({ freeInfo }: { freeInfo?: unknown }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, null, freeInfo ? 'Pricing Info' : 'No Pricing');
  },
}));

jest.mock('@/utils/aiProviderAssets', () => ({
  getAIProviderIcon: jest.fn(() => ({ iconType: 'letter', icon: 'C' })),
}));

const provider: AIProvider = {
  id: 'claude',
  name: 'Claude',
  company: 'Anthropic',
  color: '#C15F3C',
  gradient: ['#C15F3C', '#D97757'],
  apiKeyPrefix: 'sk-ant-',
  apiKeyPlaceholder: 'sk-ant-api03-...',
  docsUrl: 'https://docs.anthropic.com',
  getKeyUrl: 'https://console.anthropic.com/account/keys',
  description: 'Advanced reasoning and analysis',
  features: ['Deep thinking', 'Code generation'],
  enabled: true,
};

const defaultProps = {
  provider,
  apiKey: '',
  onKeyChange: jest.fn(),
  onTest: jest.fn().mockResolvedValue({ success: true }),
  onSave: jest.fn().mockResolvedValue(undefined),
  isExpanded: false,
  onToggleExpand: jest.fn(),
  index: 0,
  testStatus: 'idle' as const,
  testStatusMessage: undefined,
  selectedModel: undefined,
  expertModeEnabled: false,
};

jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as unknown as boolean);
jest.spyOn(Alert, 'alert').mockImplementation(() => {});

describe('ProviderCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders collapsed state with provider information', () => {
    const { getByText } = renderWithProviders(<ProviderCard {...defaultProps} />);

    expect(getByText('Claude')).toBeTruthy();
    expect(getByText('Not connected')).toBeTruthy();
    expect(getByText('+')).toBeTruthy();
  });

  it('reveals API key, updates value, and tests connection when expanded', async () => {
    const onKeyChange = jest.fn();
    const onTest = jest.fn().mockResolvedValue({ success: true });
    const onSave = jest.fn().mockResolvedValue(undefined);

    const { getByText, getByDisplayValue } = renderWithProviders(
      <ProviderCard
        {...defaultProps}
        apiKey="abcdef123456"
        isExpanded
        onKeyChange={onKeyChange}
        onTest={onTest}
        onSave={onSave}
        testStatus="success"
        testStatusMessage="Verified"
        expertModeEnabled
      />
    );

    const maskedValue = 'abc••••••456';
    expect(getByDisplayValue(maskedValue)).toBeTruthy();
    expect(getByText('Verified')).toBeTruthy();

    fireEvent.press(getByText('✏️'));
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');

    const revealedInput = getByDisplayValue('abcdef123456');
    fireEvent.changeText(revealedInput, 'abcdef654321');
    expect(onKeyChange).toHaveBeenCalledWith('abcdef654321');

    fireEvent.press(getByText('Test Connection'));

    expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);

    await waitFor(() => {
      expect(onTest).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    expect(getByDisplayValue('abc••••••321')).toBeTruthy();
  });

  it('handles failed connection tests without saving', async () => {
    const onTest = jest.fn().mockResolvedValue({ success: false, message: 'Invalid key' });
    const onSave = jest.fn();

    const { getByText } = renderWithProviders(
      <ProviderCard
        {...defaultProps}
        apiKey="abcdef123456"
        isExpanded
        onTest={onTest}
        onSave={onSave}
      />
    );

    fireEvent.press(getByText('Test Connection'));

    await waitFor(() => {
      expect(onTest).toHaveBeenCalledTimes(1);
    });

    expect(onSave).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('error');
  });
});
