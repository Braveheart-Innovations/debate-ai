import { useEffect, useMemo, useState } from 'react';
import { Platform, View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer, DefaultTheme, DarkTheme, type InitialState } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState, hydrateMediaGallery, isApiKeyConfigured, resumeCreateMediaTasks } from '../store';
import { RootStackParamList } from '../types';
import { useTheme } from '../theme';
import { SheetProvider } from '../contexts/SheetContext';
import { GlobalSheets } from './GlobalSheets';
import { useFeatureAccess } from '../hooks/useFeatureAccess';
import { useResponsive } from '../hooks/useResponsive';
import { ErrorBoundary } from '../components/organisms/common/ErrorBoundary';
import { AppLifecycleService } from '@/services/lifecycle/AppLifecycleService';

// Import screens
import WelcomeScreen from '../screens/WelcomeScreen';
import HomeScreen from '../screens/HomeScreen';
import ChatScreen from '../screens/ChatScreen';
import HistoryScreen from '../screens/HistoryScreen';
import APIConfigScreen from '../screens/APIConfigScreen';
import DebateScreen from '../screens/DebateScreen';
import DebateSetupScreen from '../screens/DebateSetupScreen';
import DebateTranscriptScreen from '../screens/DebateTranscriptScreen';
import StatsScreen from '../screens/StatsScreen';
import CompareSetupScreen from '../screens/CompareSetupScreen';
import CompareScreen from '../screens/CompareScreen';
import UpgradeScreen from '../screens/UpgradeScreen';
import ExpertModeScreen from '../screens/ExpertModeScreen';
import PrivacyPolicyScreen from '../screens/PrivacyPolicyScreen';
import TermsOfServiceScreen from '../screens/TermsOfServiceScreen';
import CreateSetupScreen from '../screens/CreateSetupScreen';
import CreateScreen from '../screens/CreateScreen';
import PersonalitySystemScreen from '../screens/PersonalitySystemScreen';
// import SubscriptionScreen from '../screens/SubscriptionScreen';
// import ExpertModeScreen from '../screens/ExpertModeScreen';

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();
const NAVIGATION_STATE_KEY = 'navigationState_v2';
const LEGACY_NAVIGATION_STATE_KEY = 'navigationState_v1';
const TAB_ROUTE_NAMES = ['Home', 'DebateTab', 'Compare', 'CreateTab', 'History'] as const;

type TabRouteName = typeof TAB_ROUTE_NAMES[number];

