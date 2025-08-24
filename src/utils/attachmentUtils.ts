import { AIConfig } from '../types';
import { getModelById } from '../config/modelConfigs';
import { AdapterFactory } from '../services/ai';
import type { AdapterCapabilities } from '../services/ai/types/adapter.types';

// Cache for adapter capabilities to avoid recreating adapters
const capabilitiesCache = new Map<string, AdapterCapabilities>();

/**
 * Determines what types of attachments are supported based on selected AIs
 * 
 * Rules:
 * 1. Only support attachments when exactly 1 AI is selected (avoid complexity with multiple AIs)
 * 2. Check model capabilities from modelConfigs
 * 3. Check adapter capabilities
 * 
 * @param selectedAIs Array of selected AI configurations
 * @returns Object with support flags for images and documents
 */
export const getAttachmentSupport = (selectedAIs: AIConfig[]): { images: boolean; documents: boolean } => {
  // Only support attachments when exactly 1 AI is selected
  // This avoids complexity of sending attachments to multiple AIs
  if (selectedAIs.length !== 1) {
    return { images: false, documents: false };
  }
  
  const ai = selectedAIs[0];
  
  // Check model capabilities
  const model = ai.model ? getModelById(ai.provider, ai.model) : null;
  
  if (!model) {
    return { images: false, documents: false };
  }
  
  // Check adapter capabilities (with caching)
  const cacheKey = `${ai.provider}:${ai.model}`;
  let capabilities: AdapterCapabilities;
  
  if (capabilitiesCache.has(cacheKey)) {
    capabilities = capabilitiesCache.get(cacheKey)!;
  } else {
    try {
      const adapter = AdapterFactory.create({
        provider: ai.provider,
        apiKey: 'dummy', // Not used for capability check
        model: ai.model,
      });
      
      capabilities = adapter.getCapabilities();
      capabilitiesCache.set(cacheKey, capabilities);
    } catch (error) {
      console.warn(`Could not check attachment support for ${ai.provider}:`, error);
      return { images: false, documents: false };
    }
  }
  
  return {
    images: Boolean(model.supportsVision && (capabilities.supportsImages ?? capabilities.attachments)),
    documents: Boolean(model.supportsDocuments && (capabilities.supportsDocuments ?? false))
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
  
  if (selectedAIs.length > 1) {
    return 'Attachments are only available when using a single AI';
  }
  
  const ai = selectedAIs[0];
  const model = ai.model ? getModelById(ai.provider, ai.model) : null;
  
  if (!model) {
    return 'No model selected';
  }
  
  if (!model.supportsVision) {
    return `${model.name} doesn't support image attachments`;
  }
  
  // Check adapter capabilities (with caching)
  const cacheKey = `${ai.provider}:${ai.model}`;
  let capabilities: AdapterCapabilities;
  
  if (capabilitiesCache.has(cacheKey)) {
    capabilities = capabilitiesCache.get(cacheKey)!;
  } else {
    try {
      const adapter = AdapterFactory.create({
        provider: ai.provider,
        apiKey: 'dummy',
        model: ai.model,
      });
      
      capabilities = adapter.getCapabilities();
      capabilitiesCache.set(cacheKey, capabilities);
    } catch {
      return `Could not verify attachment support for ${ai.provider}`;
    }
  }
  
  if (!capabilities.attachments) {
    return `${ai.provider} adapter doesn't support attachments yet`;
  }
  
  return 'You can attach images or documents';
};