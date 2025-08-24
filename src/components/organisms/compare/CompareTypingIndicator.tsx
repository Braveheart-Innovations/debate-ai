import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../../../theme';

interface CompareTypingIndicatorProps {
  isVisible: boolean;
  side: 'left' | 'right';
}

export const CompareTypingIndicator: React.FC<CompareTypingIndicatorProps> = ({ 
  isVisible,
  side 
}) => {
  const { theme } = useTheme();
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isVisible) {
      const animateDot = (dot: Animated.Value, delay: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.timing(dot, {
              toValue: 1,
              duration: 400,
              delay,
              useNativeDriver: true,
            }),
            Animated.timing(dot, {
              toValue: 0,
              duration: 400,
              useNativeDriver: true,
            }),
          ])
        );
      };

      const animation = Animated.parallel([
        animateDot(dot1, 0),
        animateDot(dot2, 150),
        animateDot(dot3, 300),
      ]);

      animation.start();

      return () => {
        animation.stop();
        dot1.setValue(0);
        dot2.setValue(0);
        dot3.setValue(0);
      };
    }
    return undefined;
  }, [isVisible, dot1, dot2, dot3]);

  if (!isVisible) return null;

  const dotColor = side === 'left' 
    ? theme.colors.warning[500]
    : theme.colors.info[500];

  return (
    <View style={styles.container}>
      <View style={styles.dotsWrapper}>
        <Animated.View
          style={[
            styles.dot,
            { 
              backgroundColor: dotColor,
              opacity: dot1,
              transform: [{ scale: dot1.interpolate({
                inputRange: [0, 1],
                outputRange: [0.8, 1.2]
              })}]
            }
          ]}
        />
        <Animated.View
          style={[
            styles.dot,
            { 
              backgroundColor: dotColor,
              opacity: dot2,
              transform: [{ scale: dot2.interpolate({
                inputRange: [0, 1],
                outputRange: [0.8, 1.2]
              })}]
            }
          ]}
        />
        <Animated.View
          style={[
            styles.dot,
            { 
              backgroundColor: dotColor,
              opacity: dot3,
              transform: [{ scale: dot3.interpolate({
                inputRange: [0, 1],
                outputRange: [0.8, 1.2]
              })}]
            }
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 12,
    alignItems: 'center',
  },
  dotsWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginHorizontal: 4,
  },
});