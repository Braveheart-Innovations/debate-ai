import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { Typography } from '@/components/molecules';
import * as Haptics from 'expo-haptics';

interface PersonalityBadgeProps {
  personalityName: string;
  onPress: () => void;
  disabled?: boolean;
  style?: object;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export const PersonalityBadge: React.FC<PersonalityBadgeProps> = ({
  personalityName,
  onPress,
  disabled = false,
  style,
}) => {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  
  const handlePressIn = () => {
    scale.value = withSpring(0.95, {
      damping: 15,
      stiffness: 400,
    });
  };
  
  const handlePressOut = () => {
    scale.value = withSpring(1, {
      damping: 15,
      stiffness: 400,
    });
  };
  
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <AnimatedTouchable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      disabled={disabled}
      style={[
        styles.badge,
        animatedStyle,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      <View style={styles.content}>
        <Typography
          variant="caption"
          weight="medium"
          color={disabled ? 'disabled' : 'secondary'}
          style={styles.text}
        >
          {personalityName}
        </Typography>
        <Text style={[styles.chevron, { color: theme.colors.text.disabled }]}>
          ›
        </Text>
      </View>
    </AnimatedTouchable>
  );
};

const styles = StyleSheet.create({
  badge: {
    height: 26,
    paddingHorizontal: 12,
    borderRadius: 13,
    borderWidth: 1,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    fontSize: 12,
    lineHeight: 14,
  },
  chevron: {
    fontSize: 14,
    marginLeft: 4,
    fontWeight: '600',
  },
});
