import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { updateExpertMode } from '../store';
import { DEFAULT_PARAMETERS } from '../config/modelConfigs';
import type { AIProvider } from '../types';
import { getEnabledProviders as getEnabledProviderDefs } from '../config/aiProviders';

export interface ExpertModeConfig {
  enabled: boolean;
  selectedModel?: string;
  parameters?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
  };
}

export type ProviderType = AIProvider;

export interface UseExpertModeReturn {
  expertModeConfigs: Record<string, ExpertModeConfig | undefined>;
  getConfig: (provider: ProviderType) => ExpertModeConfig;
  isEnabled: (provider: ProviderType) => boolean;
  enableExpertMode: (provider: ProviderType) => void;
  disableExpertMode: (provider: ProviderType) => void;
  toggleExpertMode: (provider: ProviderType) => void;
  updateModel: (provider: ProviderType, modelId: string) => void;
  updateParameter: (provider: ProviderType, parameter: string, value: number) => void;
  updateParameters: (provider: ProviderType, parameters: Partial<ExpertModeConfig['parameters']>) => void;
  resetParameters: (provider: ProviderType) => void;
  resetAllSettings: (provider: ProviderType) => void;
  getParameterValue: (provider: ProviderType, parameter: string) => number | undefined;
  hasCustomParameters: (provider: ProviderType) => boolean;
  hasCustomModel: (provider: ProviderType) => boolean;
  getEnabledProviders: () => ProviderType[];
  getConfiguredProviders: () => ProviderType[];
}

