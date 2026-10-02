import { Text, TouchableOpacity } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import type { RootStateOverrides } from '../../../../test-utils/services/state';
import { createMockAuthState } from '@test-utils/fixtures';
import type { PropsOf } from '@test-utils/mockComponents';
import { requireDefined } from '@test-utils/queries';
import type { Button, SettingRow, SheetHeader, Typography } from '@/components/molecules';
import { buildApiKeyStatus } from '@/store';
import { SettingsContent } from '@/components/organisms/settings/SettingsContent';

const mockThemeSettings = {
  isDark: false,
  isLoading: false,
  setThemeMode: jest.fn(),
};

jest.mock('@/hooks/settings', () => ({
  useThemeSettings: jest.fn(() => mockThemeSettings),
}));

const mockSettingRow = jest.fn(({ title, onPress, rightElement, disabled }: PropsOf<typeof SettingRow>) => (
  <TouchableOpacity testID={`setting-${title}`} onPress={disabled ? undefined : onPress}>
    <Text>{title}</Text>
    {rightElement}
  </TouchableOpacity>
));

const mockButton = jest.fn(({ title, onPress, disabled }: PropsOf<typeof Button>) => (
  <Text accessibilityRole="button" onPress={disabled ? undefined : onPress}>
    {title}
  </Text>
));

jest.mock('@/components/molecules', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SheetHeader: ({ title }: PropsOf<typeof SheetHeader>) => React.createElement(Text, null, title),
    Typography: ({ children }: PropsOf<typeof Typography>) => React.createElement(Text, null, children),
    SettingRow: (props: PropsOf<typeof SettingRow>) => mockSettingRow(props),
    Button: (props: PropsOf<typeof Button>) => mockButton(props),
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

    const preloadedState: RootStateOverrides = {
      settings: {
        theme: 'light',
        fontSize: 'medium',
        apiKeys: { openai: buildApiKeyStatus('key') },
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
        activeStreamCount: 0,
        totalStreamsCompleted: 0,
        providerVerificationErrors: {},
      },
      auth: createMockAuthState(),
    };

    const { getByTestId, store } = renderWithProviders(
      <SettingsContent
        onClose={onClose}
        onNavigateToAPIConfig={onNavigateToAPIConfig}
        onNavigateToExpertMode={onNavigateToExpertMode}
      />,
      { preloadedState }
    );

    fireEvent.press(getByTestId('setting-Manage API Keys'));
    expect(onNavigateToAPIConfig).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();

    fireEvent.press(getByTestId('setting-Model Defaults'));
    expect(onNavigateToExpertMode).toHaveBeenCalled();

    const toggleStreamingButtonCall = requireDefined(
      mockButton.mock.calls.find(([props]) => props.title === 'On'),
      'streaming toggle Button render'
    );
    act(() => {
      toggleStreamingButtonCall[0].onPress();
    });
    expect(store.getState().streaming.globalStreamingEnabled).toBe(false);

  });
});
