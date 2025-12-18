import React from 'react';
import { TouchableOpacity, TouchableOpacityProps, StyleSheet, ViewStyle, ActivityIndicator, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
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
  trailingIcon?: keyof typeof Ionicons.glyphMap;
  onTrailingIconPress?: () => void;
  trailingIconDisabled?: boolean;
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
  trailingIcon,
  onTrailingIconPress,
  trailingIconDisabled = false,
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

  const handleTrailingIconPress = () => {
    if (!trailingIconDisabled && !disabled && onTrailingIconPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onTrailingIconPress();
    }
  };

  return (
    <View
      style={[
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.gradient,
          sizeStyles,
          trailingIcon && styles.gradientWithTrailing,
        ]}
      >
        <TouchableOpacity
          disabled={disabled || loading}
          onPress={onPress}
          style={styles.mainTouchable}
          activeOpacity={0.8}
          {...props}
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
        </TouchableOpacity>

        {trailingIcon && onTrailingIconPress && (
          <TouchableOpacity
            onPress={handleTrailingIconPress}
            disabled={trailingIconDisabled || disabled}
            style={[
              styles.trailingIconContainer,
              (trailingIconDisabled || disabled) && styles.trailingIconDisabled,
            ]}
            activeOpacity={0.6}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={styles.trailingIconSeparator} />
            <Ionicons name={trailingIcon} size={22} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  gradient: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  gradientWithTrailing: {
    paddingRight: 8,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  mainTouchable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trailingIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 8,
  },
  trailingIconDisabled: {
    opacity: 0.5,
  },
  trailingIconSeparator: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginRight: 12,
  },
});
