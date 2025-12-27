import * as SecureStore from 'expo-secure-store';
import { ErrorService } from '@/services/errors/ErrorService';

const API_KEYS_STORAGE_KEY = 'my_ai_friends_api_keys';

// Dynamic interface to support all providers
type StoredApiKeys = Record<string, string>;

class SecureStorageService {
  // Save API keys securely
  async saveApiKeys(keys: StoredApiKeys): Promise<void> {
    try {
      const jsonValue = JSON.stringify(keys);
      await SecureStore.setItemAsync(API_KEYS_STORAGE_KEY, jsonValue);
      // API keys saved securely
    } catch (error) {
      ErrorService.handleSilent(error, { action: 'saveApiKeys' });
      throw error;
    }
  }

  // Retrieve API keys
  async getApiKeys(): Promise<StoredApiKeys | null> {
    try {
      const jsonValue = await SecureStore.getItemAsync(API_KEYS_STORAGE_KEY);
      if (jsonValue) {
        return JSON.parse(jsonValue);
      }
      return null;
    } catch (error) {
      ErrorService.handleSilent(error, { action: 'getApiKeys' });
      return null;
    }
  }

  // Update a single API key
  async updateApiKey(provider: string, key: string): Promise<void> {
    try {
      const currentKeys = await this.getApiKeys() || {};
      currentKeys[provider] = key;
      await this.saveApiKeys(currentKeys);
    } catch (error) {
      ErrorService.handleSilent(error, { action: 'updateApiKey', provider });
      throw error;
    }
  }

  // Remove all API keys
  async clearApiKeys(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(API_KEYS_STORAGE_KEY);
      // API keys cleared
    } catch (error) {
      ErrorService.handleSilent(error, { action: 'clearApiKeys' });
    }
  }

  // Check if we have any keys stored
  async hasApiKeys(): Promise<boolean> {
    const keys = await this.getApiKeys();
    return keys !== null && Object.keys(keys).length > 0;
  }
}

export default new SecureStorageService();