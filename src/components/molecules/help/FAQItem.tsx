/**
 * FAQItem
 *
 * Accordion-style FAQ item with animated expand/collapse.
 */

import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  withTiming,
  useDerivedValue,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme';
import { Box } from '@/components/atoms';
import { Typography } from '../common/Typography';

interface FAQItemProps {
  question: string;
  answer: string;
  isExpanded: boolean;
  onToggle: () => void;
  testID?: string;
}

export const FAQItem: React.FC<FAQItemProps> = ({
  question,
  answer,
  isExpanded,
  onToggle,
  testID,
}) => {
  const { theme } = useTheme();

  const progress = useDerivedValue(() => {
    return withTiming(isExpanded ? 1 : 0, { duration: 200 });
  }, [isExpanded]);

  const chevronStyle = useAnimatedStyle(() => {
    const rotation = interpolate(
      progress.value,
      [0, 1],
      [0, 180],
      Extrapolate.CLAMP
    );
    return {
      transform: [{ rotate: `${rotation}deg` }],
    };
  });

  const contentStyle = useAnimatedStyle(() => {
    const height = interpolate(
      progress.value,
      [0, 1],
      [0, 1],
      Extrapolate.CLAMP
    );
    const opacity = interpolate(
      progress.value,
      [0, 0.5, 1],
      [0, 0, 1],
      Extrapolate.CLAMP
    );
    return {
      opacity,
      transform: [{ scaleY: height }],
    };
  });

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle();
  };

  return (
    <Box
      style={[
        styles.container,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
      testID={testID}
    >
      <TouchableOpacity
        onPress={handlePress}
        style={styles.header}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        accessibilityLabel={question}
      >
        <Typography
          variant="body"
          weight="medium"
          style={styles.question}
          numberOfLines={isExpanded ? undefined : 2}
        >
          {question}
        </Typography>
        <Animated.View style={chevronStyle}>
          <Ionicons
            name="chevron-down"
            size={20}
            color={theme.colors.text.secondary}
          />
        </Animated.View>
      </TouchableOpacity>

      {isExpanded && (
        <Animated.View style={[styles.answerContainer, contentStyle]}>
          <Box style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <Typography
            variant="body"
            color="secondary"
            style={styles.answer}
          >
            {answer}
          </Typography>
        </Animated.View>
      )}
    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    gap: 12,
  },
  question: {
    flex: 1,
  },
  answerContainer: {
    transformOrigin: 'top',
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
  },
  answer: {
    padding: 16,
    paddingTop: 12,
    lineHeight: 22,
  },
});
