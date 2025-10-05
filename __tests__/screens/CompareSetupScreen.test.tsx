import React from 'react';
import { act } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { setAIPersonality, setAIModel } from '@/store';

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

jest.mock('@/hooks/useFeatureAccess', () => ({
  __esModule: true,
  default: () => ({ isDemo: false }),
  useFeatureAccess: () => ({ isDemo: false }),
}));

jest.mock('@/components/molecules/subscription/TrialBanner', () => ({
  TrialBanner: () => null,
}));

jest.mock('@/components/molecules/subscription/DemoBanner', () => ({
  DemoBanner: () => null,
}));

jest.mock('@/components/organisms/demo/CompareSamplePickerModal', () => ({
  CompareSamplePickerModal: () => null,
}));

const mockSelectorStore = { selectors: [] as any[] };

jest.mock('@/components/organisms', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Header: (props: any) => React.createElement(Text, null, props.title),
    HeaderActions: () => React.createElement(Text, null, 'actions'),
    DynamicAISelector: (props: any) => {
      mockSelectorStore.selectors.push(props);
      return React.createElement(Text, { testID: `selector-${mockSelectorStore.selectors.length}` }, 'selector');
    },
  };
});

jest.mock('@/config/aiProviders', () => ({
  AI_PROVIDERS: [
    { id: 'claude', name: 'Claude', gradient: ['#000', '#111'], color: '#123', enabled: true },
    { id: 'openai', name: 'OpenAI', gradient: ['#222', '#333'], color: '#456', enabled: true },
  ],
}));

jest.mock('@/config/modelConfigs', () => ({
  AI_MODELS: {
    claude: [{ id: 'claude-default', name: 'Claude Default', isDefault: true }],
    openai: [{ id: 'gpt-5', name: 'GPT-5', isDefault: true }],
  },
}));

jest.mock('@/utils/aiProviderAssets', () => ({
  getAIProviderIcon: () => ({ iconType: 'letter', icon: 'C' }),
}));

const mockButton = jest.fn();

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Button: (props: any) => {
      mockButton(props);
      return React.createElement(Text, { accessibilityRole: 'button', onPress: props.onPress }, props.title);
    },
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

const CompareSetupScreen = require('@/screens/CompareSetupScreen').default;

describe('CompareSetupScreen', () => {
  const navigation = { navigate: jest.fn() };
  const baseState = {
    settings: {
      apiKeys: { claude: 'key-1', openai: 'key-2' },
      expertMode: {},
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDispatch.mockClear();
    navigation.navigate.mockClear();
    mockButton.mockClear();
    mockSelectorStore.selectors.length = 0;
    mockUseSelector.mockImplementation((selector) => selector(baseState));
  });

  it('starts comparison when both sides selected', () => {
    renderWithProviders(
      <CompareSetupScreen navigation={navigation as any} />
    );

    expect(mockSelectorStore.selectors.length).toBe(2);
    const leftProps = mockSelectorStore.selectors[0];
    const rightProps = mockSelectorStore.selectors[1];

    const leftAI = leftProps.configuredAIs[0];
    const rightAI = rightProps.configuredAIs.find((ai: any) => ai.id !== leftAI.id) || rightProps.configuredAIs[0];

    act(() => {
      leftProps.onToggleAI(leftAI);
      rightProps.onToggleAI(rightAI);
    });

    const startButtonCall = mockButton.mock.calls.find(([props]) => props.title === 'Start Comparison');
    expect(startButtonCall).toBeDefined();

    act(() => {
      startButtonCall?.[0].onPress();
    });

    expect(mockDispatch).toHaveBeenCalledWith(setAIPersonality({ aiId: leftAI.id, personalityId: expect.any(String) }));
    expect(mockDispatch).toHaveBeenCalledWith(setAIModel({ aiId: leftAI.id, modelId: expect.any(String) }));
    expect(mockDispatch).toHaveBeenCalledWith(setAIPersonality({ aiId: rightAI.id, personalityId: expect.any(String) }));
    expect(mockDispatch).toHaveBeenCalledWith(setAIModel({ aiId: rightAI.id, modelId: expect.any(String) }));

    expect(navigation.navigate).toHaveBeenCalledWith('CompareSession', expect.objectContaining({
      leftAI: expect.objectContaining({ id: leftAI.id }),
      rightAI: expect.objectContaining({ id: rightAI.id }),
    }));
  });
});
