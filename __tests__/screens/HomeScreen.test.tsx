import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialIcons: () => null,
  MaterialCommunityIcons: () => null,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));

const mockFeatureAccess = jest.fn();
const mockUseGreeting = jest.fn();
const mockUsePremiumFeatures = jest.fn();
const mockUseAISelection = jest.fn();
const mockUseSessionManagement = jest.fn();
const mockUseQuickStart = jest.fn();

jest.mock('@/hooks/useFeatureAccess', () => {
  const mock = mockFeatureAccess;
  return {
    __esModule: true,
    default: mock,
    useFeatureAccess: mock,
  };
});

jest.mock('@/hooks/home/useGreeting', () => ({
  useGreeting: (...args: unknown[]) => mockUseGreeting(...args),
}));

jest.mock('@/hooks/home/usePremiumFeatures', () => ({
  usePremiumFeatures: (...args: unknown[]) => mockUsePremiumFeatures(...args),
}));

jest.mock('@/hooks/home/useAISelection', () => ({
  useAISelection: (...args: unknown[]) => mockUseAISelection(...args),
}));

jest.mock('@/hooks/home/useSessionManagement', () => ({
  useSessionManagement: (...args: unknown[]) => mockUseSessionManagement(...args),
}));

jest.mock('@/hooks/home/useQuickStart', () => ({
  useQuickStart: (...args: unknown[]) => mockUseQuickStart(...args),
}));

jest.mock('@/components/molecules/subscription/TrialBanner', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    TrialBanner: () => React.createElement(Text, null, 'TrialBanner'),
  };
});

jest.mock('@/components/molecules/subscription/DemoBanner', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    DemoBanner: ({ onPress }: { onPress?: () => void }) =>
      React.createElement(Text, { onPress }, 'Demo Mode'),
  };
});

jest.mock('@/components/organisms', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Header: ({ title, subtitle }: { title: string; subtitle?: string }) => (
      React.createElement(Text, null, `${title} ${subtitle ?? ''}`)
    ),
    HeaderActions: () => React.createElement(Text, null, 'HeaderActions'),
    DynamicAISelector: ({ onStartChat }: { onStartChat: () => void }) => (
      React.createElement(Text, { testID: 'start-chat', onPress: onStartChat }, 'Start Chat')
    ),
    QuickStartsSection: () => React.createElement(Text, null, 'QuickStarts'),
    PromptWizard: ({ visible }: { visible: boolean }) => (
      visible ? React.createElement(Text, { testID: 'prompt-wizard' }, 'Prompt Wizard') : null
    ),
  };
});

jest.mock('@/components/organisms/demo/ChatTopicPickerModal', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    ChatTopicPickerModal: ({ visible }: { visible: boolean }) => (
      visible ? React.createElement(Text, { testID: 'topic-picker' }, 'Topic Picker') : null
    ),
  };
});

const HomeScreen = require('@/screens/HomeScreen').default;

describe('HomeScreen', () => {
  const navigation = { navigate: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFeatureAccess.mockReturnValue({ isDemo: true });
    mockUseGreeting.mockReturnValue({
      timeBasedGreeting: 'Good morning',
      welcomeMessage: 'Welcome back',
    });
    mockUsePremiumFeatures.mockReturnValue({ maxAIs: 2 });
    mockUseAISelection.mockReturnValue({
      hasSelection: true,
      selectionCount: 2,
      configuredAIs: [],
      selectedAIs: [
        { id: 'ai-1', provider: 'claude', name: 'Claude', model: 'claude-3-haiku' },
      ],
      maxAIs: 2,
      toggleAI: jest.fn(),
      changePersonality: jest.fn(),
      changeModel: jest.fn(),
      aiPersonalities: {},
      selectedModels: {},
    });
    mockUseSessionManagement.mockReturnValue({
      createSession: jest.fn().mockReturnValue('session-1'),
    });
    mockUseQuickStart.mockReturnValue({
      topics: [{ id: 'topic-1', label: 'Topic' }],
      isAvailable: jest.fn().mockReturnValue(true),
      selectTopic: jest.fn(),
      showWizard: false,
      selectedTopic: null,
      closeWizard: jest.fn(),
      validateCompletion: jest.fn().mockReturnValue(true),
    });
  });

  it('shows greeting text', () => {
    const { getByText } = renderWithProviders(
      <HomeScreen navigation={navigation} />
    );

    expect(getByText(/Good morning/)).toBeTruthy();
    expect(getByText(/Welcome back/)).toBeTruthy();
  });

  it('opens topic picker when starting chat in demo mode', () => {
    const { getByTestId, queryByTestId } = renderWithProviders(
      <HomeScreen navigation={navigation} />
    );

    expect(queryByTestId('topic-picker')).toBeNull();

    fireEvent.press(getByTestId('start-chat'));

    expect(getByTestId('topic-picker')).toBeTruthy();
  });
});
