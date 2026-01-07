import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Box } from '@/components/atoms';
import { GradientButton, SectionHeader, InfoButton, Typography } from '@/components/molecules';
import { AICard } from './AICard';
import { AIConfig } from '@/types';
import { useTheme } from '@/theme';
import { useResponsive } from '@/hooks/useResponsive';
import * as Haptics from 'expo-haptics';

interface AICardBadge {
  text: string;
  color?: string;
}

interface DynamicAISelectorProps {
  configuredAIs: AIConfig[];
  selectedAIs: AIConfig[];
  maxAIs: number;
  onToggleAI: (ai: AIConfig) => void;
  onStartChat?: () => void;  // Made optional
  onAddAI: () => void;
  customSubtitle?: string;
  hideStartButton?: boolean;  // New prop to hide the start button
  hideHeader?: boolean;  // New prop to hide the section header
  hideAddAI?: boolean;  // Hide "+ Add AI" button (for demo mode)
  columnCount?: number;  // New prop to override column count
  containerWidth?: number;  // New prop to override container width calculation
  aiPersonalities?: { [aiId: string]: string };
  selectedModels?: { [aiId: string]: string };
  onPersonalityChange?: (aiId: string, personalityId: string) => void;
  onModelChange?: (aiId: string, modelId: string) => void;
  onQuickStart?: () => void;  // Handler for Quick Start icon tap
  /** Optional callback to get a badge for an AI (e.g., "img2img" for image refinement support) */
  getBadge?: (ai: AIConfig) => AICardBadge | undefined;
}

export const DynamicAISelector: React.FC<DynamicAISelectorProps> = ({
  configuredAIs,
  selectedAIs,
  maxAIs,
  onToggleAI,
  onStartChat,
  onAddAI,
  customSubtitle,
  hideStartButton = false,
  hideHeader = false,
  hideAddAI = false,
  columnCount,
  containerWidth,
  aiPersonalities = {},
  selectedModels = {},
  onPersonalityChange,
  onModelChange,
  onQuickStart,
  getBadge,
}) => {
  const { theme } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const { gridColumns, rs } = useResponsive();

  const getSubtitle = () => {
    if (customSubtitle) {
      return customSubtitle;
    }
    if (configuredAIs.length === 0) {
      return 'No AIs configured yet';
    }

    const countLabel = configuredAIs.length === 1
      ? '1 AI configured'
      : `${configuredAIs.length} AIs configured`;
    return `${countLabel} • Select up to ${maxAIs}`;
  };

  const handleAddAI = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAddAI();
  };

  // Use provided column count or responsive default: 2 on phone, 3 on tablet, 4 on tablet landscape
  const getGridLayout = () => {
    return columnCount || gridColumns(2, 3, 4);
  };

  const columns = getGridLayout();
  const baseWidth = containerWidth || screenWidth;
  const containerPadding = containerWidth ? 0 : rs('lg') * 2; // No padding if containerWidth provided
  const itemGap = rs('md'); // Responsive visual separation
  const cardWidth = (baseWidth - containerPadding - (itemGap * (columns - 1))) / columns;
  
  return (
    <Box>
      {!hideHeader && (
        <SectionHeader
          title="Choose Your AIs"
          subtitle={getSubtitle()}
          icon="🤖"
          onAction={hideAddAI ? undefined : handleAddAI}
          actionLabel={hideAddAI ? undefined : "+ Add AI"}
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
                      badge={getBadge?.(ai)}
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
      
      {/* Info row for Quick Start and Multi-AI explanations */}
      {!hideStartButton && selectedAIs.length > 0 && (
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: selectedAIs.length > 1 ? 'center' : 'flex-end',
          marginBottom: theme.spacing.sm,
          gap: theme.spacing.lg,
          paddingRight: selectedAIs.length === 1 && onQuickStart ? theme.spacing.md : 0,
        }}>
          {selectedAIs.length > 1 && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <InfoButton topicId="round-robin" size="small" />
                <Typography variant="caption" color="secondary">
                  Multi-AI
                </Typography>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <InfoButton topicId="ai-mentions" size="small" />
                <Typography variant="caption" color="secondary">
                  @Mentions
                </Typography>
              </View>
            </>
          )}
          {onQuickStart && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <InfoButton topicId="quick-start-wizard" size="small" />
              <Typography variant="caption" color="secondary">
                Quick Start
              </Typography>
            </View>
          )}
        </View>
      )}

      {!hideStartButton && (
        configuredAIs.length > 0 ? (
          <GradientButton
            title={selectedAIs.length === 0
              ? 'Select AIs to start'
              : `Start Chat with ${selectedAIs.length} AI${selectedAIs.length > 1 ? 's' : ''}`
            }
            onPress={onStartChat || (() => {})}
            disabled={selectedAIs.length === 0}
            gradient={theme.colors.gradients.ocean}
            fullWidth
            hapticType="medium"
            trailingIcon={onQuickStart ? 'bulb-outline' : undefined}
            onTrailingIconPress={onQuickStart}
            trailingIconDisabled={selectedAIs.length === 0}
          />
        ) : !hideAddAI ? (
          <GradientButton
            title="Configure Your First AI"
            onPress={onAddAI}
            gradient={theme.colors.gradients.primary}
            fullWidth
            hapticType="medium"
          />
        ) : null
      )}
    </Box>
  );
};
