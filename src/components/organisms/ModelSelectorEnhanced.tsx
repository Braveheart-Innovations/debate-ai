import React, { useMemo, useState } from 'react';
import { View, TouchableOpacity, ScrollView, Modal, Dimensions } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, showSheet } from '../../store';
import { Typography, Badge } from '../molecules';
import { useTheme } from '../../theme';
import { getProviderModels } from '../../config/modelConfigs';
import { MODEL_PRICING } from '../../config/modelPricing';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';

interface ModelSelectorEnhancedProps {
  providerId: string;
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  showPricing?: boolean;
  compactMode?: boolean;
  aiName?: string;
}

const { height: screenHeight } = Dimensions.get('window');

export const ModelSelectorEnhanced: React.FC<ModelSelectorEnhancedProps> = ({
  providerId,
  selectedModel,
  onSelectModel,
  showPricing = true,
  compactMode = false,
  aiName = '',
}) => {
  const { theme } = useTheme();
  const dispatch = useDispatch();
  const isPremium = useSelector((state: RootState) => state.auth.isPremium);
  
  const [isModalVisible, setIsModalVisible] = useState(false);
  
  const models = useMemo(() => {
    return getProviderModels(providerId) || [];
  }, [providerId]);
  
  const selectedModelInfo = useMemo(() => {
    return models.find(m => m.id === selectedModel);
  }, [models, selectedModel]);
  
  const canSelectModel = (model: typeof models[0]) => {
    return isPremium || !model.isPremium;
  };
  
  const handleModelSelect = (modelId: string) => {
    const model = models.find(m => m.id === modelId);
    if (model && canSelectModel(model)) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSelectModel(modelId);
      setIsModalVisible(false);
    }
  };
  
  // Get token pricing for display
  const getTokenPricing = (modelId: string) => {
    const pricing = MODEL_PRICING[providerId]?.[modelId];
    if (!pricing) return null;
    
    return `$${pricing.inputPer1M}/$${pricing.outputPer1M} per 1M`;
  };
  
  if (compactMode) {
    return (
      <>
        <View style={{ width: '100%' }}>
          {/* Label */}
          <Typography variant="caption" color="secondary" style={{ marginBottom: 4 }}>
            Model
          </Typography>
          
          {/* Compact model selector button */}
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsModalVisible(true);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: theme.spacing.sm,
              backgroundColor: theme.colors.surface,
              borderRadius: theme.borderRadius.sm,
              borderWidth: 1,
              borderColor: theme.colors.border,
              width: '100%',
              minHeight: 44,
            }}
          >
            <View style={{ flex: 1 }}>
              <Typography variant="body" weight="medium">
                {selectedModelInfo?.name || 'Select Model'}
              </Typography>
              {showPricing && MODEL_PRICING[providerId]?.[selectedModel] && (
                <Typography variant="caption" color="secondary" style={{ marginTop: 2 }}>
                  {getTokenPricing(selectedModel)}
                </Typography>
              )}
            </View>
            <Typography variant="body" color="secondary">
              ▶
            </Typography>
          </TouchableOpacity>
        </View>

        {/* Modal for model selection */}
        <Modal
          visible={isModalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setIsModalVisible(false)}
        >
          <View style={{
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(0,0,0,0.5)',
          }}>
            <Animated.View 
              entering={FadeIn}
              style={{
                backgroundColor: theme.colors.background,
                borderTopLeftRadius: theme.borderRadius.xl,
                borderTopRightRadius: theme.borderRadius.xl,
                maxHeight: screenHeight * 0.7,
                paddingBottom: 40,
              }}
            >
              {/* Header */}
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: theme.spacing.lg,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
              }}>
                <View>
                  <Typography variant="heading" weight="bold">
                    Select Model
                  </Typography>
                  <Typography variant="caption" color="secondary">
                    {aiName} • {models.length} models available
                  </Typography>
                </View>
                <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                  <Typography variant="heading" color="secondary">✕</Typography>
                </TouchableOpacity>
              </View>
              
              {/* Model List */}
              <ScrollView 
                contentContainerStyle={{ padding: theme.spacing.lg }}
                showsVerticalScrollIndicator={false}
              >
                {models.map((model) => {
                  const isSelected = selectedModel === model.id;
                  const isLocked = !canSelectModel(model);
                  const pricing = MODEL_PRICING[providerId]?.[model.id];
                  
                  return (
                    <TouchableOpacity
                      key={model.id}
                      onPress={() => !isLocked && handleModelSelect(model.id)}
                      disabled={isLocked}
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
                        opacity: isLocked ? 0.5 : 1,
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
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
                            {model.isPremium && (
                              <Badge label="Premium" type="premium" />
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
                            <Typography 
                              variant="caption" 
                              style={{ 
                                marginRight: theme.spacing.md,
                                color: isSelected ? 'rgba(0,0,0,0.6)' : theme.colors.text.secondary
                              }}
                            >
                              {(model.contextLength / 1000).toFixed(0)}K context
                            </Typography>
                            
                            {showPricing && pricing && (
                              <Typography 
                                variant="caption"
                                style={{
                                  color: isSelected ? 'rgba(0,0,0,0.6)' : theme.colors.text.secondary
                                }}
                              >
                                {getTokenPricing(model.id)}
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

              {/* Upsell CTA for free users when premium models exist */}
              {!isPremium && models.some(m => m.isPremium) && (
                <View style={{ paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.md }}>
                  <Typography variant="caption" color="secondary" style={{ marginBottom: 8 }}>
                    Premium models offer better quality and features.
                  </Typography>
                  <TouchableOpacity
                    onPress={() => dispatch(showSheet({ sheet: 'settings' }))}
                    style={{
                      alignSelf: 'flex-start',
                      backgroundColor: theme.colors.primary[500],
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 8,
                    }}
                  >
                    <Typography variant="body" weight="semibold" style={{ color: '#fff' }}>
                      Upgrade to unlock
                    </Typography>
                  </TouchableOpacity>
                </View>
              )}
            </Animated.View>
          </View>
        </Modal>
      </>
    );
  }
  
  // Full mode (horizontal scroll)
  return (
    <View>
      <Typography variant="subtitle" weight="semibold" style={{ marginBottom: theme.spacing.sm }}>
        Model Selection
      </Typography>
      
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: theme.spacing.md }}
      >
        {models.map((model) => {
          const isSelected = selectedModel === model.id;
          const isLocked = !canSelectModel(model);
          const pricing = MODEL_PRICING[providerId]?.[model.id];
          
          return (
            <TouchableOpacity
              key={model.id}
              onPress={() => !isLocked && handleModelSelect(model.id)}
              disabled={isLocked}
              style={{
                backgroundColor: isSelected 
                  ? theme.colors.primary[500]
                  : theme.colors.surface,
                borderRadius: theme.borderRadius.md,
                padding: theme.spacing.md,
                marginRight: theme.spacing.sm,
                opacity: isLocked ? 0.5 : 1,
                minWidth: 140,
                borderWidth: 1,
                borderColor: isSelected
                  ? theme.colors.primary[500]
                  : theme.colors.border,
              }}
            >
              <Typography 
                variant="subtitle" 
                weight="semibold"
                style={{ 
                  color: isSelected ? '#FFFFFF' : theme.colors.text.primary,
                  marginBottom: 4,
                }}
              >
                {model.name}
              </Typography>
              
              {model.isPremium && (
                <Badge 
                  label="Premium" 
                  type="premium" 
                />
              )}
              
              {model.isDefault && !model.isPremium && (
                <Badge label="Default" type="default" />
              )}
              
              {showPricing && pricing && (
                <Typography 
                  variant="caption" 
                  style={{ 
                    color: isSelected ? '#FFFFFF' : theme.colors.text.secondary,
                    marginTop: 4,
                  }}
                >
                  {getTokenPricing(model.id)}
                </Typography>
              )}
              
              <Typography 
                variant="caption" 
                style={{ 
                  color: isSelected ? '#FFFFFF' : theme.colors.text.secondary 
                }}
              >
                {(model.contextLength / 1000).toFixed(0)}K context
              </Typography>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      
      {selectedModelInfo && (
        <View style={{ marginTop: theme.spacing.sm }}>
          <Typography variant="caption" color="secondary">
            {selectedModelInfo.description}
          </Typography>
        </View>
      )}
    </View>
  );
};
