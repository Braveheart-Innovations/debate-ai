/**
 * PersonalityContext
 * Provides personality customization state and methods throughout the app
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import {
  PersonalityCustomization,
  UserPersonalitySettings,
  PersonalityTone,
  PersonalityDebateProfile,
  PersonalityModelParameters,
  EMPTY_PERSONALITY_SETTINGS,
  DEFAULT_TONE,
  DEFAULT_DEBATE_PROFILE,
  DEFAULT_MODEL_PARAMETERS,
} from '@/types/personality';
import {
  PersonalityOption,
  UNIVERSAL_PERSONALITIES,
  getPersonality,
} from '@/config/personalities';
import { PersonalityStorageService } from '@/services/personality';

/**
 * Merged personality combines base personality with user customizations
 */
export interface MergedPersonality extends PersonalityOption {
  isCustomized: boolean;
  mergedTone: PersonalityTone;
  mergedDebateProfile: PersonalityDebateProfile;
  mergedModelParameters: PersonalityModelParameters;
}

interface PersonalityContextType {
  // State
  isLoading: boolean;
  settings: UserPersonalitySettings;

  // Retrieval
  getPersonality: (id: string) => MergedPersonality | null;
  getAllPersonalities: () => MergedPersonality[];

  // Customization status
  isCustomized: (id: string) => boolean;
  getCustomization: (id: string) => PersonalityCustomization | null;

  // Customization actions
  updateCustomization: (
    id: string,
    changes: Partial<Omit<PersonalityCustomization, 'personalityId' | 'updatedAt'>>
  ) => Promise<void>;
  updateTone: (id: string, tone: Partial<PersonalityTone>) => Promise<void>;
  updateDebateProfile: (id: string, profile: Partial<PersonalityDebateProfile>) => Promise<void>;
  updateModelParameters: (id: string, params: Partial<PersonalityModelParameters>) => Promise<void>;
  toggleCustomization: (id: string, enabled: boolean) => Promise<void>;
  resetToDefaults: (id: string) => Promise<void>;
  resetAll: () => Promise<void>;

  // Force reload from storage
  reload: () => Promise<void>;
}

const PersonalityContext = createContext<PersonalityContextType | undefined>(undefined);

interface PersonalityProviderProps {
  children: ReactNode;
}

