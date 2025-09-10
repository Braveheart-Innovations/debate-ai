/**
 * DebateTopicSelector Organism
 * Handles topic selection including preset topics, custom input, and surprise mode
 */

import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
import { useTheme } from '../../../theme';
import { Typography } from '../../molecules';
import { GradientButton } from '../../molecules/GradientButton';
import { Button } from '../../molecules/Button';
import { Card } from '../../molecules/Card';
import { RichTopicInput } from './RichTopicInput';
// import { DEBATE_TOPICS } from '../../../constants/debateTopics';
import { PresetTopicsModal } from './PresetTopicsModal';
import { TopicService } from '../../../services/debate/TopicService';

interface DebateTopicSelectorProps {
  selectedTopic: string;
  customTopic: string;
  topicMode: 'preset' | 'custom' | 'surprise';
  onTopicSelect: (topic: string) => void;
  onCustomTopicChange: (topic: string) => void;
  onTopicModeChange: (mode: 'preset' | 'custom' | 'surprise') => void;
  onSurpriseMe: () => void;
  showHeading?: boolean; // optional UI heading above controls
  compact?: boolean; // tighter spacing for card usage
}

export const DebateTopicSelector: React.FC<DebateTopicSelectorProps> = ({
  selectedTopic,
  customTopic,
  topicMode,
  onTopicSelect,
  onCustomTopicChange,
  onTopicModeChange,
  onSurpriseMe,
  showHeading = true,
  compact = false,
}) => {
  const { theme, isDark } = useTheme();
  const [presetVisible, setPresetVisible] = useState(false);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  const motionSuggestion = useMemo(() => {
    if (topicMode !== 'custom') return null;
    const t = (customTopic || '').trim();
    if (!t) return null;
    if (!t.endsWith('?')) return null;
    const normalized = TopicService.normalizeMotion(t);
    if (normalized && normalized !== t && !suggestionDismissed) {
      return normalized;
    }
    return null;
  }, [customTopic, topicMode, suggestionDismissed]);


  return (
    <Animated.View entering={FadeIn}>
      {showHeading && (
        <View style={{ marginBottom: compact ? theme.spacing.md : theme.spacing.lg }}>
          <Typography 
            variant="subtitle" 
            weight="semibold" 
            align="center"
            style={{ 
              color: theme.colors.text.primary,
              marginBottom: compact ? theme.spacing.xs : theme.spacing.sm,
            }}
          >
            💭 What should the AIs debate?
          </Typography>
        </View>
      )}
      
      {/* Topic action buttons: Preset | Custom | Surprise */}
      <View style={{ marginBottom: compact ? theme.spacing.lg : theme.spacing.xl }}>
        <View style={{ flexDirection: 'row', marginBottom: theme.spacing.sm, gap: theme.spacing.sm }}>
          <Button
            title="Preset Topics"
            onPress={() => setPresetVisible(true)}
            variant="tonal"
            size="medium"
            style={{ flex: 1 }}
          />
          <Button
            title="Custom Topic"
            onPress={() => { onTopicModeChange('custom'); onTopicSelect(''); }}
            variant={topicMode === 'custom' ? 'primary' : 'tonal'}
            size="medium"
            style={{ flex: 1 }}
          />
        </View>

        {/* Surprise Me integrated as consistent button */}
        <GradientButton
          title="🎲 Surprise Me!"
          onPress={onSurpriseMe}
          gradient={theme.colors.gradients.ocean}
          fullWidth
        />
      </View>
      
      {/* Content Area - Changes based on selection */}
      <Animated.View layout={Layout.duration(300)} style={{ minHeight: compact ? 120 : 200 }}>
        {/* Preset topics now live in a modal; inline list removed */}

        {/* Unified selected topic display (for preset or surprise) */}
        {selectedTopic && topicMode !== 'custom' && (
          <Animated.View 
            entering={FadeIn.duration(300)}
            exiting={FadeOut.duration(200)}
            style={{ marginBottom: compact ? theme.spacing.lg : theme.spacing.xl }}
          >
            <Card shadow padding="large" margin="none" style={{
              backgroundColor: isDark ? theme.colors.overlays.medium : theme.colors.primary[50],
              borderColor: isDark ? theme.colors.primary[400] : theme.colors.primary[200],
              borderWidth: 1,
              borderRadius: theme.borderRadius.lg,
              position: 'relative',
              overflow: 'hidden',
            }}>
              <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: theme.colors.primary[400] }} />
              <Typography variant="caption" color="secondary" style={{ marginBottom: 6 }}>
                Selected Topic
              </Typography>
              <Typography variant="body" weight="semibold" style={{ color: theme.colors.text.primary }}>
                {selectedTopic}
              </Typography>
            </Card>
          </Animated.View>
        )}

        {/* Custom Topic Input - Fades in when selected */}
        {topicMode === 'custom' && (
          <Animated.View 
            entering={FadeIn.duration(300)}
            exiting={FadeOut.duration(200)}
            style={{ marginBottom: compact ? theme.spacing.lg : theme.spacing.xl }}
          >
            <RichTopicInput
              value={customTopic}
              onChange={onCustomTopicChange}
              maxLength={200}
              placeholder="Enter your custom debate topic..."
            />

            {/* Motion suggestion for question-style custom topics */}
            {motionSuggestion && (
              <Card shadow padding="large" margin="none" style={{
                marginTop: theme.spacing.md,
                backgroundColor: isDark ? theme.colors.overlays.medium : theme.colors.warning[50],
                borderColor: isDark ? theme.colors.warning[400] : theme.colors.warning[300],
                borderWidth: 1,
                borderRadius: theme.borderRadius.lg,
              }}>
                <Typography variant="subtitle" weight="semibold" style={{ marginBottom: 6 }}>
                  Consider using a motion
                </Typography>
                <Typography variant="body" color="secondary" style={{ marginBottom: theme.spacing.sm }}>
                  Debates work best with a clear motion (a statement to argue for/against). Your topic looks like a question. We can rephrase it:
                </Typography>
                <Typography variant="body" weight="semibold" style={{ marginBottom: theme.spacing.md }}>
                  {motionSuggestion}
                </Typography>
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                  <Button
                    title="Use Suggested"
                    variant="primary"
                    size="small"
                    onPress={() => {
                      onCustomTopicChange(motionSuggestion);
                      setSuggestionDismissed(true);
                    }}
                  />
                  <Button
                    title="Edit"
                    variant="secondary"
                    size="small"
                    onPress={() => setSuggestionDismissed(true)}
                  />
                  <Button
                    title="Use As-Is"
                    variant="tonal"
                    size="small"
                    onPress={() => setSuggestionDismissed(true)}
                  />
                </View>
              </Card>
            )}
          </Animated.View>
        )}
      </Animated.View>
      
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
