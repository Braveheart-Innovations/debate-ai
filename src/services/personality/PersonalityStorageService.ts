/**
 * PersonalityStorageService
 * Handles persistence of user personality customizations to AsyncStorage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ErrorService } from '@/services/errors/ErrorService';
import {
  PersonalityCustomization,
  UserPersonalitySettings,
  EMPTY_PERSONALITY_SETTINGS,
} from '@/types/personality';

const STORAGE_KEY = '@symposium/personality-settings';

export class PersonalityStorageService {
  /**
   * Load all personality settings from storage
   */
  static async load(): Promise<UserPersonalitySettings | null> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as UserPersonalitySettings;
        if (parsed && typeof parsed.customizations === 'object') {
          return parsed;
        }
      }
      return null;
    } catch (error) {
      ErrorService.handleSilent(error, { action: 'PersonalityStorageService.load' });
      return null;
    }
  }

  /**
   * Save all personality settings to storage
   */
  static async save(settings: UserPersonalitySettings): Promise<void> {
    try {
      const toSave: UserPersonalitySettings = {
        ...settings,
        lastSyncedAt: Date.now(),
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (error) {
      ErrorService.handleSilent(error, { action: 'PersonalityStorageService.save' });
      throw error;
    }
  }

  /**
   * Get customization for a specific personality
   */
  static async getCustomization(personalityId: string): Promise<PersonalityCustomization | null> {
    try {
      const settings = await this.load();
      if (!settings) return null;
      return settings.customizations[personalityId] || null;
    } catch (error) {
      ErrorService.handleSilent(error, {
        action: 'PersonalityStorageService.getCustomization',
        personalityId
      });
      return null;
    }
  }

  /**
   * Save customization for a specific personality
   */
  static async saveCustomization(customization: PersonalityCustomization): Promise<void> {
    try {
      let settings = await this.load();
      if (!settings) {
        settings = { ...EMPTY_PERSONALITY_SETTINGS };
      }

      settings.customizations[customization.personalityId] = {
        ...customization,
        updatedAt: Date.now(),
      };

      await this.save(settings);
    } catch (error) {
      ErrorService.handleSilent(error, {
        action: 'PersonalityStorageService.saveCustomization',
        personalityId: customization.personalityId,
      });
      throw error;
    }
  }

  /**
   * Reset customization for a specific personality (remove it)
   */
  static async resetCustomization(personalityId: string): Promise<void> {
    try {
      const settings = await this.load();
      if (!settings) return;

      delete settings.customizations[personalityId];
      await this.save(settings);
    } catch (error) {
      ErrorService.handleSilent(error, {
        action: 'PersonalityStorageService.resetCustomization',
        personalityId,
      });
      throw error;
    }
  }

  /**
   * Reset all customizations
   */
  static async resetAllCustomizations(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      ErrorService.handleSilent(error, {
        action: 'PersonalityStorageService.resetAllCustomizations',
      });
      throw error;
    }
  }

  /**
   * Get all customized personality IDs
   */
  static async getCustomizedIds(): Promise<string[]> {
    try {
      const settings = await this.load();
      if (!settings) return [];

      return Object.keys(settings.customizations).filter(
        id => settings.customizations[id]?.isCustomized
      );
    } catch (error) {
      ErrorService.handleSilent(error, {
        action: 'PersonalityStorageService.getCustomizedIds',
      });
      return [];
    }
  }

  /**
   * Check if a personality has been customized
   */
  static async isCustomized(personalityId: string): Promise<boolean> {
    try {
      const customization = await this.getCustomization(personalityId);
      return customization?.isCustomized ?? false;
    } catch (error) {
      ErrorService.handleSilent(error, {
        action: 'PersonalityStorageService.isCustomized',
        personalityId,
      });
      return false;
    }
  }
}
