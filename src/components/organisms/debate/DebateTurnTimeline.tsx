import React, { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Typography } from '../../molecules';
import { useTheme } from '../../../theme';
import type { MessageSpec } from '@/services/debate';
import { getDebateSpeakerRoleLabel } from '@/utils/debateLabels';

export interface DebateTurnTimelineProps {
  messages: MessageSpec[];
  currentMessageIndex: number;
  currentTurnLabel?: string;
  activeSideLabel?: string;
  presetLabel?: string;
  totalMessages?: number;
  showCurrentSummary?: boolean;
  showRailHeader?: boolean;
  embedded?: boolean;
}

const CHIP_GAP = 8;
const MIN_CHIP_WIDTH = 124;
const MAX_CHIP_WIDTH = 168;
const EMBEDDED_MIN_CHIP_WIDTH = 108;
const EMBEDDED_MAX_CHIP_WIDTH = 148;
const ACTIVE_MIN_CHIP_WIDTH = 184;
const ACTIVE_MAX_CHIP_WIDTH = 232;
const EMBEDDED_ACTIVE_MIN_CHIP_WIDTH = 204;
const EMBEDDED_ACTIVE_MAX_CHIP_WIDTH = 264;

export const getDebateTimelineActiveIndex = (currentMessageIndex: number, messageCount: number): number => (
  messageCount > 0
    ? Math.min(Math.max(currentMessageIndex, 0), messageCount - 1)
    : 0
);

export const getDebateTimelineLeftOffset = (activeIndex: number, chipWidth: number): number =>
  Math.max(0, activeIndex * (chipWidth + CHIP_GAP));

export const getDebateTimelineChipWidths = (
  viewportWidth: number,
  embedded = false
): { inactiveChipWidth: number; activeChipWidth: number } => {
  const inactiveMin = embedded ? EMBEDDED_MIN_CHIP_WIDTH : MIN_CHIP_WIDTH;
  const inactiveMax = embedded ? EMBEDDED_MAX_CHIP_WIDTH : MAX_CHIP_WIDTH;
  const activeMin = embedded ? EMBEDDED_ACTIVE_MIN_CHIP_WIDTH : ACTIVE_MIN_CHIP_WIDTH;
  const activeMax = embedded ? EMBEDDED_ACTIVE_MAX_CHIP_WIDTH : ACTIVE_MAX_CHIP_WIDTH;
  const inactiveScale = embedded ? 0.28 : 0.34;
  const activeScale = embedded ? 0.58 : 0.48;
  const inactiveChipWidth = Math.min(inactiveMax, Math.max(inactiveMin, Math.round(viewportWidth * inactiveScale)));
  const activeChipWidth = Math.min(activeMax, Math.max(activeMin, Math.round(viewportWidth * activeScale)));

  return {
    inactiveChipWidth,
    activeChipWidth: Math.max(activeChipWidth, inactiveChipWidth),
  };
};

/** Runs `callback` on the next frame (or next tick without rAF); returns its canceller. */
const scheduleFrame = (callback: (timestamp: number) => void): (() => void) => {
  if (typeof requestAnimationFrame === 'function') {
    const frame = requestAnimationFrame(callback);
    return () => {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
    };
  }
  const timer = setTimeout(() => callback(Date.now()), 0);
  return () => clearTimeout(timer);
};

