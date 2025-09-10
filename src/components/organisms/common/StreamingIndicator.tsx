import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';

interface StreamingIndicatorProps {
  visible: boolean;
  variant?: 'cursor' | 'dots';
  color?: string;
  size?: number;
}

export const StreamingIndicator: React.FC<StreamingIndicatorProps> = ({
  visible,
  variant = 'cursor',
  color,
  size = 16,
}) => {
  const { theme } = useTheme();
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  const indicatorColor = color || theme.colors.text.primary;

  useEffect(() => {
    if (visible) {
      if (variant === 'cursor') {
        // Blinking cursor animation
        opacity.value = withRepeat(
          withSequence(
            withTiming(0, { duration: 400 }),
            withTiming(1, { duration: 400 })
          ),
          -1,
          false
        );
      } else {
        // Pulsing dots animation
        scale.value = withRepeat(
          withSequence(
            withTiming(1.2, { duration: 300 }),
            withTiming(1, { duration: 300 })
          ),
          -1,
          true
        );
      }
    } else {
      opacity.value = withTiming(0, { duration: 200 });
      scale.value = withTiming(1, { duration: 200 });
    }
  }, [visible, variant, opacity, scale]);

  const cursorAnimatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const dotsAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: interpolate(scale.value, [1, 1.2], [0.6, 1]),
  }));

  if (!visible) return null;

  if (variant === 'cursor') {
    return (
      <Animated.Text
        style={[
          styles.cursor,
          cursorAnimatedStyle,
          {
            color: indicatorColor,
            fontSize: size,
          },
        ]}
      >
        ▊
      </Animated.Text>
    );
  }

  // Dots variant
  return (
    <Animated.View style={[styles.dotsContainer, dotsAnimatedStyle]}>
      {[0, 1, 2].map((index) => (
        <Animated.View
          key={index}
          style={[
            styles.dot,
            {
              backgroundColor: indicatorColor,
              width: size / 3,
              height: size / 3,
              marginHorizontal: size / 6,
            },
          ]}
        />
      ))}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  cursor: {
    fontFamily: 'monospace',
    marginLeft: 2,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  dot: {
    borderRadius: 999,
  },
});
