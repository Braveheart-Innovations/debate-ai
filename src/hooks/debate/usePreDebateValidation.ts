/**
 * usePreDebateValidation Hook
 * Validates that user has configured enough AIs before entering debate
 * Handles navigation guards and setup flow
 */

import { useMemo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { Alert } from 'react-native';
import { RootState } from '../../store';
import { useFeatureAccess } from '../useFeatureAccess';

interface NavigationProp {
  navigate: (screen: string, params?: Record<string, unknown>) => void;
}

export interface UsePreDebateValidation {
  isReady: boolean;
  configuredCount: number;
  checkReadiness: () => boolean;
}

export const usePreDebateValidation = (navigation: NavigationProp): UsePreDebateValidation => {
  const apiKeys = useSelector((state: RootState) => state.settings.apiKeys);
  const { isDemo } = useFeatureAccess();

  const configuredCount = useMemo(() => {
    return Object.values(apiKeys).filter(Boolean).length;
  }, [apiKeys]);

  const checkReadiness = useCallback(() => {
    // Demo mode uses pre-recorded debates, no API keys needed
    if (isDemo) return true;

    if (configuredCount < 2) {
      Alert.alert(
        "Set Up Your AIs First",
        "You need at least 2 AIs configured to start a debate. Would you like to set them up now?",
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => {
              // Navigate back to Home if they cancel
              navigation.navigate('MainTabs', { screen: 'Home' });
            }
          },
          {
            text: "Set Up AIs",
            onPress: () => {
              // Navigate to API configuration
              navigation.navigate('APIConfig');
            }
          }
        ]
      );
      return false;
    }
    return true;
  }, [isDemo, configuredCount, navigation]);

  return {
    isReady: isDemo || configuredCount >= 2,
    configuredCount,
    checkReadiness,
  };
};