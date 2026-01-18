/**
 * TraitSlider - Custom slider for personality traits
 * Features visual feedback with gradient fill and haptic response
 */

import React, { useCallback } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Typography } from '@/components/molecules';
import { useTheme } from '@/theme';

interface TraitSliderProps {
  /** Current value between 0 and 1 */
  value: number;
  /** Callback when value changes */
  onValueChange: (value: number) => void;
  /** Label for the trait */
  label: string;
  /** Label for low end (0) */
  lowLabel: string;
  /** Label for high end (1) */
  highLabel: string;
  /** Whether the slider is disabled */
  disabled?: boolean;
  /** Test ID for testing */
  testID?: string;
}

const THUMB_SIZE = 28;
const TRACK_HEIGHT = 8;
const SPRING_CONFIG = {
  damping: 20,
  stiffness: 200,
};

export const TraitSlider: React.FC<TraitSliderProps> = ({
  value,
  onValueChange,
  label,
  lowLabel,
  highLabel,
  disabled = false,
  testID,
}) => {
  const { theme } = useTheme();
  const trackWidth = useSharedValue(0);
  const isDragging = useSharedValue(false);

  // Position based on value (0-1)
  const position = useSharedValue(value);

  const triggerHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleValueChange = useCallback(
    (newValue: number) => {
      onValueChange(newValue);
    },
    [onValueChange]
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    trackWidth.value = event.nativeEvent.layout.width;
    position.value = value;
  }, [value, trackWidth, position]);

  // Update position when value prop changes
  React.useEffect(() => {
    if (!isDragging.value) {
      position.value = withSpring(value, SPRING_CONFIG);
    }
  }, [value, position, isDragging]);

  const panGesture = Gesture.Pan()
    .enabled(!disabled)
    .onBegin(() => {
      isDragging.value = true;
      runOnJS(triggerHaptic)();
    })
    .onUpdate((event) => {
      if (trackWidth.value === 0) return;

      // Calculate new position based on gesture
      const thumbOffset = THUMB_SIZE / 2;
      const effectiveWidth = trackWidth.value - THUMB_SIZE;
      const newX = Math.max(0, Math.min(event.x - thumbOffset, effectiveWidth));
      const newValue = newX / effectiveWidth;

      position.value = newValue;
    })
    .onEnd(() => {
      isDragging.value = false;
      const finalValue = Math.round(position.value * 100) / 100;
      runOnJS(handleValueChange)(finalValue);
      runOnJS(triggerHaptic)();
    });

  const tapGesture = Gesture.Tap()
    .enabled(!disabled)
    .onEnd((event) => {
      if (trackWidth.value === 0) return;

      const thumbOffset = THUMB_SIZE / 2;
      const effectiveWidth = trackWidth.value - THUMB_SIZE;
      const newX = Math.max(0, Math.min(event.x - thumbOffset, effectiveWidth));
      const newValue = newX / effectiveWidth;

      position.value = withSpring(newValue, SPRING_CONFIG);
      runOnJS(handleValueChange)(Math.round(newValue * 100) / 100);
      runOnJS(triggerHaptic)();
    });

  const combinedGesture = Gesture.Race(panGesture, tapGesture);

  const thumbStyle = useAnimatedStyle(() => {
    const effectiveWidth = trackWidth.value - THUMB_SIZE;
    return {
      transform: [{ translateX: position.value * effectiveWidth }],
    };
  });

  const fillStyle = useAnimatedStyle(() => {
    return {
      width: `${position.value * 100}%`,
    };
  });

  const thumbScaleStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: isDragging.value ? withSpring(1.2, SPRING_CONFIG) : withSpring(1, SPRING_CONFIG) },
      ],
    };
  });

  const displayValue = Math.round(value * 100);

  return (
    <View style={styles.container} testID={testID}>
      {/* Header with label and value */}
      <View style={styles.header}>
        <Typography
          variant="body"
          weight="medium"
          color={disabled ? 'disabled' : 'primary'}
        >
          {label}
        </Typography>
        <Typography
          variant="body"
          weight="semibold"
          color={disabled ? 'disabled' : 'primary'}
        >
          {displayValue}%
        </Typography>
      </View>

      {/* Slider track */}
      <GestureDetector gesture={combinedGesture}>
        <View
          style={[
            styles.trackContainer,
            disabled && styles.trackDisabled,
          ]}
          onLayout={onLayout}
        >
          {/* Background track */}
          <View
            style={[
              styles.track,
              { backgroundColor: theme.colors.border },
            ]}
          />

          {/* Filled portion */}
          <Animated.View
            style={[
              styles.trackFill,
              {
                backgroundColor: disabled
                  ? theme.colors.text.disabled
                  : theme.colors.primary[500],
              },
              fillStyle,
            ]}
          />

          {/* Thumb */}
          <Animated.View style={[styles.thumbWrapper, thumbStyle]}>
            <Animated.View
              style={[
                styles.thumb,
                {
                  backgroundColor: disabled
                    ? theme.colors.text.disabled
                    : theme.colors.primary[500],
                  borderColor: theme.colors.background,
                },
                thumbScaleStyle,
              ]}
            />
          </Animated.View>
        </View>
      </GestureDetector>

      {/* Low/High labels */}
      <View style={styles.labels}>
        <Typography variant="caption" color={disabled ? 'disabled' : 'secondary'}>
          {lowLabel}
        </Typography>
        <Typography variant="caption" color={disabled ? 'disabled' : 'secondary'}>
          {highLabel}
        </Typography>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  trackContainer: {
    height: THUMB_SIZE + 8,
    justifyContent: 'center',
    paddingHorizontal: THUMB_SIZE / 2,
  },
  trackDisabled: {
    opacity: 0.5,
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    width: '100%',
  },
  trackFill: {
    position: 'absolute',
    left: THUMB_SIZE / 2,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  thumbWrapper: {
    position: 'absolute',
    left: 0,
    top: (THUMB_SIZE + 8 - THUMB_SIZE) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
});
