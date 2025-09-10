import React from 'react';
import { View, TouchableOpacity, ScrollView } from 'react-native';
import { Typography } from '@/components/molecules';
import { AIConfig } from '@/types';
import { useTheme } from '@/theme';
import * as Haptics from 'expo-haptics';

interface SelectionSummaryProps {
  selectedAIs: AIConfig[];
  maxAIs: number;
  onRemoveAI: (ai: AIConfig) => void;
}

const SelectedAIChip: React.FC<{
  ai: AIConfig;
  onRemove: (ai: AIConfig) => void;
}> = ({ ai, onRemove }) => {
  const { theme } = useTheme();
  
  const handleRemove = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onRemove(ai);
  };
  
  return (
    <TouchableOpacity
      onPress={handleRemove}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.primary[100],
        borderRadius: theme.borderRadius.full,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        marginRight: theme.spacing.xs,
      }}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`Remove ${ai.name}`}
      accessibilityHint="Double tap to deselect this AI"
    >
      <View style={{
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: ai.color,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: theme.spacing.xs,
      }}>
        <Typography style={{ fontSize: 12 }}>
          {ai.avatar}
        </Typography>
      </View>
      <Typography variant="caption" weight="semibold" color="primary">
        {ai.name}
      </Typography>
      <View style={{
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: theme.colors.primary[600],
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: theme.spacing.xs,
      }}>
        <Typography style={{ 
          fontSize: 10, 
          color: '#FFFFFF',
          fontWeight: 'bold',
        }}>
          ×
        </Typography>
      </View>
    </TouchableOpacity>
  );
};

export const SelectionSummary: React.FC<SelectionSummaryProps> = ({
  selectedAIs,
  maxAIs,
  onRemoveAI,
}) => {
  const { theme } = useTheme();
  
  if (selectedAIs.length === 0) return null;
  
  return (
    <View style={{
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
    }}>
      <Typography 
        variant="caption" 
        color="secondary" 
        weight="semibold"
        style={{ marginBottom: theme.spacing.xs }}
      >
        Selected ({selectedAIs.length}/{maxAIs})
      </Typography>
      
      <ScrollView 
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingRight: theme.spacing.sm,
        }}
      >
        {selectedAIs.map((ai) => (
          <SelectedAIChip
            key={ai.id}
            ai={ai}
            onRemove={onRemoveAI}
          />
        ))}
      </ScrollView>
    </View>
  );
};
