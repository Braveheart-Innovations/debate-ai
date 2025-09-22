import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Typography } from '@/components/molecules';
import { UNIVERSAL_PERSONALITIES } from '@/config/personalities';
import { PersonalityBadge } from './PersonalityBadge';
import * as Haptics from 'expo-haptics';
import { PersonalityModal } from '../debate/PersonalityModal';

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
  
  const currentPersonality = UNIVERSAL_PERSONALITIES.find(p => p.id === currentPersonalityId) || UNIVERSAL_PERSONALITIES[0];
  
  const handleSelect = (personalityId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelectPersonality(personalityId);
    setIsOpen(false);
  };
  
  const availablePersonalities = UNIVERSAL_PERSONALITIES;
  
  return (
    <View style={styles.container}>
      {/* Label */}
      <Typography variant="caption" color="secondary" style={{ marginBottom: 4 }}>
        Personality
      </Typography>

      <PersonalityBadge
        personalityName={currentPersonality.name}
        onPress={() => setIsOpen(true)}
        disabled={false}
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
