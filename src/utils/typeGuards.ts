/**
 * Type guards and utilities for runtime type checking
 */

import { getEnabledProviders } from '../config/aiProviders';

// Supported API key provider IDs (all providers in this app require API keys)
export const API_KEY_PROVIDER_IDS = [
  'claude',
  'openai',
  'google',
  'perplexity',
  'mistral',
  'cohere',
  'together',
  'deepseek',
  'grok',
] as const;
export type APIKeyProviderId = typeof API_KEY_PROVIDER_IDS[number];

/**
 * Type guard to check if a string is a valid API key provider ID
 */
export const isAPIKeyProviderId = (id: string): id is APIKeyProviderId => {
  return API_KEY_PROVIDER_IDS.includes(id as APIKeyProviderId);
};

/**
 * Safe getter for API key provider ID with validation
 */
export const getAPIKeyProviderId = (id: string): APIKeyProviderId | null => {
  return isAPIKeyProviderId(id) ? id : null;
};

/**
 * Validates if a provider ID exists in enabled providers
 */
export const isValidProviderId = (id: string): boolean => {
  const enabledProviders = getEnabledProviders();
  return enabledProviders.some(provider => provider.id === id);
};

/**
 * Safely converts a provider ID to API key provider ID with validation
 */
export const validateAPIKeyProvider = (providerId: string): APIKeyProviderId => {
  const validId = getAPIKeyProviderId(providerId);
  if (!validId) {
    throw new Error(`Invalid API key provider ID: ${providerId}. Must be one of: ${API_KEY_PROVIDER_IDS.join(', ')}`);
  }
  return validId;
};
