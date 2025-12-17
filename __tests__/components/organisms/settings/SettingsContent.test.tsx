import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { SettingsContent } from '@/components/organisms/settings/SettingsContent';
import type { RootState } from '@/store';

const mockThemeSettings = {
  isDark: false,
  isLoading: false,
  setThemeMode: jest.fn(),
};

jest.mock('@/hooks/settings', () => ({
  useThemeSettings: jest.fn(() => mockThemeSettings),
}));

const mockSettingRow = jest.fn(({ title, onPress, rightElement, disabled }: any) => (
  <TouchableOpacity testID={`setting-${title}`} onPress={disabled ? undefined : onPress}>
    <Text>{title}</Text>
    {rightElement}
  </TouchableOpacity>
));

const mockButton = jest.fn(({ title, onPress, disabled }: any) => (
  <Text accessibilityRole="button" onPress={disabled ? undefined : onPress}>
    {title}
  </Text>
));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    SheetHeader: ({ title }: any) => React.createElement(Text, null, title),
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    SettingRow: (props: any) => mockSettingRow(props),
    Button: (props: any) => mockButton(props),
  };
});

describe('SettingsContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('navigates to API config and toggles streaming preferences', () => {
    const onNavigateToAPIConfig = jest.fn();
    const onNavigateToExpertMode = jest.fn();
    const onClose = jest.fn();

    const preloadedState: Partial<RootState> = {
      settings: {
        theme: 'light',
        fontSize: 'medium',
        apiKeys: { openai: 'key' },
        realtimeRelayUrl: '',
        verifiedProviders: [],
        verificationTimestamps: {},
        verificationModels: {},
        expertMode: {},
        hasCompletedOnboarding: true,
        recordModeEnabled: false,
      },
      streaming: {
        streamingMessages: {},
        streamingPreferences: {},
        globalStreamingEnabled: true,
        streamingSpeed: 'natural',
        activeStreamCount: 0,
        totalStreamsCompleted: 0,
        providerVerificationErrors: {},
      },
      auth: {
        user: null,
        isAuthenticated: false,
        isPremium: false,
        authLoading: false,
        authModalVisible: false,
        userProfile: null,
        isAnonymous: false,
        lastAuthMethod: null,
        socialAuthLoading: false,
        socialAuthError: null,
      },
    } as any;

    const { getByTestId, store } = renderWithProviders(
      <SettingsContent
        onClose={onClose}
        onNavigateToAPIConfig={onNavigateToAPIConfig}
        onNavigateToExpertMode={onNavigateToExpertMode}
      />,
      { preloadedState: preloadedState as RootState }
    );

    fireEvent.press(getByTestId('setting-Manage API Keys'));
    expect(onNavigateToAPIConfig).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();

    fireEvent.press(getByTestId('setting-Expert Mode'));
    expect(onNavigateToExpertMode).toHaveBeenCalled();

    const toggleStreamingButtonCall = mockButton.mock.calls.find(([props]: any) => props.title === 'On');
    act(() => {
      toggleStreamingButtonCall?.[0].onPress();
    });
    expect(store.getState().streaming.globalStreamingEnabled).toBe(false);

    const speedRowCall = mockSettingRow.mock.calls.find(([props]: any) => props.title === 'Streaming Speed');
    act(() => {
      speedRowCall?.[0].onPress();
    });
    expect(store.getState().streaming.streamingSpeed).toBe('slow');
  });
});
