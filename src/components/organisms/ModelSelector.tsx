import React from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { Typography } from '../molecules';
import { ActualPricing } from './ActualPricing';
import { useTheme } from '../../theme';
import { ModelConfig } from '../../config/modelConfigs';
import { MODEL_PRICING, getFreeMessageInfo } from '../../config/modelPricing';

interface ModelSelectorProps {
  models: ModelConfig[];
  selectedModel?: string;
  onSelectModel: (modelId: string) => void; // Pass empty string ('') to clear selection
  providerId: string;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  models,
  selectedModel,
  onSelectModel,
  providerId,
}) => {
  const { theme } = useTheme();
  
  return (
    <View>
      <Typography variant="subtitle" weight="semibold" style={{ marginBottom: theme.spacing.sm }}>
        Default Model Selection (optional)
      </Typography>
      
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: theme.spacing.md }}
      >
        {models.map((model) => {
          const isSelected = selectedModel === model.id;
          
          return (
            <TouchableOpacity
              key={model.id}
              onPress={() => onSelectModel(isSelected ? '' : model.id)}
              style={{
                backgroundColor: isSelected 
                  ? theme.colors.primary[500] 
                  : theme.colors.surface,
                borderRadius: theme.borderRadius.md,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
                marginRight: theme.spacing.sm,
                borderWidth: 1,
                borderColor: isSelected
                  ? theme.colors.primary[500]
                  : theme.colors.border,
                minWidth: 120,
              }}
            >
              <View style={{ alignItems: 'center' }}>
                <Typography 
                  variant="caption" 
                  weight="semibold"
                  style={{ 
                    color: isSelected 
                      ? '#FFFFFF' 
                      : theme.colors.text.primary,
                    marginBottom: 4,
                  }}
                >
                  {model.name}
                </Typography>
                {/* No default badge in Expert Mode selector */}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      
      {selectedModel && (
        <View style={{ marginTop: theme.spacing.sm }}>
          <Typography 
            variant="caption" 
            color="secondary"
          >
            {models.find(m => m.id === selectedModel)?.description}
          </Typography>
          <View style={{ marginTop: theme.spacing.xs }}>
            {(() => {
              const pricing = MODEL_PRICING[providerId]?.[selectedModel];
              const freeInfo = getFreeMessageInfo(providerId, selectedModel);
              
              if (pricing || freeInfo) {
                return (
                  <ActualPricing
                    inputPricePerM={pricing?.inputPer1M}
                    outputPricePerM={pricing?.outputPer1M}
                    freeInfo={freeInfo}
                    compact={false}
                  />
                );
              }
              return null;
            })()}
          </View>
        </View>
      )}

      {/* No upsell — all models selectable; demo mode handled elsewhere */}
    </View>
  );
};