export const DebateTurnTimeline: React.FC<DebateTurnTimelineProps> = ({
  messages,
  currentMessageIndex,
  currentTurnLabel,
  activeSideLabel,
  presetLabel,
  totalMessages,
  showCurrentSummary = true,
  showRailHeader = true,
  embedded = false,
}) => {
  const { theme, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);

  const activeIndex = getDebateTimelineActiveIndex(currentMessageIndex, messages.length);
  const activeMessage = messages[activeIndex];
  const viewportWidth = Math.max(0, width - (embedded ? 28 : 32));
  const { inactiveChipWidth, activeChipWidth } = getDebateTimelineChipWidths(viewportWidth, embedded);
  const railRightPadding = Math.max(16, viewportWidth - activeChipWidth);
  const safeTotalMessages = Math.max(totalMessages ?? messages.length, messages.length);
  const progressText = safeTotalMessages > 0 ? `${activeIndex + 1}/${safeTotalMessages}` : '0/0';
  const progressPercent = safeTotalMessages > 0 ? ((activeIndex + 1) / safeTotalMessages) * 100 : 0;
  const activeRoleLabel = activeSideLabel || getDebateSpeakerRoleLabel(activeMessage);

  useEffect(() => {
    if (messages.length === 0) return undefined;

    const cancelScroll = scheduleFrame(() => {
      const leftLockedOffset = getDebateTimelineLeftOffset(activeIndex, inactiveChipWidth);
      scrollRef.current?.scrollTo({
        x: Math.max(0, leftLockedOffset),
        animated: true,
      });
    });

    return cancelScroll;
  }, [activeIndex, inactiveChipWidth, messages.length]);

  if (!activeMessage) {
    return null;
  }

  return (
    <View
      style={[
        styles.container,
        embedded && styles.embeddedContainer,
        {
          backgroundColor: embedded ? 'transparent' : theme.colors.surface,
          borderColor: embedded ? 'transparent' : theme.colors.border,
        },
      ]}
    >
      {showRailHeader && (
        <View style={styles.headerRow}>
          <Typography variant="caption" weight="semibold" color="secondary">
            Speech Order
          </Typography>
          <Typography variant="caption" color="secondary">
            {activeIndex + 1}/{messages.length}
          </Typography>
        </View>
      )}

      {showCurrentSummary && (
        <View
          style={[
            styles.activeSummary,
            {
              backgroundColor: isDark ? theme.colors.overlays.soft : theme.colors.primary[50],
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.activeCopy}>
            <Typography variant="caption" color="secondary">
              Current step
            </Typography>
            <Typography variant="body" weight="semibold" numberOfLines={1}>
              {currentTurnLabel || activeMessage.label}
            </Typography>
          </View>
          <Typography variant="caption" weight="semibold" color="brand" numberOfLines={1}>
            {getDebateSpeakerRoleLabel(activeMessage)}
          </Typography>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingRight: railRightPadding },
        ]}
        testID="debate-turn-timeline-scroll"
      >
        {messages.map((message, index) => {
          const isCurrent = index === activeIndex;
          const isComplete = index < activeIndex;
          const borderColor = isCurrent
            ? theme.colors.primary[500]
            : isComplete
              ? theme.colors.border
              : theme.colors.border;
          const backgroundColor = isCurrent
            ? (isDark ? theme.colors.overlays.medium : theme.colors.primary[50])
            : isComplete
              ? (isDark ? theme.colors.overlays.soft : theme.colors.gray[100])
              : theme.colors.card;

          return (
            <View
              key={`${message.label}-${index}`}
              style={[
                styles.turnChip,
                embedded && styles.embeddedTurnChip,
                isCurrent && styles.activeTurnChip,
                embedded && isCurrent && styles.embeddedActiveTurnChip,
                { width: isCurrent ? activeChipWidth : inactiveChipWidth },
                {
                  backgroundColor,
                  borderColor,
                },
              ]}
            >
              <View style={styles.chipMetaRow}>
                <Typography
                  variant="caption"
                  color={isCurrent ? 'brand' : 'secondary'}
                  weight={isCurrent ? 'semibold' : 'normal'}
                  numberOfLines={1}
                >
                  {isCurrent ? progressText : index + 1}
                </Typography>
                {isCurrent && (
                  <Typography variant="caption" color="brand" weight="semibold" numberOfLines={1} style={styles.activeRoleText}>
                    {activeRoleLabel}
                  </Typography>
                )}
              </View>
              <Typography
                variant={isCurrent ? 'body' : 'caption'}
                weight={isCurrent ? 'bold' : 'medium'}
                numberOfLines={isCurrent ? 2 : 1}
                style={styles.turnLabel}
              >
                {isCurrent ? currentTurnLabel || message.label : message.label}
              </Typography>
              <Typography variant="caption" color="secondary" numberOfLines={1}>
                {isCurrent ? presetLabel || activeRoleLabel : getDebateSpeakerRoleLabel(message)}
              </Typography>
              {isCurrent && (
                <View style={[
                  styles.progressTrack,
                  { backgroundColor: isDark ? theme.colors.overlays.medium : theme.colors.gray[200] },
                ]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${progressPercent}%` as `${number}%`,
                        backgroundColor: theme.colors.primary[500],
                      },
                    ]}
                  />
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  embeddedContainer: {
    borderTopWidth: 0,
    borderBottomWidth: 0,
    paddingHorizontal: 0,
    paddingTop: 3,
    paddingBottom: 0,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  activeSummary: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  activeCopy: {
    flex: 1,
    minWidth: 0,
  },
  scrollContent: {
    gap: CHIP_GAP,
    paddingRight: 16,
  },
  turnChip: {
    minHeight: 66,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  embeddedTurnChip: {
    minHeight: 50,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  activeTurnChip: {
    minHeight: 80,
    shadowColor: 'rgba(0,0,0,0.18)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 5,
  },
  embeddedActiveTurnChip: {
    minHeight: 72,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  chipMetaRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  activeRoleText: {
    flexShrink: 1,
    textAlign: 'right',
  },
  turnLabel: {
    letterSpacing: 0,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
});
