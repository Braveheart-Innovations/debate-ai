import React from 'react';
import { waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { createAppStore } from '@/store';
import type { RootState } from '@/store';

/**
 * What the NavigationContainer stub records. AppNavigator's onStateChange projects
 * whatever it receives through sanitizeNavigationStateForPersistence (typed
 * `unknown`), so tests feed it minimal partial states, not full NavigationState.
 */
type CapturedContainerProps = {
  children: React.ReactNode;
  initialState?: unknown;
  onStateChange?: (state: unknown) => void;
};

let mockNavigationContainerProps: CapturedContainerProps | undefined;
const mockLifecycleHandlers: Array<Record<string, unknown>> = [];
const mockLifecycleStart = jest.fn();
const mockLifecycleRegister = jest.fn((handler: Record<string, unknown>) => {
  mockLifecycleHandlers.push(handler);
  return jest.fn();
});
const mockInterruptAllStreams = jest.fn();

jest.mock('@/services/lifecycle/AppLifecycleService', () => ({
  AppLifecycleService: {
    start: () => mockLifecycleStart(),
    register: (handler: Record<string, unknown>) => mockLifecycleRegister(handler),
  },
}));

jest.mock('@/services/streaming/StreamingService', () => ({
  getStreamingService: () => ({
    interruptAllStreams: mockInterruptAllStreams,
  }),
}));

jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(),
  default: 'ViewShot',
}));

jest.mock('@react-navigation/native', () => ({
  NavigationContainer: (props: CapturedContainerProps) => {
    mockNavigationContainerProps = props;
    return <>{props.children}</>;
  },
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
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    GlobalSheets: () => React.createElement(Text, null, 'GlobalSheets'),
  };
});

const createScreenMock = (label: string) => () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
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

const {
  default: AppNavigator,
  sanitizeNavigationStateForPersistence,
} = require('@/navigation/AppNavigator') as typeof import('@/navigation/AppNavigator');

/** Fires the onStateChange handler AppNavigator passed to NavigationContainer. */
const emitStateChange = (state: unknown) => {
  const onStateChange = mockNavigationContainerProps?.onStateChange;
  if (!onStateChange) {
    throw new Error('NavigationContainer was rendered without onStateChange');
  }
  onStateChange(state);
};

const mainTabsStateFor = (activeTab: string) => ({
  name: 'MainTabs',
  state: {
    index: ['Home', 'DebateTab', 'Compare', 'CreateTab', 'History'].indexOf(activeTab),
    routes: ['Home', 'DebateTab', 'Compare', 'CreateTab', 'History'].map(name => ({ name })),
  },
});

