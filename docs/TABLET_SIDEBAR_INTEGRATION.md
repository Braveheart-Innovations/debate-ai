# TabletSidebar Integration - Feature Implementation Guide

## Overview

This document details the integration of the `TabletSidebar` component into the app's navigation system. The sidebar was created in commit `96d7196` (iPad optimization) but integration was deferred.

## Current State

### Existing Component
**Location:** `src/navigation/TabletSidebar.tsx`

The `TabletSidebar` component is fully implemented and ready for integration:
- 88px fixed-width sidebar
- "Symposium" branding at top
- 4 navigation items matching bottom tabs:
  - Chat (Home)
  - Debate (DebateTab)
  - Compare
  - History
- Badge support for Debate tab (shows "!" when < 2 AIs configured)
- Theme support (light/dark mode)
- Safe area handling

**Props Interface:**
```typescript
interface TabletSidebarProps {
  activeTab: string;
  onTabPress: (tabName: string) => void;
  configuredCount: number;
  isDemo: boolean;
}
```

### Related iPad Optimizations Already Implemented
- `SessionDetailPane` - Master-detail view for History screen (integrated)
- `ResponsiveContainer` - Max-width containers for tablets (integrated)
- `useResponsive` hook - Device detection and responsive helpers (integrated)
- Responsive message bubble widths (integrated)
- 2-column grid layout on Stats screen (integrated)

## Requirements

1. **iPad Landscape (width > 1024):** Show TabletSidebar + content area instead of bottom tabs
2. **iPad Portrait or Phone:** Keep existing bottom tab navigation
3. **Tab State Preservation:** Maintain active tab when rotating between orientations
4. **Scope:** Sidebar only visible on main tabs (hidden during Chat, Debate, Compare sessions)

## Architecture

### Current Navigation Structure
```
NavigationContainer
  └── Stack.Navigator
        ├── Welcome (if not onboarded)
        └── (if onboarded)
              ├── MainTabs (Tab.Navigator with bottom tabs)
              ├── Chat
              ├── Debate
              ├── DebateTranscript
              ├── CompareSession
              └── ...other screens
```

### Target Navigation Structure
```
NavigationContainer
  └── Stack.Navigator
        ├── Welcome (if not onboarded)
        └── (if onboarded)
              ├── MainTabs (ResponsiveMainTabs)
              │     ├── iPad Landscape: TabletSidebarLayout
              │     │     ├── TabletSidebar (left, 88px)
              │     │     └── Active Screen (right, flex: 1)
              │     └── Phone/Portrait: Tab.Navigator (existing)
              ├── Chat
              ├── Debate
              └── ...other screens
```

## Implementation Plan

### Step 1: Create TabletSidebarLayout Component

**File:** `src/navigation/TabletSidebarLayout.tsx`

This component combines the sidebar with the active screen content.

```typescript
import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { TabletSidebar } from './TabletSidebar';
import { useFeatureAccess } from '../hooks/useFeatureAccess';
import { useTheme } from '../theme';

// Import screens directly
import HomeScreen from '../screens/HomeScreen';
import DebateSetupScreen from '../screens/DebateSetupScreen';
import CompareSetupScreen from '../screens/CompareSetupScreen';
import HistoryScreen from '../screens/HistoryScreen';

interface TabletSidebarLayoutProps {
  activeTabName: string;
  onTabChange: (tabName: string) => void;
  navigation: any;
}

const screenComponents: Record<string, React.ComponentType<any>> = {
  Home: HomeScreen,
  DebateTab: DebateSetupScreen,
  Compare: CompareSetupScreen,
  History: HistoryScreen,
};

export const TabletSidebarLayout: React.FC<TabletSidebarLayoutProps> = ({
  activeTabName,
  onTabChange,
  navigation,
}) => {
  const { theme } = useTheme();
  const apiKeys = useSelector((state: RootState) => state.settings.apiKeys || {});
  const { isDemo } = useFeatureAccess();

  const configuredCount = useMemo(() => {
    return Object.values(apiKeys).filter(Boolean).length;
  }, [apiKeys]);

  const ActiveScreen = screenComponents[activeTabName] || HomeScreen;

  return (
    <View style={styles.container}>
      <TabletSidebar
        activeTab={activeTabName}
        onTabPress={onTabChange}
        configuredCount={configuredCount}
        isDemo={isDemo}
      />
      <View style={[styles.content, { backgroundColor: theme.colors.background }]}>
        <ActiveScreen navigation={navigation} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  content: {
    flex: 1,
  },
});
```

### Step 2: Create ResponsiveMainTabs Component

**File:** `src/navigation/ResponsiveMainTabs.tsx`

This component conditionally renders sidebar or bottom tabs based on device/orientation.

