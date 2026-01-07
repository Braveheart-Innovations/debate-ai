/**
 * CitationPreviewTooltip
 * Floating tooltip that appears when user taps an inline [n] citation reference
 * Shows citation details and allows opening the source in WebView or browser
 */

import React, { useCallback } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Image,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '../common/Typography';
import { useTheme } from '@/theme';
import { extractDomain, getFaviconUrl, truncateText } from '@/utils/citationUtils';
import type { Citation } from '@/types';

export interface CitationPreviewTooltipProps {
  citation: Citation | null;
  visible: boolean;
  position: { x: number; y: number };
  onDismiss: () => void;
  onOpenSource: () => void;
  brandColor?: string;
}

const TOOLTIP_WIDTH = 280;
const TOOLTIP_MIN_HEIGHT = 100;
const POINTER_SIZE = 8;
const SCREEN_PADDING = 16;

export const CitationPreviewTooltip: React.FC<CitationPreviewTooltipProps> = ({
  citation,
  visible,
  position,
  onDismiss,
  onOpenSource,
  brandColor,
}) => {
  const { theme, isDark } = useTheme();
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;

  const [faviconError, setFaviconError] = React.useState(false);

  // Reset favicon error when citation changes
  React.useEffect(() => {
    setFaviconError(false);
  }, [citation?.url]);

  // Calculate position to keep tooltip within bounds
  const getPosition = useCallback(() => {
    let tooltipX = position.x - TOOLTIP_WIDTH / 2;
    let tooltipY = position.y;
    let pointerDirection: 'up' | 'down' = 'down';

    // Adjust X to keep within screen
    if (tooltipX < SCREEN_PADDING) {
      tooltipX = SCREEN_PADDING;
    } else if (tooltipX + TOOLTIP_WIDTH > screenWidth - SCREEN_PADDING) {
      tooltipX = screenWidth - SCREEN_PADDING - TOOLTIP_WIDTH;
    }

    // Determine if tooltip should appear above or below tap point
    // If tap is in bottom half of screen, show tooltip above
    if (position.y > screenHeight / 2) {
      tooltipY = position.y - TOOLTIP_MIN_HEIGHT - POINTER_SIZE - 20;
      pointerDirection = 'down';
    } else {
      tooltipY = position.y + POINTER_SIZE + 10;
      pointerDirection = 'up';
    }

    return { tooltipX, tooltipY, pointerDirection };
  }, [position, screenWidth, screenHeight]);

  if (!visible || !citation) {
    return null;
  }

  const { tooltipX, tooltipY, pointerDirection } = getPosition();
  const domain = citation.domain || extractDomain(citation.url);
  const faviconUrl = getFaviconUrl(domain, 32);
  const accentColor = brandColor || theme.colors.primary[500];

  // Pointer style based on direction
  const getPointerStyle = () => {
    const baseStyle = {
      position: 'absolute' as const,
      width: 0,
      height: 0,
      borderStyle: 'solid' as const,
      // Center the pointer horizontally
      left: (TOOLTIP_WIDTH / 2) - POINTER_SIZE,
    };

    const borderColor = isDark ? theme.colors.surface : theme.colors.card;

    if (pointerDirection === 'up') {
      return {
        ...baseStyle,
        top: -POINTER_SIZE,
        borderLeftWidth: POINTER_SIZE,
        borderRightWidth: POINTER_SIZE,
        borderBottomWidth: POINTER_SIZE,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: borderColor,
      };
    } else {
      return {
        ...baseStyle,
        bottom: -POINTER_SIZE,
        borderLeftWidth: POINTER_SIZE,
        borderRightWidth: POINTER_SIZE,
        borderTopWidth: POINTER_SIZE,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: borderColor,
      };
    }
  };

  return (
    <TouchableWithoutFeedback onPress={onDismiss}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(100)}
          style={[
            styles.container,
            {
              left: tooltipX,
              top: tooltipY,
              backgroundColor: isDark ? theme.colors.surface : theme.colors.card,
              shadowColor: theme.colors.shadowDark,
              borderColor: theme.colors.border,
            },
          ]}
        >
          {/* Pointer */}
          <View style={getPointerStyle()} />

          {/* Header: Index + Domain + Favicon */}
          <View style={styles.header}>
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

            {/* Domain */}
            <Typography
              variant="caption"
              weight="medium"
              color="secondary"
              style={styles.domain}
              numberOfLines={1}
            >
              {domain}
            </Typography>
          </View>

          {/* Title */}
          {citation.title && (
            <Typography
              variant="body"
              weight="medium"
              style={[styles.title, { color: theme.colors.text.primary }]}
              numberOfLines={2}
            >
              {truncateText(citation.title, 80)}
            </Typography>
          )}

          {/* Snippet */}
          {citation.snippet && (
            <Typography
              variant="caption"
              color="secondary"
              style={styles.snippet}
              numberOfLines={2}
            >
              "{truncateText(citation.snippet, 100)}"
            </Typography>
          )}

          {/* Open Source Button */}
          <TouchableOpacity
            onPress={onOpenSource}
            style={[styles.openButton, { backgroundColor: accentColor }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Typography variant="caption" weight="semibold" style={styles.openButtonText}>
              View Source
            </Typography>
            <Ionicons name="open-outline" size={14} color="#FFFFFF" />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: TOOLTIP_WIDTH,
    minHeight: TOOLTIP_MIN_HEIGHT,
    borderRadius: 12,
    padding: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 9999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  faviconContainer: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  favicon: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
  indexBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  indexText: {
    color: '#FFFFFF',
    fontSize: 11,
  },
  domain: {
    flex: 1,
  },
  title: {
    marginBottom: 4,
    lineHeight: 20,
  },
  snippet: {
    marginBottom: 12,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 4,
  },
  openButtonText: {
    color: '#FFFFFF',
  },
});

export default CitationPreviewTooltip;
