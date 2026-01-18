import React from 'react';
import { waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import type { RootState } from '@/store';

jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(),
  default: 'ViewShot',
}));

jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DefaultTheme: {},
  DarkTheme: {},
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: jest.fn(),
  useIsFocused: () => true,
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
jest.mock('@/screens/CreateSetupScreen', () => createScreenMock('Create Setup Screen'));
jest.mock('@/screens/CreateScreen', () => createScreenMock('Create Screen'));

jest.mock('@/services/firebase/auth', () => ({
  onAuthStateChanged: jest.fn((callback) => {
    // Immediately call with null user to resolve loading state
    setTimeout(() => callback(null), 0);
    return jest.fn();
  }),
}));

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: jest.fn(),
  collection: jest.fn(),
  doc: jest.fn(),
  onSnapshot: jest.fn(() => jest.fn()),
}));

jest.mock('@/hooks/usePersonality', () => ({
  usePersonality: () => ({
    isLoading: false,
    settings: { customizations: {}, lastSyncedAt: 0, version: 1 },
    getPersonality: jest.fn().mockReturnValue(null),
    getAllPersonalities: jest.fn().mockReturnValue([]),
    isCustomized: jest.fn().mockReturnValue(false),
    getCustomization: jest.fn().mockReturnValue(null),
    updateCustomization: jest.fn(),
    updateTone: jest.fn(),
    updateDebateProfile: jest.fn(),
    updateModelParameters: jest.fn(),
    toggleCustomization: jest.fn(),
    resetToDefaults: jest.fn(),
    resetAll: jest.fn(),
    reload: jest.fn(),
  }),
  usePersonalityById: () => null,
}));

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

  it('shows welcome flow when onboarding incomplete', async () => {
    const { getByText } = renderWithProviders(<AppNavigator />, {
      preloadedState: {
        settings: { ...baseSettings, hasCompletedOnboarding: false },
      },
    });

    await waitFor(() => {
      expect(getByText('Welcome Screen')).toBeTruthy();
    });
  });

  it('renders main tabs after onboarding completes', async () => {
    const { getByText, queryByText } = renderWithProviders(<AppNavigator />, {
      preloadedState: {
        settings: { ...baseSettings, hasCompletedOnboarding: true },
      },
    });

    await waitFor(() => {
      expect(getByText('Home Screen')).toBeTruthy();
    });
    expect(queryByText('Welcome Screen')).toBeNull();
  });
});