```typescript
import React, { useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';

import { RootState } from '../store';
import { useTheme } from '../theme';
import { useFeatureAccess } from '../hooks/useFeatureAccess';
import { useResponsive } from '../hooks/useResponsive';
import { TabletSidebarLayout } from './TabletSidebarLayout';

// Import screens
import HomeScreen from '../screens/HomeScreen';
import DebateSetupScreen from '../screens/DebateSetupScreen';
import CompareSetupScreen from '../screens/CompareSetupScreen';
import HistoryScreen from '../screens/HistoryScreen';

const Tab = createBottomTabNavigator();

export const ResponsiveMainTabs: React.FC = () => {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const apiKeys = useSelector((state: RootState) => state.settings.apiKeys || {});
  const { isDemo } = useFeatureAccess();
  const { isTablet, isLandscape, width, responsive } = useResponsive();

  const [activeTabName, setActiveTabName] = useState('Home');

  // Show sidebar on iPad landscape when width > 1024
  const showSidebar = isTablet && isLandscape && width > 1024;

  const configuredCount = Object.values(apiKeys).filter(Boolean).length;

  const handleTabChange = useCallback((tabName: string) => {
    setActiveTabName(tabName);
  }, []);

  // iPad Landscape: Show sidebar layout
  if (showSidebar) {
    return (
      <TabletSidebarLayout
        activeTabName={activeTabName}
        onTabChange={handleTabChange}
        navigation={navigation}
      />
    );
  }

  // Phone/iPad Portrait: Show bottom tabs
  const tabBarHeight = responsive(60, 72);
  const iconSize = responsive(24, 28);
  const labelFontSize = responsive(12, 14);
  const totalHeight = tabBarHeight + insets.bottom;

  return (
    <Tab.Navigator
      initialRouteName={activeTabName}
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
      screenListeners={{
        tabPress: (e) => {
          // Keep activeTabName in sync when using bottom tabs
          const routeName = e.target?.split('-')[0];
          if (routeName) {
            setActiveTabName(routeName);
          }
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
            <MaterialCommunityIcons name="sword-cross" size={iconSize} color={color} />
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
            <MaterialIcons name="history" size={responsive(26, 30)} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};
```

### Step 3: Update AppNavigator

**File:** `src/navigation/AppNavigator.tsx`

Changes required:
1. Remove `MainTabs` component definition
2. Remove `MainTabsWithSheets` wrapper
3. Import and use `ResponsiveMainTabs`

```typescript
// Add import
import { ResponsiveMainTabs } from './ResponsiveMainTabs';

// Replace MainTabsWithSheets usage
<Stack.Screen
  name="MainTabs"
  component={ResponsiveMainTabs}
  options={{ headerShown: false }}
/>
```

## Edge Cases

### iPadOS Split View / Slide Over
The `width > 1024` check handles this automatically. When the app runs in a smaller window, the sidebar hides and bottom tabs appear.

### iPad Mini
iPad Mini in landscape is approximately 1024px wide. The check handles the boundary correctly.

### Keyboard Open
`useWindowDimensions` (used by `useDeviceType`) reports actual available space. Sidebar remains if still > 1024px.

### Rapid Orientation Changes
React Navigation preserves state naturally. The `activeTabName` state persists across re-renders.

### Session Screen Navigation
Session screens (Chat, Debate, CompareSession, DebateTranscript) are pushed onto the Stack navigator, naturally hiding the MainTabs (and sidebar).

## Testing Checklist

### Device Testing
- [ ] iPad Pro 12.9" landscape: Sidebar visible
- [ ] iPad Pro 12.9" portrait: Bottom tabs visible
- [ ] iPad Pro 11" landscape: Sidebar visible
- [ ] iPad Pro 11" portrait: Bottom tabs visible
- [ ] iPad Mini landscape: Check width threshold behavior
- [ ] iPhone (any): Always bottom tabs

### Orientation Testing
- [ ] Rotate while on Home tab: State preserved
- [ ] Rotate while on Debate tab: State preserved
- [ ] Rotate while on Compare tab: State preserved
- [ ] Rotate while on History tab: State preserved

### Navigation Testing
- [ ] Tap sidebar Chat: Shows HomeScreen
- [ ] Tap sidebar Debate: Shows DebateSetupScreen
- [ ] Tap sidebar Compare: Shows CompareSetupScreen
- [ ] Tap sidebar History: Shows HistoryScreen with split view
- [ ] Navigate to Chat session: Sidebar hidden
- [ ] Navigate to Debate session: Sidebar hidden
- [ ] Return from session: Correct tab still active

### Edge Case Testing
- [ ] iPadOS Split View: Sidebar hides when width < 1024
- [ ] iPadOS Slide Over: Bottom tabs appear
- [ ] Demo mode: Debate badge hidden
- [ ] < 2 AIs configured: Debate badge shows "!"

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/navigation/TabletSidebar.tsx` | Exists | No changes needed |
| `src/navigation/TabletSidebarLayout.tsx` | Create | Sidebar + content wrapper |
| `src/navigation/ResponsiveMainTabs.tsx` | Create | Conditional layout switcher |
| `src/navigation/AppNavigator.tsx` | Modify | Replace MainTabs with ResponsiveMainTabs |

## Related Documentation
- `docs/ATOMIC_MIGRATION_PLAN.md` - Component architecture reference
- `src/hooks/useResponsive.ts` - Responsive helper documentation
- `src/hooks/useDeviceType.ts` - Device detection implementation
