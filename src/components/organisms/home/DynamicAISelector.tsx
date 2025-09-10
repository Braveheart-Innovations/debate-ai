import React from 'react';
import { View, Dimensions } from 'react-native';
import { Box } from '@/components/atoms';
import { GradientButton, SectionHeader } from '@/components/molecules';
import { AICard } from './AICard';
import { AIConfig } from '@/types';
import { useTheme } from '@/theme';
import * as Haptics from 'expo-haptics';

const { width: screenWidth } = Dimensions.get('window');

interface DynamicAISelectorProps {
  configuredAIs: AIConfig[];
  selectedAIs: AIConfig[];
  maxAIs: number;
  onToggleAI: (ai: AIConfig) => void;
  onStartChat?: () => void;  // Made optional
  onAddAI: () => void;
  isPremium: boolean;
  customSubtitle?: string;
  hideStartButton?: boolean;  // New prop to hide the start button
  hideHeader?: boolean;  // New prop to hide the section header
  columnCount?: number;  // New prop to override column count
  containerWidth?: number;  // New prop to override container width calculation
  aiPersonalities?: { [aiId: string]: string };
  selectedModels?: { [aiId: string]: string };
  onPersonalityChange?: (aiId: string, personalityId: string) => void;
  onModelChange?: (aiId: string, modelId: string) => void;
}

export const DynamicAISelector: React.FC<DynamicAISelectorProps> = ({
  configuredAIs,
  selectedAIs,
  maxAIs,
  onToggleAI,
  onStartChat,
  onAddAI,
  isPremium,
  customSubtitle,
  hideStartButton = false,
  hideHeader = false,
  columnCount,
  containerWidth,
  aiPersonalities = {},
  selectedModels = {},
  onPersonalityChange,
  onModelChange,
}) => {
  const { theme } = useTheme();
  
  const getSubtitle = () => {
    if (customSubtitle) {
      return customSubtitle;
    }
    if (configuredAIs.length === 0) {
      return 'No AIs configured yet';
    } else if (configuredAIs.length === 1) {
      return '1 AI ready';
    } else if (isPremium) {
      return `${configuredAIs.length} AIs ready`;
    } else {
      return `${configuredAIs.length} configured • Select up to ${maxAIs}`;
    }
  };
  
  const handleAddAI = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAddAI();
  };
  
  // Use provided column count or default to 2 columns for clean, consistent layout
  const getGridLayout = () => {
    return columnCount || 2; // Default to 2 columns for optimal spacing and readability
  };
  
  const columns = getGridLayout();
  const baseWidth = containerWidth || screenWidth;
  const containerPadding = containerWidth ? 0 : theme.spacing.lg * 2; // No padding if containerWidth provided
  const itemGap = theme.spacing.md; // Improved visual separation (12px)
  const cardWidth = (baseWidth - containerPadding - (itemGap * (columns - 1))) / columns;
  
  return (
    <Box>
      {!hideHeader && (
        <SectionHeader
          title="Choose Your AIs"
          subtitle={getSubtitle()}
          icon="🤖"
          onAction={handleAddAI}
          actionLabel="+ Add AI"
        />
      )}
      
      {/* AI Grid Layout - Only AI cards, no Add button */}
      <View style={{ marginBottom: theme.spacing.lg, overflow: 'visible', zIndex: 1 }}>
        {/* Create rows dynamically */}
        {Array.from({ length: Math.ceil(configuredAIs.length / columns) }, (_, rowIndex) => (
          <View
            key={rowIndex}
            style={{
              flexDirection: 'row',
              justifyContent: 'flex-start',
              marginBottom: theme.spacing.md, // Increased spacing to prevent dropdown overlap
              overflow: 'visible',
              zIndex: 999 - rowIndex,
            }}
          >
            {Array.from({ length: columns }, (_, colIndex) => {
              const itemIndex = rowIndex * columns + colIndex;
              
              // AI cards only
              if (itemIndex < configuredAIs.length) {
                const ai = configuredAIs[itemIndex];
                const isSelected = selectedAIs.some(s => s.id === ai.id);
                const isDisabled = !isSelected && selectedAIs.length >= maxAIs;
                
                return (
                  <View key={ai.id} style={{ 
                    width: cardWidth, 
                    marginRight: colIndex < columns - 1 ? itemGap : 0, 
                    overflow: 'visible', 
                    zIndex: 1,
                  }}>
                    <AICard
                      ai={{
                        ...ai,
                        model: selectedModels[ai.id] || ai.model,
                      }}
                      isSelected={isSelected}
                      isDisabled={isDisabled}
                      onPress={onToggleAI}
                      index={itemIndex}
                      style={{ width: '100%' }}
                      personalityId={aiPersonalities[ai.id] || 'default'}
                      onPersonalityChange={isSelected && onPersonalityChange ? (personalityId) => onPersonalityChange(ai.id, personalityId) : undefined}
                      onModelChange={isSelected && onModelChange ? (modelId) => onModelChange(ai.id, modelId) : undefined}
                      isPremium={isPremium}
                    />
                  </View>
                );
              }
              
              // Empty space
              return <View key={`empty-${itemIndex}`} style={{ width: cardWidth, marginRight: colIndex < columns - 1 ? itemGap : 0 }} />;
            })}
          </View>
        ))}
      </View>
      
      {!hideStartButton && (
        configuredAIs.length > 0 ? (
          <GradientButton
            title={selectedAIs.length === 0 
              ? "Select AIs to start" 
              : `Start Chat with ${selectedAIs.length} AI${selectedAIs.length > 1 ? 's' : ''}`
            }
            onPress={onStartChat || (() => {})}
            disabled={selectedAIs.length === 0}
            gradient={theme.colors.gradients.ocean}
            fullWidth
            hapticType="medium"
          />
        ) : (
          <GradientButton
            title="Configure Your First AI"
            onPress={onAddAI}
            gradient={theme.colors.gradients.primary}
            fullWidth
            hapticType="medium"
          />
        )
      )}
    </Box>
  );
};
