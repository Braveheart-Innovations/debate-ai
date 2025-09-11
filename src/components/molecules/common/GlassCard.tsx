import React from 'react';
import { TouchableOpacity, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { Box } from '@/components/atoms';
import { useTheme } from '@/theme';

interface GlassCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  style?: ViewStyle;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  onPress,
  disabled = false,
  padding = 'md',
  style,
}) => {
  const { theme, isDark } = useTheme();

  const paddingMap = {
    none: 0,
    sm: theme.spacing.sm,
    md: theme.spacing.md,
    lg: theme.spacing.lg,
  };

  const cardStyle: ViewStyle = {
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: isDark 
      ? 'rgba(255, 255, 255, 0.05)' 
      : 'rgba(255, 255, 255, 0.8)',
  };

  const blurStyle: ViewStyle = {
    padding: paddingMap[padding],
  };

  const content = (
    <Box style={[cardStyle, style]}>
      <BlurView
        intensity={isDark ? 20 : 80}
        tint={isDark ? 'dark' : 'light'}
        style={blurStyle}
      >
        {children}
      </BlurView>
    </Box>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.8}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};
