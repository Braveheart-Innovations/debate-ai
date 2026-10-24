/**
 * AISelectionPersistenceService - Persist composer AI selection (chat/compare
 * pills) to AsyncStorage so returning users find their lineup pre-seeded.
 *
 * Stored raw, non-destructively: entries whose provider currently lacks an API
 * key are hidden at read time (utils/aiSelection.validateAISelectionConfigs),
 * not deleted, so re-adding a key restores the pill.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AISelectionConfig } from '../../types/aiSelection';

export const AI_SELECTION_STORAGE_KEY = '@ai_selection_v1';
const STORAGE_KEY = AI_SELECTION_STORAGE_KEY;

export interface PersistedAISelection {
  chat: AISelectionConfig[];
  compare: AISelectionConfig[];
}

const sanitizeConfigList = (value: unknown): AISelectionConfig[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is AISelectionConfig => {
    if (!entry || typeof entry !== 'object') return false;
    const candidate = entry as Record<string, unknown>;
    return (
      typeof candidate.providerId === 'string' &&
      candidate.providerId.length > 0 &&
      typeof candidate.modelId === 'string' &&
      typeof candidate.personalityId === 'string'
    );
  });
};

export class AISelectionPersistenceService {
  static async load(): Promise<PersistedAISelection | null> {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEY);
      if (!json) return null;
      const data = JSON.parse(json) as Record<string, unknown>;
      return {
        chat: sanitizeConfigList(data.chat),
        compare: sanitizeConfigList(data.compare),
      };
    } catch (error) {
      console.warn('Failed to load persisted AI selection:', error);
      return null;
    }
  }

  static async save(selection: PersistedAISelection): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
    } catch (error) {
      console.warn('Failed to persist AI selection:', error);
    }
  }
}

export default AISelectionPersistenceService;
