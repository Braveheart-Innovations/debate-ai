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
  getParameterRange,
  getSupportedParams,
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
  /** Undefined clears the parameter (maxTokens back to the model's own limit). */
  onParameterChange: (param: keyof ModelParameters, value: number | string | string[] | undefined) => void;
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
  const visibleSelectedModel = selectedModel && models.some((model) => model.id === selectedModel)
    ? selectedModel
    : undefined;
  const effectiveModel = visibleSelectedModel || models.find((model) => model.isDefault)?.id;
  // Model-aware: params in the model's unsupportedParams don't render, and
  // ranges reflect provider/model constraints (e.g. locked temperature 1).
  const supportedParams = getSupportedParams(providerId, effectiveModel);
  
  const handleReset = () => {
    Object.keys(DEFAULT_PARAMETERS).forEach(param => {
      if (supportedParams.includes(param as keyof ModelParameters)) {
        const defaultValue = DEFAULT_PARAMETERS[param as keyof ModelParameters];
        if (defaultValue !== undefined && typeof defaultValue !== 'boolean') {
          onParameterChange(
            param as keyof ModelParameters,
            defaultValue
          );
        }
      }
    });
    if (parameters.maxTokens !== undefined) {
      onParameterChange('maxTokens', undefined);
    }
  };
  
  const renderParameter = (param: keyof ModelParameters) => {
    if (!(param in PARAMETER_RANGES) || !supportedParams.includes(param)) return null;
    const range = getParameterRange(providerId, param as keyof typeof PARAMETER_RANGES, effectiveModel);

    // Display-clamp stored out-of-range values (e.g. a saved temperature of
    // 1.8 before the Claude cap); the adapters clamp again at request time.
    // An unset maxTokens stays empty: the model's own limit.
    const stored = parameters[param] ?? DEFAULT_PARAMETERS[param];
    const value = param === 'maxTokens' && stored === undefined
      ? undefined
      : Math.max(range.min, Math.min(Number(stored ?? range.min), range.max));
    const helpTopicId = PARAM_HELP_TOPICS[param];

    return (
      <View key={param}>
        <ParameterSlider
          name={param}
          value={value}
          min={range.min}
          max={range.max}
          step={range.step}
          description={range.description}
          onChange={(newValue) => onParameterChange(param, newValue)}
          rightElement={
            helpTopicId ? <InfoButton topicId={helpTopicId} size="small" /> : undefined
          }
          {...(param === 'maxTokens'
            ? { emptyLabel: 'Model default', emptyStart: range.max, onClear: () => onParameterChange(param, undefined) }
            : {})}
        />
      </View>
    );
  };
  
  return (
    <View>
      {/* Default model selection is always available - it is not an expert
          feature and must not require the Expert Mode toggle. */}
      <View style={{ marginBottom: theme.spacing.md }}>
        <ModelSelector
          models={models}
          selectedModel={visibleSelectedModel || models.find(m => m.isDefault)?.id}
          onSelectModel={onModelChange}
          providerId={providerId}
        />
      </View>

      {/* Expert Mode Toggle Card - gates the parameter overrides below */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.card,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.md,
        marginBottom: isEnabled ? theme.spacing.md : 0,
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
            Fine-tune generation parameters
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
