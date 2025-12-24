/**
 * useMessageBubbleAnimation - Unified animation hook for message bubbles
 * Provides consistent animation behavior across Chat, Debate, and Compare modes
 */

import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';

export type BubbleAnimationType = 'spring-scale' | 'fade-in' | 'none';

interface UseMessageBubbleAnimationOptions {
  /** Animation type: 'spring-scale' for Chat, 'fade-in' for Debate/Compare */
  type?: BubbleAnimationType;
  /** Whether this is a new message that should animate in */
  isNew?: boolean;
  /** Delay before animation starts (ms) */
  delay?: number;
}

interface UseMessageBubbleAnimationReturn {
  /** Animated style to apply to message container */
  animatedStyle: ReturnType<typeof useAnimatedStyle>;
}

/**
 * Unified animation hook for message bubbles
 *
 * @example
 * // Chat mode - spring scale animation for last message
 * const { animatedStyle } = useMessageBubbleAnimation({
 *   type: 'spring-scale',
 *   isNew: isLast,
 * });
 *
 * @example
 * // Debate mode - fade in animation
 * const { animatedStyle } = useMessageBubbleAnimation({
 *   type: 'fade-in',
 *   isNew: true,
 * });
 */
export const useMessageBubbleAnimation = ({
  type = 'fade-in',
  isNew = false,
  delay = 0,
}: UseMessageBubbleAnimationOptions = {}): UseMessageBubbleAnimationReturn => {
  // Initialize values based on whether this is a new message
  const opacity = useSharedValue(isNew && type !== 'none' ? 0 : 1);
  const scale = useSharedValue(isNew && type === 'spring-scale' ? 0.85 : 1);

  useEffect(() => {
    if (!isNew || type === 'none') return;

    const animate = () => {
      if (type === 'spring-scale') {
        // Chat mode: spring scale with subtle fade
        scale.value = withSpring(1, {
          damping: 15,
          stiffness: 150,
        });
        opacity.value = withTiming(1, { duration: 150 });
      } else if (type === 'fade-in') {
        // Debate/Compare mode: smooth fade in
        opacity.value = withTiming(1, {
          duration: 300,
          easing: Easing.out(Easing.ease),
        });
      }
    };

    if (delay > 0) {
      const timeout = setTimeout(animate, delay);
      return () => clearTimeout(timeout);
    }

    animate();
    return undefined;
  }, [isNew, type, delay, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return { animatedStyle };
};

export default useMessageBubbleAnimation;
