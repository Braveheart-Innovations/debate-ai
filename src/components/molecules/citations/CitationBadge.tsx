/**
 * CitationBadge Molecule Component
 * Compact pill/badge representation of a citation with favicon and domain
 */

import React, { useState } from 'react';
import { TouchableOpacity, Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '../common/Typography';
import { useTheme } from '@/theme';
import { extractDomain, getFaviconUrl, truncateText } from '@/utils/citationUtils';
import type { Citation } from '@/types';

export interface CitationBadgeProps {
  citation: Citation;
  onPress?: () => void;
  size?: 'small' | 'medium';
  showFavicon?: boolean;
  showDomain?: boolean;
  brandColor?: string;
}

export const CitationBadge: React.FC<CitationBadgeProps> = React.memo(({
  citation,
  onPress,
  size = 'medium',
  showFavicon = true,
  showDomain = true,
  brandColor,
}) => {
  const { theme, isDark } = useTheme();
  const [faviconError, setFaviconError] = useState(false);

  const domain = citation.domain || extractDomain(citation.url);
  const faviconUrl = getFaviconUrl(domain);

  // Size variants
  const isSmall = size === 'small';
  const iconSize = isSmall ? 12 : 16;
  const fontSize = isSmall ? 11 : 12;
  const paddingH = isSmall ? 6 : 8;
  const paddingV = isSmall ? 3 : 4;
  const maxDomainLength = isSmall ? 12 : 18;

  // Colors
  const indexColor = brandColor || theme.colors.primary[500];
  const backgroundColor = isDark
    ? theme.colors.glass.background
    : theme.colors.gray[100];
  const borderColor = isDark
    ? theme.colors.glass.border
    : theme.colors.gray[200];

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      style={[
        styles.badge,
        {
          backgroundColor,
          borderColor,
          paddingHorizontal: paddingH,
          paddingVertical: paddingV,
        },
      ]}
      accessibilityRole="link"
      accessibilityLabel={`Citation ${citation.index}: ${citation.title || domain}`}
      accessibilityHint="Opens source in browser"
    >
      {/* Citation Index */}
      <Typography
        variant="caption"
        weight="semibold"
        style={[styles.index, { color: indexColor, fontSize }]}
      >
        [{citation.index}]
      </Typography>

      {/* Domain Text */}
      {showDomain && (
        <Typography
          variant="caption"
          style={[styles.domain, { fontSize, color: theme.colors.text.secondary }]}
          numberOfLines={1}
        >
          {truncateText(domain, maxDomainLength)}
        </Typography>
      )}

      {/* Favicon */}
      {showFavicon && (
        <View style={styles.faviconContainer}>
          {faviconError ? (
            <Ionicons
              name="globe-outline"
              size={iconSize}
              color={theme.colors.text.disabled}
            />
          ) : (
            <Image
              source={{ uri: faviconUrl }}
              style={[styles.favicon, { width: iconSize, height: iconSize }]}
              onError={() => setFaviconError(true)}
              resizeMode="contain"
            />
          )}
        </View>
      )}
    </TouchableOpacity>
  );
});

CitationBadge.displayName = 'CitationBadge';

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  index: {
    fontWeight: '600',
  },
  domain: {
    maxWidth: 100,
  },
  faviconContainer: {
    marginLeft: 2,
  },
  favicon: {
    borderRadius: 2,
  },
});
