import React from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme';
import { Typography } from '../common/Typography';

interface WebSearchToggleProps {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export const WebSearchToggle: React.FC<WebSearchToggleProps> = ({
  enabled,
  onToggle,
  disabled = false,
}) => {
  const { theme, isDark } = useTheme();

  const handlePress = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onToggle();
  };

  const backgroundColor = enabled
    ? isDark
      ? `${theme.colors.primary[500]}26` // 15% opacity
      : `${theme.colors.primary[500]}1A` // 10% opacity
    : theme.colors.surface;

  const borderColor = enabled
    ? `${theme.colors.primary[400]}99` // 60% opacity
    : theme.colors.border;

  const iconColor = enabled
    ? theme.colors.primary[500]
    : theme.colors.text.secondary;

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={enabled ? 'Web search enabled' : 'Enable web search'}
      accessibilityState={{ checked: enabled, disabled }}
      style={[
        styles.container,
        {
          backgroundColor,
          borderColor,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
    >
      <Ionicons name="globe-outline" size={18} color={iconColor} />
      <View style={styles.labelContainer}>
        <Typography
          variant="caption"
          style={[
            styles.label,
            { color: enabled ? theme.colors.primary[500] : theme.colors.text.secondary },
          ]}
        >
          {enabled ? 'On' : 'Search'}
        </Typography>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    marginRight: 8,
  },
  labelContainer: {
    minWidth: 32,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
});

export default WebSearchToggle;
