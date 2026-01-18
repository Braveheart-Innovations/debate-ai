import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import {
  PersonalityProvider,
  usePersonality,
  usePersonalityById,
  MergedPersonality,
} from '@/contexts/PersonalityContext';
import { PersonalityStorageService } from '@/services/personality';
import { UserPersonalitySettings, EMPTY_PERSONALITY_SETTINGS } from '@/types/personality';
import { UNIVERSAL_PERSONALITIES } from '@/config/personalities';

// Mock PersonalityStorageService
jest.mock('@/services/personality', () => ({
  PersonalityStorageService: {
    load: jest.fn(),
    save: jest.fn(),
    resetAllCustomizations: jest.fn(),
  },
}));

const mockStorageService = PersonalityStorageService as jest.Mocked<typeof PersonalityStorageService>;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PersonalityProvider>{children}</PersonalityProvider>
);

describe('PersonalityContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorageService.load.mockResolvedValue(null);
    mockStorageService.save.mockResolvedValue(undefined);
    mockStorageService.resetAllCustomizations.mockResolvedValue(undefined);
  });

  describe('usePersonality hook', () => {
    it('throws error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => usePersonality());
      }).toThrow('usePersonality must be used within a PersonalityProvider');

      consoleSpy.mockRestore();
    });

    it('provides initial loading state', async () => {
      mockStorageService.load.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => usePersonality(), { wrapper });

      expect(result.current.isLoading).toBe(true);
    });

    it('loads settings from storage on mount', async () => {
      const mockSettings: UserPersonalitySettings = {
        customizations: {
          bestie: {
            personalityId: 'bestie',
            isCustomized: true,
            tone: { formality: 0.3 },
            updatedAt: Date.now(),
          },
        },
        lastSyncedAt: Date.now(),
        version: 1,
      };
      mockStorageService.load.mockResolvedValue(mockSettings);

      const { result } = renderHook(() => usePersonality(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.settings.customizations.bestie).toBeDefined();
      expect(result.current.isCustomized('bestie')).toBe(true);
    });
  });

  describe('getPersonality', () => {
    it('returns null for unknown personality', async () => {
      const { result } = renderHook(() => usePersonality(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.getPersonality('unknown')).toBeNull();
    });

    it('returns base personality when no customization exists', async () => {
      const { result } = renderHook(() => usePersonality(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const personality = result.current.getPersonality('bestie');
      expect(personality).not.toBeNull();
      expect(personality?.id).toBe('bestie');
      expect(personality?.isCustomized).toBe(false);
    });

    it('merges customization with base personality', async () => {
      const mockSettings: UserPersonalitySettings = {
        customizations: {
          bestie: {
            personalityId: 'bestie',
            isCustomized: true,
            tone: { formality: 0.2, humor: 0.9 },
            updatedAt: Date.now(),
          },
        },
        lastSyncedAt: Date.now(),
        version: 1,
      };
      mockStorageService.load.mockResolvedValue(mockSettings);

      const { result } = renderHook(() => usePersonality(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const personality = result.current.getPersonality('bestie');
      expect(personality).not.toBeNull();
      expect(personality?.isCustomized).toBe(true);
      expect(personality?.mergedTone.formality).toBe(0.2);
      expect(personality?.mergedTone.humor).toBe(0.9);
      // Base values should be preserved for non-customized traits
      expect(personality?.mergedTone.energy).toBeDefined();
    });
  });

  describe('getAllPersonalities', () => {
    it('returns all universal personalities', async () => {
      const { result } = renderHook(() => usePersonality(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const all = result.current.getAllPersonalities();
      expect(all.length).toBe(UNIVERSAL_PERSONALITIES.length);
      expect(all.every(p => p.id)).toBe(true);
    });
  });

  describe('isCustomized', () => {
    it('returns false for non-customized personality', async () => {
      const { result } = renderHook(() => usePersonality(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isCustomized('bestie')).toBe(false);
    });

    it('returns true for customized personality', async () => {
      const mockSettings: UserPersonalitySettings = {
        customizations: {
          critic: {
            personalityId: 'critic',
            isCustomized: true,
            tone: { technicality: 0.9 },
            updatedAt: Date.now(),
          },
        },
        lastSyncedAt: Date.now(),
        version: 1,
      };
      mockStorageService.load.mockResolvedValue(mockSettings);

      const { result } = renderHook(() => usePersonality(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isCustomized('critic')).toBe(true);
    });
  });

  describe('updateTone', () => {
    it('updates tone and saves to storage', async () => {
      const { result } = renderHook(() => usePersonality(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateTone('bestie', { formality: 0.1 });
      });

      expect(mockStorageService.save).toHaveBeenCalled();
      expect(result.current.isCustomized('bestie')).toBe(true);

      const personality = result.current.getPersonality('bestie');
      expect(personality?.mergedTone.formality).toBe(0.1);
    });

    it('preserves existing tone values when updating', async () => {
      const mockSettings: UserPersonalitySettings = {
        customizations: {
          bestie: {
            personalityId: 'bestie',
            isCustomized: true,
            tone: { formality: 0.3, humor: 0.8 },
            updatedAt: Date.now(),
          },
        },
        lastSyncedAt: Date.now(),
        version: 1,
      };
      mockStorageService.load.mockResolvedValue(mockSettings);

      const { result } = renderHook(() => usePersonality(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateTone('bestie', { energy: 0.9 });
      });

      const personality = result.current.getPersonality('bestie');
      expect(personality?.mergedTone.formality).toBe(0.3); // Preserved
      expect(personality?.mergedTone.humor).toBe(0.8); // Preserved
      expect(personality?.mergedTone.energy).toBe(0.9); // Updated
    });
  });

  describe('updateDebateProfile', () => {
    it('updates debate profile and saves', async () => {
      const { result } = renderHook(() => usePersonality(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateDebateProfile('bestie', { aggression: 0.8 });
      });

      expect(mockStorageService.save).toHaveBeenCalled();
      const personality = result.current.getPersonality('bestie');
      expect(personality?.mergedDebateProfile.aggression).toBe(0.8);
    });
  });

  describe('updateModelParameters', () => {
    it('updates model parameters and saves', async () => {
      const { result } = renderHook(() => usePersonality(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateModelParameters('bestie', { temperature: 0.9 });
      });

      expect(mockStorageService.save).toHaveBeenCalled();
      const personality = result.current.getPersonality('bestie');
      expect(personality?.mergedModelParameters.temperature).toBe(0.9);
    });
  });

  describe('toggleCustomization', () => {
    it('sets isCustomized flag but does not affect isCustomized() when no data exists', async () => {
      // Note: isCustomized() now checks for actual data (tone, debateProfile, modelParameters)
      // not the isCustomized flag. This is because we moved to a Lock/Unlock pattern
      // where customization status is determined by whether values differ from defaults.
      const { result } = renderHook(() => usePersonality(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.toggleCustomization('bestie', true);
      });

      // isCustomized returns false because there's no actual data
      expect(result.current.isCustomized('bestie')).toBe(false);
      // But the customization entry exists with the flag set
      const customization = result.current.getCustomization('bestie');
      expect(customization).not.toBeNull();
      expect(customization?.isCustomized).toBe(true);
    });

    it('keeps data when flag is toggled off - isCustomized based on data presence', async () => {
      const mockSettings: UserPersonalitySettings = {
        customizations: {
          bestie: {
            personalityId: 'bestie',
            isCustomized: true,
            tone: { formality: 0.3 },
            updatedAt: Date.now(),
          },
        },
        lastSyncedAt: Date.now(),
        version: 1,
      };
      mockStorageService.load.mockResolvedValue(mockSettings);

      const { result } = renderHook(() => usePersonality(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.toggleCustomization('bestie', false);
      });

      // isCustomized() returns true because actual data exists (tone)
      // regardless of the isCustomized flag
      expect(result.current.isCustomized('bestie')).toBe(true);
      // Customization data should still exist
      expect(result.current.getCustomization('bestie')).not.toBeNull();
      expect(result.current.getCustomization('bestie')?.tone?.formality).toBe(0.3);
    });
  });

  describe('resetToDefaults', () => {
    it('removes customization for specific personality', async () => {
      const mockSettings: UserPersonalitySettings = {
        customizations: {
          bestie: {
            personalityId: 'bestie',
            isCustomized: true,
            tone: { formality: 0.3 },
            updatedAt: Date.now(),
          },
          critic: {
            personalityId: 'critic',
            isCustomized: true,
            tone: { technicality: 0.9 },
            updatedAt: Date.now(),
          },
        },
        lastSyncedAt: Date.now(),
        version: 1,
      };
      mockStorageService.load.mockResolvedValue(mockSettings);

      const { result } = renderHook(() => usePersonality(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.resetToDefaults('bestie');
      });

      expect(result.current.isCustomized('bestie')).toBe(false);
      expect(result.current.getCustomization('bestie')).toBeNull();
      // Other customizations should be preserved
      expect(result.current.isCustomized('critic')).toBe(true);
    });
  });

  describe('resetAll', () => {
    it('clears all customizations', async () => {
      const mockSettings: UserPersonalitySettings = {
        customizations: {
          bestie: {
            personalityId: 'bestie',
            isCustomized: true,
            tone: { formality: 0.3 },
            updatedAt: Date.now(),
          },
        },
        lastSyncedAt: Date.now(),
        version: 1,
      };
      mockStorageService.load.mockResolvedValue(mockSettings);

      const { result } = renderHook(() => usePersonality(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.resetAll();
      });

      expect(mockStorageService.resetAllCustomizations).toHaveBeenCalled();
      expect(result.current.isCustomized('bestie')).toBe(false);
    });
  });

  describe('reload', () => {
    it('reloads settings from storage', async () => {
      mockStorageService.load.mockResolvedValueOnce(null);

      const { result } = renderHook(() => usePersonality(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isCustomized('bestie')).toBe(false);

      // Update mock to return different data
      const newSettings: UserPersonalitySettings = {
        customizations: {
          bestie: {
            personalityId: 'bestie',
            isCustomized: true,
            tone: { formality: 0.1 },
            updatedAt: Date.now(),
          },
        },
        lastSyncedAt: Date.now(),
        version: 1,
      };
      mockStorageService.load.mockResolvedValueOnce(newSettings);

      await act(async () => {
        await result.current.reload();
      });

      expect(result.current.isCustomized('bestie')).toBe(true);
    });
  });
});

describe('usePersonalityById', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorageService.load.mockResolvedValue(null);
  });

  it('returns merged personality for valid id', async () => {
    const { result } = renderHook(() => usePersonalityById('bestie'), { wrapper });

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    expect(result.current?.id).toBe('bestie');
  });

  it('returns null for invalid id', async () => {
    const { result } = renderHook(() => usePersonalityById('nonexistent'), { wrapper });

    await waitFor(() => {
      // Give it time to settle
    });

    expect(result.current).toBeNull();
  });
});
