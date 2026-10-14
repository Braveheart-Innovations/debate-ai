import React from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme';
import { Typography, GradientButton, Button } from '@/components/molecules';
import { useGreeting } from '@/hooks/useGreeting';
import type { CreateMediaOperation, CreateTab } from '@/types/media';

export interface CreateRecentAsset {
  id: string;
  type: CreateTab;
  /** Rendered in an <Image>: the image itself, or a video poster frame. */
  previewUri?: string;
  /** Audio cards: prompt snippet shown as the card title. */
  label?: string;
  durationSeconds?: number;
  operation?: CreateMediaOperation;
}

/** Another Studio tab already has a connected provider; offer to go there. */
export interface CreateTabSuggestion {
  /** e.g. "Your Runway key makes videos." */
  note: string;
  /** e.g. "Switch to Video" */
  label: string;
  onPress: () => void;
}

interface CreateEmptyStateProps {
  tab: CreateTab;
  hasConfiguredProviders: boolean;
  tabSuggestion?: CreateTabSuggestion | null;
  recentAssets: CreateRecentAsset[];
  onPressRecent: (asset: CreateRecentAsset) => void;
  onConfigureProviders: () => void;
  testID?: string;
}

const CAPABILITY_HINTS: Record<
  CreateTab,
  Array<{ icon: keyof typeof Ionicons.glyphMap; label: string }>
> = {
  image: [
    { icon: 'images-outline', label: 'Up to 3 models' },
    { icon: 'color-palette-outline', label: 'Styles' },
    { icon: 'layers-outline', label: 'Refine with a photo' },
  ],
  video: [
    { icon: 'videocam-outline', label: 'Text to video' },
    { icon: 'image-outline', label: 'Image to video' },
  ],
  audio: [
    { icon: 'mic-outline', label: 'Voiceovers' },
    { icon: 'musical-notes-outline', label: 'Sound effects' },
  ],
};

const RECENT_TILE_ICONS: Record<CreateTab, keyof typeof Ionicons.glyphMap> = {
  image: 'image-outline',
  video: 'videocam-outline',
  audio: 'musical-notes-outline',
};

const AUDIO_OPERATION_META: Partial<
  Record<CreateMediaOperation, { icon: keyof typeof Ionicons.glyphMap; label: string }>
> = {
  text_to_speech: { icon: 'mic-outline', label: 'Voiceover' },
  sound_effect: { icon: 'volume-high-outline', label: 'Sound effect' },
  debate_voice_pack: { icon: 'people-outline', label: 'Debate voices' },
  debate_podcast_playlist: { icon: 'radio-outline', label: 'Podcast' },
};

const DEFAULT_AUDIO_META = { icon: 'musical-notes-outline' as const, label: 'Audio' };

