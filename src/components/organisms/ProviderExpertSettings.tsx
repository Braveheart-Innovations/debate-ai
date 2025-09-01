import React from 'react';
import { View, Switch } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Button, Typography, Badge } from '../molecules';
import { ModelSelector } from './ModelSelector';
import { ParameterSlider } from './ParameterSlider';
import { useTheme } from '../../theme';
import { 
  getProviderModels,
  ModelParameters,
  DEFAULT_PARAMETERS,
  PARAMETER_RANGES,
  PROVIDER_SUPPORTED_PARAMS 
} from '../../config/modelConfigs';

interface ProviderExpertSettingsProps {
  providerId: string;
  isEnabled: boolean;
  isPremium: boolean;
  onToggle: (enabled: boolean) => void;
  selectedModel?: string;
  onModelChange: (modelId: string) => void;
  parameters: ModelParameters;
  onParameterChange: (param: keyof ModelParameters, value: number | string | string[]) => void;
}

export const ProviderExpertSettings: React.FC<ProviderExpertSettingsProps> = ({
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
    
    return (
      <ParameterSlider
        key={param}
        name={param}
        value={Number(value)}
        min={range.min}
        max={range.max}
        step={range.step}
        description={range.description}
        onChange={(newValue) => onParameterChange(param, newValue)}
      />
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
        borderWidth: isPremium ? 0 : 1,
        borderColor: theme.colors.warning[500],
      }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Typography variant="subtitle" weight="bold">
              Expert Mode
            </Typography>
            {!isPremium && (
              <Badge label="Premium" type="premium" />
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
      
      {/* Expert Settings Content */}
      {isEnabled && isPremium && (
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
