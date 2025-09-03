import React from 'react';
import { StyleSheet, ViewStyle, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Box } from '../atoms';
import { Typography } from './Typography';
import { useTheme } from '../../theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  textAlign?: 'left' | 'center';
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  accessibilityLabel,
  accessibilityHint,
  textAlign = 'center',
}) => {
  const { theme } = useTheme();

  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 6,
          minHeight: 32,
        };
      case 'large':
        return {
          paddingHorizontal: 24,
          paddingVertical: 14,
          borderRadius: 12,
        };
      case 'medium':
      default:
        return {
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 8,
        };
    }
  };

  const getVariantStyles = (): ViewStyle => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: theme.colors.primary[500],
          borderWidth: 1,
          borderColor: theme.colors.primary[500],
        };
      case 'secondary':
        return {
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: theme.colors.border,
        };
      case 'danger':
        return {
          backgroundColor: theme.colors.error[500],
          borderWidth: 1,
          borderColor: theme.colors.error[500],
        };
      default:
        return {
          backgroundColor: theme.colors.primary[500],
          borderWidth: 1,
          borderColor: theme.colors.primary[500],
        };
    }
  };

  const textColor = variant === 'ghost' || variant === 'secondary' ? 'primary' : 'inverse';
  const textVariant = size === 'small' ? 'caption' : size === 'large' ? 'subtitle' : 'button';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.container,
        getSizeStyles(),
        getVariantStyles(),
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.disabled,
        textAlign === 'left' && styles.alignStart,
        style,
      ]}
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
    >
      <Box style={[styles.content, textAlign === 'left' && styles.contentLeft]}>
        {loading ? (
          <ActivityIndicator 
            size="small" 
            color={variant === 'ghost' ? theme.colors.text.primary : theme.colors.text.inverse}
          />
        ) : (
          <Typography
            variant={textVariant}
            color={textColor}
            weight="semibold"
            align={textAlign}
          >
            {title}
          </Typography>
        )}
      </Box>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentLeft: {
    justifyContent: 'flex-start',
  },
  alignStart: {
    alignItems: 'stretch',
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
});
