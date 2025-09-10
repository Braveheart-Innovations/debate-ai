import React, { useState } from 'react';
import {
  View,
  Text,
  Switch,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { Button, Typography } from '@/components/molecules';
import { 
  AI_MODELS, 
  ModelParameters,
  DEFAULT_PARAMETERS,
  PARAMETER_RANGES,
  PROVIDER_SUPPORTED_PARAMS 
} from '@/config/modelConfigs';

interface ExpertModeSettingsProps {
  providerId: string;
  isEnabled: boolean;
  isPremium: boolean;
  onToggle: (enabled: boolean) => void;
  selectedModel?: string;
  onModelChange: (modelId: string) => void;
  parameters: ModelParameters;
  onParameterChange: (param: keyof ModelParameters, value: number | string | string[]) => void;
}

export const ExpertModeSettings: React.FC<ExpertModeSettingsProps> = ({
  providerId,
  isEnabled,
  isPremium,
  onToggle,
  selectedModel,
  onModelChange,
  parameters,
  onParameterChange,
}) => {
  const { theme } = useTheme();
  const [expandedParam, setExpandedParam] = useState<string | null>(null);
  
  const models = AI_MODELS[providerId] || [];
  const supportedParams = PROVIDER_SUPPORTED_PARAMS[providerId] || [];
  const currentModel = models.find(m => m.id === selectedModel) || models.find(m => m.isDefault);
  
  const renderParameterControl = (param: keyof ModelParameters) => {
    const range = PARAMETER_RANGES[param as keyof typeof PARAMETER_RANGES];
    if (!range || !supportedParams.includes(param)) return null;
    
    const value = parameters[param] ?? DEFAULT_PARAMETERS[param];
    const isExpanded = expandedParam === param;
    
    return (
      <Animated.View 
        key={param}
        entering={FadeInDown}
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: theme.borderRadius.md,
          padding: theme.spacing.md,
          marginBottom: theme.spacing.sm,
        }}
      >
        <TouchableOpacity
          onPress={() => setExpandedParam(isExpanded ? null : param)}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Typography variant="subtitle" weight="semibold">
                {param.charAt(0).toUpperCase() + param.slice(1).replace(/([A-Z])/g, ' $1')}
              </Typography>
              <Typography variant="caption" color="secondary">
                {value}
              </Typography>
            </View>
            <Text style={{ color: theme.colors.text.secondary }}>
              {isExpanded ? '▼' : '▶'}
            </Text>
          </View>
        </TouchableOpacity>
        
        {isExpanded && (
          <View style={{ marginTop: theme.spacing.md }}>
            <Typography variant="caption" color="secondary" style={{ marginBottom: theme.spacing.sm }}>
              {range.description}
            </Typography>
            
            {/* Value Input with Steppers */}
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <TouchableOpacity
                onPress={() => {
                  const newValue = Math.max(range.min, Number(value) - range.step);
                  onParameterChange(param, newValue);
                }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: theme.colors.primary[100],
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: theme.colors.primary[600], fontSize: 20, fontWeight: 'bold' }}>
                  −
                </Text>
              </TouchableOpacity>
              
              <TextInput
                style={{
                  flex: 1,
                  marginHorizontal: theme.spacing.md,
                  backgroundColor: theme.colors.background,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: theme.borderRadius.sm,
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.sm,
                  textAlign: 'center',
                  color: theme.colors.text.primary,
                  fontSize: 16,
                  fontWeight: '600',
                }}
                value={String(value)}
                onChangeText={(text) => {
                  const num = parseFloat(text);
                  if (!isNaN(num) && num >= range.min && num <= range.max) {
                    onParameterChange(param, num);
                  }
                }}
                keyboardType="numeric"
              />
              
              <TouchableOpacity
                onPress={() => {
                  const newValue = Math.min(range.max, Number(value) + range.step);
                  onParameterChange(param, newValue);
                }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: theme.colors.primary[100],
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: theme.colors.primary[600], fontSize: 20, fontWeight: 'bold' }}>
                  +
                </Text>
              </TouchableOpacity>
            </View>
            
            <View style={{ 
              flexDirection: 'row', 
              justifyContent: 'space-between',
              marginTop: theme.spacing.xs,
            }}>
              <Typography variant="caption" color="secondary">
                Min: {range.min}
              </Typography>
              <Typography variant="caption" color="secondary">
                Max: {range.max}
              </Typography>
            </View>
          </View>
        )}
      </Animated.View>
    );
  };
  
  return (
    <View>
      {/* Expert Mode Toggle */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.card,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.lg,
        marginBottom: theme.spacing.md,
        borderWidth: isPremium ? 0 : 1,
        borderColor: theme.colors.warning[500],
      }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Typography variant="subtitle" weight="bold">
              Expert Mode
            </Typography>
            {!isPremium && (
              <View style={{
                backgroundColor: theme.colors.warning[500],
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 12,
                marginLeft: 8,
              }}>
                <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: 'bold' }}>
                  PREMIUM
                </Text>
              </View>
            )}
          </View>
          <Typography variant="caption" color="secondary" style={{ marginTop: 4 }}>
            {isPremium 
              ? 'Fine-tune model behavior and parameters'
              : 'Upgrade to unlock advanced controls'}
          </Typography>
        </View>
        <Switch
          value={isEnabled && isPremium}
          onValueChange={isPremium ? onToggle : undefined}
          disabled={!isPremium}
          trackColor={{ 
            false: theme.colors.gray[300], 
            true: theme.colors.primary[500] 
          }}
        />
      </View>
      
      {/* Expert Settings */}
      {isEnabled && isPremium && (
        <Animated.View entering={FadeInDown.springify()}>
          {/* Model Selection */}
          <View style={{ marginBottom: theme.spacing.lg }}>
            <Typography variant="subtitle" weight="semibold" style={{ marginBottom: theme.spacing.sm }}>
              Model Selection
            </Typography>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {models.map((model) => (
                <TouchableOpacity
                  key={model.id}
                  onPress={() => onModelChange(model.id)}
                  style={{
                    backgroundColor: selectedModel === model.id 
                      ? theme.colors.primary[500] 
                      : theme.colors.surface,
                    borderRadius: theme.borderRadius.md,
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: theme.spacing.sm,
                    marginRight: theme.spacing.sm,
                    borderWidth: 1,
                    borderColor: selectedModel === model.id
                      ? theme.colors.primary[500]
                      : theme.colors.border,
                  }}
                >
                  <Typography 
                    variant="caption" 
                    weight="semibold"
                    style={{ 
                      color: selectedModel === model.id 
                        ? '#FFFFFF' 
                        : theme.colors.text.primary 
                    }}
                  >
                    {model.name}
                  </Typography>
                  {model.isPremium && (
                    <Typography 
                      variant="caption"
                      style={{ 
                        color: selectedModel === model.id 
                          ? '#FFFFFF' 
                          : theme.colors.warning[500],
                        fontSize: 10,
                      }}
                    >
                      Premium
                    </Typography>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            {currentModel && (
              <Typography variant="caption" color="secondary" style={{ marginTop: theme.spacing.sm }}>
                {currentModel.description}
              </Typography>
            )}
          </View>
          
          {/* Parameters */}
          <View>
            <Typography variant="subtitle" weight="semibold" style={{ marginBottom: theme.spacing.sm }}>
              Parameters
            </Typography>
            {supportedParams.map(param => renderParameterControl(param))}
          </View>
          
          {/* Reset Button */}
          <Button
            title="Reset to Defaults"
            variant="secondary"
            onPress={() => {
              Object.keys(DEFAULT_PARAMETERS).forEach(param => {
                if (supportedParams.includes(param as keyof ModelParameters)) {
                  const defaultValue = DEFAULT_PARAMETERS[param as keyof ModelParameters];
                  if (defaultValue !== undefined) {
                    onParameterChange(
                      param as keyof ModelParameters, 
                      defaultValue
                    );
                  }
                }
              });
            }}
            style={{ marginTop: theme.spacing.md }}
          />
        </Animated.View>
      )}
    </View>
  );
};
