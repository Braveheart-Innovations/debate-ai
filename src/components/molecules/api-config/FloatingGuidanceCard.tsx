/**
 * FloatingGuidanceCard
 *
 * A floating card that shows step-by-step guidance during API key acquisition.
 * Appears as an overlay in the WebView modal.
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Box } from '@/components/atoms';
import { Typography } from '../common/Typography';
import { useTheme } from '@/theme';
import { GuidanceStep } from '@/config/aiProviders';

interface FloatingGuidanceCardProps {
  /** The current guidance step to display. */
  step: GuidanceStep;
  /** The current step number (1-indexed). */
  stepNumber: number;
  /** Total number of steps. */
  totalSteps: number;
  /** Whether the card is visible. */
  visible: boolean;
  /** Callback to dismiss the card. */
  onDismiss?: () => void;
  /** Position of the card. */
  position?: 'top' | 'bottom';
  /** Additional styles. */
  style?: ViewStyle;
  testID?: string;
}

export const FloatingGuidanceCard: React.FC<FloatingGuidanceCardProps> = ({
  step,
  stepNumber,
  totalSteps,
  visible,
  onDismiss,
  position = 'top',
  style,
  testID,
}) => {
  const { theme, isDark } = useTheme();

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={[
        styles.container,
        position === 'top' ? styles.positionTop : styles.positionBottom,
        style,
      ]}
      testID={testID}
    >
      <BlurView
        intensity={isDark ? 60 : 80}
        tint={isDark ? 'dark' : 'light'}
        style={styles.blurContainer}
      >
        <Box
          style={[
            styles.card,
            { backgroundColor: isDark ? 'rgba(30, 30, 30, 0.9)' : 'rgba(255, 255, 255, 0.95)' },
          ]}
        >
          {/* Step indicator */}
          <Box style={styles.header}>
            <Box
              style={[
                styles.stepBadge,
                { backgroundColor: theme.colors.primary[500] },
              ]}
            >
              <Typography
                variant="caption"
                weight="semibold"
                style={{ color: '#FFFFFF' }}
              >
                Step {stepNumber}/{totalSteps}
              </Typography>
            </Box>

            {onDismiss && (
              <TouchableOpacity
                onPress={onDismiss}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Dismiss guidance"
                accessibilityRole="button"
              >
                <Typography variant="body" color="secondary">
                  Hide
                </Typography>
              </TouchableOpacity>
            )}
          </Box>

          {/* Step content */}
          <Box style={styles.content}>
            <Typography variant="body" weight="semibold" style={styles.title}>
              {step.title}
            </Typography>
            <Typography variant="caption" color="secondary" style={styles.instruction}>
              {step.instruction}
            </Typography>
          </Box>
        </Box>
      </BlurView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 1000,
  },
  positionTop: {
    top: 16,
  },
  positionBottom: {
    bottom: 100, // Above the bottom button
  },
  blurContainer: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  card: {
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  stepBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  content: {
    gap: 4,
  },
  title: {
    marginBottom: 2,
  },
  instruction: {
    lineHeight: 18,
  },
});
