/**
 * CitationWebViewModal
 * Full-screen modal with embedded WebView for viewing citation source pages.
 * Based on HelpWebViewModal pattern.
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
  Image,
  StyleSheet,
} from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { Typography } from '@/components/molecules';
import { Box } from '@/components/atoms';
import { extractDomain, getFaviconUrl, truncateText } from '@/utils/citationUtils';
import type { Citation } from '@/types';

export interface CitationWebViewModalProps {
  visible: boolean;
  citation: Citation | null;
  onClose: () => void;
  brandColor?: string;
}

export const CitationWebViewModal: React.FC<CitationWebViewModalProps> = ({
  visible,
  citation,
  onClose,
  brandColor,
}) => {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [faviconError, setFaviconError] = useState(false);

  // Reset state when citation changes
  React.useEffect(() => {
    if (citation) {
      setHasError(false);
      setIsLoading(true);
      setFaviconError(false);
    }
  }, [citation]);

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
    if (citation?.url) {
      await Linking.openURL(citation.url);
    }
  }, [citation?.url]);

  const handleRetry = useCallback(() => {
    setHasError(false);
    setIsLoading(true);
    webViewRef.current?.reload();
  }, []);

  if (!citation) {
    return null;
  }

  const domain = citation.domain || extractDomain(citation.url);
  const faviconUrl = getFaviconUrl(domain, 32);
  const accentColor = brandColor || theme.colors.primary[500];

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
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
            backgroundColor: theme.colors.background,
            gap: 12,
          }}
        >
          {/* Close Button */}
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.closeButton}
            accessibilityLabel="Close"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={24} color={theme.colors.text.primary} />
          </TouchableOpacity>

          {/* Citation Info */}
          <Box style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Favicon */}
            <View style={styles.faviconContainer}>
              {faviconError ? (
                <Ionicons
                  name="globe-outline"
                  size={20}
                  color={theme.colors.text.disabled}
                />
              ) : (
                <Image
                  source={{ uri: faviconUrl }}
                  style={styles.favicon}
                  onError={() => setFaviconError(true)}
                  resizeMode="contain"
                />
              )}
            </View>

            {/* Index Badge */}
            <View style={[styles.indexBadge, { backgroundColor: accentColor }]}>
              <Typography variant="caption" weight="bold" style={styles.indexText}>
                {citation.index}
              </Typography>
            </View>

            {/* Title/Domain */}
            <Box style={{ flex: 1 }}>
              <Typography
                variant="caption"
                weight="medium"
                numberOfLines={1}
                style={{ color: theme.colors.text.primary }}
              >
                {citation.title ? truncateText(citation.title, 40) : domain}
              </Typography>
              {citation.title && (
                <Typography variant="caption" color="secondary" numberOfLines={1}>
                  {domain}
                </Typography>
              )}
            </Box>
          </Box>

          {/* Open in Browser Button */}
          <TouchableOpacity
            onPress={handleOpenInBrowser}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Open in Browser"
            accessibilityRole="button"
          >
            <Ionicons name="open-outline" size={22} color={accentColor} />
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
              <Ionicons
                name="cloud-offline-outline"
                size={48}
                color={theme.colors.text.disabled}
                style={{ marginBottom: 16 }}
              />
              <Typography variant="title" style={{ marginBottom: 8, textAlign: 'center' }}>
                Unable to load page
              </Typography>
              <Typography
                variant="body"
                color="secondary"
                style={{ marginBottom: 24, textAlign: 'center' }}
              >
                The source page couldn't be loaded. Try opening in your browser instead.
              </Typography>
              <Box style={{ gap: 12 }}>
                <TouchableOpacity
                  onPress={handleRetry}
                  style={{
                    backgroundColor: accentColor,
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
                  <Typography variant="body" style={{ color: accentColor }}>
                    Open in Browser
                  </Typography>
                </TouchableOpacity>
              </Box>
            </Box>
          ) : (
            <>
              <WebView
                ref={webViewRef}
                source={{ uri: citation.url }}
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
                    <ActivityIndicator size="large" color={accentColor} />
                    <Typography
                      variant="body"
                      color="secondary"
                      style={{ marginTop: 12 }}
                    >
                      Loading source...
                    </Typography>
                  </Box>
                )}
                userAgent={Platform.select({
                  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
                  android:
                    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                })}
              />

              {/* Loading indicator bar */}
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
                      backgroundColor: accentColor,
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

const styles = StyleSheet.create({
  closeButton: {
    padding: 4,
  },
  faviconContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  favicon: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
  indexBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  indexText: {
    color: '#FFFFFF',
    fontSize: 11,
  },
});

export default CitationWebViewModal;
