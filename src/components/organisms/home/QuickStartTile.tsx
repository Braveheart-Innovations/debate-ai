import React from 'react';
import { TouchableOpacity, ViewStyle } from 'react-native';
import Animated, { 
  FadeInUp,
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from 'react-native-reanimated';
import { Box } from '@/components/atoms';
import { Typography } from '@/components/molecules';
import { useTheme } from '@/theme';
import * as Haptics from 'expo-haptics';

interface QuickStartTileProps {
  emoji: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  index: number;
  disabled?: boolean;
  style?: ViewStyle;
}


export const QuickStartTile: React.FC<QuickStartTileProps> = ({
  emoji,
  title,
  subtitle,
  onPress,
  index,
  disabled = false,
  style,
}) => {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  
  const handlePressIn = () => {
    if (!disabled) {
      scale.value = withSpring(0.95, { damping: 15 });
    }
  };
  
  const handlePressOut = () => {
    if (!disabled) {
      scale.value = withSpring(1, { damping: 15 });
    }
  };
  
  const handlePress = () => {
    if (!disabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };
  
  return (
    <Animated.View
      entering={FadeInUp.delay(400 + index * 50).springify()}
      style={[
        {
          flex: 1,
          ...style,
        }
      ]}
    >
      <Animated.View style={animatedStyle}>
        <TouchableOpacity
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: theme.borderRadius.lg,
            padding: theme.spacing.md,
            borderWidth: 1,
            borderColor: theme.colors.border,
            height: '100%',
          }}
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={1}
          disabled={disabled}
        >
          <Box>
            <Typography style={{ fontSize: 28, marginBottom: 8 }}>
              {emoji}
            </Typography>
            <Typography variant="subtitle" weight="semibold" numberOfLines={2} style={{ fontSize: 14 }}>
              {title}
            </Typography>
            <Typography variant="caption" color="secondary" numberOfLines={2}>
              {subtitle}
            </Typography>
          </Box>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
};
