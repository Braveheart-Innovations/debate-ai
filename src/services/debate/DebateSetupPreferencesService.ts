/**
 * DebateSetupPreferencesService - Persist the Debate setup choices that carry
 * over between debates (today: Speech length) to AsyncStorage, so setup opens
 * with the user's last choice. App start hydrates it into the settings slice.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DebateSpeechLength } from '../../types';
import { isDebateSpeechLength } from './debateSpeechLength';

const STORAGE_KEY = '@debate_setup_preferences_v1';

export interface DebateSetupPreferences {
  speechLength?: DebateSpeechLength;
}

export class DebateSetupPreferencesService {
  static async load(): Promise<DebateSetupPreferences | null> {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEY);
      if (!json) return null;
      const data: unknown = JSON.parse(json);
      if (!data || typeof data !== 'object' || !('speechLength' in data)) return {};
      return isDebateSpeechLength(data.speechLength) ? { speechLength: data.speechLength } : {};
    } catch (error) {
      console.warn('Failed to load Debate setup preferences:', error);
      return null;
    }
  }

  static async save(preferences: DebateSetupPreferences): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      console.warn('Failed to persist Debate setup preferences:', error);
    }
  }
}

export default DebateSetupPreferencesService;