export const useExpertMode = (): UseExpertModeReturn => {
  const dispatch = useDispatch();
  const expertModeConfigs = useSelector((state: RootState) => state.settings.expertMode || {}) as Record<string, ExpertModeConfig | undefined>;

  /**
   * Get configuration for a specific provider
   */
  const getConfig = useCallback((provider: ProviderType): ExpertModeConfig => {
    return expertModeConfigs[provider] || {
      enabled: false,
      parameters: DEFAULT_PARAMETERS
    };
  }, [expertModeConfigs]);

  /**
   * Check if expert mode is enabled for a provider
   */
  const isEnabled = useCallback((provider: ProviderType): boolean => {
    const config = getConfig(provider);
    return config.enabled === true;
  }, [getConfig]);

  /**
   * Enable expert mode for a provider
   */
  const enableExpertMode = useCallback((provider: ProviderType) => {
    const currentConfig = getConfig(provider);
    const updatedConfig: ExpertModeConfig = {
      ...currentConfig,
      enabled: true,
      parameters: currentConfig.parameters || DEFAULT_PARAMETERS
    };
    
    dispatch(updateExpertMode({
      provider,
      config: updatedConfig
    }));
  }, [dispatch, getConfig]);

  /**
   * Disable expert mode for a provider
   */
  const disableExpertMode = useCallback((provider: ProviderType) => {
    const currentConfig = getConfig(provider);
    const updatedConfig: ExpertModeConfig = {
      ...currentConfig,
      enabled: false
    };
    
    dispatch(updateExpertMode({
      provider,
      config: updatedConfig
    }));
  }, [dispatch, getConfig]);

  /**
   * Toggle expert mode for a provider
   */
  const toggleExpertMode = useCallback((provider: ProviderType) => {
    if (isEnabled(provider)) {
      disableExpertMode(provider);
    } else {
      enableExpertMode(provider);
    }
  }, [isEnabled, enableExpertMode, disableExpertMode]);

  /**
   * Update selected model for a provider
   */
  const updateModel = useCallback((provider: ProviderType, modelId: string) => {
    const currentConfig = getConfig(provider);
    const updatedConfig: ExpertModeConfig = {
      ...currentConfig,
      selectedModel: modelId && modelId.length > 0 ? modelId : undefined
    };
    
    dispatch(updateExpertMode({
      provider,
      config: updatedConfig
    }));
  }, [dispatch, getConfig]);

  /**
   * Update a specific parameter for a provider
   */
  const updateParameter = useCallback((provider: ProviderType, parameter: string, value: number) => {
    const currentConfig = getConfig(provider);
    const updatedConfig: ExpertModeConfig = {
      ...currentConfig,
      parameters: {
        ...DEFAULT_PARAMETERS,
        ...currentConfig.parameters,
        [parameter]: value
      }
    };
    
    dispatch(updateExpertMode({
      provider,
      config: updatedConfig
    }));
  }, [dispatch, getConfig]);

  /**
   * Update multiple parameters for a provider
   */
  const updateParameters = useCallback((
    provider: ProviderType, 
    parameters: Partial<ExpertModeConfig['parameters']>
  ) => {
    const currentConfig = getConfig(provider);
    const updatedConfig: ExpertModeConfig = {
      ...currentConfig,
      parameters: {
        ...DEFAULT_PARAMETERS,
        ...currentConfig.parameters,
        ...parameters
      }
    };
    
    dispatch(updateExpertMode({
      provider,
      config: updatedConfig
    }));
  }, [dispatch, getConfig]);

  /**
   * Reset parameters to defaults for a provider
   */
  const resetParameters = useCallback((provider: ProviderType) => {
    const currentConfig = getConfig(provider);
    const updatedConfig: ExpertModeConfig = {
      ...currentConfig,
      parameters: DEFAULT_PARAMETERS
    };
    
    dispatch(updateExpertMode({
      provider,
      config: updatedConfig
    }));
  }, [dispatch, getConfig]);

  /**
   * Reset all settings (model and parameters) for a provider
   */
  const resetAllSettings = useCallback((provider: ProviderType) => {
    const updatedConfig: ExpertModeConfig = {
      enabled: false,
      parameters: DEFAULT_PARAMETERS
    };
    
    dispatch(updateExpertMode({
      provider,
      config: updatedConfig
    }));
  }, [dispatch]);

  /**
   * Get a specific parameter value for a provider
   */
  const getParameterValue = useCallback((provider: ProviderType, parameter: string): number | undefined => {
    const config = getConfig(provider);
    const parameters = {
      ...DEFAULT_PARAMETERS,
      ...config.parameters
    };
    
    const paramValue = parameters[parameter as keyof typeof parameters];
    return typeof paramValue === 'number' ? paramValue : undefined;
  }, [getConfig]);

  /**
   * Check if provider has custom parameters (different from defaults)
   */
  const hasCustomParameters = useCallback((provider: ProviderType): boolean => {
    const config = getConfig(provider);
    if (!config.parameters) return false;

    return Object.entries(config.parameters).some(([key, value]) => {
      const defaultValue = DEFAULT_PARAMETERS[key as keyof typeof DEFAULT_PARAMETERS];
      return value !== defaultValue;
    });
  }, [getConfig]);

  /**
   * Check if provider has a custom model selected
   */
  const hasCustomModel = useCallback((provider: ProviderType): boolean => {
    const config = getConfig(provider);
    return !!config.selectedModel;
  }, [getConfig]);

  /**
   * Get list of providers with expert mode enabled
   */
  const getEnabledProviders = useCallback((): ProviderType[] => {
    const providers = getEnabledProviderDefs().map(p => p.id as ProviderType);
    return providers.filter(provider => isEnabled(provider));
  }, [isEnabled]);

  /**
   * Get list of providers with any expert mode configuration
   */
  const getConfiguredProviders = useCallback((): ProviderType[] => {
    const providers = getEnabledProviderDefs().map(p => p.id as ProviderType);
    return providers.filter(provider => {
      const config = getConfig(provider);
      return config.enabled || hasCustomParameters(provider) || hasCustomModel(provider);
    });
  }, [getConfig, hasCustomParameters, hasCustomModel]);

  return {
    expertModeConfigs,
    getConfig,
    isEnabled,
    enableExpertMode,
    disableExpertMode,
    toggleExpertMode,
    updateModel,
    updateParameter,
    updateParameters,
    resetParameters,
    resetAllSettings,
    getParameterValue,
    hasCustomParameters,
    hasCustomModel,
    getEnabledProviders,
    getConfiguredProviders,
  };
};
