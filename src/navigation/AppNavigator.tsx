import React, { useMemo } from 'react';
import { View, Text, Platform, TouchableOpacity } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme, NavigationProp } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, showSheet, clearSheet } from '../store';
import { RootStackParamList } from '../types';
import { useTheme } from '../theme';
import { SheetProvider } from '../contexts/SheetContext';
import { 
  ProfileSheet, 
  SettingsContent,
  SupportScreen
} from '../components/organisms';

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
// import SubscriptionScreen from '../screens/SubscriptionScreen';
// import ExpertModeScreen from '../screens/ExpertModeScreen';

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

// Main Tab Navigator
const MainTabs = () => {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const apiKeys = useSelector((state: RootState) => state.settings.apiKeys || {});
  
  // Calculate configured AI count for badge
  const configuredCount = useMemo(() => {
    return Object.values(apiKeys).filter(Boolean).length;
  }, [apiKeys]);
  
  // Calculate tab bar height with safe area
  const tabBarHeight = 60;
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
            paddingTop: 5,
            height: totalHeight,
          },
          tabBarLabelStyle: {
            fontSize: 12,
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
              size={24} 
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
              size={24} 
              color={color} 
            />
          ),
          tabBarBadge: configuredCount < 2 ? '!' : undefined,
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
              size={24} 
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
              size={26} 
              color={color} 
            />
          ),
        }}
      />
      </Tab.Navigator>
  );
};

// Wrapper to include sheets and modals
const MainTabsWithSheets = ({ navigation }: { navigation?: NavigationProp<RootStackParamList> }) => {
  const { theme } = useTheme();
  const dispatch = useDispatch();
  const { activeSheet, sheetVisible } = useSelector((state: RootState) => state.navigation);
  
  const handleSheetClose = () => {
    dispatch(clearSheet());
  };
  
  return (
    <>
      <MainTabs />
      
      {/* Profile Sheet */}
      {activeSheet === 'profile' && sheetVisible && (
        <TouchableOpacity 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
          }}
          activeOpacity={1}
          onPress={handleSheetClose}
        >
          <TouchableOpacity 
            activeOpacity={1}
            style={{
            flex: 1,
            backgroundColor: theme.colors.background,
            marginTop: 100,
          }}>
            <ProfileSheet
              onClose={handleSheetClose}
              onSettingsPress={() => {
                dispatch(showSheet({ sheet: 'settings' }));
              }}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      )}
      
      {/* Settings Sheet */}
      {activeSheet === 'settings' && sheetVisible && (
        <TouchableOpacity 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
          }}
          activeOpacity={1}
          onPress={handleSheetClose}
        >
          <TouchableOpacity 
            activeOpacity={1}
            style={{
            flex: 1,
            backgroundColor: theme.colors.background,
            marginTop: 100,
          }}>
            <SettingsContent
              onClose={handleSheetClose}
              onNavigateToAPIConfig={() => {
                handleSheetClose();
                navigation?.navigate('APIConfig');
              }}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      )}
      
      {/* Support Sheet */}
      {activeSheet === 'support' && sheetVisible && (
        <TouchableOpacity 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
          }}
          activeOpacity={1}
          onPress={handleSheetClose}
        >
          <TouchableOpacity 
            activeOpacity={1}
            style={{
            flex: 1,
            backgroundColor: theme.colors.background,
            marginTop: 100,
          }}>
            <SupportScreen onClose={handleSheetClose} />
          </TouchableOpacity>
        </TouchableOpacity>
      )}
    </>
  );
};


// Placeholder screen for testing
interface PlaceholderScreenProps {
  route: {
    name: string;
  };
}

const PlaceholderScreen: React.FC<PlaceholderScreenProps> = ({ route }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{route.name} Screen</Text>
    </View>
  );
};

const styles = {
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  text: {
    fontSize: 20,
    fontWeight: 'bold',
  },
} as const;

export default function AppNavigator() {
  const { theme, isDark } = useTheme();
  const uiMode = useSelector((state: RootState) => state.user.uiMode);
  const hasCompletedOnboarding = useSelector(
    (state: RootState) => state.settings.hasCompletedOnboarding
  );

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

  return (
    <SheetProvider>
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
        {!hasCompletedOnboarding ? (
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
              name="Subscription"
              component={UpgradeScreen}
              options={{ headerShown: false }}
            />
            {uiMode === 'expert' && (
              <Stack.Screen
                name="ExpertMode"
                component={PlaceholderScreen}
                options={{ title: 'Expert Settings' }}
              />
            )}
          </>
        )}
        </Stack.Navigator>
      </NavigationContainer>
    </SheetProvider>
  );
}