const ROUTE_NAMES = new Set([
  'Welcome',
  'MainTabs',
  'Home',
  'DebateTab',
  'Compare',
  'CreateTab',
  'History',
  'Chat',
  'Debate',
  'DebateTranscript',
  'CompareSession',
  'CreateSession',
  'APIConfig',
  'Stats',
  'PrivacyPolicy',
  'TermsOfService',
  'Subscription',
  'ExpertMode',
  'PersonalitySystem',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const hasStringParam = (route: Record<string, unknown>, key: string): boolean => {
  const params = route.params;
  return isRecord(params) && typeof params[key] === 'string' && params[key].length > 0;
};

const isValidNavigationRoute = (route: unknown, depth = 0): route is Record<string, unknown> => {
  if (!isRecord(route) || typeof route.name !== 'string' || !ROUTE_NAMES.has(route.name)) {
    return false;
  }

  if (route.name === 'Chat' && !hasStringParam(route, 'sessionId')) {
    return false;
  }

  if (route.name === 'Debate') {
    const params = route.params;
    if (!isRecord(params) || !Array.isArray(params.selectedAIs)) {
      return false;
    }
  }

  if (route.name === 'CompareSession') {
    const params = route.params;
    if (!isRecord(params) || !isRecord(params.leftAI) || !isRecord(params.rightAI)) {
      return false;
    }
  }

  if ('state' in route && route.state !== undefined) {
    return depth < 4 && isValidNavigationState(route.state, depth + 1);
  }

  return true;
};

const isValidNavigationState = (value: unknown, depth = 0): value is InitialState => {
  if (!isRecord(value) || !Array.isArray(value.routes)) return false;
  if (value.routes.length === 0) return false;
  if (typeof value.index === 'number' && (value.index < 0 || value.index >= value.routes.length)) {
    return false;
  }
  return value.routes.every(route => isValidNavigationRoute(route, depth));
};

// Persisted navigation state carries locations, never payloads or commands.
// Only these params survive the write to AsyncStorage; everything else —
// auto-send flags, prompts, base64 attachments, message arrays — is stripped
// so nothing heavy is serialized on every navigation and nothing replays a
// send after a cold restore. Routes absent from this map persist paramless.
const PERSISTED_PARAM_ALLOWLIST: Record<string, readonly string[]> = {
  MainTabs: ['screen'],
  Chat: ['sessionId', 'resuming', 'searchTerm', 'selectedAIs', 'aiPersonalities', 'selectedModels'],
  Debate: [
    'selectedAIs',
    'topic',
    'personalities',
    'formatId',
    'rounds',
    'exchanges',
    'civility',
    'rematchKey',
    'voiceConfig',
    'demoDebateId',
  ],
  CompareSession: ['leftAI', 'rightAI', 'sessionId', 'resuming'],
  CreateSession: ['focusAssetId', 'focusMediaId', 'galleryTab'],
};

// Routes whose identity IS a payload (e.g. a full session object) are never
// persisted; a restore lands on the screen beneath them instead.
const NEVER_PERSISTED_ROUTES = new Set(['DebateTranscript']);

interface PersistableRoute {
  name: string;
  params?: Record<string, unknown>;
  state?: PersistableState;
}

interface PersistableState {
  index: number;
  routes: PersistableRoute[];
}

const sanitizeRouteForPersistence = (route: unknown, depth: number): PersistableRoute | undefined => {
  if (!isRecord(route) || typeof route.name !== 'string' || !ROUTE_NAMES.has(route.name)) {
    return undefined;
  }
  if (NEVER_PERSISTED_ROUTES.has(route.name)) return undefined;

  let params: Record<string, unknown> | undefined;
  const allowedKeys = PERSISTED_PARAM_ALLOWLIST[route.name];
  if (allowedKeys && isRecord(route.params)) {
    const picked: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (route.params[key] !== undefined) picked[key] = route.params[key];
    }
    if (Object.keys(picked).length > 0) params = picked;
  }

  // Requirements mirror isValidNavigationRoute: a route that cannot render
  // from its surviving params is dropped rather than persisted broken.
  if (route.name === 'Chat' && !(typeof params?.sessionId === 'string' && params.sessionId.length > 0)) {
    return undefined;
  }
  if (route.name === 'Debate' && !Array.isArray(params?.selectedAIs)) {
    return undefined;
  }
  if (route.name === 'CompareSession' && !(isRecord(params?.leftAI) && isRecord(params?.rightAI))) {
    return undefined;
  }

  let state: PersistableState | undefined;
  if ('state' in route && route.state !== undefined && depth < 4) {
    // A nested state that fails to sanitize just isn't persisted; the
    // navigator falls back to its own initial route on restore.
    state = sanitizeNavigationStateForPersistence(route.state, depth + 1);
  }

  return {
    name: route.name,
    ...(params ? { params } : {}),
    ...(state ? { state } : {}),
  };
};

export const sanitizeNavigationStateForPersistence = (
  value: unknown,
  depth = 0
): PersistableState | undefined => {
  if (!isRecord(value) || !Array.isArray(value.routes) || value.routes.length === 0) {
    return undefined;
  }

  const originalIndex = typeof value.index === 'number' &&
    value.index >= 0 && value.index < value.routes.length
    ? value.index
    : value.routes.length - 1;

  const routes: PersistableRoute[] = [];
  let index = -1;
  value.routes.forEach((route, position) => {
    const sanitized = sanitizeRouteForPersistence(route, depth);
    if (!sanitized) return;
    routes.push(sanitized);
    // The active route follows the original focus; if that route was dropped
    // (e.g. a never-persisted leaf), focus lands on the survivor beneath it.
    if (position <= originalIndex) index = routes.length - 1;
  });

  if (routes.length === 0) return undefined;
  return { index: Math.max(index, 0), routes };
};

const parseNavigationState = (raw: string | null): InitialState | undefined => {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return isValidNavigationState(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const getActiveRouteName = (state: InitialState): string | undefined => {
  const index = typeof state.index === 'number' ? state.index : state.routes.length - 1;
  const route = state.routes[index];
  if (!route) return undefined;
  if (route.state && isValidNavigationState(route.state)) {
    return getActiveRouteName(route.state);
  }
  return typeof route.name === 'string' ? route.name : undefined;
};

const createMainTabsRoute = (activeTab: TabRouteName): InitialState['routes'][number] => ({
  name: 'MainTabs',
  state: {
    index: TAB_ROUTE_NAMES.indexOf(activeTab),
    routes: TAB_ROUTE_NAMES.map(name => ({ name })),
  },
});

const getSetupTabForStackRoute = (routeName: string): TabRouteName | undefined => {
  switch (routeName) {
    case 'Chat':
      return 'Home';
    case 'Debate':
      return 'DebateTab';
    case 'CompareSession':
      return 'Compare';
    case 'CreateSession':
      return 'CreateTab';
    default:
      return undefined;
  }
};

const normalizeRestoredNavigationState = (state: InitialState | undefined): InitialState | undefined => {
  if (!state) return undefined;

  const index = typeof state.index === 'number' ? state.index : state.routes.length - 1;
  const activeRoute = state.routes[index];
  const activeRouteName = typeof activeRoute?.name === 'string' ? activeRoute.name : undefined;
  if (!activeRoute || !activeRouteName) return state;

  const setupTab = getSetupTabForStackRoute(activeRouteName);
  if (!setupTab) return state;

  return {
    ...state,
    index: 1,
    routes: [
      createMainTabsRoute(setupTab),
      activeRoute,
    ],
  };
};

const getInitialNavigationState = (currentRaw: string | null, legacyRaw: string | null): InitialState | undefined => {
  const current = parseNavigationState(currentRaw);
  if (current) return normalizeRestoredNavigationState(current);

  const legacy = parseNavigationState(legacyRaw);
  if (!legacy) return undefined;

  // v1 is known to strand users on the Debate setup tab after OTA reloads.
  // Migrate only if the active route is a concrete screen that is not that tab.
  return getActiveRouteName(legacy) === 'DebateTab'
    ? undefined
    : normalizeRestoredNavigationState(legacy);
};

const CreateActivityBridge = () => {
  const dispatch = useDispatch<AppDispatch>();
  const mediaGalleryHydrated = useSelector((state: RootState) => state.create.mediaGalleryHydrated);
  const activeRunwayTask = useSelector((state: RootState) => state.create.activeRunwayTask);

  useEffect(() => {
    if (!mediaGalleryHydrated) {
      dispatch(hydrateMediaGallery());
    }
  }, [dispatch, mediaGalleryHydrated]);

  useEffect(() => {
    if (mediaGalleryHydrated && activeRunwayTask) {
      dispatch(resumeCreateMediaTasks());
    }
  }, [activeRunwayTask, dispatch, mediaGalleryHydrated]);

  useEffect(() => {
    AppLifecycleService.start();
    return AppLifecycleService.register({
      id: 'create-activity-bridge',
      onForeground: () => {
        dispatch(resumeCreateMediaTasks());
      },
    });
  }, [dispatch]);

  return null;
};

// Main Tab Navigator
const MainTabs = () => {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const apiKeys = useSelector((state: RootState) => state.settings.apiKeys || {});
  const createActivity = useSelector((state: RootState) => state.create.createActivity);
  const mediaGeneration = useSelector((state: RootState) => state.create.mediaGeneration);
  const { isDemo } = useFeatureAccess();
  const { responsive } = useResponsive();

  // Calculate configured AI count for badge
  const configuredCount = useMemo(() => {
    return Object.values(apiKeys).filter(isApiKeyConfigured).length;
  }, [apiKeys]);

  // Responsive tab bar sizing for iPad
  const tabBarHeight = responsive(60, 72);
  const iconSize = responsive(24, 28);
  const labelFontSize = responsive(12, 14);
  const totalHeight = tabBarHeight + insets.bottom;
  const createBadge = createActivity.hasUnseenActivity
    ? '•'
    : (mediaGeneration.video || mediaGeneration.audio || createActivity.status === 'running') ? '…' : undefined;

  return (
    <>
    <CreateActivityBridge />
    <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.colors.primary[500],
          tabBarInactiveTintColor: theme.colors.text.secondary,
          tabBarStyle: {
            backgroundColor: isDark ? '#000000' : '#FFFFFF',
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            paddingBottom: insets.bottom > 0 ? insets.bottom : Platform.OS === 'android' ? 5 : 5,
            paddingTop: responsive(5, 8),
            height: totalHeight,
          },
          tabBarLabelStyle: {
            fontSize: labelFontSize,
            fontWeight: '500',
          },
        }}
      >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Chat',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
              size={iconSize}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="DebateTab"
        component={DebateSetupScreen}
        options={{
          tabBarLabel: 'Debate',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name="sword-cross"
              size={iconSize}
              color={color}
            />
          ),
          tabBarBadge: !isDemo && configuredCount < 2 ? '!' : undefined,
          tabBarBadgeStyle: {
            backgroundColor: theme.colors.error[500],
            fontSize: 10,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
          },
        }}
      />
      <Tab.Screen
        name="Compare"
        component={CompareSetupScreen}
        options={{
          tabBarLabel: 'Compare',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'git-compare' : 'git-compare-outline'}
              size={iconSize}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="CreateTab"
        component={CreateSetupScreen}
        options={{
          tabBarLabel: 'Create',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'sparkles' : 'sparkles-outline'}
              size={iconSize}
              color={color}
            />
          ),
          tabBarBadge: createBadge,
          tabBarBadgeStyle: {
            backgroundColor: createActivity.hasUnseenActivity
              ? theme.colors.primary[500]
              : theme.colors.warning[500],
            fontSize: 10,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
          },
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarLabel: 'History',
          tabBarIcon: ({ color }) => (
            <MaterialIcons
              name="history"
              size={responsive(26, 30)}
              color={color}
            />
          ),
        }}
      />
      </Tab.Navigator>
    </>
  );
};

