/**
 * HelpWebViewModal
 *
 * Full-screen modal with embedded WebView for detailed help content.
 * Follows the APIKeyWebViewModal pattern.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Linking,
  Platform,
} from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { Typography } from '@/components/molecules';
import { Box } from '@/components/atoms';

export interface HelpWebViewModalProps {
  visible: boolean;
  url: string | null;
  title?: string;
  onClose: () => void;
}

export const HelpWebViewModal: React.FC<HelpWebViewModalProps> = ({
  visible,
  url,
  title = 'Help',
  onClose,
}) => {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const handleNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    setIsLoading(navState.loading);
  }, []);

  const handleLoadEnd = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleError = useCallback(() => {
    setHasError(true);
    setIsLoading(false);
  }, []);

  const handleOpenInBrowser = useCallback(async () => {
    if (url) {
      await Linking.openURL(url);
    }
  }, [url]);

  const handleRetry = useCallback(() => {
    setHasError(false);
    setIsLoading(true);
    webViewRef.current?.reload();
  }, []);

  if (!url) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
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
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Typography variant="body" style={{ color: theme.colors.primary[500] }}>
              Close
            </Typography>
          </TouchableOpacity>

          <Box style={{ flex: 1, alignItems: 'center', marginHorizontal: 16 }}>
            <Typography variant="caption" color="secondary" numberOfLines={1}>
              {title}
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
                The help page couldn't be loaded. Try opening in your browser instead.
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
                source={{ uri: url }}
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
                      Loading help content...
                    </Typography>
                  </Box>
                )}
                userAgent={Platform.select({
                  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
                  android:
                    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                })}
              />

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

        {/* Bottom padding for safe area */}
        <View
          style={{
            height: insets.bottom,
            backgroundColor: theme.colors.background,
          }}
        />
      </SafeAreaView>
    </Modal>
  );
};

export default HelpWebViewModal;
