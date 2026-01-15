import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AppSettings {
  themeMode: 'light' | 'dark' | 'system';
  notifications: {
    enabled: boolean;
    soundEnabled: boolean;
    vibrationEnabled: boolean;
  };
  privacy: {
    analyticsEnabled: boolean;
    crashReportingEnabled: boolean;
  };
  accessibility: {
    fontSize: 'small' | 'medium' | 'large';
    highContrast: boolean;
    reducedMotion: boolean;
  };
  version: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  themeMode: 'system',
  notifications: {
    enabled: true,
    soundEnabled: true,
    vibrationEnabled: true,
  },
  privacy: {
    analyticsEnabled: true,
    crashReportingEnabled: true,
  },
  accessibility: {
    fontSize: 'medium',
    highContrast: false,
    reducedMotion: false,
  },
  version: '1.0.0',
};

class SettingsService {
  private static readonly SETTINGS_KEY = '@settings';
  private static readonly SETTINGS_VERSION = '1.0.0';
  private static readonly ONBOARDING_KEY = '@hasCompletedOnboarding';

  /**
   * Load user settings from AsyncStorage
   */
  async loadSettings(): Promise<AppSettings> {
    try {
      const settingsJson = await AsyncStorage.getItem(SettingsService.SETTINGS_KEY);
      
      if (!settingsJson) {
        // First time - save defaults and return them
        await this.saveSettings(DEFAULT_SETTINGS);
        return DEFAULT_SETTINGS;
      }

      const settings = JSON.parse(settingsJson) as AppSettings;
      
      // Migrate settings if needed
      const migratedSettings = await this.migrateSettings(settings);
      
      return migratedSettings;
    } catch (error) {
      console.error('Failed to load settings:', error);
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * Save user settings to AsyncStorage
   */
  async saveSettings(settings: AppSettings): Promise<void> {
    try {
      const settingsJson = JSON.stringify({
        ...settings,
        version: SettingsService.SETTINGS_VERSION,
      });
      
      await AsyncStorage.setItem(SettingsService.SETTINGS_KEY, settingsJson);
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw new Error('Unable to save settings');
    }
  }

  /**
   * Update a specific setting
   */
  async updateSetting<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ): Promise<void> {
    try {
      const currentSettings = await this.loadSettings();
      const updatedSettings = {
        ...currentSettings,
        [key]: value,
      };
      
      await this.saveSettings(updatedSettings);
    } catch (error) {
      console.error(`Failed to update setting ${key}:`, error);
      throw new Error(`Unable to update ${key} setting`);
    }
  }

  /**
   * Reset all settings to defaults
   */
  async resetSettings(): Promise<void> {
    try {
      await this.saveSettings(DEFAULT_SETTINGS);
    } catch (error) {
      console.error('Failed to reset settings:', error);
      throw new Error('Unable to reset settings');
    }
  }

  /**
   * Export settings for backup
   */
  async exportSettings(): Promise<string> {
    try {
      const settings = await this.loadSettings();
      return JSON.stringify(settings, null, 2);
    } catch (error) {
      console.error('Failed to export settings:', error);
      throw new Error('Unable to export settings');
    }
  }

  /**
   * Import settings from backup
   */
  async importSettings(settingsJson: string): Promise<void> {
    try {
      const settings = JSON.parse(settingsJson) as unknown as Record<string, unknown>;
      
      // Validate imported settings
      const validatedSettings = this.validateSettings(settings);
      
      await this.saveSettings(validatedSettings);
    } catch (error) {
      console.error('Failed to import settings:', error);
      throw new Error('Unable to import settings - invalid format');
    }
  }

  /**
   * Clear all stored settings
   */
  async clearSettings(): Promise<void> {
    try {
      await AsyncStorage.removeItem(SettingsService.SETTINGS_KEY);
    } catch (error) {
      console.error('Failed to clear settings:', error);
      throw new Error('Unable to clear settings');
    }
  }

  /**
   * Get current app version from settings
   */
  async getAppVersion(): Promise<string> {
    try {
      const settings = await this.loadSettings();
      return settings.version;
    } catch (error) {
      console.error('Failed to get app version:', error);
      return DEFAULT_SETTINGS.version;
    }
  }

  /**
   * Validate settings structure
   */
  private validateSettings(settings: Record<string, unknown>): AppSettings {
    try {
      // Merge with defaults to ensure all required fields exist
      const notificationsData = settings.notifications as Record<string, unknown> | undefined;
      const privacyData = settings.privacy as Record<string, unknown> | undefined;
      const accessibilityData = settings.accessibility as Record<string, unknown> | undefined;

      const validatedSettings: AppSettings = {
        themeMode: (settings.themeMode as AppSettings['themeMode']) || DEFAULT_SETTINGS.themeMode,
        notifications: {
          enabled: notificationsData?.enabled as boolean ?? DEFAULT_SETTINGS.notifications.enabled,
          soundEnabled: notificationsData?.soundEnabled as boolean ?? DEFAULT_SETTINGS.notifications.soundEnabled,
          vibrationEnabled: notificationsData?.vibrationEnabled as boolean ?? DEFAULT_SETTINGS.notifications.vibrationEnabled,
        },
        privacy: {
          analyticsEnabled: privacyData?.analyticsEnabled as boolean ?? DEFAULT_SETTINGS.privacy.analyticsEnabled,
          crashReportingEnabled: privacyData?.crashReportingEnabled as boolean ?? DEFAULT_SETTINGS.privacy.crashReportingEnabled,
        },
        accessibility: {
          fontSize: (accessibilityData?.fontSize as AppSettings['accessibility']['fontSize']) || DEFAULT_SETTINGS.accessibility.fontSize,
          highContrast: accessibilityData?.highContrast as boolean ?? DEFAULT_SETTINGS.accessibility.highContrast,
          reducedMotion: accessibilityData?.reducedMotion as boolean ?? DEFAULT_SETTINGS.accessibility.reducedMotion,
        },
        version: (settings.version as string) || DEFAULT_SETTINGS.version,
      };

      return validatedSettings;
    } catch (error) {
      console.warn('Settings validation failed, using defaults:', error);
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * Migrate settings from older versions
   */
  private async migrateSettings(settings: AppSettings): Promise<AppSettings> {
    try {
      const currentVersion = settings.version || '0.0.0';

      if (currentVersion !== SettingsService.SETTINGS_VERSION) {
        console.warn(`Migrating settings from ${currentVersion} to ${SettingsService.SETTINGS_VERSION}`);

        // Perform migration logic here if needed
        const migratedSettings = {
          ...this.validateSettings(settings as unknown as Record<string, unknown>),
          version: SettingsService.SETTINGS_VERSION,
        };

        // Save migrated settings
        await this.saveSettings(migratedSettings);

        return migratedSettings;
      }

      return settings;
    } catch (error) {
      console.error('Settings migration failed:', error);
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * Load onboarding completion state from AsyncStorage
   * Used to persist hasCompletedOnboarding across app updates
   */
  async loadOnboardingState(): Promise<boolean> {
    try {
      const value = await AsyncStorage.getItem(SettingsService.ONBOARDING_KEY);
      return value === 'true';
    } catch (error) {
      console.error('Failed to load onboarding state:', error);
      return false;
    }
  }

  /**
   * Save onboarding completion state to AsyncStorage
   */
  async saveOnboardingState(completed: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(SettingsService.ONBOARDING_KEY, String(completed));
    } catch (error) {
      console.error('Failed to save onboarding state:', error);
    }
  }
}

// Export singleton instance
export const settingsService = new SettingsService();
export default settingsService;