/**
 * DebateTopicSelector Organism
 * Handles topic selection including preset topics, custom input, and surprise mode
 */

import React, { useState } from 'react';
import { View, TouchableOpacity, Alert } from 'react-native';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
import { useTheme } from '../../../theme';
import { Typography, GradientButton } from '../../molecules';
import { RichTopicInput } from './RichTopicInput';
// import { DEBATE_TOPICS } from '../../../constants/debateTopics';
import { PresetTopicsModal } from './PresetTopicsModal';

interface DebateTopicSelectorProps {
  selectedTopic: string;
  customTopic: string;
  topicMode: 'preset' | 'custom' | 'surprise';
  onTopicSelect: (topic: string) => void;
  onCustomTopicChange: (topic: string) => void;
  onTopicModeChange: (mode: 'preset' | 'custom' | 'surprise') => void;
  onNext: () => void;
  onSurpriseMe: () => void;
  showHeading?: boolean; // optional UI heading above controls
}

export const DebateTopicSelector: React.FC<DebateTopicSelectorProps> = ({
  selectedTopic,
  customTopic,
  topicMode,
  onTopicSelect,
  onCustomTopicChange,
  onTopicModeChange,
  onNext,
  onSurpriseMe,
  showHeading = true,
}) => {
  const { theme } = useTheme();
  const [presetVisible, setPresetVisible] = useState(false);

  const handleNext = () => {
    const finalTopic = topicMode === 'custom' ? customTopic : selectedTopic;
    if (!finalTopic) {
      Alert.alert('Select a Topic', 'Please choose or enter a debate topic first!');
      return;
    }
    onNext();
  };

  const isNextEnabled = Boolean(
    (topicMode === 'preset' && selectedTopic) ||
    (topicMode === 'custom' && customTopic) ||
    (topicMode === 'surprise' && selectedTopic)
  );

  return (
    <Animated.View entering={FadeIn}>
      {showHeading && (
        <View style={{ marginBottom: theme.spacing.lg }}>
          <Typography 
            variant="subtitle" 
            weight="semibold" 
            align="center"
            style={{ 
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.sm,
            }}
          >
            💭 What should the AIs debate?
          </Typography>
        </View>
      )}
      
      {/* Three Main Action Buttons */}
      <View style={{ marginBottom: theme.spacing.lg }}>
        <View style={{ 
          flexDirection: 'row', 
          marginBottom: theme.spacing.sm,
          gap: theme.spacing.sm,
        }}>
          <TouchableOpacity
            onPress={() => {
              setPresetVisible(true);
            }}
            style={{
              flex: 1,
              paddingVertical: theme.spacing.md,
              paddingHorizontal: theme.spacing.lg,
              borderRadius: theme.borderRadius.md,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Typography 
              variant="body" 
              weight="semibold" 
              align="center"
              style={{ color: theme.colors.text.primary }}
            >
              Preset Topics
            </Typography>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              onTopicModeChange('custom');
              onTopicSelect('');
            }}
            style={{
              flex: 1,
              paddingVertical: theme.spacing.md,
              paddingHorizontal: theme.spacing.lg,
              borderRadius: theme.borderRadius.md,
              backgroundColor: topicMode === 'custom' ? theme.colors.primary[500] : theme.colors.surface,
              borderWidth: 1,
              borderColor: topicMode === 'custom' ? theme.colors.primary[500] : theme.colors.border,
            }}
          >
            <Typography 
              variant="body" 
              weight="semibold" 
              align="center"
              style={{ color: topicMode === 'custom' ? '#fff' : theme.colors.text.primary }}
            >
              Custom Topic
            </Typography>
          </TouchableOpacity>
        </View>
        
        {/* Surprise Me Button - Always Visible */}
        <GradientButton
          title="🎲 Surprise Me!"
          onPress={onSurpriseMe}
          gradient={theme.colors.gradients.ocean}
          fullWidth
        />
      </View>
      
      {/* Content Area - Changes based on selection */}
      <Animated.View layout={Layout.duration(300)} style={{ minHeight: 200 }}>
        {/* Preset topics now live in a modal; inline list removed */}

        {/* Unified selected topic display (for preset or surprise) */}
        {selectedTopic && topicMode !== 'custom' && (
          <Animated.View 
            entering={FadeIn.duration(300)}
            exiting={FadeOut.duration(200)}
            style={{ marginBottom: theme.spacing.xl }}
          >
            <View style={{
              backgroundColor: theme.colors.surface,
              borderRadius: theme.borderRadius.lg,
              padding: theme.spacing.lg,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}>
              <Typography variant="caption" color="secondary" style={{ marginBottom: 8 }}>
                Selected Topic:
              </Typography>
              <Typography variant="body" weight="semibold">
                {selectedTopic}
              </Typography>
            </View>
          </Animated.View>
        )}

        {/* Custom Topic Input - Fades in when selected */}
        {topicMode === 'custom' && (
          <Animated.View 
            entering={FadeIn.duration(300)}
            exiting={FadeOut.duration(200)}
            style={{ marginBottom: theme.spacing.xl }}
          >
            <RichTopicInput
              value={customTopic}
              onChange={onCustomTopicChange}
              maxLength={200}
              placeholder="Enter your custom debate topic..."
            />
          </Animated.View>
        )}
      </Animated.View>
      
      {/* Next Button */}
      <GradientButton
        title="Next: Choose Debaters →"
        onPress={handleNext}
        disabled={!isNextEnabled}
        gradient={theme.colors.gradients.primary}
        fullWidth
      />

      {/* Preset Topics Modal */}
      <PresetTopicsModal
        visible={presetVisible}
        onClose={() => setPresetVisible(false)}
        onSelectTopic={(topic) => {
          onTopicModeChange('preset');
          onCustomTopicChange('');
          onTopicSelect(topic);
          setPresetVisible(false);
        }}
      />
    </Animated.View>
  );
};
