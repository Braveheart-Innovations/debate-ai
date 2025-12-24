import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { Typography } from '../components/molecules';

interface TabletSidebarProps {
  activeTab: string;
  onTabPress: (tabName: string) => void;
  configuredCount: number;
  isDemo: boolean;
}

interface SidebarItem {
  name: string;
  label: string;
  icon: React.ReactNode;
  activeIcon: React.ReactNode;
  badge?: string;
}

/**
 * Tablet sidebar navigation for iPad landscape mode.
 * Replaces bottom tabs with a permanent left sidebar.
 */
export const TabletSidebar: React.FC<TabletSidebarProps> = ({
  activeTab,
  onTabPress,
  configuredCount,
  isDemo,
}) => {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const items: SidebarItem[] = [
    {
      name: 'Home',
      label: 'Chat',
      icon: <Ionicons name="chatbubbles-outline" size={24} color={theme.colors.text.secondary} />,
      activeIcon: <Ionicons name="chatbubbles" size={24} color={theme.colors.primary[500]} />,
    },
    {
      name: 'DebateTab',
      label: 'Debate',
      icon: <MaterialCommunityIcons name="sword-cross" size={24} color={theme.colors.text.secondary} />,
      activeIcon: <MaterialCommunityIcons name="sword-cross" size={24} color={theme.colors.primary[500]} />,
      badge: !isDemo && configuredCount < 2 ? '!' : undefined,
    },
    {
      name: 'Compare',
      label: 'Compare',
      icon: <Ionicons name="git-compare-outline" size={24} color={theme.colors.text.secondary} />,
      activeIcon: <Ionicons name="git-compare" size={24} color={theme.colors.primary[500]} />,
    },
    {
      name: 'History',
      label: 'History',
      icon: <MaterialIcons name="history" size={26} color={theme.colors.text.secondary} />,
      activeIcon: <MaterialIcons name="history" size={26} color={theme.colors.primary[500]} />,
    },
  ];

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? '#000000' : '#FFFFFF',
          borderRightColor: theme.colors.border,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 16,
        },
      ]}
    >
      {/* App branding */}
      <View style={styles.brandingSection}>
        <Typography variant="subtitle" weight="bold" style={{ color: theme.colors.primary[500] }}>
          Symposium
        </Typography>
      </View>

      {/* Navigation items */}
      <View style={styles.navSection}>
        {items.map((item) => {
          const isActive = activeTab === item.name;
          return (
            <TouchableOpacity
              key={item.name}
              style={[
                styles.navItem,
                isActive && {
                  backgroundColor: isDark
                    ? theme.colors.primary[900]
                    : theme.colors.primary[50],
                },
              ]}
              onPress={() => onTabPress(item.name)}
              accessibilityLabel={item.label}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              {isActive ? item.activeIcon : item.icon}
              <Typography
                variant="caption"
                weight={isActive ? 'semibold' : 'normal'}
                style={{
                  marginTop: 4,
                  color: isActive ? theme.colors.primary[500] : theme.colors.text.secondary,
                }}
              >
                {item.label}
              </Typography>
              {item.badge && (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: theme.colors.error[500] },
                  ]}
                >
                  <Typography
                    variant="caption"
                    style={{ color: '#FFFFFF', fontSize: 10 }}
                  >
                    {item.badge}
                  </Typography>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 88,
    borderRightWidth: 1,
    alignItems: 'center',
  },
  brandingSection: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  navSection: {
    flex: 1,
    width: '100%',
    paddingTop: 8,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginHorizontal: 8,
    marginBottom: 4,
    borderRadius: 12,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 12,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
});
