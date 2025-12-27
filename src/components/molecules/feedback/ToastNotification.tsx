import React, { useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box } from '../../atoms';
import { Typography } from '../common/Typography';
import { useTheme } from '../../../theme';
import { ErrorSeverity } from '../../../errors/codes/ErrorCodes';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface ToastNotificationProps {
  /** Message to display */
  message: string;
  /** Severity level for styling */
  severity: ErrorSeverity;
  /** Whether toast is visible */
  visible: boolean;
  /** Called when toast is dismissed */
  onDismiss: () => void;
  /** Called when retry button is pressed */
  onRetry?: () => void;
  /** Whether retry button should be shown */
  retryable?: boolean;
  /** Auto-dismiss duration in ms (0 = no auto-dismiss) */
  duration?: number;
  /** Position of the toast */
  position?: 'top' | 'bottom';
}

interface SeverityConfig {
  icon: keyof typeof Ionicons.glyphMap;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
}

/**
 * ToastNotification - Animated toast notification component
 *
 * Features:
 * - Animated entrance/exit
 * - Severity-based styling (info, warning, error, critical)
 * - Optional retry button for retryable errors
 * - Auto-dismiss with configurable duration
 * - Critical errors require manual dismissal
 */
export const ToastNotification: React.FC<ToastNotificationProps> = ({
  message,
  severity,
  visible,
  onDismiss,
  onRetry,
  retryable = false,
  duration = 4000,
  position = 'top',
}) => {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(position === 'top' ? -100 : 100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  }, []);

  const animateOut = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: position === 'top' ? -100 : 100,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  }, [translateY, opacity, position, onDismiss]);

  const handleDismiss = useCallback(() => {
    clearDismissTimer();
    animateOut();
  }, [clearDismissTimer, animateOut]);

  useEffect(() => {
    if (visible) {
      // Animate in
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 15,
          stiffness: 150,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Set auto-dismiss timer (except for critical errors)
      if (duration > 0 && severity !== 'critical') {
        clearDismissTimer();
        dismissTimer.current = setTimeout(() => {
          animateOut();
        }, duration);
      }
    }

    return clearDismissTimer;
  }, [visible, duration, severity, translateY, opacity, clearDismissTimer, animateOut]);

  const getSeverityConfig = useCallback((): SeverityConfig => {
    switch (severity) {
      case 'info':
        return {
          icon: 'information-circle',
          backgroundColor: isDark ? theme.colors.info[900] : theme.colors.info[50],
          borderColor: theme.colors.info[500],
          textColor: isDark ? theme.colors.info[200] : theme.colors.info[700],
        };
      case 'warning':
        return {
          icon: 'warning',
          backgroundColor: isDark ? theme.colors.warning[900] : theme.colors.warning[50],
          borderColor: theme.colors.warning[500],
          textColor: isDark ? theme.colors.warning[200] : theme.colors.warning[700],
        };
      case 'error':
        return {
          icon: 'close-circle',
          backgroundColor: isDark ? theme.colors.error[900] : theme.colors.error[50],
          borderColor: theme.colors.error[500],
          textColor: isDark ? theme.colors.error[200] : theme.colors.error[700],
        };
      case 'critical':
        return {
          icon: 'alert-circle',
          backgroundColor: isDark ? theme.colors.error[800] : theme.colors.error[100],
          borderColor: theme.colors.error[600],
          textColor: isDark ? theme.colors.error[100] : theme.colors.error[800],
        };
      default:
        return {
          icon: 'information-circle',
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          textColor: theme.colors.text.primary,
        };
    }
  }, [severity, isDark, theme]);

  const config = getSeverityConfig();

  const containerStyle: ViewStyle = {
    position: 'absolute',
    [position]: position === 'top' ? insets.top + 8 : insets.bottom + 8,
    left: 16,
    right: 16,
    maxWidth: SCREEN_WIDTH - 32,
    zIndex: 9999,
  };

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      style={[
        containerStyle,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <Box
        style={[
          styles.toast,
          {
            backgroundColor: config.backgroundColor,
            borderLeftColor: config.borderColor,
          },
          theme.shadows.md,
        ]}
      >
        <Ionicons
          name={config.icon}
          size={20}
          color={config.borderColor}
          style={styles.icon}
        />

        <Typography
          variant="body"
          style={[styles.message, { color: config.textColor }]}
          numberOfLines={3}
        >
          {message}
        </Typography>

        <Box style={styles.actions}>
          {retryable && onRetry && (
            <TouchableOpacity
              onPress={onRetry}
              style={styles.retryButton}
              activeOpacity={0.7}
            >
              <Typography
                variant="body"
                style={{ color: theme.colors.primary[500] }}
                weight="semibold"
              >
                Retry
              </Typography>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={handleDismiss}
            style={styles.dismissButton}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name="close"
              size={18}
              color={theme.colors.text.secondary}
            />
          </TouchableOpacity>
        </Box>
      </Box>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
  },
  icon: {
    marginRight: 12,
  },
  message: {
    flex: 1,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dismissButton: {
    padding: 4,
  },
});