function formatClipDuration(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  const rounded = Math.round(seconds);
  if (rounded < 60) return `${rounded}s`;
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const CONNECT_COPY: Record<CreateTab, string> = {
  image: 'Bring your own API keys — connect OpenAI, Google, or Grok to create images.',
  video: 'Bring your own API key — connect Runway to create videos.',
  audio: 'Bring your own API key — connect ElevenLabs to create voiceovers and sound effects.',
};

/**
 * Fills the space above the Studio's bottom-docked composer: witty greeting,
 * per-tab capability hints, a recent-creations strip, and a first-run CTA
 * when the tab has no configured provider yet.
 */
export const CreateEmptyState: React.FC<CreateEmptyStateProps> = ({
  tab,
  hasConfiguredProviders,
  tabSuggestion,
  recentAssets,
  onPressRecent,
  onConfigureProviders,
  testID,
}) => {
  const { theme, isDark } = useTheme();
  const { timeBasedGreeting, welcomeMessage } = useGreeting({ screenCategory: 'create' });

  const handlePressRecent = (asset: CreateRecentAsset) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPressRecent(asset);
  };

  const renderRecentContent = (asset: CreateRecentAsset) => {
    if (asset.type === 'audio') {
      const meta = (asset.operation && AUDIO_OPERATION_META[asset.operation]) || DEFAULT_AUDIO_META;
      const duration = formatClipDuration(asset.durationSeconds);
      return (
        <View style={styles.audioCard}>
          <View
            style={[
              styles.audioIconBubble,
              { backgroundColor: isDark ? theme.colors.overlays.medium : theme.colors.primary[100] },
            ]}
          >
            <Ionicons name={meta.icon} size={16} color={theme.colors.primary[500]} />
          </View>
          <View style={styles.audioCardBody}>
            <Typography variant="caption" weight="medium" numberOfLines={2} style={styles.audioCardTitle}>
              {asset.label || meta.label}
            </Typography>
            <Typography variant="caption" color="secondary" numberOfLines={1} style={styles.audioCardMeta}>
              {duration ? `${meta.label} · ${duration}` : meta.label}
            </Typography>
          </View>
        </View>
      );
    }

    const duration = asset.type === 'video' ? formatClipDuration(asset.durationSeconds) : null;
    return (
      <>
        {asset.previewUri ? (
          <Image
            source={{ uri: asset.previewUri }}
            style={styles.recentPreview}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Ionicons
            name={RECENT_TILE_ICONS[asset.type]}
            size={22}
            color={theme.colors.text.secondary}
          />
        )}
        {asset.type === 'video' && asset.previewUri && (
          <View style={styles.playBadge}>
            <Ionicons name="play" size={12} color="#FFFFFF" style={styles.playGlyph} />
          </View>
        )}
        {duration && (
          <View style={styles.durationBadge}>
            <Typography variant="caption" style={styles.durationText}>
              {duration}
            </Typography>
          </View>
        )}
      </>
    );
  };

  const getRecentAccessibilityLabel = (asset: CreateRecentAsset): string => {
    if (asset.type === 'audio') {
      const meta = (asset.operation && AUDIO_OPERATION_META[asset.operation]) || DEFAULT_AUDIO_META;
      return asset.label ? `Open recent ${meta.label.toLowerCase()}: ${asset.label}` : `Open recent ${meta.label.toLowerCase()}`;
    }
    return asset.type === 'video' ? 'Open recent video' : 'Open recent image';
  };

  return (
    <View style={styles.container} testID={testID}>
      <Typography variant="title" align="center">
        {timeBasedGreeting}
      </Typography>
      <Typography variant="body" color="secondary" align="center" style={styles.subtitle}>
        {welcomeMessage}
      </Typography>

      {hasConfiguredProviders ? (
        <>
          <View style={styles.hintRow}>
            {CAPABILITY_HINTS[tab].map(hint => (
              <View key={hint.label} style={styles.hint}>
                <Ionicons name={hint.icon} size={14} color={theme.colors.text.secondary} />
                <Typography variant="caption" color="secondary">
                  {hint.label}
                </Typography>
              </View>
            ))}
          </View>

          {recentAssets.length > 0 && (
            <View style={styles.recentsBlock}>
              <Typography variant="caption" weight="semibold" color="secondary">
                RECENT
              </Typography>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.recentsRow}
                testID={testID ? `${testID}-recents` : undefined}
              >
                {recentAssets.map(asset => (
                  <TouchableOpacity
                    key={asset.id}
                    onPress={() => handlePressRecent(asset)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={getRecentAccessibilityLabel(asset)}
                    style={[
                      styles.recentTile,
                      asset.type === 'video' && styles.videoTile,
                      asset.type === 'audio' && styles.audioTile,
                      { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                    ]}
                  >
                    {renderRecentContent(asset)}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </>
      ) : (
        <View style={styles.configureCta}>
          <Typography variant="body" color="secondary" align="center" style={styles.configureCopy}>
            {CONNECT_COPY[tab]}
          </Typography>
          <GradientButton
            title="Connect a provider"
            onPress={onConfigureProviders}
            gradient={theme.colors.gradients.primary}
            testID={testID ? `${testID}-configure` : undefined}
          />
          {tabSuggestion && (
            <View
              style={styles.tabSuggestion}
              testID={testID ? `${testID}-switch-tab` : undefined}
            >
              <Typography variant="caption" color="secondary" align="center">
                {tabSuggestion.note}
              </Typography>
              <Button
                title={tabSuggestion.label}
                onPress={tabSuggestion.onPress}
                variant="secondary"
                size="medium"
              />
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 20,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 20,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recentsBlock: {
    alignSelf: 'stretch',
    gap: 8,
    alignItems: 'center',
  },
  recentsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 4,
  },
  recentTile: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoTile: {
    width: 96,
  },
  audioTile: {
    width: 200,
  },
  recentPreview: {
    width: '100%',
    height: '100%',
  },
  playBadge: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyph: {
    marginLeft: 1,
  },
  durationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  durationText: {
    color: '#FFFFFF',
    fontSize: 10,
    lineHeight: 13,
  },
  audioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    height: '100%',
    paddingHorizontal: 10,
  },
  audioIconBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioCardBody: {
    flex: 1,
    gap: 1,
  },
  audioCardTitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  audioCardMeta: {
    fontSize: 11,
    lineHeight: 14,
  },
  configureCta: {
    alignSelf: 'stretch',
    gap: 16,
  },
  configureCopy: {
    paddingHorizontal: 8,
  },
  tabSuggestion: {
    gap: 8,
  },
});

export default CreateEmptyState;
