/**
 * APIKeyWebViewModal
 *
 * Full-screen modal with embedded WebView for in-app API key acquisition.
 * Shows floating guidance card and "I've copied my key" button.
 */

import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  StatusBar,
  Linking,
} from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { Typography } from '@/components/molecules';
import { Box } from '@/components/atoms';
import { AIProvider, GuidanceStep } from '@/config/aiProviders';
import { FloatingGuidanceCard } from '@/components/molecules/api-config/FloatingGuidanceCard';
import * as Haptics from 'expo-haptics';

export interface APIKeyWebViewModalProps {
  visible: boolean;
  provider: AIProvider | null;
  onKeyObtained: () => void;
  onClose: () => void;
  onFallbackToBrowser: () => void;
}

export const APIKeyWebViewModal: React.FC<APIKeyWebViewModalProps> = ({
  visible,
  provider,
  onKeyObtained,
  onClose,
  onFallbackToBrowser,
}) => {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [currentUrl, setCurrentUrl] = useState('');
  const [hasError, setHasError] = useState(false);
  const [showGuidance, setShowGuidance] = useState(true);

  // Determine current guidance step based on URL
  const getCurrentStep = useCallback((): { step: GuidanceStep; index: number } | null => {
    if (!provider?.guidance?.steps) return null;

    const steps = provider.guidance.steps;

    // Find the most specific matching step
    for (let i = steps.length - 1; i >= 0; i--) {
      const step = steps[i];
      if (currentUrl.includes(step.urlPattern)) {
        return { step, index: i };
      }
    }

    // Default to first step
    return { step: steps[0], index: 0 };
  }, [provider, currentUrl]);

  const currentStepData = useMemo(() => getCurrentStep(), [getCurrentStep]);

  const handleNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    setCurrentUrl(navState.url);
    setIsLoading(navState.loading);
  }, []);

  const handleLoadEnd = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleError = useCallback(() => {
    setHasError(true);
    setIsLoading(false);
  }, []);

  const handleClose = useCallback(() => {
    Alert.alert(
      'Leave?',
      'Are you sure you want to close? You can always come back later.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: onClose,
        },
      ]
    );
  }, [onClose]);

  const handleKeyCopied = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onKeyObtained();
  }, [onKeyObtained]);

  const handleOpenInBrowser = useCallback(async () => {
    if (provider?.getKeyUrl) {
      await Linking.openURL(provider.getKeyUrl);
      onFallbackToBrowser();
    }
  }, [provider, onFallbackToBrowser]);

  const handleRetry = useCallback(() => {
    setHasError(false);
    setIsLoading(true);
    webViewRef.current?.reload();
  }, []);

  if (!provider) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
        }}
      >
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

        {/* Header */}
        <Box
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
            backgroundColor: theme.colors.background,
          }}
        >
          <TouchableOpacity
            onPress={handleClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Typography variant="body" style={{ color: theme.colors.primary[500] }}>
              Close
            </Typography>
          </TouchableOpacity>

          <Box style={{ flex: 1, alignItems: 'center', marginHorizontal: 16 }}>
            <Typography variant="caption" color="secondary" numberOfLines={1}>
              {provider.name}
            </Typography>
          </Box>

          <TouchableOpacity
            onPress={handleOpenInBrowser}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Typography variant="body" style={{ color: theme.colors.primary[500] }}>
              Open in Browser
            </Typography>
          </TouchableOpacity>
        </Box>

        {/* WebView Container */}
        <View style={{ flex: 1, position: 'relative' }}>
          {hasError ? (
            // Error state
            <Box
              style={{
                flex: 1,
                justifyContent: 'center',
                alignItems: 'center',
                padding: 32,
              }}
            >
              <Typography variant="title" style={{ marginBottom: 8, textAlign: 'center' }}>
                Unable to load page
              </Typography>
              <Typography
                variant="body"
                color="secondary"
                style={{ marginBottom: 24, textAlign: 'center' }}
              >
                The provider's website couldn't be loaded. Try opening in your browser instead.
              </Typography>
              <Box style={{ gap: 12 }}>
                <TouchableOpacity
                  onPress={handleRetry}
                  style={{
                    backgroundColor: theme.colors.primary[500],
                    paddingHorizontal: 24,
                    paddingVertical: 12,
                    borderRadius: 8,
                  }}
                >
                  <Typography variant="body" weight="medium" style={{ color: '#FFFFFF' }}>
                    Try Again
                  </Typography>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleOpenInBrowser}
                  style={{
                    paddingHorizontal: 24,
                    paddingVertical: 12,
                  }}
                >
                  <Typography variant="body" style={{ color: theme.colors.primary[500] }}>
                    Open in Browser
                  </Typography>
                </TouchableOpacity>
              </Box>
            </Box>
          ) : (
            <>
              <WebView
                ref={webViewRef}
                source={{ uri: provider.getKeyUrl }}
                onNavigationStateChange={handleNavigationStateChange}
                onLoadEnd={handleLoadEnd}
                onError={handleError}
                onHttpError={handleError}
                style={{ flex: 1 }}
                javaScriptEnabled
                domStorageEnabled
                sharedCookiesEnabled
                thirdPartyCookiesEnabled
                startInLoadingState
                renderLoading={() => (
                  <Box
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      justifyContent: 'center',
                      alignItems: 'center',
                      backgroundColor: theme.colors.background,
                    }}
                  >
                    <ActivityIndicator size="large" color={theme.colors.primary[500]} />
                    <Typography
                      variant="body"
                      color="secondary"
                      style={{ marginTop: 12 }}
                    >
                      Loading {provider.name}...
                    </Typography>
                  </Box>
                )}
                userAgent={Platform.select({
                  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
                  android: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                })}
              />

              {/* Floating Guidance Card */}
              {currentStepData && provider.guidance && (
                <FloatingGuidanceCard
                  step={currentStepData.step}
                  stepNumber={currentStepData.index + 1}
                  totalSteps={provider.guidance.steps.length}
                  visible={showGuidance && !isLoading}
                  onDismiss={() => setShowGuidance(false)}
                  position="top"
                />
              )}

              {/* Show guidance toggle if hidden */}
              {!showGuidance && !isLoading && (
                <TouchableOpacity
                  onPress={() => setShowGuidance(true)}
                  style={{
                    position: 'absolute',
                    top: 16,
                    right: 16,
                    backgroundColor: theme.colors.primary[500],
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 16,
                  }}
                >
                  <Typography variant="caption" style={{ color: '#FFFFFF' }}>
                    Show Guide
                  </Typography>
                </TouchableOpacity>
              )}

              {/* Loading indicator overlay */}
              {isLoading && (
                <Box
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 3,
                    backgroundColor: theme.colors.overlays.soft,
                  }}
                >
                  <Box
                    style={{
                      height: '100%',
                      width: '30%',
                      backgroundColor: theme.colors.primary[500],
                    }}
                  />
                </Box>
              )}
            </>
          )}
        </View>

        {/* Bottom action bar */}
        <Box
          style={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 16),
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.background,
          }}
        >
          <TouchableOpacity
            onPress={handleKeyCopied}
            style={{
              backgroundColor: theme.colors.success[500],
              paddingVertical: 16,
              borderRadius: 12,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Typography variant="body" weight="semibold" style={{ color: '#FFFFFF' }}>
              I've Copied My Key
            </Typography>
          </TouchableOpacity>
        </Box>
      </SafeAreaView>
    </Modal>
  );
};

export default APIKeyWebViewModal;
