import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Typography } from '../molecules';
import { UNIVERSAL_PERSONALITIES } from '../../config/personalities';
import { PersonalityBadge } from './PersonalityBadge';
import * as Haptics from 'expo-haptics';
import { PersonalityModal } from './debate/PersonalityModal';
import { useNavigation } from '@react-navigation/native';

interface PersonalityPickerProps {
  currentPersonalityId: string;
  onSelectPersonality: (personalityId: string) => void;
  isPremium: boolean;
  aiName: string;
}

export const PersonalityPicker: React.FC<PersonalityPickerProps> = ({
  currentPersonalityId,
  onSelectPersonality,
  isPremium,
  aiName,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const navigation = useNavigation();
  
  const currentPersonality = UNIVERSAL_PERSONALITIES.find(p => p.id === currentPersonalityId) || UNIVERSAL_PERSONALITIES[0];
  
  const handleSelect = (personalityId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelectPersonality(personalityId);
    setIsOpen(false);
  };
  
  const availablePersonalities = isPremium 
    ? UNIVERSAL_PERSONALITIES 
    : UNIVERSAL_PERSONALITIES.filter(p => p.id === 'default' || p.id === 'prof_sage');
  
  return (
    <View style={styles.container}>
      {/* Label */}
      <Typography variant="caption" color="secondary" style={{ marginBottom: 4 }}>
        Personality
      </Typography>

      <PersonalityBadge
        personalityName={currentPersonality.name}
        onPress={() => setIsOpen(true)}
        isPremium={isPremium}
        isLocked={false}
      />

      <PersonalityModal
        visible={isOpen}
        onClose={() => setIsOpen(false)}
        onConfirm={handleSelect}
        selectedPersonalityId={currentPersonalityId}
        availablePersonalities={availablePersonalities}
        isPremium={isPremium}
        aiName={aiName}
        onUpgrade={() => {
          setIsOpen(false);
          navigation.navigate('Subscription' as never);
        }}
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
