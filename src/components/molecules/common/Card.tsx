import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { Box } from '@/components/atoms';
import { useTheme } from '@/theme';

interface CardProps {
  children: React.ReactNode;
  padding?: 'none' | 'small' | 'medium' | 'large';
  margin?: 'none' | 'small' | 'medium' | 'large';
  shadow?: boolean;
  style?: ViewStyle;
}

export const Card: React.FC<CardProps> = ({
  children,
  padding = 'medium',
  margin = 'none',
  shadow = true,
  style,
}) => {
  const { theme, isDark } = useTheme();

  const getPaddingStyles = () => {
    switch (padding) {
      case 'none':
        return { padding: 0 };
      case 'small':
        return { padding: theme.spacing.sm };
      case 'large':
        return { padding: theme.spacing.lg };
      case 'medium':
      default:
        return { padding: theme.spacing.md };
    }
  };

  const getMarginStyles = () => {
    switch (margin) {
      case 'none':
        return { margin: 0 };
      case 'small':
        return { margin: theme.spacing.sm };
      case 'large':
        return { margin: theme.spacing.lg };
      case 'medium':
      default:
        return { margin: theme.spacing.md };
    }
  };

  const shadowStyles = shadow ? {
    shadowColor: isDark ? '#000' : '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: isDark ? 0.3 : 0.1,
    shadowRadius: 4,
    elevation: 3,
  } : {};

  return (
    <Box
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
        getPaddingStyles(),
        getMarginStyles(),
        shadowStyles,
        style,
      ]}
    >
      {children}
    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
  },
});