describe('AppNavigator', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockNavigationContainerProps = undefined;
    mockLifecycleHandlers.length = 0;
    mockLifecycleStart.mockClear();
    mockLifecycleRegister.mockClear();
    mockInterruptAllStreams.mockClear();
  });

  const baseSettings: RootState['settings'] = {
    theme: 'auto',
    fontSize: 'medium',
    apiKeys: {},
    verifiedProviders: [],
    verificationTimestamps: {},
    verificationModels: {},
    expertMode: {},
    hasCompletedOnboarding: false,
    recordModeEnabled: false,
  };
  const resolvedAuth: RootState['auth'] = {
    ...createAppStore().getState().auth,
    authLoading: false,
  };

  it('shows welcome flow when onboarding incomplete', async () => {
    const { getByText } = renderWithProviders(<AppNavigator />, {
      preloadedState: {
        auth: resolvedAuth,
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
        auth: resolvedAuth,
        settings: { ...baseSettings, hasCompletedOnboarding: true },
      },
    });

    await waitFor(() => {
      expect(getByText('Home Screen')).toBeTruthy();
    });
    expect(queryByText('Welcome Screen')).toBeNull();
  });

  it('restores valid v2 navigation state and clears legacy v1 state', async () => {
    const persistedState = {
      index: 1,
      routes: [
        { name: 'MainTabs' },
        { name: 'Chat', params: { sessionId: 'session-restore' } },
      ],
    };
    await AsyncStorage.setItem('navigationState_v2', JSON.stringify(persistedState));
    await AsyncStorage.setItem('navigationState_v1', JSON.stringify({
      index: 0,
      routes: [{ name: 'MainTabs', state: { index: 1, routes: [{ name: 'Home' }, { name: 'DebateTab' }] } }],
    }));

    renderWithProviders(<AppNavigator />, {
      preloadedState: {
        auth: resolvedAuth,
        settings: { ...baseSettings, hasCompletedOnboarding: true },
      },
    });

    await waitFor(() => {
      expect(mockNavigationContainerProps?.initialState).toEqual({
        index: 1,
        routes: [
          mainTabsStateFor('Home'),
          persistedState.routes[1],
        ],
      });
    });
    await expect(AsyncStorage.getItem('navigationState_v1')).resolves.toBeNull();
  });

  it('migrates a valid legacy chat route when v2 state is not available', async () => {
    const legacyState = {
      index: 1,
      routes: [
        { name: 'MainTabs' },
        { name: 'Chat', params: { sessionId: 'session-legacy-chat' } },
      ],
    };
    await AsyncStorage.setItem('navigationState_v1', JSON.stringify(legacyState));

    renderWithProviders(<AppNavigator />, {
      preloadedState: {
        auth: resolvedAuth,
        settings: { ...baseSettings, hasCompletedOnboarding: true },
      },
    });

    await waitFor(() => {
      expect(mockNavigationContainerProps?.initialState).toEqual({
        index: 1,
        routes: [
          mainTabsStateFor('Home'),
          legacyState.routes[1],
        ],
      });
    });
  });

  it('rebases restored chat routes over the Chat setup tab instead of a stale Debate tab', async () => {
    const persistedState = {
      index: 1,
      routes: [
        {
          name: 'MainTabs',
          state: {
            index: 1,
            routes: [
              { name: 'Home' },
              { name: 'DebateTab' },
              { name: 'Compare' },
            ],
          },
        },
        { name: 'Chat', params: { sessionId: 'session-chat' } },
      ],
    };
    await AsyncStorage.setItem('navigationState_v2', JSON.stringify(persistedState));

    renderWithProviders(<AppNavigator />, {
      preloadedState: {
        auth: resolvedAuth,
        settings: { ...baseSettings, hasCompletedOnboarding: true },
      },
    });

    await waitFor(() => {
      expect(mockNavigationContainerProps?.initialState).toEqual({
        index: 1,
        routes: [
          mainTabsStateFor('Home'),
          persistedState.routes[1],
        ],
      });
    });
  });

  it('does not restore the legacy Debate setup tab state that caused OTA reload loops', async () => {
    await AsyncStorage.setItem('navigationState_v1', JSON.stringify({
      index: 0,
      routes: [{
        name: 'MainTabs',
        state: {
          index: 1,
          routes: [
            { name: 'Home' },
            { name: 'DebateTab' },
          ],
        },
      }],
    }));

    renderWithProviders(<AppNavigator />, {
      preloadedState: {
        auth: resolvedAuth,
        settings: { ...baseSettings, hasCompletedOnboarding: true },
      },
    });

    await waitFor(() => {
      expect(mockNavigationContainerProps).toBeDefined();
    });
    expect(mockNavigationContainerProps?.initialState).toBeUndefined();
  });

  it('ignores invalid persisted navigation state instead of restoring a broken screen', async () => {
    await AsyncStorage.setItem('navigationState_v2', JSON.stringify({
      index: 1,
      routes: [
        { name: 'MainTabs' },
        { name: 'Chat', params: {} },
      ],
    }));

    renderWithProviders(<AppNavigator />, {
      preloadedState: {
        auth: resolvedAuth,
        settings: { ...baseSettings, hasCompletedOnboarding: true },
      },
    });

    await waitFor(() => {
      expect(mockNavigationContainerProps).toBeDefined();
    });
    expect(mockNavigationContainerProps?.initialState).toBeUndefined();
  });

  it('persists current navigation state to v2 on navigation changes', async () => {
    const currentState = {
      index: 1,
      routes: [
        { name: 'MainTabs' },
        { name: 'Chat', params: { sessionId: 'session-current' } },
      ],
    };

    renderWithProviders(<AppNavigator />, {
      preloadedState: {
        auth: resolvedAuth,
        settings: { ...baseSettings, hasCompletedOnboarding: true },
      },
    });

    await waitFor(() => {
      expect(mockNavigationContainerProps?.onStateChange).toBeDefined();
    });
    emitStateChange(currentState);

    await expect(AsyncStorage.getItem('navigationState_v2')).resolves.toBe(JSON.stringify({
      index: 1,
      routes: [
        mainTabsStateFor('Home'),
        currentState.routes[1],
      ],
    }));
  });

  it('strips commands and payloads from persisted params, keeping identifiers only', async () => {
    const fatBase64 = 'A'.repeat(4096);
    const currentState = {
      index: 1,
      routes: [
        { name: 'MainTabs' },
        {
          name: 'Chat',
          params: {
            sessionId: 'session-current',
            resuming: true,
            initialPrompt: 'What is in this photo?',
            userPrompt: 'What is in this photo?',
            autoSend: true,
            demoSampleId: 'sample-1',
            initialMessages: [{ id: 'm1', content: fatBase64 }],
            attachments: [{ base64: fatBase64 }],
          },
        },
      ],
    };

    renderWithProviders(<AppNavigator />, {
      preloadedState: {
        auth: resolvedAuth,
        settings: { ...baseSettings, hasCompletedOnboarding: true },
      },
    });

    await waitFor(() => {
      expect(mockNavigationContainerProps?.onStateChange).toBeDefined();
    });
    emitStateChange(currentState);

    const raw = await AsyncStorage.getItem('navigationState_v2');
    expect(raw).toBe(JSON.stringify({
      index: 1,
      routes: [
        mainTabsStateFor('Home'),
        { name: 'Chat', params: { sessionId: 'session-current', resuming: true } },
      ],
    }));
    // Nothing heavy and no replayable command ever reaches AsyncStorage.
    expect(raw).not.toContain('autoSend');
    expect(raw).not.toContain('initialPrompt');
    expect(raw).not.toContain(fatBase64.slice(0, 64));
  });

  it('keeps the last good snapshot when a state has nothing restorable', async () => {
    await AsyncStorage.setItem('navigationState_v2', JSON.stringify({
      index: 0,
      routes: [{ name: 'MainTabs' }],
    }));

    renderWithProviders(<AppNavigator />, {
      preloadedState: {
        auth: resolvedAuth,
        settings: { ...baseSettings, hasCompletedOnboarding: true },
      },
    });

    await waitFor(() => {
      expect(mockNavigationContainerProps?.onStateChange).toBeDefined();
    });
    emitStateChange({
      index: 0,
      routes: [{ name: 'NotARealRoute', params: { blob: 'x'.repeat(1024) } }],
    });

    await expect(AsyncStorage.getItem('navigationState_v2')).resolves.toBe(JSON.stringify({
      index: 0,
      routes: [{ name: 'MainTabs' }],
    }));
  });

  describe('sanitizeNavigationStateForPersistence', () => {
    it('drops CompareSession commands but keeps its identity params', () => {
      const sanitized = sanitizeNavigationStateForPersistence({
        index: 0,
        routes: [{
          name: 'CompareSession',
          key: 'stale-key-1',
          params: {
            leftAI: { id: 'claude' },
            rightAI: { id: 'openai' },
            sessionId: 'cmp-1',
            initialPrompt: 'Summarize this PDF',
          },
        }],
      });

      expect(sanitized).toEqual({
        index: 0,
        routes: [{
          name: 'CompareSession',
          params: {
            leftAI: { id: 'claude' },
            rightAI: { id: 'openai' },
            sessionId: 'cmp-1',
          },
        }],
      });
    });

    it('never persists DebateTranscript and refocuses the surviving route beneath it', () => {
      const sanitized = sanitizeNavigationStateForPersistence({
        index: 2,
        routes: [
          { name: 'MainTabs' },
          { name: 'Debate', params: { selectedAIs: [{ id: 'claude' }], topic: 'AI', demoSample: { huge: true } } },
          { name: 'DebateTranscript', params: { session: { messages: ['entire', 'session'] } } },
        ],
      });

      expect(sanitized).toEqual({
        index: 1,
        routes: [
          { name: 'MainTabs' },
          { name: 'Debate', params: { selectedAIs: [{ id: 'claude' }], topic: 'AI' } },
        ],
      });
    });

    it('drops routes that cannot render from surviving params', () => {
      expect(sanitizeNavigationStateForPersistence({
        index: 0,
        routes: [{ name: 'Chat', params: { initialPrompt: 'no session id' } }],
      })).toBeUndefined();
    });

    it('sanitizes nested navigator state recursively', () => {
      const sanitized = sanitizeNavigationStateForPersistence({
        index: 0,
        routes: [{
          name: 'MainTabs',
          params: { screen: 'CreateTab', junk: 'drop-me' },
          state: {
            index: 3,
            routes: [
              { name: 'Home', params: { stray: 'payload' } },
              { name: 'DebateTab' },
              { name: 'Compare' },
              { name: 'CreateTab' },
              { name: 'History' },
            ],
          },
        }],
      });

      expect(sanitized).toEqual({
        index: 0,
        routes: [{
          name: 'MainTabs',
          params: { screen: 'CreateTab' },
          state: {
            index: 3,
            routes: [
              { name: 'Home' },
              { name: 'DebateTab' },
              { name: 'Compare' },
              { name: 'CreateTab' },
              { name: 'History' },
            ],
          },
        }],
      });
    });
  });

  it('does not interrupt provider streams from the global lifecycle bridge', async () => {
    const { getByText } = renderWithProviders(<AppNavigator />, {
      preloadedState: {
        auth: resolvedAuth,
        settings: { ...baseSettings, hasCompletedOnboarding: true },
      },
    });

    await waitFor(() => {
      expect(getByText('Home Screen')).toBeTruthy();
    });

    const createBridgeHandler = mockLifecycleHandlers.find(handler => handler.id === 'create-activity-bridge');

    expect(createBridgeHandler).toBeDefined();
    expect(createBridgeHandler?.onBackground).toBeUndefined();
    expect(mockInterruptAllStreams).not.toHaveBeenCalled();
  });
});
