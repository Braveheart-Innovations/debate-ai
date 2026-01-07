/**
 * CitationList Organism Component
 * Manages a list of citations with expand/collapse functionality
 */

import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Linking, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CitationBadge, CitationCard } from '@/components/molecules/citations';
import { Typography } from '@/components/molecules';
import { useTheme } from '@/theme';
import { normalizeCitations } from '@/utils/citationUtils';
import type { Citation } from '@/types';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type CitationListVariant = 'compact' | 'expanded' | 'inline';

export interface CitationListProps {
  citations: Citation[];
  variant?: CitationListVariant;
  initialVisible?: number;
  onCitationPress?: (citation: Citation) => void;
  brandColor?: string;
  showHeader?: boolean;
}

export const CitationList: React.FC<CitationListProps> = React.memo(({
  citations,
  variant = 'compact',
  initialVisible = 3,
  onCitationPress,
  brandColor,
  showHeader = true,
}) => {
  const { theme } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);

  // Normalize citations to ensure domain field is populated
  const normalizedCitations = useMemo(
    () => normalizeCitations(citations),
    [citations]
  );

  // Determine which citations to show
  const visibleCitations = useMemo(() => {
    if (isExpanded || normalizedCitations.length <= initialVisible) {
      return normalizedCitations;
    }
    return normalizedCitations.slice(0, initialVisible);
  }, [normalizedCitations, isExpanded, initialVisible]);

  const hasMore = normalizedCitations.length > initialVisible;
  const hiddenCount = normalizedCitations.length - initialVisible;

  // Handle citation press - open URL in browser
  const handleCitationPress = useCallback((citation: Citation) => {
    if (onCitationPress) {
      onCitationPress(citation);
    } else {
      Linking.openURL(citation.url).catch((err) =>
        console.error('Failed to open citation URL:', err)
      );
    }
  }, [onCitationPress]);

  // Toggle expand/collapse with animation
  const toggleExpanded = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded((prev) => !prev);
  }, []);

  // Don't render if no citations
  if (normalizedCitations.length === 0) {
    return null;
  }

  // Render based on variant
  const renderCitations = () => {
    if (variant === 'expanded') {
      return (
        <View style={styles.expandedList}>
          {visibleCitations.map((citation) => (
            <CitationCard
              key={`citation-${citation.index}`}
              citation={citation}
              onPress={() => handleCitationPress(citation)}
              brandColor={brandColor}
            />
          ))}
        </View>
      );
    }

    // Compact and inline variants use badges
    return (
      <View style={[
        styles.badgeList,
        variant === 'inline' && styles.inlineList,
      ]}>
        {visibleCitations.map((citation) => (
          <CitationBadge
            key={`citation-${citation.index}`}
            citation={citation}
            onPress={() => handleCitationPress(citation)}
            brandColor={brandColor}
            size={variant === 'inline' ? 'small' : 'medium'}
            showDomain={variant !== 'inline'}
          />
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      {showHeader && (
        <View style={styles.header}>
          <Ionicons
            name="globe-outline"
            size={14}
            color={theme.colors.text.secondary}
          />
          <Typography
            variant="caption"
            weight="semibold"
            color="secondary"
            style={styles.headerText}
          >
            Sources ({normalizedCitations.length})
          </Typography>
        </View>
      )}

      {/* Citation List */}
      {renderCitations()}

      {/* Show More/Less Button */}
      {hasMore && (
        <TouchableOpacity
          onPress={toggleExpanded}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.toggleButton}
          accessibilityRole="button"
          accessibilityLabel={isExpanded ? 'Show less sources' : `Show ${hiddenCount} more sources`}
        >
          <Typography
            variant="caption"
            weight="medium"
            style={{ color: brandColor || theme.colors.primary[500] }}
          >
            {isExpanded ? 'Show less' : `+${hiddenCount} more`}
          </Typography>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={brandColor || theme.colors.primary[500]}
          />
        </TouchableOpacity>
      )}
    </View>
  );
});

CitationList.displayName = 'CitationList';

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  headerText: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badgeList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  inlineList: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 4,
  },
  expandedList: {
    gap: 8,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
});
