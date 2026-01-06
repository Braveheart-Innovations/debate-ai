import { AIConfig } from '../types';
import { getModelById } from '../config/modelConfigs';
import { AdapterFactory } from '../services/ai';
import type { AdapterCapabilities } from '../services/ai/types/adapter.types';

// Cache for adapter capabilities to avoid recreating adapters
const capabilitiesCache = new Map<string, AdapterCapabilities>();

/**
 * Gets adapter capabilities with caching
 */
const getAdapterCapabilities = (provider: string, model: string): AdapterCapabilities | null => {
  const cacheKey = `${provider}:${model}`;

  if (capabilitiesCache.has(cacheKey)) {
    return capabilitiesCache.get(cacheKey)!;
  }

  try {
    const adapter = AdapterFactory.create({
      provider: provider as AIConfig['provider'],
      apiKey: 'dummy', // Not used for capability check
      model,
    });

    const capabilities = adapter.getCapabilities();
    capabilitiesCache.set(cacheKey, capabilities);
    return capabilities;
  } catch (error) {
    console.warn(`Could not check attachment support for ${provider}:`, error);
    return null;
  }
};

/**
 * Determines what types of attachments are supported based on selected AIs
 *
 * Rules:
 * 1. Attachments only available when ALL selected AIs support the capability
 * 2. Check model capabilities from modelConfigs
 * 3. Check adapter capabilities
 *
 * @param selectedAIs Array of selected AI configurations
 * @returns Object with support flags for images and documents
 */
export const getAttachmentSupport = (selectedAIs: AIConfig[]): { images: boolean; documents: boolean } => {
  // No AIs selected - disable attachments
  if (selectedAIs.length === 0) {
    return { images: false, documents: false };
  }

  // Check if ALL selected AIs support each capability
  const allSupportImages = selectedAIs.every(ai => {
    const model = ai.model ? getModelById(ai.provider, ai.model) : null;
    if (!model) return false;

    const capabilities = getAdapterCapabilities(ai.provider, ai.model || '');
    if (!capabilities) return false;

    return Boolean(model.supportsVision && (capabilities.supportsImages ?? capabilities.attachments));
  });

  const allSupportDocuments = selectedAIs.every(ai => {
    const model = ai.model ? getModelById(ai.provider, ai.model) : null;
    if (!model) return false;

    const capabilities = getAdapterCapabilities(ai.provider, ai.model || '');
    if (!capabilities) return false;

    return Boolean(model.supportsDocuments && (capabilities.supportsDocuments ?? false));
  });

  return {
    images: allSupportImages,
    documents: allSupportDocuments
  };
};

/**
 * Gets a user-friendly message about attachment support
 *
 * @param selectedAIs Array of selected AI configurations
 * @returns A message explaining why attachments are or aren't available
 */
export const getAttachmentSupportMessage = (selectedAIs: AIConfig[]): string => {
  if (selectedAIs.length === 0) {
    return 'Select an AI to enable attachments';
  }

  // Check which AIs don't support attachments
  const unsupportedAIs: string[] = [];

  for (const ai of selectedAIs) {
    const model = ai.model ? getModelById(ai.provider, ai.model) : null;

    if (!model) {
      unsupportedAIs.push(ai.name);
      continue;
    }

    if (!model.supportsVision) {
      unsupportedAIs.push(ai.name);
      continue;
    }

    const capabilities = getAdapterCapabilities(ai.provider, ai.model || '');
    if (!capabilities || !capabilities.attachments) {
      unsupportedAIs.push(ai.name);
    }
  }

  if (unsupportedAIs.length > 0) {
    if (unsupportedAIs.length === 1) {
      return `${unsupportedAIs[0]} doesn't support attachments`;
    }
    return `${unsupportedAIs.join(', ')} don't support attachments`;
  }

  return 'You can attach images or documents';
};