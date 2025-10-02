import React from 'react';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import type { RootState } from '@/store';

jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DefaultTheme: {},
  DarkTheme: {},
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('@react-navigation/stack', () => ({
  createStackNavigator: () => {
    const Screen = ({ component: Component }: { component: React.ComponentType }) => <Component />;
    const Navigator = ({ children }: { children: React.ReactNode }) => <>{children}</>;
    return { Screen, Navigator };
  },
}));

jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => {
    const Screen = ({ component: Component }: { component: React.ComponentType }) => <Component />;
    const Navigator = ({ children }: { children: React.ReactNode }) => <>{children}</>;
    return { Screen, Navigator };
  },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialIcons: () => null,
  MaterialCommunityIcons: () => null,
}));

jest.mock('@/navigation/GlobalSheets', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    GlobalSheets: () => React.createElement(Text, null, 'GlobalSheets'),
  };
});

const createScreenMock = (label: string) => () => {
  const React = require('react');
  const { Text } = require('react-native');
  return React.createElement(Text, null, label);
};

jest.mock('@/screens/WelcomeScreen', () => createScreenMock('Welcome Screen'));
jest.mock('@/screens/HomeScreen', () => createScreenMock('Home Screen'));
jest.mock('@/screens/ChatScreen', () => createScreenMock('Chat Screen'));
jest.mock('@/screens/HistoryScreen', () => createScreenMock('History Screen'));
jest.mock('@/screens/APIConfigScreen', () => createScreenMock('API Config Screen'));
jest.mock('@/screens/DebateScreen', () => createScreenMock('Debate Screen'));
jest.mock('@/screens/DebateSetupScreen', () => createScreenMock('Debate Setup Screen'));
jest.mock('@/screens/DebateTranscriptScreen', () => createScreenMock('Debate Transcript Screen'));
jest.mock('@/screens/StatsScreen', () => createScreenMock('Stats Screen'));
jest.mock('@/screens/CompareSetupScreen', () => createScreenMock('Compare Setup Screen'));
jest.mock('@/screens/CompareScreen', () => createScreenMock('Compare Screen'));
jest.mock('@/screens/UpgradeScreen', () => createScreenMock('Upgrade Screen'));
jest.mock('@/screens/ExpertModeScreen', () => createScreenMock('Expert Mode Screen'));
jest.mock('@/screens/PrivacyPolicyScreen', () => createScreenMock('Privacy Policy Screen'));
jest.mock('@/screens/TermsOfServiceScreen', () => createScreenMock('Terms Screen'));

const AppNavigator = require('@/navigation/AppNavigator').default;

describe('AppNavigator', () => {
  const baseSettings: RootState['settings'] = {
    theme: 'auto',
    fontSize: 'medium',
    apiKeys: {},
    realtimeRelayUrl: undefined,
    verifiedProviders: [],
    verificationTimestamps: {},
    verificationModels: {},
    expertMode: {},
    hasCompletedOnboarding: false,
    recordModeEnabled: false,
  };

  it('shows welcome flow when onboarding incomplete', () => {
    const { getByText } = renderWithProviders(<AppNavigator />, {
      preloadedState: {
        settings: { ...baseSettings, hasCompletedOnboarding: false },
      },
    });

    expect(getByText('Welcome Screen')).toBeTruthy();
  });

  it('renders main tabs after onboarding completes', () => {
    const { getByText, queryByText } = renderWithProviders(<AppNavigator />, {
      preloadedState: {
        settings: { ...baseSettings, hasCompletedOnboarding: true },
      },
    });

    expect(getByText('Home Screen')).toBeTruthy();
    expect(queryByText('Welcome Screen')).toBeNull();
  });
});
