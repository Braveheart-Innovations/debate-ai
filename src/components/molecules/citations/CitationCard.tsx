/**
 * CitationCard Molecule Component
 * Expanded card representation of a citation with full details
 */

import React, { useState } from 'react';
import { TouchableOpacity, Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '../common/Typography';
import { useTheme } from '@/theme';
import { extractDomain, getFaviconUrl, truncateText } from '@/utils/citationUtils';
import type { Citation } from '@/types';

export interface CitationCardProps {
  citation: Citation;
  onPress?: () => void;
  brandColor?: string;
  compact?: boolean;
}

export const CitationCard: React.FC<CitationCardProps> = React.memo(({
  citation,
  onPress,
  brandColor,
  compact = false,
}) => {
  const { theme, isDark } = useTheme();
  const [faviconError, setFaviconError] = useState(false);

  const domain = citation.domain || extractDomain(citation.url);
  const faviconUrl = getFaviconUrl(domain, 32);

  // Colors
  const accentColor = brandColor || theme.colors.primary[500];
  const backgroundColor = isDark
    ? theme.colors.surface
    : theme.colors.card;
  const borderColor = isDark
    ? theme.colors.border
    : theme.colors.gray[200];

  const iconSize = compact ? 16 : 20;
  const maxTitleLength = compact ? 40 : 60;
  const maxSnippetLength = compact ? 80 : 120;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.card,
        {
          backgroundColor,
          borderColor,
          padding: compact ? 10 : 12,
        },
      ]}
      accessibilityRole="link"
      accessibilityLabel={`Citation ${citation.index}: ${citation.title || domain}`}
      accessibilityHint="Opens source in browser"
    >
      {/* Header Row: Favicon + Index + Domain */}
      <View style={styles.header}>
        {/* Favicon */}
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

        {/* Index Badge */}
        <View style={[styles.indexBadge, { backgroundColor: accentColor }]}>
          <Typography
            variant="caption"
            weight="bold"
            style={styles.indexText}
          >
            {citation.index}
          </Typography>
        </View>

        {/* Domain */}
        <Typography
          variant="caption"
          color="secondary"
          style={styles.domain}
          numberOfLines={1}
        >
          {domain}
        </Typography>

        {/* External Link Icon */}
        <Ionicons
          name="open-outline"
          size={14}
          color={theme.colors.text.disabled}
          style={styles.externalIcon}
        />
      </View>

      {/* Title */}
      {citation.title && (
        <Typography
          variant="body"
          weight="medium"
          style={[styles.title, { color: theme.colors.text.primary }]}
          numberOfLines={2}
        >
          {truncateText(citation.title, maxTitleLength)}
        </Typography>
      )}

      {/* Snippet */}
      {!compact && citation.snippet && (
        <Typography
          variant="caption"
          color="secondary"
          style={styles.snippet}
          numberOfLines={2}
        >
          {truncateText(citation.snippet, maxSnippetLength)}
        </Typography>
      )}
    </TouchableOpacity>
  );
});

CitationCard.displayName = 'CitationCard';

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  faviconContainer: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  favicon: {
    borderRadius: 2,
  },
  indexBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  indexText: {
    color: '#FFFFFF',
    fontSize: 10,
  },
  domain: {
    flex: 1,
  },
  externalIcon: {
    marginLeft: 'auto',
  },
  title: {
    marginTop: 6,
    lineHeight: 18,
  },
  snippet: {
    marginTop: 4,
    lineHeight: 16,
  },
});
