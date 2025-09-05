import React from 'react';
import { StyleSheet, ViewStyle, ActivityIndicator, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Box } from '../atoms';
import { Typography } from './Typography';
import { useTheme } from '../../theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'tonal';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  textAlign?: 'left' | 'center';
  rightIcon?: 'chevron-down' | 'none' | string; // minimal adornment support
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
  rightIcon = 'none',
}) => {
  const { theme, isDark } = useTheme();

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
      case 'tonal':
        return {
          backgroundColor: isDark ? theme.colors.overlays.medium : theme.colors.primary[50],
          borderWidth: 1,
          borderColor: isDark ? theme.colors.primary[400] : theme.colors.primary[200],
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

  const textColor = (variant === 'ghost' || variant === 'secondary' || variant === 'tonal') ? 'primary' : 'inverse';
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
      <Box style={[styles.content, textAlign === 'left' ? styles.contentBetween : styles.contentCenter]}>
        {loading ? (
          <ActivityIndicator 
            size="small" 
            color={variant === 'ghost' ? theme.colors.text.primary : theme.colors.text.inverse}
          />
        ) : (
          <>
            <Typography
              variant={textVariant}
              color={textColor}
              weight="semibold"
              align={textAlign}
            >
              {title}
            </Typography>
            {textAlign === 'left' && rightIcon !== 'none' && (
              <View style={{ marginLeft: 8 }}>
                {rightIcon === 'chevron-down' ? (
                  <Ionicons name="chevron-down" size={16} color={variant === 'primary' ? theme.colors.text.inverse : theme.colors.primary[500]} />
                ) : (
                  <Typography variant="caption" color={textColor}>{rightIcon}</Typography>
                )}
              </View>
            )}
          </>
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
  },
  contentCenter: {
    justifyContent: 'center',
  },
  contentBetween: {
    justifyContent: 'space-between',
    width: '100%',
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  alignStart: {
    alignItems: 'stretch',
  },
});
