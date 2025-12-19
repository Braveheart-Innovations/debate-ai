import React from 'react';
import { View, Switch } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Button, Typography, InfoButton } from '@/components/molecules';
import { ModelSelector } from '@/components/organisms/home/ModelSelector';
import { ParameterSlider } from '@/components/organisms/api-config/ParameterSlider';
import { useTheme } from '@/theme';
import {
  getProviderModels,
  ModelParameters,
  DEFAULT_PARAMETERS,
  PARAMETER_RANGES,
  PROVIDER_SUPPORTED_PARAMS
} from '@/config/modelConfigs';
import { HelpTopicId } from '@/config/help/types';

// Map parameter names to help topic IDs
const PARAM_HELP_TOPICS: Partial<Record<keyof ModelParameters, HelpTopicId>> = {
  temperature: 'expert-temperature',
  maxTokens: 'expert-tokens',
  topP: 'expert-top-p',
};

interface ProviderExpertSettingsProps {
  providerId: string;
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  selectedModel?: string;
  onModelChange: (modelId: string) => void;
  parameters: ModelParameters;
  onParameterChange: (param: keyof ModelParameters, value: number | string | string[]) => void;
}

export const ProviderExpertSettings: React.FC<ProviderExpertSettingsProps> = ({
  providerId,
  isEnabled,
  onToggle,
  selectedModel,
  onModelChange,
  parameters,
  onParameterChange,
}) => {
  const { theme } = useTheme();
  const models = getProviderModels(providerId) || [];
  const supportedParams = PROVIDER_SUPPORTED_PARAMS[providerId] || [];
  
  const handleReset = () => {
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
  };
  
  const renderParameter = (param: keyof ModelParameters) => {
    const range = PARAMETER_RANGES[param as keyof typeof PARAMETER_RANGES];
    if (!range || !supportedParams.includes(param)) return null;

    const value = parameters[param] ?? DEFAULT_PARAMETERS[param];
    const helpTopicId = PARAM_HELP_TOPICS[param];

    return (
      <View key={param}>
        <ParameterSlider
          name={param}
          value={Number(value)}
          min={range.min}
          max={range.max}
          step={range.step}
          description={range.description}
          onChange={(newValue) => onParameterChange(param, newValue)}
          rightElement={
            helpTopicId ? <InfoButton topicId={helpTopicId} size="small" /> : undefined
          }
        />
      </View>
    );
  };
  
  return (
    <View>
      {/* Expert Mode Toggle Card */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.card,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.lg,
        marginBottom: theme.spacing.md,
        borderWidth: 0,
        borderColor: theme.colors.border,
      }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Typography variant="subtitle" weight="bold">
              Expert Mode
            </Typography>
            <InfoButton topicId="expert-mode" size="small" />
          </View>
          <Typography variant="caption" color="secondary" style={{ marginTop: 4 }}>
            Fine-tune model behavior and parameters
          </Typography>
        </View>
        <Switch
          value={isEnabled}
          onValueChange={onToggle}
          trackColor={{ 
            false: theme.colors.gray[300], 
            true: theme.colors.primary[500] 
          }}
        />
      </View>
      
      {/* Expert Settings Content */}
      {isEnabled && (
        <Animated.View entering={FadeInDown.springify()}>
          {/* Model Selection */}
          <View style={{ marginBottom: theme.spacing.xl }}>
            <ModelSelector
              models={models}
              selectedModel={selectedModel || models.find(m => m.isDefault)?.id}
              onSelectModel={onModelChange}
              providerId={providerId}
            />
          </View>
          
          {/* Parameters Section */}
          <View>
            <Typography 
              variant="subtitle" 
              weight="semibold" 
              style={{ marginBottom: theme.spacing.md }}
            >
              Parameters
            </Typography>
            
            {/* Render each supported parameter */}
            {supportedParams.map(param => renderParameter(param))}
          </View>
          
          {/* Reset Button */}
          <Button
            title="Reset to Defaults"
            variant="secondary"
            onPress={handleReset}
            style={{ marginTop: theme.spacing.lg }}
          />
        </Animated.View>
      )}
    </View>
  );
};
