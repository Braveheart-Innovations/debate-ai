import React from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Typography } from '../common/Typography';
import { Box } from '../../atoms';
import { useTheme } from '../../../theme';
import { colors } from '../../../theme/colors';

export interface DemoProgressIndicatorProps {
  /** Current turn number (1-based for display) */
  currentTurn: number;
  /** Total number of turns */
  totalTurns: number;
  /** Whether the demo has completed all turns */
  isComplete?: boolean;
  /** Called when user wants to replay the demo */
  onReplay?: () => void;
}

/**
 * DemoProgressIndicator - Shows demo playback progress with turn counter
 */
export const DemoProgressIndicator: React.FC<DemoProgressIndicatorProps> = ({
  currentTurn,
  totalTurns,
  isComplete = false,
  onReplay,
}) => {
  const { theme, isDark } = useTheme();

  // Calculate progress percentage
  const progress = totalTurns > 0 ? (currentTurn / totalTurns) * 100 : 0;

  // Get progress bar colors based on theme
  const progressColors: [string, string] = colors.gradients.primary as [string, string];
  const trackColor = isDark ? theme.colors.gray[700] : theme.colors.gray[200];

  if (totalTurns === 0) {
    return null;
  }

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
      style={[
        styles.container,
        {
          backgroundColor: isDark
            ? theme.colors.overlays.subtle
            : theme.colors.overlays.soft,
          borderBottomColor: theme.colors.border,
        },
      ]}
    >
      {/* Progress bar */}
      <Box style={[styles.progressTrack, { backgroundColor: trackColor }]}>
        <LinearGradient
          colors={progressColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.progressFill, { width: `${progress}%` }]}
        />
      </Box>

      {/* Status row */}
      <View style={styles.statusRow}>
        {isComplete ? (
          <>
            <View style={styles.completeContainer}>
              <Ionicons
                name="checkmark-circle"
                size={16}
                color={colors.success[500]}
              />
              <Typography
                variant="caption"
                weight="medium"
                style={[styles.statusText, { color: colors.success[500] }]}
              >
                Demo Complete
              </Typography>
            </View>
            {onReplay && (
              <TouchableOpacity
                onPress={onReplay}
                style={styles.replayButton}
                activeOpacity={0.7}
                accessibilityLabel="Replay demo"
                accessibilityRole="button"
              >
                <Ionicons
                  name="refresh"
                  size={14}
                  color={theme.colors.text.secondary}
                />
                <Typography
                  variant="caption"
                  weight="medium"
                  style={{ color: theme.colors.text.secondary, marginLeft: 4 }}
                >
                  Replay
                </Typography>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <Typography
            variant="caption"
            weight="medium"
            style={{ color: theme.colors.text.secondary }}
          >
            Turn {currentTurn} of {totalTurns}
          </Typography>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  completeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    marginLeft: 4,
  },
  replayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
});

export default DemoProgressIndicator;
