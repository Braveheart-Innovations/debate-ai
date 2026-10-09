/**
 * Model facts for the server-side Analyze loop: context length (history
 * pruning), max output tokens, supported parameters, and function support.
 * Generated from the web app's src/config/modelConfigs.ts by
 * symposium-ai-web scripts/export-analyze-model-catalog.mjs — never edited by
 * hand. Run that script after every model refresh.
 */
import catalogJson from './modelCatalog.generated.json';
import { resolveModelAlias } from '../modelRegistry';

export type ModelParam =
  | 'temperature' | 'maxTokens' | 'topP' | 'topK' | 'frequencyPenalty'
  | 'presencePenalty' | 'stopSequences' | 'seed';

export interface CatalogModel {
  contextLength: number;
  maxOutputTokens: number;
  supportedParams: ModelParam[];
  supportsFunctions: boolean;
  supportsVision: boolean;
  isDeprecated?: boolean;
}

interface CatalogProvider {
  defaultModel: string | null;
  models: Record<string, CatalogModel>;
}

const catalog = catalogJson as { providers: Record<string, CatalogProvider> };

/** Mirrors the web app's DEFAULT_MAX_OUTPUT_TOKENS for unknown models. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 16384;

export function getCatalogModel(providerId: string, modelId: string): CatalogModel | undefined {
  const models = catalog.providers[providerId]?.models;
  if (!models) return undefined;
  return models[resolveModelAlias(modelId)] ?? models[modelId];
}

export function getCatalogProviders(): string[] {
  return Object.keys(catalog.providers);
}

export function hasCatalogModel(providerId: string, modelId: string): boolean {
  return Boolean(getCatalogModel(providerId, modelId));
}
