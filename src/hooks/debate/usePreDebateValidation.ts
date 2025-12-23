/**
 * usePreDebateValidation Hook
 * Provides validation state for debate screen (no side effects).
 * UI shows inline warning card when not ready; Alerts only on explicit user actions.
 */

import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { useFeatureAccess } from '../useFeatureAccess';

export interface UsePreDebateValidation {
  isReady: boolean;
  configuredCount: number;
  isDemo: boolean;
}

export const usePreDebateValidation = (): UsePreDebateValidation => {
  const apiKeys = useSelector((state: RootState) => state.settings.apiKeys);
  const { isDemo } = useFeatureAccess();

  const configuredCount = useMemo(() => {
    return Object.values(apiKeys).filter(Boolean).length;
  }, [apiKeys]);

  return {
    isReady: isDemo || configuredCount >= 2,
    configuredCount,
    isDemo,
  };
};