import React, { useMemo } from 'react';
import { Platform, View, ActivityIndicator } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { RootStackParamList } from '../types';
import { useTheme } from '../theme';
import { SheetProvider } from '../contexts/SheetContext';
import { GlobalSheets } from './GlobalSheets';
import { useFeatureAccess } from '../hooks/useFeatureAccess';
import { useResponsive } from '../hooks/useResponsive';
import { ErrorBoundary } from '../components/organisms/common/ErrorBoundary';

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
// import SubscriptionScreen from '../screens/SubscriptionScreen';
// import ExpertModeScreen from '../screens/ExpertModeScreen';

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

// Main Tab Navigator
const MainTabs = () => {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const apiKeys = useSelector((state: RootState) => state.settings.apiKeys || {});
  const { isDemo } = useFeatureAccess();
  const { responsive } = useResponsive();

  // Calculate configured AI count for badge
  const configuredCount = useMemo(() => {
    return Object.values(apiKeys).filter(Boolean).length;
  }, [apiKeys]);

  // Responsive tab bar sizing for iPad
  const tabBarHeight = responsive(60, 72);
  const iconSize = responsive(24, 28);
  const labelFontSize = responsive(12, 14);
  const totalHeight = tabBarHeight + insets.bottom;

  return (
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
  );
};

// Wrapper to include sheets and modals
const MainTabsWithSheets = () => {
  return <MainTabs />;
};


// Placeholder removed — using real screens

export default function AppNavigator() {
  const { theme, isDark } = useTheme();
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
  if (subscriptionLoading) {
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
        <NavigationContainer theme={navigationTheme}>
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
