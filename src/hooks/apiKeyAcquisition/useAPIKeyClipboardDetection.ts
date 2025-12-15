/**
 * useAPIKeyClipboardDetection
 *
 * Hook for detecting API keys in the clipboard when the app returns to foreground.
 * Automatically checks clipboard when app state changes to 'active'.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  ClipboardDetectionService,
  ProviderId,
  DetectionResult,
} from '@/services/apiKeyAcquisition';

interface UseAPIKeyClipboardDetectionOptions {
  /** The provider we're expecting a key for (optional). */
  expectedProviderId?: ProviderId;
  /** Whether to automatically check on app foreground. Default: true. */
  autoCheck?: boolean;
  /** Callback when a key is detected. */
  onKeyDetected?: (result: DetectionResult) => void;
}

interface UseAPIKeyClipboardDetectionReturn {
  /** The detected key result, if any. */
  detectedKey: DetectionResult | null;
  /** Whether a check is in progress. */
  isChecking: boolean;
  /** Manually trigger a clipboard check. */
  checkClipboard: () => Promise<DetectionResult | null>;
  /** Clear the detected key state. */
  clearDetectedKey: () => void;
  /** Whether clipboard detection is supported. */
  isSupported: boolean;
}

export function useAPIKeyClipboardDetection(
  options: UseAPIKeyClipboardDetectionOptions = {}
): UseAPIKeyClipboardDetectionReturn {
  const { expectedProviderId, autoCheck = true, onKeyDetected } = options;

  const [detectedKey, setDetectedKey] = useState<DetectionResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  // Keep track of the last clipboard content to avoid duplicate detections
  const lastClipboardContent = useRef<string | null>(null);

  // Track if we've already shown a detection for this session
  const hasShownDetection = useRef(false);

  const checkClipboard = useCallback(async (): Promise<DetectionResult | null> => {
    setIsChecking(true);
    try {
      const result = await ClipboardDetectionService.checkClipboard(expectedProviderId);

      // Only update if we detected something new
      if (
        result.detected &&
        result.content &&
        result.content !== lastClipboardContent.current
      ) {
        lastClipboardContent.current = result.content;
        setDetectedKey(result);
        onKeyDetected?.(result);
        return result;
      }

      return null;
    } finally {
      setIsChecking(false);
    }
  }, [expectedProviderId, onKeyDetected]);

  const clearDetectedKey = useCallback(() => {
    setDetectedKey(null);
    hasShownDetection.current = false;
  }, []);

  // Listen for app state changes
  useEffect(() => {
    if (!autoCheck) return;

    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      // Check clipboard when app comes to foreground
      if (nextAppState === 'active' && !hasShownDetection.current) {
        const result = await checkClipboard();
        if (result?.detected) {
          hasShownDetection.current = true;
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Also check immediately on mount if app is already active
    if (AppState.currentState === 'active') {
      checkClipboard();
    }

    return () => {
      subscription.remove();
    };
  }, [autoCheck, checkClipboard]);

  // Reset detection flag when expected provider changes
  useEffect(() => {
    hasShownDetection.current = false;
    lastClipboardContent.current = null;
  }, [expectedProviderId]);

  return {
    detectedKey,
    isChecking,
    checkClipboard,
    clearDetectedKey,
    isSupported: true, // expo-clipboard is always available
  };
}
