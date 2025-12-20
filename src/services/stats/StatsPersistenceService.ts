/**
 * StatsPersistenceService - Persist debate stats to AsyncStorage
 * Ensures stats survive app reloads for cumulative tracking
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DebateStats, DebateRound } from '../../store/debateStatsSlice';

export interface PersistedStatsData {
  stats: DebateStats;
  history: DebateRound[];
}

class StatsPersistenceService {
  private static instance: StatsPersistenceService;
  private static readonly STORAGE_KEY = '@debate_stats';

  static getInstance(): StatsPersistenceService {
    if (!StatsPersistenceService.instance) {
      StatsPersistenceService.instance = new StatsPersistenceService();
    }
    return StatsPersistenceService.instance;
  }

  /**
   * Save debate stats to AsyncStorage
   */
  async saveStats(stats: DebateStats, history: DebateRound[]): Promise<void> {
    try {
      const data: PersistedStatsData = { stats, history };
      const jsonData = JSON.stringify(data);
      await AsyncStorage.setItem(StatsPersistenceService.STORAGE_KEY, jsonData);
    } catch (error) {
      console.error('Failed to save debate stats:', error);
      // Don't throw - stats persistence failure shouldn't break the app
    }
  }

  /**
   * Load debate stats from AsyncStorage
   */
  async loadStats(): Promise<PersistedStatsData | null> {
    try {
      const jsonData = await AsyncStorage.getItem(StatsPersistenceService.STORAGE_KEY);
      if (jsonData) {
        return JSON.parse(jsonData) as PersistedStatsData;
      }
      return null;
    } catch (error) {
      console.error('Failed to load debate stats:', error);
      return null;
    }
  }

  /**
   * Clear all debate stats
   */
  async clearStats(): Promise<void> {
    try {
      await AsyncStorage.removeItem(StatsPersistenceService.STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear debate stats:', error);
    }
  }
}

export default StatsPersistenceService.getInstance();
