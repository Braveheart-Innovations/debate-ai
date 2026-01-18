import React, { useState, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Typography, InfoButton } from '@/components/molecules';
import { UNIVERSAL_PERSONALITIES } from '@/config/personalities';
import { PersonalityBadge } from './PersonalityBadge';
import * as Haptics from 'expo-haptics';
import { PersonalityModal } from '../debate/PersonalityModal';
import { usePersonality } from '@/hooks/usePersonality';

interface PersonalityPickerProps {
  currentPersonalityId: string;
  onSelectPersonality: (personalityId: string) => void;
  aiName: string;
}

export const PersonalityPicker: React.FC<PersonalityPickerProps> = ({
  currentPersonalityId,
  onSelectPersonality,
  aiName,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { isCustomized } = usePersonality();

  const currentPersonality = UNIVERSAL_PERSONALITIES.find(p => p.id === currentPersonalityId) || UNIVERSAL_PERSONALITIES[0];
  const isCurrentCustomized = useMemo(() => isCustomized(currentPersonalityId), [isCustomized, currentPersonalityId]);
  
  const handleSelect = (personalityId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelectPersonality(personalityId);
    setIsOpen(false);
  };
  
  const availablePersonalities = UNIVERSAL_PERSONALITIES;
  
  return (
    <View style={styles.container}>
      {/* Label with InfoButton */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <Typography variant="caption" color="secondary">
          Personality
        </Typography>
        <InfoButton topicId="personalities" size="small" />
      </View>

      <PersonalityBadge
        personalityName={currentPersonality.name}
        onPress={() => setIsOpen(true)}
        disabled={false}
        isCustomized={isCurrentCustomized}
      />

      <PersonalityModal
        visible={isOpen}
        onClose={() => setIsOpen(false)}
        onConfirm={handleSelect}
        selectedPersonalityId={currentPersonalityId}
        availablePersonalities={availablePersonalities}
        aiName={aiName}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 1,
  },
});
