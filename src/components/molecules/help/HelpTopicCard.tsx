/**
 * HelpTopicCard
 *
 * Expandable card for displaying help topics in the how-to guides list.
 */

import React from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
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
import { HelpTopic } from '@/config/help/types';

interface HelpTopicCardProps {
  topic: HelpTopic;
  isExpanded: boolean;
  onPress: () => void;
  testID?: string;
}

export const HelpTopicCard: React.FC<HelpTopicCardProps> = ({
  topic,
  isExpanded,
  onPress,
  testID,
}) => {
  const { theme } = useTheme();

  const progress = useDerivedValue(() => {
    return withTiming(isExpanded ? 1 : 0, { duration: 250 });
  }, [isExpanded]);

  const chevronStyle = useAnimatedStyle(() => {
    const rotation = interpolate(
      progress.value,
      [0, 1],
      [0, 90],
      Extrapolate.CLAMP
    );
    return {
      transform: [{ rotate: `${rotation}deg` }],
    };
  });

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Box
      style={[
        styles.container,
        { backgroundColor: theme.colors.surface },
        isExpanded && styles.containerExpanded,
      ]}
      testID={testID}
    >
      <TouchableOpacity
        onPress={handlePress}
        style={styles.header}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        accessibilityLabel={topic.title}
      >
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: theme.colors.primary[100] },
          ]}
        >
          <Ionicons
            name={topic.icon as keyof typeof Ionicons.glyphMap}
            size={24}
            color={theme.colors.primary[600]}
          />
        </View>
        <View style={styles.headerText}>
          <Typography variant="body" weight="semibold">
            {topic.title}
          </Typography>
          <Typography
            variant="caption"
            color="secondary"
            numberOfLines={isExpanded ? undefined : 1}
          >
            {topic.shortDescription}
          </Typography>
        </View>
        <Animated.View style={chevronStyle}>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={theme.colors.text.secondary}
          />
        </Animated.View>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.expandedContent}>
          <Box style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <Typography
            variant="body"
            color="secondary"
            style={styles.content}
          >
            {topic.content}
          </Typography>
        </View>
      )}
    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  containerExpanded: {
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  expandedContent: {
    paddingBottom: 16,
  },
  divider: {
    height: 1,
    marginHorizontal: 12,
    marginBottom: 12,
  },
  content: {
    paddingHorizontal: 16,
    lineHeight: 22,
  },
});
