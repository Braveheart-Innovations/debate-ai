/**
 * TypingDots Atom Component
 * Simple animated dots for typing indicators
 * Pure presentational component with no business logic
 */

import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';

export const TypingDots: React.FC = () => {
  const { theme } = useTheme();
  const dot1Opacity = useSharedValue(0.3);
  const dot2Opacity = useSharedValue(0.3);
  const dot3Opacity = useSharedValue(0.3);

  useEffect(() => {
    dot1Opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0.3, { duration: 400 })
      ),
      -1
    );

    dot2Opacity.value = withDelay(
      200,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.3, { duration: 400 })
        ),
        -1
      )
    );

    dot3Opacity.value = withDelay(
      400,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.3, { duration: 400 })
        ),
        -1
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dot1Style = useAnimatedStyle(() => ({
    opacity: dot1Opacity.value,
  }));

  const dot2Style = useAnimatedStyle(() => ({
    opacity: dot2Opacity.value,
  }));

  const dot3Style = useAnimatedStyle(() => ({
    opacity: dot3Opacity.value,
  }));

  const dotBase = {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.text.secondary,
    marginHorizontal: 2,
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 6 }}>
      <Animated.View style={[dotBase, dot1Style]} />
      <Animated.View style={[dotBase, dot2Style]} />
      <Animated.View style={[dotBase, dot3Style]} />
    </View>
  );
};
