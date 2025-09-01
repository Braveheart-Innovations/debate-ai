/**
 * DebatePersonalitySelector Organism
 * Handles personality selection for each AI in the debate (Premium feature)
 */

import React, { useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '../../../theme';
import { Typography, GradientButton, Button, SectionHeader } from '../../molecules';
import { AIAvatar } from '../AIAvatar';
import { AIConfig } from '../../../types';
import { UNIVERSAL_PERSONALITIES } from '../../../config/personalities';
// PersonalityService removed from this view to simplify UI
import { } from 'react-native';
import PersonalityModal from './PersonalityModal';

interface DebatePersonalitySelectorProps {
  selectedTopic: string;
  customTopic: string;
  topicMode: 'preset' | 'custom' | 'surprise';
  selectedAIs: AIConfig[];
  aiPersonalities: Record<string, string>;
  onPersonalityChange: (aiId: string, personalityId: string) => void;
  onStartDebate: () => void;
  onBack: () => void;
}

export const DebatePersonalitySelector: React.FC<DebatePersonalitySelectorProps> = ({
  selectedTopic,
  customTopic,
  topicMode,
  selectedAIs,
  aiPersonalities,
  onPersonalityChange,
  onStartDebate,
  onBack,
}) => {
  const { theme } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);
  const [activeAI, setActiveAI] = useState<AIConfig | null>(null);

  const displayTopic = topicMode === 'custom' ? customTopic : selectedTopic;

  return (
    <Animated.View entering={FadeIn}>
      {/* Back Button */}
      <TouchableOpacity 
        onPress={onBack}
        style={{ 
          flexDirection: 'row', 
          alignItems: 'center',
          marginBottom: theme.spacing.md,
        }}
      >
        <Typography variant="body" style={{ marginRight: 8 }}>←</Typography>
        <Typography variant="body" color="secondary">Back to AI Selection</Typography>
      </TouchableOpacity>
      
      <SectionHeader
        title="Step 3: Set the Tone"
        subtitle="Choose personality styles for the debate"
        icon="🎭"
      />
      
      {/* Removed top suggested pairings to focus on clear personality info */}
      
      {/* Topic & AIs Summary */}
      <View style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}>
        <Typography variant="caption" color="secondary" style={{ marginBottom: 8 }}>
          Debate Preview:
        </Typography>
        <Typography variant="body" weight="semibold" style={{ marginBottom: 4 }}>
          "{displayTopic}"
        </Typography>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          {selectedAIs.map((ai) => (
            <View 
              key={ai.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: theme.colors.primary[50],
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
              }}
            >
              <Typography variant="caption" weight="semibold">{ai.name}</Typography>
            </View>
          ))}
        </View>
      </View>
      
      {/* Personality Selection for Each AI (launch modal) */}
      <View style={{ gap: theme.spacing.md }}>
        {selectedAIs.map((ai) => {
          const currentPersonality = aiPersonalities[ai.id] || 'default';
          return (
            <View 
              key={ai.id}
              style={{
                backgroundColor: theme.colors.card,
                borderRadius: theme.borderRadius.lg,
                padding: theme.spacing.md,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.md }}>
                <View style={{ marginRight: theme.spacing.md }}>
                  <AIAvatar
                    icon={ai.icon || ai.name.charAt(0)}
                    iconType={ai.iconType || 'letter'}
                    size="large"
                    color={ai.color}
                    isSelected={false}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Typography variant="body" weight="medium" style={{ marginBottom: 4 }}>
                    Personality Selection
                  </Typography>
                  <Typography variant="caption" color="secondary">
                    Selected: {UNIVERSAL_PERSONALITIES.find(p => p.id === currentPersonality)?.name || 'Default'}
                  </Typography>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setActiveAI(ai);
                  setModalVisible(true);
                }}
                style={{
                  alignSelf: 'flex-start',
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.sm,
                  borderRadius: theme.borderRadius.full,
                  backgroundColor: theme.colors.surface,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Typography variant="caption" weight="medium">
                  Choose Personality →
                </Typography>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      {/* Modal */}
      <PersonalityModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onConfirm={(personalityId) => {
          if (activeAI) {
            onPersonalityChange(activeAI.id, personalityId);
          }
          setModalVisible(false);
        }}
        selectedPersonalityId={activeAI ? aiPersonalities[activeAI.id] || 'default' : 'default'}
        availablePersonalities={UNIVERSAL_PERSONALITIES}
        isPremium={true}
        aiName={activeAI?.name}
      />
      
      {/* Start Debate Button */}
      <GradientButton
        title="Start Debate ⚔️"
        onPress={onStartDebate}
        gradient={theme.colors.gradients.sunset}
        fullWidth
        hapticType="medium"
        style={{ marginTop: theme.spacing.xl }}
      />
      
      {/* Secondary Back Button */}
      <Button
        title="← Back to AI Selection"
        onPress={onBack}
        variant="ghost"
        fullWidth
        style={{ marginTop: theme.spacing.md }}
      />
    </Animated.View>
  );
};
