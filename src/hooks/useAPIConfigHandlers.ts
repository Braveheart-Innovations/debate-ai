import { useCallback } from 'react';
import { validateAPIKeyProvider } from '../utils/typeGuards';
import { useAPIKeys } from './useAPIKeys';
import { useProviderVerification } from './useProviderVerification';
import { useConnectionTest } from './useConnectionTest';
import { useExpertMode } from './useExpertMode';
import * as Haptics from 'expo-haptics';

/**
 * Custom hook that encapsulates all API configuration event handlers
 * to reduce the main component complexity and improve maintainability.
 */
export const useAPIConfigHandlers = () => {
  const { apiKeys, updateKey } = useAPIKeys();
  const { verifyProvider, removeVerification } = useProviderVerification();
  const { testConnection } = useConnectionTest();
  const { toggleExpertMode, updateModel, updateParameter } = useExpertMode();

  const handleKeyChange = useCallback(async (providerId: string, key: string) => {
    await updateKey(providerId, key);

    // Always clear verification when key changes - user must re-verify
    await removeVerification(providerId);
  }, [updateKey, removeVerification]);

  /**
   * Complex connection test handler that:
   * 1. Validates API key exists
   * 2. Tests connection to provider API
   * 3. On success: saves key and marks provider as verified
   * 4. Provides comprehensive error handling with user-friendly messages
   */
  const handleTestConnection = useCallback(async (providerId: string): Promise<{ 
    success: boolean; 
    message?: string; 
    model?: string; 
  }> => {
    const key = apiKeys[providerId];
    if (!key) return { success: false, message: 'No API key provided' };

    try {
      // Test connection with real API call
      const result = await testConnection(providerId, key);

      if (result.success) {
        // Atomically save key and mark as verified to maintain data consistency
        await updateKey(providerId, key);
        await verifyProvider(providerId, {
          success: true,
          message: 'Verified just now',
          model: result.model,
          timestamp: Date.now()
        });
      } else {
        // Clear verification on failure - key is invalid
        await removeVerification(providerId);
      }
      return result;
    } catch (error) {
      console.error('Test connection failed:', error);
      // Clear verification on exception too
      await removeVerification(providerId);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Test failed'
      };
    }
  }, [apiKeys, testConnection, updateKey, verifyProvider, removeVerification]);

  const handleSaveKey = useCallback(async (providerId: string) => {
    const key = apiKeys[providerId];
    await updateKey(providerId, key);
  }, [apiKeys, updateKey]);

  /**
   * Toggle expand handler with haptic feedback.
   * Uses accordion pattern - only one provider can be expanded at a time.
   */
  const handleToggleExpand = useCallback((
    providerId: string, 
    expandedProvider: string | null,
    setExpandedProvider: (value: string | null) => void
  ) => {
    // Provide tactile feedback for better UX
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Accordion behavior: clicking same provider collapses, different provider switches
    setExpandedProvider(expandedProvider === providerId ? null : providerId);
  }, []);

  /**
   * Safely handles expert mode toggle with provider validation
   */
  const handleExpertModeToggle = useCallback((providerId: string) => {
    try {
      const providerKey = validateAPIKeyProvider(providerId);
      toggleExpertMode(providerKey);
    } catch {
      console.warn('Invalid provider for expert mode:', providerId);
    }
  }, [toggleExpertMode]);

  /**
   * Safely handles model change with provider validation
   */
  const handleModelChange = useCallback((providerId: string, modelId: string) => {
    try {
      const providerKey = validateAPIKeyProvider(providerId);
      updateModel(providerKey, modelId);
    } catch {
      console.warn('Invalid provider for model change:', providerId);
    }
  }, [updateModel]);

  /**
   * Safely handles parameter change with provider validation
   */
  const handleParameterChange = useCallback((providerId: string, param: string, value: number) => {
    try {
      const providerKey = validateAPIKeyProvider(providerId);
      updateParameter(providerKey, param, value);
    } catch {
      console.warn('Invalid provider for parameter change:', providerId);
    }
  }, [updateParameter]);

  return {
    handleKeyChange,
    handleTestConnection,
    handleSaveKey,
    handleToggleExpand,
    handleExpertModeToggle,
    handleModelChange,
    handleParameterChange,
  };
};