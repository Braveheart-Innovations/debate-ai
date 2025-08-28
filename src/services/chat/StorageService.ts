import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatSession, Message } from '../../types';

export interface StorageKeys {
  SESSION_INDEX: 'sessionIndex';
  SESSION_PREFIX: 'chatSession_';
  USER_PREFERENCES: 'userPreferences';
}

export interface SessionIndexEntry {
  id: string;
  createdAt: number;
  lastMessageAt: number;
  messageCount: number;
  participants: string[];
}

export interface SessionIndex {
  sessions: SessionIndexEntry[];
  lastUpdated: number;
}

export interface UserPreferences {
  autoSave: boolean;
  maxStoredSessions: number;
  retentionDays: number;
}

export class StorageService {
  private static readonly STORAGE_KEYS: StorageKeys = {
    SESSION_INDEX: 'sessionIndex',
    SESSION_PREFIX: 'chatSession_',
    USER_PREFERENCES: 'userPreferences'
  };

  /**
   * Get the storage key for a specific session
   */
  private static getSessionKey(sessionId: string): string {
    return `${this.STORAGE_KEYS.SESSION_PREFIX}${sessionId}`;
  }

  /**
   * Get or create the session index
   */
  private static async getSessionIndex(): Promise<SessionIndex> {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEYS.SESSION_INDEX);
      if (stored) {
        return JSON.parse(stored);
      }
      return { sessions: [], lastUpdated: Date.now() };
    } catch (error) {
      console.error('Error getting session index:', error);
      return { sessions: [], lastUpdated: Date.now() };
    }
  }

  /**
   * Update the session index
   */
  private static async updateSessionIndex(index: SessionIndex): Promise<void> {
    try {
      index.lastUpdated = Date.now();
      await AsyncStorage.setItem(
        this.STORAGE_KEYS.SESSION_INDEX,
        JSON.stringify(index)
      );
    } catch (error) {
      console.error('Error updating session index:', error);
    }
  }

  /**
   * Saves a chat session to AsyncStorage (ONLY the specific session)
   */
  static async saveSession(session: ChatSession): Promise<void> {
    try {
      // Critical check: Prevent saving Redux debate sessions
      if (session.sessionType === 'debate' && !session.id.startsWith('debate_')) {
        // Skip saving Redux debate sessions - they should only be saved via DebateOrchestrator
        return;
      }
      
      // Save the individual session
      const sessionKey = this.getSessionKey(session.id);
      await AsyncStorage.setItem(sessionKey, JSON.stringify(session));

      // Update the index
      const index = await this.getSessionIndex();
      const indexEntry: SessionIndexEntry = {
        id: session.id,
        createdAt: session.createdAt,
        lastMessageAt: session.lastMessageAt || session.createdAt,
        messageCount: session.messages.length,
        participants: session.selectedAIs.map(ai => ai.name)
      };

      // Update or add to index
      const existingIndex = index.sessions.findIndex(s => s.id === session.id);
      if (existingIndex >= 0) {
        index.sessions[existingIndex] = indexEntry;
      } else {
        index.sessions.push(indexEntry);
      }

      // Sort by most recent first
      index.sessions.sort((a, b) => b.lastMessageAt - a.lastMessageAt);

      await this.updateSessionIndex(index);

    } catch (error) {
      console.error('Error saving session:', error);
      throw new Error('Failed to save session to storage');
    }
  }

  /**
   * Loads a specific chat session from AsyncStorage (direct access)
   */
  static async loadSession(sessionId: string): Promise<ChatSession | null> {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      const stored = await AsyncStorage.getItem(sessionKey);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Error loading session:', error);
      return null;
    }
  }

  /**
   * Gets all chat sessions from AsyncStorage
   */
  static async getAllSessions(): Promise<ChatSession[]> {
    try {
      const index = await this.getSessionIndex();
      
      // Load all sessions in parallel
      const sessionPromises = index.sessions.map(entry => 
        this.loadSession(entry.id)
      );
      
      const sessions = await Promise.all(sessionPromises);
      
      // Filter out any null values and return
      const validSessions = sessions.filter((s): s is ChatSession => s !== null);
      
      return validSessions;
    } catch (error) {
      console.error('Error getting all sessions:', error);
      return [];
    }
  }

  /**
   * Deletes a specific session
   */
  static async deleteSession(sessionId: string): Promise<void> {
    try {
      // Delete the session data
      const sessionKey = this.getSessionKey(sessionId);
      await AsyncStorage.removeItem(sessionKey);

      // Update the index
      const index = await this.getSessionIndex();
      index.sessions = index.sessions.filter(s => s.id !== sessionId);
      await this.updateSessionIndex(index);

    } catch (error) {
      console.error('Error deleting session:', error);
      throw new Error('Failed to delete session from storage');
    }
  }

  /**
   * Merges a session with existing data (for updating)
   */
  static async mergeSession(
    sessionId: string, 
    updates: Partial<ChatSession>
  ): Promise<ChatSession | null> {
    try {
      const existingSession = await this.loadSession(sessionId);
      if (!existingSession) {
        return null;
      }

      const mergedSession: ChatSession = {
        ...existingSession,
        ...updates,
        // Ensure messages are properly merged
        messages: updates.messages || existingSession.messages,
        // Always update timestamp
        lastMessageAt: Date.now()
      };

      await this.saveSession(mergedSession);
      return mergedSession;
    } catch (error) {
      console.error('Error merging session:', error);
      return null;
    }
  }

  /**
   * Adds a message to an existing session
   */
  static async addMessageToSession(
    sessionId: string, 
    message: Message
  ): Promise<void> {
    try {
      const session = await this.loadSession(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const updatedMessages = [...session.messages, message];
      
      await this.mergeSession(sessionId, {
        messages: updatedMessages,
        lastMessageAt: message.timestamp
      });
    } catch (error) {
      console.error('Error adding message to session:', error);
      throw error;
    }
  }

  /**
   * Gets session metadata for quick access (from index)
   */
  static async getSessionMetadata(): Promise<SessionIndexEntry[]> {
    try {
      const index = await this.getSessionIndex();
      return index.sessions;
    } catch (error) {
      console.error('Error getting session metadata:', error);
      return [];
    }
  }

  /**
   * Clears all stored sessions (use with caution)
   */
  static async clearAllSessions(): Promise<void> {
    try {
      // Get all keys
      const allKeys = await AsyncStorage.getAllKeys();
      
      // Filter for session keys and index
      const keysToRemove = allKeys.filter(key => 
        key.startsWith(this.STORAGE_KEYS.SESSION_PREFIX) || 
        key === this.STORAGE_KEYS.SESSION_INDEX ||
        key === 'chatSessions' || // Remove old format
        key === 'sessionMetadata' // Remove old metadata
      );
      
      // Remove all session-related keys
      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
      }
      
      // Create empty index
      await this.updateSessionIndex({ sessions: [], lastUpdated: Date.now() });
    } catch (error) {
      console.error('Error clearing all sessions:', error);
      throw new Error('Failed to clear sessions from storage');
    }
  }

  /**
   * Gets storage statistics
   */
  static async getStorageStats(): Promise<{
    totalSessions: number;
    totalMessages: number;
    oldestSession: number | null;
    newestSession: number | null;
    storageSize: number;
  }> {
    try {
      const sessions = await this.getAllSessions();
      
      const totalMessages = sessions.reduce((sum, s) => sum + s.messages.length, 0);
      
      const timestamps = sessions.map(s => s.createdAt);
      const oldestSession = timestamps.length > 0 ? Math.min(...timestamps) : null;
      const newestSession = timestamps.length > 0 ? Math.max(...timestamps) : null;

      // Estimate storage size (rough calculation)
      const dataString = JSON.stringify(sessions);
      const storageSize = new Blob([dataString]).size;

      return {
        totalSessions: sessions.length,
        totalMessages,
        oldestSession,
        newestSession,
        storageSize
      };
    } catch (error) {
      console.error('Error getting storage stats:', error);
      return {
        totalSessions: 0,
        totalMessages: 0,
        oldestSession: null,
        newestSession: null,
        storageSize: 0
      };
    }
  }

  /**
   * Cleans up old sessions based on retention policy
   */
  static async cleanupOldSessions(retentionDays: number = 30): Promise<number> {
    try {
      const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
      const index = await this.getSessionIndex();
      
      // Find sessions to remove
      const sessionsToRemove = index.sessions.filter(session => {
        const lastActivity = session.lastMessageAt || session.createdAt;
        return lastActivity < cutoffTime;
      });

      // Remove old sessions
      for (const session of sessionsToRemove) {
        await this.deleteSession(session.id);
      }

      return sessionsToRemove.length;
    } catch (error) {
      console.error('Error cleaning up old sessions:', error);
      return 0;
    }
  }

  /**
   * Migrate from old storage format to new format
   */
  static async migrateFromOldFormat(): Promise<number> {
    try {
      // Check if old format exists
      const oldSessions = await AsyncStorage.getItem('chatSessions');
      if (!oldSessions) {
        return 0;
      }

      const sessions: ChatSession[] = JSON.parse(oldSessions);
      
      // Save each session in new format
      for (const session of sessions) {
        await this.saveSession(session);
      }

      // Clean up old format
      await AsyncStorage.removeItem('chatSessions');
      await AsyncStorage.removeItem('sessionMetadata');

      return sessions.length;
    } catch (error) {
      console.error('Error migrating from old format:', error);
      return 0;
    }
  }

  /**
   * Exports session data for backup
   */
  static async exportSessions(): Promise<string> {
    try {
      const sessions = await this.getAllSessions();
      const index = await this.getSessionIndex();
      
      const exportData = {
        sessions,
        index,
        exportedAt: Date.now(),
        version: '2.0'
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('Error exporting sessions:', error);
      throw new Error('Failed to export session data');
    }
  }

  /**
   * Imports session data from backup
   */
  static async importSessions(exportDataString: string): Promise<number> {
    try {
      const exportData = JSON.parse(exportDataString);
      
      if (!exportData.sessions || !Array.isArray(exportData.sessions)) {
        throw new Error('Invalid export data format');
      }

      // Save each session
      for (const session of exportData.sessions) {
        await this.saveSession(session);
      }

      return exportData.sessions.length;
    } catch (error) {
      console.error('Error importing sessions:', error);
      throw new Error('Failed to import session data');
    }
  }

  /**
   * Get sessions filtered by type
   */
  static async getSessionsByType(type: 'chat' | 'comparison' | 'debate'): Promise<ChatSession[]> {
    const sessions = await this.getAllSessions();
    
    // Only return sessions that explicitly match the requested type
    const filtered = sessions.filter(session => session.sessionType === type);
    
    return filtered;
  }

  /**
   * Get storage counts by type
   */
  static async getStorageCounts(): Promise<{ chat: number; comparison: number; debate: number }> {
    const sessions = await this.getAllSessions();
    return sessions.reduce((counts, session) => {
      // Only count sessions with explicit sessionType
      if (session.sessionType) {
        counts[session.sessionType] = (counts[session.sessionType] || 0) + 1;
      }
      return counts;
    }, { chat: 0, comparison: 0, debate: 0 });
  }

  /**
   * Enforce storage limits for free tier users
   * Should be called BEFORE saving a new session to check if we need to make room
   */
  static async enforceStorageLimits(
    type: 'chat' | 'comparison' | 'debate',
    isPremium: boolean,
    isNewSession: boolean = true
  ): Promise<{ deleted: boolean; deletedId?: string }> {
    // No limits for premium users
    if (isPremium) {
      return { deleted: false };
    }

    const LIMITS = { chat: 3, comparison: 3, debate: 3 };
    const sessions = await this.getSessionsByType(type);
    
    // If we're adding a new session and already at limit, delete the oldest
    if (isNewSession && sessions.length >= LIMITS[type]) {
      // Sort by creation time (oldest first)
      const sorted = sessions.sort((a, b) => a.createdAt - b.createdAt);
      const oldestSession = sorted[0];
      
      // CRITICAL CHECK: Make sure we're deleting the right type
      if (oldestSession.sessionType !== type) {
        // Don't delete wrong type!
        return { deleted: false };
      }
      
      // Delete the oldest session to make room for the new one
      await this.deleteSession(oldestSession.id);
      
      return { deleted: true, deletedId: oldestSession.id };
    }

    return { deleted: false };
  }
}