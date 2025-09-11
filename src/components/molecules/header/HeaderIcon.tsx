import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme';

type IconLibrary = 'ionicons' | 'material' | 'material-community';

interface HeaderIconProps {
  name: string;
  library?: IconLibrary;
  onPress: () => void;
  disabled?: boolean;
  size?: number;
  badge?: string | number;
  badgeColor?: string;
  color?: string; // Override icon color (useful for gradient backgrounds)
  accessibilityLabel?: string;
  testID?: string;
}

export const HeaderIcon: React.FC<HeaderIconProps> = ({
  name,
  library = 'ionicons',
  onPress,
  disabled = false,
  size = 24,
  badge,
  badgeColor,
  color,
  accessibilityLabel,
  testID,
}) => {
  const { theme } = useTheme();

  const handlePress = () => {
    if (!disabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  const renderIcon = () => {
    const iconColor = color || (disabled ? theme.colors.text.secondary : theme.colors.text.primary);
    
    switch (library) {
      case 'material':
        return <MaterialIcons name={name as keyof typeof MaterialIcons.glyphMap} size={size} color={iconColor} />;
      case 'material-community':
        return <MaterialCommunityIcons name={name as keyof typeof MaterialCommunityIcons.glyphMap} size={size} color={iconColor} />;
      case 'ionicons':
      default:
        return <Ionicons name={name as keyof typeof Ionicons.glyphMap} size={size} color={iconColor} />;
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled}
      style={[styles.container, { opacity: disabled ? 0.5 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <View style={styles.iconContainer}>
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
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 8,
  },
  iconContainer: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -6,
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
