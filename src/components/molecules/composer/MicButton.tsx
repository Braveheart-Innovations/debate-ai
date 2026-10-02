import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';

interface MicButtonProps {
  isListening: boolean;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

/**
 * Composer dictation toggle. Idle it is a quiet mic glyph beside send; while
 * listening it fills with the accent color and pulses so the live state is
 * obvious even when the transcript has not changed yet.
 */
export const MicButton: React.FC<MicButtonProps> = ({
  isListening,
  onPress,
  disabled = false,
  testID,
}) => {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (isListening && !reduceMotion) {
      pulse.value = 0;
      pulse.value = withRepeat(withTiming(1, { duration: 1100 }), -1, false);
    } else {
      cancelAnimation(pulse);
      pulse.value = 0;
    }
  }, [isListening, reduceMotion, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 0.45 }],
  }));

  const accent = theme.colors.primary[500];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={isListening ? 'Stop dictation' : 'Dictate message'}
      accessibilityState={{ disabled, selected: isListening }}
      hitSlop={6}
      style={styles.container}
      testID={testID}
    >
      {isListening && (
        <Animated.View
          pointerEvents="none"
          style={[styles.ring, { backgroundColor: accent }, pulseStyle]}
        />
      )}
      <View
        style={[
          styles.button,
          isListening && { backgroundColor: accent },
        ]}
      >
        <Ionicons
          name={isListening ? 'stop' : 'mic-outline'}
          size={isListening ? 16 : 22}
          color={
            isListening
              ? '#FFFFFF'
              : disabled
                ? theme.colors.text.disabled
                : theme.colors.text.secondary
          }
        />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default MicButton;
