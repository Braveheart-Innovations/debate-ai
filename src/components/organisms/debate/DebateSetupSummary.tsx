/**
 * DebateSetupSummary Organism
 * Displays a summary of the debate setup including topic, AIs, and personalities
 */

import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../../theme';
import { Typography } from '../../molecules';
import { AIConfig } from '../../../types';
import { UNIVERSAL_PERSONALITIES } from '../../../config/personalities';

interface DebateSetupSummaryProps {
  selectedTopic: string;
  customTopic: string;
  topicMode: 'preset' | 'custom' | 'surprise';
  selectedAIs: AIConfig[];
  aiPersonalities: Record<string, string>;
  compact?: boolean;
}

export const DebateSetupSummary: React.FC<DebateSetupSummaryProps> = ({
  selectedTopic,
  customTopic,
  topicMode,
  selectedAIs,
  aiPersonalities,
  compact = false,
}) => {
  const { theme } = useTheme();

  const displayTopic = topicMode === 'custom' ? customTopic : selectedTopic;

  if (compact) {
    return (
      <View style={{
        backgroundColor: theme.colors.primary[50],
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        borderWidth: 1,
        borderColor: theme.colors.primary[200],
      }}>
        <Typography variant="caption" color="secondary" style={{ marginBottom: 4 }}>
          Selected Motion:
        </Typography>
        <Typography variant="body" weight="semibold">
          {displayTopic}
        </Typography>
      </View>
    );
  }

  return (
    <View style={{
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
    }}>
      <Typography variant="caption" color="secondary" style={{ marginBottom: 8 }}>
        Debate Preview:
      </Typography>
      
      {/* Topic */}
      <Typography variant="body" weight="semibold" style={{ marginBottom: 12 }}>
        "{displayTopic}"
      </Typography>
      
      {/* AIs */}
      <View style={{ marginBottom: 12 }}>
        <Typography variant="caption" color="secondary" style={{ marginBottom: 6 }}>
          Debaters:
        </Typography>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {selectedAIs.map((ai) => {
            const personality = aiPersonalities[ai.id];
            const personalityName = personality ? 
              UNIVERSAL_PERSONALITIES.find(p => p.id === personality)?.name : 
              'Default';
            
            return (
              <View 
                key={ai.id}
                style={{
                  backgroundColor: theme.colors.primary[50],
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: theme.colors.primary[200],
                }}
              >
                <Typography variant="caption" weight="semibold">
                  {ai.name}
                </Typography>
                {personality && (
                  <Typography variant="caption" color="secondary" style={{ fontSize: 10 }}>
                    {personalityName}
                  </Typography>
                )}
              </View>
            );
          })}
        </View>
      </View>
      
      {/* Motion Mode Indicator */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Typography variant="caption" color="secondary">
          {topicMode === 'custom' && '✏️ Custom Motion'}
          {topicMode === 'preset' && '📋 Preset Motion'}
          {topicMode === 'surprise' && '🎲 Surprise Motion'}
        </Typography>
      </View>
    </View>
  );
};
