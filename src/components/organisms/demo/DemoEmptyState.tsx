import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Typography } from '@/components/molecules/common/Typography';
import { useTheme } from '@/theme';
import { colors } from '@/theme/colors';

export interface DemoEmptyStateProps {
  /** Title text */
  title?: string;
  /** Subtitle text */
  subtitle?: string;
  /** Whether to show the animated arrow pointing up */
  showArrow?: boolean;
}

/**
 * DemoEmptyState - Demo-specific empty state with animated arrow
 */
export const DemoEmptyState: React.FC<DemoEmptyStateProps> = ({
  title = 'Choose a Demo Conversation',
  subtitle = 'Select a sample above to see the AI in action',
  showArrow = true,
}) => {
  const { theme, isDark } = useTheme();

  // Bouncing arrow animation
  const arrowTranslate = useSharedValue(0);

  useEffect(() => {
    if (showArrow) {
      arrowTranslate.value = withRepeat(
        withSequence(
          withTiming(-10, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 600, easing: Easing.inOut(Easing.ease) })
        ),
        -1, // infinite
        false
      );
    }
  }, [showArrow, arrowTranslate]);

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: arrowTranslate.value }],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(400)}
      style={styles.container}
    >
      {/* Animated arrow */}
      {showArrow && (
        <Animated.View style={[styles.arrowContainer, arrowStyle]}>
          <Ionicons
            name="arrow-up"
            size={28}
            color={theme.colors.text.secondary}
          />
        </Animated.View>
      )}

      {/* Icon */}
      <View
        style={[
          styles.iconContainer,
          {
            backgroundColor: isDark
              ? theme.colors.overlays.soft
              : theme.colors.overlays.subtle,
          },
        ]}
      >
        <Ionicons
          name="chatbubbles"
          size={40}
          color={colors.primary[isDark ? 400 : 500]}
        />
        <View style={styles.playBadge}>
          <Ionicons
            name="play"
            size={14}
            color="#FFFFFF"
          />
        </View>
      </View>

      {/* Text */}
      <Typography
        variant="title"
        weight="semibold"
        style={[styles.title, { color: theme.colors.text.primary }]}
      >
        {title}
      </Typography>

      <Typography
        variant="body"
        style={[styles.subtitle, { color: theme.colors.text.secondary }]}
      >
        {subtitle}
      </Typography>

      {/* Demo mode indicator */}
      <View
        style={[
          styles.modeIndicator,
          {
            backgroundColor: isDark
              ? colors.primary[900]
              : colors.primary[50],
            borderColor: isDark
              ? colors.primary[600]
              : colors.primary[200],
          },
        ]}
      >
        <Ionicons
          name="play-circle-outline"
          size={14}
          color={colors.primary[isDark ? 300 : 600]}
        />
        <Typography
          variant="caption"
          weight="medium"
          style={{ color: colors.primary[isDark ? 300 : 600], marginLeft: 4 }}
        >
          Demo Mode
        </Typography>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  arrowContainer: {
    marginBottom: 16,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  playBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  modeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
});

export default DemoEmptyState;
