import { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, updateApiKeys } from '@/store';
import APIKeyService from '@/services/APIKeyService';
import { AI_PROVIDERS } from '@/config/aiProviders';
// Type guards imported for future validation needs

export interface UseAPIKeysReturn {
  apiKeys: Record<string, string>;
  isLoading: boolean;
  error: string | null;
  updateKey: (providerId: string, key: string) => Promise<void>;
  deleteKey: (providerId: string) => Promise<void>;
  clearAll: () => Promise<void>;
  hasKey: (providerId: string) => boolean;
  getKeyCount: () => number;
  refreshKeys: () => Promise<void>;
  validateKey: (providerId: string, key: string) => { isValid: boolean; message: string };
  maskKey: (key: string) => string;
}

export const useAPIKeys = (): UseAPIKeysReturn => {
  const dispatch = useDispatch();
  const existingKeys = useSelector((state: RootState) => state.settings.apiKeys || {});
  
  // Local state for immediate UI updates
  const [localKeys, setLocalKeys] = useState<Record<string, string>>(() => {
    const keys: Record<string, string> = {};
    AI_PROVIDERS.forEach(provider => {
      const existingKey = existingKeys?.[provider.id];
      keys[provider.id] = existingKey || '';
    });
    return keys;
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Sync local state with Redux when existingKeys change
   */
  useEffect(() => {
    const keys: Record<string, string> = {};
    AI_PROVIDERS.forEach(provider => {
      const existingKey = existingKeys?.[provider.id];
      keys[provider.id] = existingKey || '';
    });
    setLocalKeys(keys);
  }, [existingKeys]);

  /**
   * Update a single API key
   */
  const updateKey = useCallback(async (providerId: string, key: string) => {
    try {
      setError(null);
      
      // Optimistically update local state
      setLocalKeys(prev => ({ ...prev, [providerId]: key }));

      // Save to secure storage
      await APIKeyService.saveKey(providerId, key);

      // Update Redux state
      const updatedKeys = { ...existingKeys, [providerId]: key };
      if (!key) {
        delete updatedKeys[providerId];
      }
      
      dispatch(updateApiKeys(updatedKeys));
    } catch (err) {
      console.error(`Failed to update API key for ${providerId}:`, err);
      setError(`Failed to update ${providerId} API key`);
      
      // Revert optimistic update
      setLocalKeys(prev => ({
        ...prev,
        [providerId]: existingKeys?.[providerId] || ''
      }));
      
      throw err;
    }
  }, [dispatch, existingKeys]);

  /**
   * Delete an API key
   */
  const deleteKey = useCallback(async (providerId: string) => {
    try {
      setError(null);
      
      // Optimistically update local state
      setLocalKeys(prev => ({ ...prev, [providerId]: '' }));

      // Delete from secure storage
      await APIKeyService.deleteKey(providerId);

      // Update Redux state
      const updatedKeys = { ...existingKeys };
      delete updatedKeys[providerId];
      
      dispatch(updateApiKeys(updatedKeys));
    } catch (err) {
      console.error(`Failed to delete API key for ${providerId}:`, err);
      setError(`Failed to delete ${providerId} API key`);
      
      // Revert optimistic update
      setLocalKeys(prev => ({
        ...prev,
        [providerId]: existingKeys?.[providerId] || ''
      }));
      
      throw err;
    }
  }, [dispatch, existingKeys]);

  /**
   * Refresh keys from storage
   */
  const refreshKeys = useCallback(async () => {
    try {
      setError(null);
      setIsLoading(true);

      const keys = await APIKeyService.loadKeys();
      
      // Update local state with all providers
      const updatedKeys: Record<string, string> = {};
      AI_PROVIDERS.forEach(provider => {
        updatedKeys[provider.id] = keys[provider.id] || '';
      });
      
      setLocalKeys(updatedKeys);
      
      // Update Redux state
      dispatch(updateApiKeys(keys));
    } catch (err) {
      console.error('Failed to refresh API keys:', err);
      setError('Failed to refresh API keys');
    } finally {
      setIsLoading(false);
    }
  }, [dispatch]);

  /**
   * Clear all API keys
   */
  const clearAll = useCallback(async () => {
    try {
      setError(null);
      setIsLoading(true);

      // Optimistically update local state
      const emptyKeys: Record<string, string> = {};
      AI_PROVIDERS.forEach(provider => {
        emptyKeys[provider.id] = '';
      });
      setLocalKeys(emptyKeys);

      // Clear from secure storage
      await APIKeyService.clearAllKeys();

      // Update Redux state
      dispatch(updateApiKeys({}));
    } catch (err) {
      console.error('Failed to clear all API keys:', err);
      setError('Failed to clear all API keys');
      
      // Revert optimistic update
      await refreshKeys();
      
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [dispatch, refreshKeys]);

  /**
   * Check if provider has an API key
   */
  const hasKey = useCallback((providerId: string): boolean => {
    return !!(localKeys[providerId] && localKeys[providerId].trim().length > 0);
  }, [localKeys]);

  /**
   * Get count of configured API keys
   */
  const getKeyCount = useCallback((): number => {
    return Object.values(localKeys).filter(key => key && key.trim().length > 0).length;
  }, [localKeys]);

  /**
   * Validate API key format
   */
  const validateKey = useCallback((providerId: string, key: string) => {
    return APIKeyService.validateKeyFormat(providerId, key);
  }, []);

  /**
   * Mask API key for display
   */
  const maskKey = useCallback((key: string): string => {
    return APIKeyService.maskKey(key);
  }, []);

  return {
    apiKeys: localKeys,
    isLoading,
    error,
    updateKey,
    deleteKey,
    clearAll,
    hasKey,
    getKeyCount,
    refreshKeys,
    validateKey,
    maskKey,
  };
};