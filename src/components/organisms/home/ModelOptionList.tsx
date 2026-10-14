/**
 * ModelOptionList
 *
 * Scrollable list of a provider's selectable models with pricing, context
 * and capability badges. Presentation shared by PagedSheet model pages;
 * selection semantics belong to the caller.
 */

import React, { useMemo } from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { Typography, Badge } from '@/components/molecules';
import { useTheme } from '@/theme';
import { getModelContextLabel, getProviderModels } from '@/config/modelConfigs';
import { MODEL_PRICING } from '@/config/modelPricing';

interface ModelOptionListProps {
  providerId: string;
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  showPricing?: boolean;
  testID?: string;
}

export const getModelTokenPricing = (providerId: string, modelId: string): string | null => {
  const pricing = MODEL_PRICING[providerId]?.[modelId];
  if (!pricing) return null;
  return `$${pricing.inputPer1M}/$${pricing.outputPer1M} per 1M`;
};

export const ModelOptionList: React.FC<ModelOptionListProps> = ({
  providerId,
  selectedModel,
  onSelectModel,
  showPricing = true,
  testID,
}) => {
  const { theme } = useTheme();

  const models = useMemo(() => {
    return (getProviderModels(providerId) || []).filter((model) => !model.isDeprecated);
  }, [providerId]);

  const effectiveSelectedModel = useMemo(() => {
    if (models.some((model) => model.id === selectedModel)) {
      return selectedModel;
    }
    return models.find((model) => model.isDefault)?.id || '';
  }, [models, selectedModel]);

  return (
    <ScrollView
      contentContainerStyle={{ padding: theme.spacing.lg }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      testID={testID}
    >
      {models.map((model) => {
        const isSelected = effectiveSelectedModel === model.id;
        const contextLabel = getModelContextLabel(model);
        const pricing = MODEL_PRICING[providerId]?.[model.id];

        return (
          <TouchableOpacity
            key={model.id}
            onPress={() => onSelectModel(model.id)}
            testID={testID ? `${testID}-option-${model.id}` : undefined}
            style={{
              backgroundColor: isSelected
                ? theme.colors.primary[100]
                : theme.colors.card,
              borderRadius: theme.borderRadius.md,
              padding: theme.spacing.md,
              marginBottom: theme.spacing.sm,
              borderWidth: isSelected ? 2 : 1,
              borderColor: isSelected
                ? theme.colors.primary[500]
                : theme.colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                  <Typography
                    variant="subtitle"
                    weight="semibold"
                    style={{
                      marginRight: theme.spacing.xs,
                      color: isSelected ? '#000000' : theme.colors.text.primary
                    }}
                  >
                    {model.name}
                  </Typography>
                  {model.isDefault && (
                    <Badge label="Default" type="default" />
                  )}
                  {model.supportsWebSearch && (
                    <Badge label="Live Search" type="new" />
                  )}
                </View>

                <Typography
                  variant="caption"
                  style={{
                    marginBottom: 4,
                    color: isSelected ? 'rgba(0,0,0,0.7)' : theme.colors.text.secondary
                  }}
                >
                  {model.description}
                </Typography>

                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                  {contextLabel && (
                    <Typography
                      variant="caption"
                      style={{
                        marginRight: theme.spacing.md,
                        color: isSelected ? 'rgba(0,0,0,0.6)' : theme.colors.text.secondary
                      }}
                    >
                      {contextLabel}
                    </Typography>
                  )}

                  {showPricing && pricing && (
                    <Typography
                      variant="caption"
                      style={{
                        color: isSelected ? 'rgba(0,0,0,0.6)' : theme.colors.text.secondary
                      }}
                    >
                      {getModelTokenPricing(providerId, model.id)}
                    </Typography>
                  )}
                </View>
              </View>

              {isSelected && (
                <View style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: '#000000',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}>
                  <Typography style={{ color: '#FFFFFF', fontSize: 16 }}>✓</Typography>
                </View>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

export default ModelOptionList;