export const PersonalityProvider: React.FC<PersonalityProviderProps> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState<UserPersonalitySettings>(EMPTY_PERSONALITY_SETTINGS);

  // Load settings from storage on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const stored = await PersonalityStorageService.load();
      if (stored) {
        setSettings(stored);
      }
    } catch (error) {
      console.error('Failed to load personality settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const reload = useCallback(async () => {
    await loadSettings();
  }, []);

  // Get customization for a personality
  const getCustomization = useCallback(
    (id: string): PersonalityCustomization | null => {
      return settings.customizations[id] || null;
    },
    [settings]
  );

  // Check if personality is customized
  const isCustomized = useCallback(
    (id: string): boolean => {
      const customization = settings.customizations[id];
      return customization?.isCustomized ?? false;
    },
    [settings]
  );

  // Get merged personality (base + customizations)
  const getMergedPersonality = useCallback(
    (id: string): MergedPersonality | null => {
      const base = getPersonality(id);
      if (!base) return null;

      const customization = settings.customizations[id];
      const hasCustomization = customization?.isCustomized ?? false;

      // Merge tone: base defaults → personality defaults → customization
      const baseTone: PersonalityTone = {
        ...DEFAULT_TONE,
        ...(base.tone || {}),
      };
      const mergedTone: PersonalityTone = hasCustomization && customization?.tone
        ? { ...baseTone, ...customization.tone }
        : baseTone;

      // Merge debate profile
      const baseDebateProfile: PersonalityDebateProfile = {
        ...DEFAULT_DEBATE_PROFILE,
        ...(base.debateProfile || {}),
      };
      const mergedDebateProfile: PersonalityDebateProfile = hasCustomization && customization?.debateProfile
        ? { ...baseDebateProfile, ...customization.debateProfile }
        : baseDebateProfile;

      // Merge model parameters
      const baseModelParams: PersonalityModelParameters = {
        ...DEFAULT_MODEL_PARAMETERS,
        ...(base.modelParameters || {}),
      };
      const mergedModelParameters: PersonalityModelParameters = hasCustomization && customization?.modelParameters
        ? { ...baseModelParams, ...customization.modelParameters }
        : baseModelParams;

      return {
        ...base,
        isCustomized: hasCustomization,
        mergedTone,
        mergedDebateProfile,
        mergedModelParameters,
      };
    },
    [settings]
  );

  // Get all personalities with customizations merged
  const getAllPersonalities = useCallback((): MergedPersonality[] => {
    return UNIVERSAL_PERSONALITIES.map(p => getMergedPersonality(p.id)).filter(
      (p): p is MergedPersonality => p !== null
    );
  }, [getMergedPersonality]);

  // Save settings to storage
  const saveSettings = async (newSettings: UserPersonalitySettings) => {
    setSettings(newSettings);
    await PersonalityStorageService.save(newSettings);
  };

  // Update customization for a personality
  const updateCustomization = useCallback(
    async (
      id: string,
      changes: Partial<Omit<PersonalityCustomization, 'personalityId' | 'updatedAt'>>
    ) => {
      const existing = settings.customizations[id];
      const newCustomization: PersonalityCustomization = {
        ...existing,
        isCustomized: true, // Default to true, but can be overridden by changes
        ...changes,
        personalityId: id,
        updatedAt: Date.now(),
      };

      const newSettings: UserPersonalitySettings = {
        ...settings,
        customizations: {
          ...settings.customizations,
          [id]: newCustomization,
        },
      };

      await saveSettings(newSettings);
    },
    [settings]
  );

  // Update tone for a personality
  const updateTone = useCallback(
    async (id: string, tone: Partial<PersonalityTone>) => {
      const existing = settings.customizations[id];
      await updateCustomization(id, {
        tone: { ...(existing?.tone || {}), ...tone },
      });
    },
    [settings, updateCustomization]
  );

  // Update debate profile for a personality
  const updateDebateProfile = useCallback(
    async (id: string, profile: Partial<PersonalityDebateProfile>) => {
      const existing = settings.customizations[id];
      await updateCustomization(id, {
        debateProfile: { ...(existing?.debateProfile || {}), ...profile },
      });
    },
    [settings, updateCustomization]
  );

  // Update model parameters for a personality
  const updateModelParameters = useCallback(
    async (id: string, params: Partial<PersonalityModelParameters>) => {
      const existing = settings.customizations[id];
      await updateCustomization(id, {
        modelParameters: { ...(existing?.modelParameters || {}), ...params },
      });
    },
    [settings, updateCustomization]
  );

  // Toggle customization on/off
  const toggleCustomization = useCallback(
    async (id: string, enabled: boolean) => {
      if (!enabled) {
        // Disable: keep the customization data but mark as not customized
        await updateCustomization(id, { isCustomized: false });
      } else {
        // Enable: mark as customized
        await updateCustomization(id, { isCustomized: true });
      }
    },
    [updateCustomization]
  );

  // Reset a single personality to defaults
  const resetToDefaults = useCallback(
    async (id: string) => {
      const newSettings: UserPersonalitySettings = {
        ...settings,
        customizations: { ...settings.customizations },
      };
      delete newSettings.customizations[id];
      await saveSettings(newSettings);
    },
    [settings]
  );

  // Reset all customizations
  const resetAll = useCallback(async () => {
    await PersonalityStorageService.resetAllCustomizations();
    setSettings(EMPTY_PERSONALITY_SETTINGS);
  }, []);

  const value: PersonalityContextType = useMemo(
    () => ({
      isLoading,
      settings,
      getPersonality: getMergedPersonality,
      getAllPersonalities,
      isCustomized,
      getCustomization,
      updateCustomization,
      updateTone,
      updateDebateProfile,
      updateModelParameters,
      toggleCustomization,
      resetToDefaults,
      resetAll,
      reload,
    }),
    [
      isLoading,
      settings,
      getMergedPersonality,
      getAllPersonalities,
      isCustomized,
      getCustomization,
      updateCustomization,
      updateTone,
      updateDebateProfile,
      updateModelParameters,
      toggleCustomization,
      resetToDefaults,
      resetAll,
      reload,
    ]
  );

  return (
    <PersonalityContext.Provider value={value}>
      {children}
    </PersonalityContext.Provider>
  );
};

/**
 * Hook to access personality customization context
 */
export const usePersonality = (): PersonalityContextType => {
  const context = useContext(PersonalityContext);
  if (context === undefined) {
    throw new Error('usePersonality must be used within a PersonalityProvider');
  }
  return context;
};

/**
 * Hook to get a specific merged personality
 */
export const usePersonalityById = (id: string): MergedPersonality | null => {
  const { getPersonality } = usePersonality();
  return useMemo(() => getPersonality(id), [getPersonality, id]);
};
