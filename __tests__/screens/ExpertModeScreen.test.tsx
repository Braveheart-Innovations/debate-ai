import React from 'react';
import { Text } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { buildApiKeyStatus, showSheet, updateExpertMode } from '@/store';
import type { RootState } from '@/store';
import ExpertModeScreen from '@/screens/ExpertModeScreen';
import { capturePropsOf, type PropsOf } from '@test-utils/mockComponents';
import { requireDefined } from '@test-utils/queries';
import { buildRootState } from '@test-utils/services/state';
import type { Header, ProviderExpertSettings } from '@/components/organisms';

const mockDispatch = jest.fn();
const mockUseSelector = jest.fn<unknown, [(state: RootState) => unknown]>();

jest.mock('react-redux', () => {
  const actual = jest.requireActual<typeof import('react-redux')>('react-redux');
  return {
    ...actual,
    useDispatch: () => mockDispatch,
    useSelector: (selector: (state: RootState) => unknown) => mockUseSelector(selector),
  };
});

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native') as typeof import('react-native');
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

const providerProps: Partial<Record<string, PropsOf<typeof ProviderExpertSettings>>> = {};
const mockProviderExpertSettings = capturePropsOf<typeof ProviderExpertSettings>((props) => {
  providerProps[props.providerId] = props;
  return <Text testID={`settings-${props.providerId}`}>settings</Text>;
});

const mockHeader = capturePropsOf<typeof Header>(({ title, onBack }) => (
  <Text testID="header" onPress={onBack}>
    {title}
  </Text>
));

jest.mock('@/components/organisms', () => ({
  get Header() {
    return mockHeader.Stub;
  },
  get ProviderExpertSettings() {
    return mockProviderExpertSettings.Stub;
  },
}));

// Mock useFeatureAccess to allow premium features
jest.mock('@/hooks/useFeatureAccess', () => ({
  __esModule: true,
  default: () => ({
    isDemo: false,
    isPremium: true,
    isInTrial: false,
    canStartTrial: false,
    hasUsedTrial: true,
    trialDaysRemaining: null,
    refresh: jest.fn(),
  }),
}));

describe('ExpertModeScreen', () => {
  const navigation = { goBack: jest.fn() };
  const baseState = buildRootState({
    settings: {
      apiKeys: { claude: buildApiKeyStatus('key-1'), openai: buildApiKeyStatus('key-2') },
      expertMode: {
        claude: { enabled: true, selectedModel: 'claude-model', parameters: { temperature: 0.8 } },
        openai: { enabled: false, selectedModel: undefined, parameters: {} },
      },
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockDispatch.mockClear();
    navigation.goBack.mockClear();
    Object.keys(providerProps).forEach((key) => delete providerProps[key]);
    mockProviderExpertSettings.reset();
    mockHeader.reset();
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

    requireDefined(providerProps.claude, 'claude settings props').onToggle(false);
    expect(mockDispatch).toHaveBeenCalledWith(updateExpertMode({
      provider: 'claude',
      config: expect.objectContaining({ enabled: false }),
    }));

    fireEvent.press(getByTestId('header'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(mockDispatch).not.toHaveBeenCalledWith(showSheet({ sheet: 'settings' }));
  });

  it('reopens the Settings sheet on back only when launched from it', () => {
    const { getByTestId } = renderWithProviders(
      <ExpertModeScreen navigation={navigation} route={{ params: { from: 'settings' } }} />
    );

    fireEvent.press(getByTestId('header'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith(showSheet({ sheet: 'settings' }));
  });
});
