import { DEFAULT_PARAMETERS } from '../config/modelConfigs';
import type { ModelParameters } from '../types';

/**
 * Resolve expert mode overrides for a provider.
 * - If not enabled, returns { enabled: false }.
 * - If enabled, merges parameters with defaults and returns optional model override.
 */
export function getExpertOverrides(
  expertModeConfigs: Record<string, unknown>,
  providerId: string
): { enabled: boolean; model?: string; parameters?: ModelParameters } {
  const cfg = expertModeConfigs?.[providerId] as
    | { enabled?: boolean; selectedModel?: string; parameters?: Partial<ModelParameters> | Record<string, number> }
    | undefined;
  if (!cfg || !cfg.enabled) return { enabled: false };

  const params: ModelParameters = {
    ...DEFAULT_PARAMETERS,
    ...(cfg.parameters as Partial<ModelParameters> | undefined),
  } as ModelParameters;

  return {
    enabled: true,
    model: cfg.selectedModel,
    parameters: params,
  };
}
