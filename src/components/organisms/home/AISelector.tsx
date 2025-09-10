import React from 'react';
import { View, Dimensions } from 'react-native';
import { Box } from '@/components/atoms';
import { GradientButton, SectionHeader } from '@/components/molecules';
import { AICard } from './AICard';
import { AIConfig } from '@/types';
import { useTheme } from '@/theme';

const { width } = Dimensions.get('window');

interface AISelectorProps {
  availableAIs: AIConfig[];
  selectedAIs: AIConfig[];
  maxAIs: number;
  onToggleAI: (ai: AIConfig) => void;
  onStartChat: () => void;
  isPremium: boolean;
}

export const AISelector: React.FC<AISelectorProps> = ({
  availableAIs,
  selectedAIs,
  maxAIs,
  onToggleAI,
  onStartChat,
  isPremium,
}) => {
  const { theme } = useTheme();
  const cardWidth = (width - 48 - 20) / 3; // Account for padding and gaps
  
  return (
    <Box>
      <SectionHeader
        title="Select your AIs"
        subtitle={isPremium 
          ? 'All AIs unlocked and ready'
          : `Choose up to ${maxAIs} (upgrade for the full crew)`
        }
        icon="🤖"
      />
      
      <View style={{ 
        flexDirection: 'row', 
        justifyContent: 'space-between',
        marginBottom: theme.spacing.lg,
      }}>
        {availableAIs.map((ai, index) => {
          const isSelected = selectedAIs.some(s => s.id === ai.id);
          const isDisabled = !isSelected && selectedAIs.length >= maxAIs;
          
          return (
            <AICard
              key={ai.id}
              ai={ai}
              isSelected={isSelected}
              isDisabled={isDisabled}
              onPress={onToggleAI}
              index={index}
              style={{ width: cardWidth }}
            />
          );
        })}
      </View>
      
      <GradientButton
        title={selectedAIs.length === 0 
          ? "Select AIs to start" 
          : `Start Chat with ${selectedAIs.length} AI${selectedAIs.length > 1 ? 's' : ''}`
        }
        onPress={onStartChat}
        disabled={selectedAIs.length === 0}
        gradient={theme.colors.gradients.ocean}
        fullWidth
        hapticType="medium"
      />
    </Box>
  );
};
