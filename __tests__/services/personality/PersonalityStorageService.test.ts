import AsyncStorage from '@react-native-async-storage/async-storage';
import { PersonalityStorageService } from '@/services/personality/PersonalityStorageService';
import { PersonalityCustomization, UserPersonalitySettings, EMPTY_PERSONALITY_SETTINGS } from '@/types/personality';

// Use the globally mocked AsyncStorage from jest.setup.ts

describe('PersonalityStorageService', () => {
  beforeEach(async () => {
    // Clear AsyncStorage before each test
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  describe('load', () => {
    it('returns null when no data is stored', async () => {
      const result = await PersonalityStorageService.load();
      expect(result).toBeNull();
    });

    it('returns parsed settings when valid data exists', async () => {
      const mockSettings: UserPersonalitySettings = {
        customizations: {
          bestie: {
            personalityId: 'bestie',
            isCustomized: true,
            tone: { formality: 0.3, humor: 0.7 },
            updatedAt: Date.now(),
          },
        },
        lastSyncedAt: Date.now(),
        version: 1,
      };
      await AsyncStorage.setItem('@symposium/personality-settings', JSON.stringify(mockSettings));

      const result = await PersonalityStorageService.load();
      expect(result).not.toBeNull();
      expect(result?.customizations.bestie).toBeDefined();
      expect(result?.customizations.bestie.isCustomized).toBe(true);
    });

    it('returns null for invalid JSON', async () => {
      await AsyncStorage.setItem('@symposium/personality-settings', 'not valid json');
      const result = await PersonalityStorageService.load();
      expect(result).toBeNull();
    });

    it('returns null when customizations field is missing', async () => {
      await AsyncStorage.setItem('@symposium/personality-settings', JSON.stringify({ version: 1 }));
      const result = await PersonalityStorageService.load();
      expect(result).toBeNull();
    });
  });

  describe('save', () => {
    it('saves settings to AsyncStorage', async () => {
      const settings: UserPersonalitySettings = {
        customizations: {
          brody: {
            personalityId: 'brody',
            isCustomized: true,
            tone: { energy: 0.9 },
            updatedAt: Date.now(),
          },
        },
        lastSyncedAt: 0,
        version: 1,
      };

      await PersonalityStorageService.save(settings);

      const stored = await AsyncStorage.getItem('@symposium/personality-settings');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.customizations.brody).toBeDefined();
      expect(parsed.lastSyncedAt).toBeGreaterThan(0);
    });

    it('updates lastSyncedAt on save', async () => {
      const settings: UserPersonalitySettings = {
        customizations: {},
        lastSyncedAt: 0,
        version: 1,
      };

      const before = Date.now();
      await PersonalityStorageService.save(settings);
      const after = Date.now();

      const stored = await AsyncStorage.getItem('@symposium/personality-settings');
      const parsed = JSON.parse(stored!);
      expect(parsed.lastSyncedAt).toBeGreaterThanOrEqual(before);
      expect(parsed.lastSyncedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('getCustomization', () => {
    it('returns null when no settings exist', async () => {
      const result = await PersonalityStorageService.getCustomization('bestie');
      expect(result).toBeNull();
    });

    it('returns null when personality is not customized', async () => {
      const settings: UserPersonalitySettings = {
        customizations: {},
        lastSyncedAt: Date.now(),
        version: 1,
      };
      await AsyncStorage.setItem('@symposium/personality-settings', JSON.stringify(settings));

      const result = await PersonalityStorageService.getCustomization('bestie');
      expect(result).toBeNull();
    });

    it('returns customization when it exists', async () => {
      const customization: PersonalityCustomization = {
        personalityId: 'critic',
        isCustomized: true,
        tone: { formality: 0.8, technicality: 0.9 },
        updatedAt: Date.now(),
      };
      const settings: UserPersonalitySettings = {
        customizations: { critic: customization },
        lastSyncedAt: Date.now(),
        version: 1,
      };
      await AsyncStorage.setItem('@symposium/personality-settings', JSON.stringify(settings));

      const result = await PersonalityStorageService.getCustomization('critic');
      expect(result).not.toBeNull();
      expect(result?.tone?.formality).toBe(0.8);
      expect(result?.tone?.technicality).toBe(0.9);
    });
  });

  describe('saveCustomization', () => {
    it('creates new settings when none exist', async () => {
      const customization: PersonalityCustomization = {
        personalityId: 'sage',
        isCustomized: true,
        tone: { formality: 0.6 },
        updatedAt: 0,
      };

      await PersonalityStorageService.saveCustomization(customization);

      const result = await PersonalityStorageService.getCustomization('sage');
      expect(result).not.toBeNull();
      expect(result?.isCustomized).toBe(true);
      expect(result?.updatedAt).toBeGreaterThan(0);
    });

    it('updates existing customization', async () => {
      // First save
      await PersonalityStorageService.saveCustomization({
        personalityId: 'bestie',
        isCustomized: true,
        tone: { formality: 0.3 },
        updatedAt: 0,
      });

      // Update
      await PersonalityStorageService.saveCustomization({
        personalityId: 'bestie',
        isCustomized: true,
        tone: { formality: 0.7, humor: 0.8 },
        updatedAt: 0,
      });

      const result = await PersonalityStorageService.getCustomization('bestie');
      expect(result?.tone?.formality).toBe(0.7);
      expect(result?.tone?.humor).toBe(0.8);
    });

    it('preserves other customizations when adding new one', async () => {
      // Save first customization
      await PersonalityStorageService.saveCustomization({
        personalityId: 'bestie',
        isCustomized: true,
        tone: { formality: 0.3 },
        updatedAt: 0,
      });

      // Save second customization
      await PersonalityStorageService.saveCustomization({
        personalityId: 'critic',
        isCustomized: true,
        tone: { technicality: 0.9 },
        updatedAt: 0,
      });

      // Both should exist
      const bestie = await PersonalityStorageService.getCustomization('bestie');
      const critic = await PersonalityStorageService.getCustomization('critic');
      expect(bestie).not.toBeNull();
      expect(critic).not.toBeNull();
    });
  });

  describe('resetCustomization', () => {
    it('removes specific customization', async () => {
      await PersonalityStorageService.saveCustomization({
        personalityId: 'bestie',
        isCustomized: true,
        tone: { formality: 0.3 },
        updatedAt: 0,
      });
      await PersonalityStorageService.saveCustomization({
        personalityId: 'critic',
        isCustomized: true,
        tone: { technicality: 0.9 },
        updatedAt: 0,
      });

      await PersonalityStorageService.resetCustomization('bestie');

      const bestie = await PersonalityStorageService.getCustomization('bestie');
      const critic = await PersonalityStorageService.getCustomization('critic');
      expect(bestie).toBeNull();
      expect(critic).not.toBeNull();
    });

    it('does nothing when no settings exist', async () => {
      // Should not throw
      await expect(PersonalityStorageService.resetCustomization('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('resetAllCustomizations', () => {
    it('removes all personality settings', async () => {
      await PersonalityStorageService.saveCustomization({
        personalityId: 'bestie',
        isCustomized: true,
        tone: { formality: 0.3 },
        updatedAt: 0,
      });
      await PersonalityStorageService.saveCustomization({
        personalityId: 'critic',
        isCustomized: true,
        tone: { technicality: 0.9 },
        updatedAt: 0,
      });

      await PersonalityStorageService.resetAllCustomizations();

      const result = await PersonalityStorageService.load();
      expect(result).toBeNull();
    });
  });

  describe('getCustomizedIds', () => {
    it('returns empty array when no settings exist', async () => {
      const result = await PersonalityStorageService.getCustomizedIds();
      expect(result).toEqual([]);
    });

    it('returns only customized personality IDs', async () => {
      const settings: UserPersonalitySettings = {
        customizations: {
          bestie: { personalityId: 'bestie', isCustomized: true, updatedAt: Date.now() },
          critic: { personalityId: 'critic', isCustomized: false, updatedAt: Date.now() },
          sage: { personalityId: 'sage', isCustomized: true, updatedAt: Date.now() },
        },
        lastSyncedAt: Date.now(),
        version: 1,
      };
      await AsyncStorage.setItem('@symposium/personality-settings', JSON.stringify(settings));

      const result = await PersonalityStorageService.getCustomizedIds();
      expect(result).toContain('bestie');
      expect(result).toContain('sage');
      expect(result).not.toContain('critic');
      expect(result).toHaveLength(2);
    });
  });

  describe('isCustomized', () => {
    it('returns false when no settings exist', async () => {
      const result = await PersonalityStorageService.isCustomized('bestie');
      expect(result).toBe(false);
    });

    it('returns false when personality is not customized', async () => {
      const settings: UserPersonalitySettings = {
        customizations: {
          bestie: { personalityId: 'bestie', isCustomized: false, updatedAt: Date.now() },
        },
        lastSyncedAt: Date.now(),
        version: 1,
      };
      await AsyncStorage.setItem('@symposium/personality-settings', JSON.stringify(settings));

      const result = await PersonalityStorageService.isCustomized('bestie');
      expect(result).toBe(false);
    });

    it('returns true when personality is customized', async () => {
      await PersonalityStorageService.saveCustomization({
        personalityId: 'bestie',
        isCustomized: true,
        tone: { formality: 0.3 },
        updatedAt: 0,
      });

      const result = await PersonalityStorageService.isCustomized('bestie');
      expect(result).toBe(true);
    });
  });
});