// Wrapper to include sheets and modals
const MainTabsWithSheets = () => {
  return <MainTabs />;
};


// Placeholder removed — using real screens

export default function AppNavigator() {
  const { theme, isDark } = useTheme();
  const [initialNavigationState, setInitialNavigationState] = useState<InitialState | undefined>();
  const [isNavigationStateReady, setIsNavigationStateReady] = useState(false);
  // const uiMode = useSelector((state: RootState) => state.user.uiMode);
  const hasCompletedOnboarding = useSelector(
    (state: RootState) => state.settings.hasCompletedOnboarding
  );

  // Get subscription status to determine if we should skip Welcome
  const { membershipStatus, loading: subscriptionLoading } = useFeatureAccess();

  // Premium subscribers skip Welcome entirely
  // Trial and demo users follow the normal onboarding flow
  const isPremiumSubscriber = membershipStatus === 'premium';
  const shouldShowMainApp = isPremiumSubscriber || hasCompletedOnboarding;

  useEffect(() => {
    let mounted = true;
    Promise.all([
      AsyncStorage.getItem(NAVIGATION_STATE_KEY),
      AsyncStorage.getItem(LEGACY_NAVIGATION_STATE_KEY),
      AsyncStorage.removeItem(LEGACY_NAVIGATION_STATE_KEY),
    ])
      .then(([currentRaw, legacyRaw]) => {
        if (!mounted) return;
        setInitialNavigationState(getInitialNavigationState(currentRaw, legacyRaw));
      })
      .catch(() => {
        // Navigation persistence is best-effort only.
      })
      .finally(() => {
        if (mounted) setIsNavigationStateReady(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Custom navigation theme
  const navigationTheme = isDark ? {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: theme.colors.primary[500],
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text.primary,
      border: theme.colors.border,
    },
  } : {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: theme.colors.primary[500],
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text.primary,
      border: theme.colors.border,
    },
  };

  // Show loading screen while determining subscription status
  // This prevents flash of wrong screen
  if (subscriptionLoading || !isNavigationStateReady) {
    return (
      <View style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <ActivityIndicator size="large" color={theme.colors.primary[500]} />
      </View>
    );
  }

  return (
    <SheetProvider>
      <ErrorBoundary level="recoverable">
        <NavigationContainer
          theme={navigationTheme}
          initialState={shouldShowMainApp ? initialNavigationState : undefined}
          onStateChange={(state) => {
            if (!shouldShowMainApp || !state) return;
            // Persist locations, never payloads or commands: project the
            // state down to route identity + allowlisted identifier params
            // before it touches AsyncStorage.
            const sanitized = sanitizeNavigationStateForPersistence(state);
            if (!sanitized) return; // nothing restorable — keep the last good snapshot
            const persistedState = normalizeRestoredNavigationState(sanitized as InitialState);
            AsyncStorage.setItem(NAVIGATION_STATE_KEY, JSON.stringify(persistedState)).catch(() => {});
          }}
        >
          <Stack.Navigator
          screenOptions={{
            headerStyle: {
              backgroundColor: isDark ? theme.colors.surface : theme.colors.primary[500],
            },
            headerTintColor: isDark ? theme.colors.text.primary : '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
          }}
        >
        {!shouldShowMainApp ? (
          <Stack.Screen
            name="Welcome"
            component={WelcomeScreen}
            options={{ headerShown: false }}
          />
        ) : (
          <>
            <Stack.Screen
              name="MainTabs"
              component={MainTabsWithSheets}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Debate"
              component={DebateScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="DebateTranscript"
              component={DebateTranscriptScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="CompareSession"
              component={CompareScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="CreateSession"
              component={CreateScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="APIConfig"
              component={APIConfigScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Stats"
              component={StatsScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="PrivacyPolicy"
              component={PrivacyPolicyScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="TermsOfService"
              component={TermsOfServiceScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Subscription"
              component={UpgradeScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="ExpertMode"
              component={ExpertModeScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="PersonalitySystem"
              component={PersonalitySystemScreen}
              options={{ headerShown: false }}
            />
          </>
        )}
        </Stack.Navigator>
        {/* Global sheets: available on every screen */}
          <GlobalSheets />
        </NavigationContainer>
      </ErrorBoundary>
    </SheetProvider>
  );
}
