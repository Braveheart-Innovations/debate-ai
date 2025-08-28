import { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { StorageService } from '../../services/chat';
import { ChatSession } from '../../types';
import { UseSessionHistoryReturn, SessionValidationResult } from '../../types/history';

export const useSessionHistory = (): UseSessionHistoryReturn => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [validationResult] = useState<SessionValidationResult | undefined>(undefined);

  // Get subscription info from Redux store
  const subscription = useSelector(
    (state: RootState) => state.user.currentUser?.subscription || 'free'
  );

  // Free users can have 3 of EACH type (9 total), not 3 total
  const maxSessions = subscription === 'free' ? 9 : Infinity;

  /**
   * Load sessions from storage
   */
  const loadSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Simple direct load with timeout
      
      // Add timeout to prevent infinite hanging
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Loading sessions timed out after 3 seconds')), 3000)
      );
      
      let allSessions: ChatSession[] = [];
      try {
        allSessions = await Promise.race([
          StorageService.getAllSessions(),
          timeoutPromise
        ]) as ChatSession[];
      } catch {
        allSessions = [];
      }

      // Don't limit here - storage already enforces per-type limits
      // Free users get 3 chats + 3 comparisons + 3 debates = 9 total possible
      const limitedSessions = allSessions;

      setSessions(limitedSessions);

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load sessions');
      setError(error);
      console.error('Error loading chat history:', error);
      // Set empty array on error to prevent crashes
      setSessions([]);
    } finally {
      // Always set loading to false
      setIsLoading(false);
    }
  }, [maxSessions, subscription]);

  /**
   * Refresh sessions (public API for manual refresh)
   */
  const refresh = useCallback(async () => {
    await loadSessions();
  }, [loadSessions]);

  /**
   * Clear all session history
   */
  const clearHistory = useCallback(async () => {
    try {
      setError(null);
      await StorageService.clearAllSessions();
      setSessions([]);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to clear history');
      setError(error);
      console.error('Error clearing history:', error);
      throw error;
    }
  }, []);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  return {
    sessions,
    isLoading,
    error,
    refresh,
    clearHistory,
    validationResult
  };
};