import React from 'react';
import { TouchableOpacity, TouchableOpacityProps, StyleSheet, ViewStyle, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Typography } from './Typography';
import { useTheme } from '@/theme';

interface GradientButtonProps extends Omit<TouchableOpacityProps, 'style'> {
  title: string;
  gradient?: readonly string[];
  variant?: 'primary' | 'secondary' | 'success';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  hapticType?: string;
  loading?: boolean;
  style?: ViewStyle;
}

export const GradientButton: React.FC<GradientButtonProps> = ({
  title,
  gradient,
  variant = 'primary',
  size = 'medium',
  fullWidth = false,
  hapticType: _hapticType,
  loading = false,
  disabled = false,
  onPress,
  style,
  ...props
}) => {
  const { theme } = useTheme();
  
  // Support both gradient prop and variant-based gradients
  const getGradientColors = () => {
    if (gradient) return gradient as readonly [string, string, ...string[]];
    
    const variantMap = {
      primary: theme.colors.gradients.primary,
      secondary: theme.colors.gradients.ocean,
      success: theme.colors.gradients.forest,
    };
    
    return variantMap[variant] as readonly [string, string, ...string[]];
  };
  
  const gradientColors = getGradientColors();
  
  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return {
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 8,
        };
      case 'large':
        return {
          paddingHorizontal: 32,
          paddingVertical: 16,
          borderRadius: 16,
        };
      case 'medium':
      default:
        return {
          paddingHorizontal: 24,
          paddingVertical: 12,
          borderRadius: 12,
        };
    }
  };
  
  const sizeStyles = getSizeStyles();
  const textVariant = size === 'small' ? 'caption' : size === 'large' ? 'title' : 'button';
  
  return (
    <TouchableOpacity
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.disabled,
        style,
      ]}
      {...props}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.gradient,
          sizeStyles,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Typography
            variant={textVariant}
            weight="semibold"
            color="inverse"
            align="center"
          >
            {title}
          </Typography>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  gradient: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
});
