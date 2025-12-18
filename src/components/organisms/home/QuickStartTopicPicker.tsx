import React from 'react';
import { Modal, View, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Box } from '@/components/atoms';
import { Typography, GlassCard } from '@/components/molecules';
import { QuickStartTopic } from './QuickStartsSection';
import { useTheme } from '@/theme';

interface QuickStartTopicPickerProps {
  visible: boolean;
  topics: QuickStartTopic[];
  onSelectTopic: (topic: QuickStartTopic) => void;
  onClose: () => void;
}

export const QuickStartTopicPicker: React.FC<QuickStartTopicPickerProps> = ({
  visible,
  topics,
  onSelectTopic,
  onClose,
}) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const handleSelectTopic = (topic: QuickStartTopic) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelectTopic(topic);
  };

  const handleBackdropPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={true}
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={handleBackdropPress}>
        <Animated.View
          entering={FadeIn.duration(200)}
          style={styles.backdropOverlay}
        />
      </Pressable>

      <View style={styles.modalContainer} pointerEvents="box-none">
        <Animated.View
          entering={SlideInDown.springify().damping(20).stiffness(200)}
          style={[
            styles.content,
            {
              backgroundColor: theme.colors.background,
              paddingBottom: insets.bottom + theme.spacing.lg,
              borderTopLeftRadius: theme.borderRadius.xl,
              borderTopRightRadius: theme.borderRadius.xl,
            },
          ]}
        >
          {/* Handle bar */}
          <View style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
          </View>

          {/* Header */}
          <Box style={{ paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md }}>
            <Typography variant="title" weight="bold" align="center">
              Quick Start
            </Typography>
            <Typography
              variant="body"
              color="secondary"
              align="center"
              style={{ marginTop: theme.spacing.xs }}
            >
              Choose a conversation starter
            </Typography>
          </Box>

          {/* Topics Grid - 2 columns x 3 rows */}
          <View style={[styles.grid, { paddingHorizontal: theme.spacing.lg }]}>
            {topics.map((topic, index) => (
              <View
                key={topic.id}
                style={[
                  styles.gridItem,
                  { marginRight: index % 2 === 0 ? theme.spacing.sm : 0 },
                ]}
              >
                <TouchableOpacity
                  onPress={() => handleSelectTopic(topic)}
                  activeOpacity={0.7}
                >
                  <GlassCard
                    padding="md"
                    style={{
                      ...styles.topicCard,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <Typography style={styles.emoji}>{topic.emoji}</Typography>
                    <Typography
                      variant="body"
                      weight="semibold"
                      align="center"
                      numberOfLines={1}
                    >
                      {topic.title}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="secondary"
                      align="center"
                      numberOfLines={1}
                    >
                      {topic.subtitle}
                    </Typography>
                  </GlassCard>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  content: {
    paddingTop: 8,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItem: {
    width: '48%',
    marginBottom: 12,
  },
  topicCard: {
    alignItems: 'center',
    minHeight: 90,
    borderWidth: 1,
  },
  emoji: {
    fontSize: 28,
    marginBottom: 4,
  },
});
