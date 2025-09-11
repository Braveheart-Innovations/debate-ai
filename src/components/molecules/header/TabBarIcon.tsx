import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme';

type IconLibrary = 'ionicons' | 'material' | 'material-community';

interface TabBarIconProps {
  name: string;
  library?: IconLibrary;
  focused: boolean;
  color: string;
  size?: number;
  badge?: string | number;
  badgeColor?: string;
}

export const TabBarIcon: React.FC<TabBarIconProps> = ({
  name,
  library = 'ionicons',
  color,
  size = 24,
  badge,
  badgeColor,
}) => {
  const { theme } = useTheme();

  const renderIcon = () => {
    switch (library) {
      case 'material':
        return <MaterialIcons name={name as keyof typeof MaterialIcons.glyphMap} size={size} color={color} />;
      case 'material-community':
        return <MaterialCommunityIcons name={name as keyof typeof MaterialCommunityIcons.glyphMap} size={size} color={color} />;
      case 'ionicons':
      default:
        return <Ionicons name={name as keyof typeof Ionicons.glyphMap} size={size} color={color} />;
    }
  };

  return (
    <View style={styles.container}>
      {renderIcon()}
      {badge && (
        <View style={[
          styles.badge,
          { backgroundColor: badgeColor || theme.colors.error[500] }
        ]}>
          <Text style={[styles.badgeText, { color: theme.colors.background }]}>
            {typeof badge === 'number' && badge > 99 ? '99+' : badge}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
});
