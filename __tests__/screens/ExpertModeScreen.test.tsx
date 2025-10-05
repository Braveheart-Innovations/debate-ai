import React from 'react';
import { Text } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { showSheet, updateExpertMode } from '@/store';

const mockDispatch = jest.fn();
const mockUseSelector = jest.fn();

jest.mock('react-redux', () => {
  const actual = jest.requireActual('react-redux');
  return {
    ...actual,
    useDispatch: () => mockDispatch,
    useSelector: (selector: (state: any) => any) => mockUseSelector(selector),
  };
});

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
}));

jest.mock('@/config/aiProviders', () => ({
  AI_PROVIDERS: [
    { id: 'claude', name: 'Claude', gradient: ['#000', '#111'], color: '#123', enabled: true },
    { id: 'openai', name: 'OpenAI', gradient: ['#222', '#333'], color: '#456', enabled: true },
  ],
}));

jest.mock('@/utils/aiProviderAssets', () => ({
  getAIProviderIcon: () => ({ iconType: 'letter', icon: 'C' }),
}));

const providerProps: Record<string, any> = {};
const mockProviderExpertSettings = jest.fn((props) => {
  providerProps[props.providerId] = props;
  return <Text testID={`settings-${props.providerId}`}>settings</Text>;
});

const mockHeader = jest.fn(({ title, onBack }: { title: string; onBack: () => void }) => (
  <Text testID="header" onPress={onBack}>
    {title}
  </Text>
));

jest.mock('@/components/organisms', () => ({
  Header: (props: any) => mockHeader(props),
  ProviderExpertSettings: (props: any) => mockProviderExpertSettings(props),
}));

const ExpertModeScreen = require('@/screens/ExpertModeScreen').default;

describe('ExpertModeScreen', () => {
  const navigation = { goBack: jest.fn() };
  const baseState = {
    settings: {
      apiKeys: { claude: 'key-1', openai: 'key-2' },
      expertMode: {
        claude: { enabled: true, selectedModel: 'claude-model', parameters: { temperature: 0.8 } },
        openai: { enabled: false, selectedModel: undefined, parameters: {} },
      },
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDispatch.mockClear();
    navigation.goBack.mockClear();
    Object.keys(providerProps).forEach((key) => delete providerProps[key]);
    mockUseSelector.mockImplementation((selector) => selector(baseState));
  });

  it('renders provider settings for enabled providers and dispatches updates', () => {
    const { getByTestId } = renderWithProviders(
      <ExpertModeScreen navigation={navigation} />
    );

    expect(getByTestId('settings-claude')).toBeTruthy();
    expect(providerProps.claude).toMatchObject({
      providerId: 'claude',
      isEnabled: true,
      selectedModel: 'claude-model',
    });

    providerProps.claude.onToggle(false);
    expect(mockDispatch).toHaveBeenCalledWith(updateExpertMode({
      provider: 'claude',
      config: expect.objectContaining({ enabled: false }),
    }));

    fireEvent.press(getByTestId('header'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith(showSheet({ sheet: 'settings' }));
  });
});
