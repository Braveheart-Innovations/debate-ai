/**
 * CreateScreen - Active Create generation session screen.
 * Shows generation progress, media gallery, and refinement options.
 */
import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Dimensions,
  Alert,
  ActivityIndicator,
  Platform,
  Share,
  Pressable,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorService } from '@/services/errors/ErrorService';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSelector, useDispatch } from 'react-redux';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { VideoView, useVideoPlayer, type PlayingChangeEventPayload } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme';
import { Typography } from '../components/molecules';
import type { RefinementProvider } from '../components/organisms/chat/ImageRefinementModal';
import { GeneratedContentReportModal } from '@/components/organisms/report/GeneratedContentReportModal';
import { RootState, AppDispatch, isApiKeyConfigured, setAttachments } from '../store';
import {
  selectCreateState,
  selectGallery,
  selectIsGenerating,
  removeFromGalleryWithCleanup,
  persistGallery,
  updateGalleryEntryUri,
  GeneratedImageEntry,
  GeneratedMediaEntry,
  hydrateMediaGallery,
  markCreateActivitySeen,
  removeFromMediaGalleryWithCleanup,
  persistMediaGallery,
  LOCAL_GALLERY_ASSET_LIMIT,
  normalizeGalleryAssets,
  getGalleryAssetCounts,
  getFilteredGalleryAssets,
  getSortedGalleryAssets,
} from '../store/createSlice';
import type {
  GalleryAsset,
  GalleryAssetType,
  GalleryFilterState,
  GallerySortMode,
  GalleryTab,
} from '../store/createSlice';
import type { DebateVoicePackManifest } from '../types/media';
import { RootStackParamList, AIProvider } from '../types';
import {
  clearBackgroundAudioPlayer,
  forgetBackgroundAudioPlayer,
  pauseBackgroundAudioPlayer,
  playWithBackgroundAudio,
  type BackgroundAudioMetadata,
} from '../services/audio/backgroundAudioPlayback';
import {
  getImageInputModels,
  getImageModelDisplayName,
  getImageProviderDisplayName,
  supportsImageInput,
} from '../config/imageGenerationModels';
import {
  getImageShareUti,
  getImageMimeType,
  isDocumentImageUri,
  persistImageUri,
} from '../services/images/fileCache';
import MediaSaveService from '../services/media/MediaSaveService';
import { getMediaShareUti } from '../services/media/mediaFileCache';
import useFeatureAccess from '../hooks/useFeatureAccess';
import { useGreeting } from '../hooks/useGreeting';
import type { GeneratedContentReportTarget } from '@/services/reports/GeneratedContentReportService';
import { buildGalleryAssetReportTarget } from '@/utils/generatedContentReportTargets';

type NavigationProp = StackNavigationProp<RootStackParamList>;
type ScreenRouteProp = RouteProp<RootStackParamList, 'CreateSession'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_SIZE = SCREEN_WIDTH - 32;
const LIBRARY_GAP = 12;
const LIBRARY_CARD_WIDTH = (SCREEN_WIDTH - 32 - LIBRARY_GAP) / 2;
const RETENTION_WARNING_THRESHOLD = Math.floor(LOCAL_GALLERY_ASSET_LIMIT * 0.9);

const EMPTY_GALLERY_FILTERS: GalleryFilterState = {
  providers: [],
  models: [],
  operations: [],
  dateRange: 'all',
  availability: 'all',
};

const GALLERY_TABS: Array<{ value: GalleryTab; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'all', label: 'All', icon: 'albums-outline' },
  { value: 'image', label: 'Images', icon: 'image-outline' },
  { value: 'video', label: 'Videos', icon: 'videocam-outline' },
  { value: 'audio', label: 'Audio', icon: 'musical-notes-outline' },
];

const GALLERY_SORT_OPTIONS: Array<{ value: GallerySortMode; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'provider', label: 'Provider' },
  { value: 'model', label: 'Model' },
];

const GALLERY_DATE_FILTERS: Array<{ value: GalleryFilterState['dateRange']; label: string }> = [
  { value: 'all', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: '7 days' },
  { value: 'month', label: '30 days' },
];

const GALLERY_AVAILABILITY_FILTERS: Array<{ value: GalleryFilterState['availability']; label: string }> = [
  { value: 'all', label: 'Any status' },
  { value: 'available', label: 'Available' },
  { value: 'remote_expiring', label: 'Expiring links' },
  { value: 'failed', label: 'Failed' },
];

type VideoPlaybackState = {
  isPlaying: boolean;
  hasEnded: boolean;
};

type AudioPlaybackPhase = 'idle' | 'playing' | 'paused' | 'ended';

type AudioPlayerResetRequest = {
  id: number;
  seekTime: number;
  shouldPlay: boolean;
};

const AUDIO_END_EPSILON_SECONDS = 0.05;
const AUDIO_SKIP_SECONDS = 1;

function isVoicePackEntry(entry: GeneratedMediaEntry): entry is GeneratedMediaEntry & { voicePack: DebateVoicePackManifest } {
  return entry.voicePack?.kind === 'debate_voice_pack' || entry.voicePack?.kind === 'debate_podcast_playlist';
}

function getAudioPhase(status: ReturnType<typeof useAudioPlayerStatus>): AudioPlaybackPhase {
  if (status.playing) return 'playing';
  const hasDuration = Number.isFinite(status.duration) && status.duration > 0;
  const endedByPosition = hasDuration && status.currentTime >= Math.max(0, status.duration - AUDIO_END_EPSILON_SECONDS);
  if (status.didJustFinish || endedByPosition) return 'ended';
  if (status.currentTime > 0) return 'paused';
  return 'idle';
}

function clampAudioTime(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds)) return 0;
  const upperBound = Number.isFinite(duration) && duration > 0 ? duration : Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(seconds, upperBound));
}

function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function VideoPreview({
  mediaId,
  uri,
  style,
  onPlaybackStateChange,
}: {
  mediaId: string;
  uri: string;
  style: object;
  onPlaybackStateChange?: (mediaId: string, state: VideoPlaybackState) => void;
}) {
  const player = useVideoPlayer(uri);
  const [isPlaying, setIsPlaying] = useState(Boolean(player.playing));
  const [nativeControlsVisible, setNativeControlsVisible] = useState(!player.playing);

  const notifyPlaybackState = useCallback((state: VideoPlaybackState) => {
    setIsPlaying(state.isPlaying);
    setNativeControlsVisible(!state.isPlaying);
    onPlaybackStateChange?.(mediaId, state);
  }, [mediaId, onPlaybackStateChange]);

  useEffect(() => {
    notifyPlaybackState({ isPlaying: Boolean(player.playing), hasEnded: false });
  }, [notifyPlaybackState, player]);

  useEffect(() => {
    const playingSubscription = player.addListener('playingChange', ({ isPlaying }: PlayingChangeEventPayload) => {
      notifyPlaybackState({ isPlaying, hasEnded: false });
    });
    const endSubscription = player.addListener('playToEnd', () => {
      notifyPlaybackState({ isPlaying: false, hasEnded: true });
    });

    return () => {
      playingSubscription.remove();
      endSubscription.remove();
    };
  }, [notifyPlaybackState, player]);

  const handleHiddenControlsPress = useCallback(() => {
    player.pause();
    notifyPlaybackState({ isPlaying: false, hasEnded: false });
  }, [notifyPlaybackState, player]);

  return (
    <View style={style}>
      <VideoView
        player={player}
        style={styles.videoPlayerSurface}
        nativeControls={nativeControlsVisible}
        contentFit="cover"
        fullscreenOptions={{ enable: false }}
        showsTimecodes={false}
        buttonOptions={{
          showBottomBar: false,
          showSeekBackward: false,
          showSeekForward: false,
          showSettings: false,
          showNext: false,
          showPrevious: false,
          showSubtitles: false,
        }}
        testID={`gallery-video-surface-${mediaId}`}
      />
      {isPlaying && !nativeControlsVisible && (
        <Pressable
          style={styles.videoPressSurface}
          onPress={handleHiddenControlsPress}
          accessibilityRole="button"
          accessibilityLabel="Pause video"
        />
      )}
    </View>
  );
}

function AudioPreview({
  uri,
  metadata,
  theme,
  isDark,
}: {
  uri: string;
  metadata: BackgroundAudioMetadata;
  theme: ReturnType<typeof useTheme>['theme'];
  isDark: boolean;
}) {
  const [playerGeneration, setPlayerGeneration] = useState(0);
  const [resetRequest, setResetRequest] = useState<AudioPlayerResetRequest>({
    id: 0,
    seekTime: 0,
    shouldPlay: false,
  });

  const handleResetPlayer = useCallback((seekTime = 0, shouldPlay = true) => {
    setResetRequest((current) => ({
      id: current.id + 1,
      seekTime,
      shouldPlay,
    }));
    setPlayerGeneration((current) => current + 1);
  }, []);

  return (
    <AudioPreviewPlayer
      key={`${uri}-${playerGeneration}`}
      uri={uri}
      metadata={metadata}
      theme={theme}
      isDark={isDark}
      resetRequest={resetRequest}
      onResetPlayer={handleResetPlayer}
    />
  );
}

function AudioPreviewPlayer({
  uri,
  metadata,
  theme,
  isDark,
  resetRequest,
  onResetPlayer,
}: {
  uri: string;
  metadata: BackgroundAudioMetadata;
  theme: ReturnType<typeof useTheme>['theme'];
  isDark: boolean;
  resetRequest: AudioPlayerResetRequest;
  onResetPlayer: (seekTime?: number, shouldPlay?: boolean) => void;
}) {
  const player = useAudioPlayer(uri, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const statusPhase = getAudioPhase(status);
  const [playbackPhase, setPlaybackPhase] = useState<AudioPlaybackPhase>(statusPhase);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const isMountedRef = useRef(true);
  const wasPlayingBeforeScrubRef = useRef(false);
  const duration = Number.isFinite(status.duration) && status.duration > 0 ? status.duration : 0;
  const currentTime = clampAudioTime(status.currentTime, duration);
  const displayedTime = clampAudioTime(scrubTime ?? currentTime, duration);
  const canSeek = duration > 0;
  const canSkipBackward = canSeek && displayedTime > 0;
  const canSkipForward = canSeek && displayedTime < Math.max(0, duration - AUDIO_END_EPSILON_SECONDS);
  const audioSurfaceColor = isDark ? theme.colors.overlays.medium : theme.colors.primary[50];
  const audioAccentColor = isDark ? theme.colors.primary[300] : theme.colors.primary[700];
  const audioTrackColor = isDark ? theme.colors.border : theme.colors.primary[100];

  useEffect(() => {
    setPlaybackPhase(statusPhase);
    if (statusPhase === 'ended') {
      clearBackgroundAudioPlayer(player);
    }
  }, [player, statusPhase]);

  useEffect(() => () => {
    forgetBackgroundAudioPlayer(player);
    isMountedRef.current = false;
  }, [player]);

  useEffect(() => {
    if (resetRequest.id === 0) {
      return;
    }

    let cancelled = false;
    const nextTime = clampAudioTime(resetRequest.seekTime, duration);
    const autoPlayTimer = setTimeout(() => {
      void player.seekTo(nextTime, 0, 0).catch(() => undefined).finally(() => {
        if (cancelled) return;
        if (resetRequest.shouldPlay) {
          void playWithBackgroundAudio(player, metadata);
          if (isMountedRef.current) {
            setPlaybackPhase('playing');
          }
        } else {
          if (isMountedRef.current) {
            setPlaybackPhase(nextTime > 0 ? 'paused' : 'idle');
          }
        }
      });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(autoPlayTimer);
    };
  }, [duration, metadata, player, resetRequest]);

  const handlePress = useCallback(() => {
    if (playbackPhase === 'playing') {
      pauseBackgroundAudioPlayer(player, { clearControls: true });
      setPlaybackPhase('paused');
      return;
    }

    if (playbackPhase === 'ended') {
      onResetPlayer(0, true);
      return;
    }

    void playWithBackgroundAudio(player, metadata);
    setPlaybackPhase('playing');
  }, [metadata, onResetPlayer, playbackPhase, player]);

  const seekToTime = useCallback((nextTime: number, shouldResume: boolean) => {
    const clampedTime = clampAudioTime(nextTime, duration);

    if (playbackPhase === 'ended' || statusPhase === 'ended') {
      onResetPlayer(clampedTime, shouldResume);
      return;
    }

    void player.seekTo(clampedTime, 0, 0).catch(() => undefined).finally(() => {
      if (!isMountedRef.current) return;
      if (shouldResume) {
        void playWithBackgroundAudio(player, metadata);
        setPlaybackPhase('playing');
        return;
      }

      if (duration > 0 && clampedTime >= duration - AUDIO_END_EPSILON_SECONDS) {
        setPlaybackPhase('ended');
      } else {
        setPlaybackPhase(clampedTime > 0 ? 'paused' : 'idle');
      }
    });
  }, [duration, metadata, onResetPlayer, playbackPhase, player, statusPhase]);

  const handleSeekStart = useCallback(() => {
    wasPlayingBeforeScrubRef.current = playbackPhase === 'playing';
    setScrubTime(displayedTime);
    if (playbackPhase === 'playing') {
      player.pause();
      setPlaybackPhase('paused');
    }
  }, [displayedTime, playbackPhase, player]);

  const handleSeekChange = useCallback((nextTime: number) => {
    setScrubTime(clampAudioTime(nextTime, duration));
  }, [duration]);

  const handleSeekComplete = useCallback((nextTime: number) => {
    const shouldResume = wasPlayingBeforeScrubRef.current;
    wasPlayingBeforeScrubRef.current = false;
    setScrubTime(null);
    seekToTime(nextTime, shouldResume);
  }, [seekToTime]);

  const handleSkipBackward = useCallback(() => {
    seekToTime(displayedTime - AUDIO_SKIP_SECONDS, playbackPhase === 'playing');
  }, [displayedTime, playbackPhase, seekToTime]);

  const handleSkipForward = useCallback(() => {
    seekToTime(displayedTime + AUDIO_SKIP_SECONDS, playbackPhase === 'playing');
  }, [displayedTime, playbackPhase, seekToTime]);

  const buttonIcon = playbackPhase === 'playing'
    ? 'pause'
    : playbackPhase === 'ended'
      ? 'refresh'
      : 'play';
  const accessibilityLabel = playbackPhase === 'playing'
    ? 'Pause audio'
    : playbackPhase === 'ended'
      ? 'Replay audio'
      : 'Play audio';
  const statusLabel = playbackPhase === 'playing'
    ? 'Playing'
    : playbackPhase === 'ended'
      ? 'Replay'
      : playbackPhase === 'paused'
        ? 'Paused'
        : 'Ready';

  return (
    <View style={[styles.audioPreview, { backgroundColor: audioSurfaceColor }]}>
      <View style={styles.audioControlsRow}>
        <TouchableOpacity
          style={[
            styles.audioSecondaryControlButton,
            { backgroundColor: theme.colors.surface, opacity: canSkipBackward ? 1 : 0.45 },
          ]}
          onPress={handleSkipBackward}
          disabled={!canSkipBackward}
          accessibilityRole="button"
          accessibilityLabel="Rewind audio 1 second"
        >
          <Ionicons name="play-back" size={22} color={audioAccentColor} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.audioControlButton, { backgroundColor: theme.colors.primary[500] }]}
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          <Ionicons name={buttonIcon} size={30} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.audioSecondaryControlButton,
            { backgroundColor: theme.colors.surface, opacity: canSkipForward ? 1 : 0.45 },
          ]}
          onPress={handleSkipForward}
          disabled={!canSkipForward}
          accessibilityRole="button"
          accessibilityLabel="Advance audio 1 second"
        >
          <Ionicons name="play-forward" size={22} color={audioAccentColor} />
        </TouchableOpacity>
      </View>
      <View style={styles.audioPlaybackInfo}>
        <Typography variant="body" weight="semibold" style={{ color: theme.colors.text.primary }}>
          {statusLabel}
        </Typography>
        <View style={styles.audioProgressRow}>
          <Typography variant="caption" color="secondary" style={styles.audioTimeText}>
            {formatPlaybackTime(displayedTime)}
          </Typography>
          <Slider
            style={styles.audioProgressSlider}
            value={displayedTime}
            minimumValue={0}
            maximumValue={duration || 1}
            disabled={!canSeek}
            onSlidingStart={handleSeekStart}
            onValueChange={handleSeekChange}
            onSlidingComplete={handleSeekComplete}
            minimumTrackTintColor={theme.colors.primary[500]}
            maximumTrackTintColor={audioTrackColor}
            thumbTintColor={audioAccentColor}
            accessibilityLabel="Audio playback position"
            accessibilityRole="adjustable"
            accessibilityValue={{
              min: 0,
              max: duration || 1,
              now: displayedTime,
              text: `${formatPlaybackTime(displayedTime)} of ${formatPlaybackTime(duration)}`,
            }}
          />
          <Typography variant="caption" color="secondary" style={styles.audioTimeText}>
            {formatPlaybackTime(duration)}
          </Typography>
        </View>
      </View>
    </View>
  );
}

function VoicePackPreview({
  manifest,
  theme,
  isDark,
}: {
  manifest: DebateVoicePackManifest;
  theme: ReturnType<typeof useTheme>['theme'];
  isDark: boolean;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isWaitingForNextClip, setIsWaitingForNextClip] = useState(false);
  const [packEnded, setPackEnded] = useState(false);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clips = manifest.clips;
  const currentClip = clips[currentIndex];
  const audioSurfaceColor = isDark ? theme.colors.overlays.medium : theme.colors.primary[50];
  const audioAccentColor = isDark ? theme.colors.primary[300] : theme.colors.primary[700];
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < clips.length - 1;

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    setIsWaitingForNextClip(false);
  }, []);

  useEffect(() => () => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
    }
  }, []);

  const moveToClip = useCallback((nextIndex: number, shouldPlay: boolean) => {
    clearAdvanceTimer();
    setPackEnded(false);
    setCurrentIndex(Math.max(0, Math.min(nextIndex, clips.length - 1)));
    setIsPlaying(shouldPlay);
  }, [clearAdvanceTimer, clips.length]);

  const handleClipEnded = useCallback(() => {
    if (!isPlaying) return;
    if (currentIndex >= clips.length - 1) {
      clearAdvanceTimer();
      setIsPlaying(false);
      setPackEnded(true);
      return;
    }

    setIsWaitingForNextClip(true);
    const pauseMs = currentClip?.pauseAfterMs ?? manifest.pauseMs;
    advanceTimerRef.current = setTimeout(() => {
      advanceTimerRef.current = null;
      setIsWaitingForNextClip(false);
      setCurrentIndex((index) => Math.min(index + 1, clips.length - 1));
    }, pauseMs);
  }, [clearAdvanceTimer, clips.length, currentClip?.pauseAfterMs, currentIndex, isPlaying, manifest.pauseMs]);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      clearAdvanceTimer();
      setIsPlaying(false);
      return;
    }

    if (packEnded) {
      setCurrentIndex(0);
      setPackEnded(false);
    }
    setIsPlaying(true);
  }, [clearAdvanceTimer, isPlaying, packEnded]);

  if (!currentClip) {
    return (
      <View style={[styles.voicePackPreview, { backgroundColor: audioSurfaceColor }]}>
        <Typography variant="body" color="secondary">
          Voice pack has no clips.
        </Typography>
      </View>
    );
  }

  const playbackLabel = isWaitingForNextClip
    ? 'Pause between speakers'
    : packEnded
      ? 'Replay voice pack'
      : isPlaying
        ? `Playing ${currentClip.speakerName}`
        : `Ready: ${currentClip.speakerName}`;

  return (
    <View style={[styles.voicePackPreview, { backgroundColor: audioSurfaceColor }]}>
      <View style={styles.voicePackHeader}>
        <View style={styles.voicePackTitleText}>
          <Typography variant="body" weight="semibold" numberOfLines={1}>
            {manifest.topic}
          </Typography>
          <Typography variant="caption" color="secondary" numberOfLines={1}>
            Clip {currentIndex + 1} of {clips.length} • {currentClip.speakerName}
          </Typography>
        </View>
        <View style={[styles.voicePackBadge, { backgroundColor: theme.colors.surface }]}>
          <Ionicons name="albums-outline" size={15} color={audioAccentColor} />
          <Typography variant="caption" weight="semibold" style={{ color: audioAccentColor }}>
            Pack
          </Typography>
        </View>
      </View>

      <View style={styles.audioControlsRow}>
        <TouchableOpacity
          style={[
            styles.audioSecondaryControlButton,
            { backgroundColor: theme.colors.surface, opacity: canGoPrevious ? 1 : 0.45 },
          ]}
          onPress={() => moveToClip(currentIndex - 1, isPlaying)}
          disabled={!canGoPrevious}
          accessibilityRole="button"
          accessibilityLabel="Previous voice clip"
        >
          <Ionicons name="play-skip-back" size={22} color={audioAccentColor} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.audioControlButton, { backgroundColor: theme.colors.primary[500] }]}
          onPress={handlePlayPause}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause voice pack' : packEnded ? 'Replay voice pack' : 'Play voice pack'}
        >
          <Ionicons name={isPlaying ? 'pause' : packEnded ? 'refresh' : 'play'} size={30} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.audioSecondaryControlButton,
            { backgroundColor: theme.colors.surface, opacity: canGoNext ? 1 : 0.45 },
          ]}
          onPress={() => moveToClip(currentIndex + 1, isPlaying)}
          disabled={!canGoNext}
          accessibilityRole="button"
          accessibilityLabel="Next voice clip"
        >
          <Ionicons name="play-skip-forward" size={22} color={audioAccentColor} />
        </TouchableOpacity>
      </View>

      <Typography variant="caption" color="secondary" align="center">
        {playbackLabel}
      </Typography>

      <VoicePackClipPlayer
        key={`${currentClip.id}-${currentIndex}`}
        clip={currentClip}
        manifest={manifest}
        shouldPlay={isPlaying && !isWaitingForNextClip}
        theme={theme}
        isDark={isDark}
        onEnded={handleClipEnded}
      />
    </View>
  );
}

function VoicePackClipPlayer({
  clip,
  manifest,
  shouldPlay,
  theme,
  isDark,
  onEnded,
}: {
  clip: DebateVoicePackManifest['clips'][number];
  manifest: DebateVoicePackManifest;
  shouldPlay: boolean;
  theme: ReturnType<typeof useTheme>['theme'];
  isDark: boolean;
  onEnded: () => void;
}) {
  const audioPlayerOptions = useMemo(() => ({ updateInterval: 250 }), []);
  const player = useAudioPlayer(clip.uri, audioPlayerOptions);
  const status = useAudioPlayerStatus(player);
  const statusPhase = getAudioPhase(status);
  const endedNotifiedRef = useRef(false);
  const playbackCommandRef = useRef<{ clipUri: string; shouldPlay: boolean } | null>(null);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const duration = Number.isFinite(status.duration) && status.duration > 0 ? status.duration : 0;
  const currentTime = clampAudioTime(status.currentTime, duration);
  const displayedTime = clampAudioTime(scrubTime ?? currentTime, duration);
  const canSeek = duration > 0;
  const audioTrackColor = isDark ? theme.colors.border : theme.colors.primary[100];
  const audioAccentColor = isDark ? theme.colors.primary[300] : theme.colors.primary[700];
  const lockScreenMetadata = useMemo(() => ({
    title: clip.speechLabel || manifest.topic || 'Debate voice pack',
    artist: clip.voiceName ? `${clip.speakerName} · ${clip.voiceName}` : clip.speakerName,
    albumTitle: manifest.kind === 'debate_podcast_playlist' ? 'Debate podcast' : 'Debate voice pack',
  }), [clip.speakerName, clip.speechLabel, clip.voiceName, manifest.kind, manifest.topic]);

  useEffect(() => () => {
    forgetBackgroundAudioPlayer(player);
  }, [player]);

  useEffect(() => {
    const previousCommand = playbackCommandRef.current;
    const clipChanged = previousCommand?.clipUri !== clip.uri;
    const playbackIntentChanged = previousCommand?.shouldPlay !== shouldPlay;

    if (!clipChanged && !playbackIntentChanged) {
      return;
    }

    playbackCommandRef.current = { clipUri: clip.uri, shouldPlay };

    if (shouldPlay) {
      void playWithBackgroundAudio(player, lockScreenMetadata);
    } else if (previousCommand?.shouldPlay && playbackIntentChanged) {
      pauseBackgroundAudioPlayer(player, { clearControls: true });
    }
  }, [clip.uri, lockScreenMetadata, player, shouldPlay]);

  useEffect(() => {
    if (statusPhase === 'ended' && !endedNotifiedRef.current) {
      endedNotifiedRef.current = true;
      clearBackgroundAudioPlayer(player);
      onEnded();
    } else if (statusPhase !== 'ended') {
      endedNotifiedRef.current = false;
    }
  }, [onEnded, player, statusPhase]);

  const handleSeekComplete = useCallback((nextTime: number) => {
    setScrubTime(null);
    const clampedTime = clampAudioTime(nextTime, duration);
    void player.seekTo(clampedTime, 0, 0).catch(() => undefined).finally(() => {
      if (shouldPlay) {
        void playWithBackgroundAudio(player, lockScreenMetadata);
      }
    });
  }, [duration, lockScreenMetadata, player, shouldPlay]);

  return (
    <View style={styles.voicePackClipPanel}>
      <Typography variant="caption" color="secondary" numberOfLines={1}>
        {clip.speechLabel || clip.textPreview}
      </Typography>
      <View style={styles.audioProgressRow}>
        <Typography variant="caption" color="secondary" style={styles.audioTimeText}>
          {formatPlaybackTime(displayedTime)}
        </Typography>
        <Slider
          style={styles.audioProgressSlider}
          value={displayedTime}
          minimumValue={0}
          maximumValue={duration || 1}
          disabled={!canSeek}
          onSlidingStart={() => setScrubTime(displayedTime)}
          onValueChange={(nextTime) => setScrubTime(clampAudioTime(nextTime, duration))}
          onSlidingComplete={handleSeekComplete}
          minimumTrackTintColor={theme.colors.primary[500]}
          maximumTrackTintColor={audioTrackColor}
          thumbTintColor={audioAccentColor}
          accessibilityLabel="Voice pack clip playback position"
          accessibilityRole="adjustable"
          accessibilityValue={{
            min: 0,
            max: duration || 1,
            now: displayedTime,
            text: `${formatPlaybackTime(displayedTime)} of ${formatPlaybackTime(duration)}`,
          }}
        />
        <Typography variant="caption" color="secondary" style={styles.audioTimeText}>
          {formatPlaybackTime(duration)}
        </Typography>
      </View>
    </View>
  );
}

function getMediaProviderDisplayName(providerId: string): string {
  if (providerId === 'runway') return 'Runway';
  if (providerId === 'elevenlabs') return 'ElevenLabs';
  return providerId;
}

function buildGeneratedAudioMetadata(entry: GeneratedMediaEntry): BackgroundAudioMetadata {
  return {
    title: entry.prompt || 'Generated audio',
    artist: getMediaProviderDisplayName(entry.providerId),
    albumTitle: 'Symposium AI',
  };
}

function isImageProvider(providerId: string): providerId is AIProvider {
  return ['claude', 'openai', 'chatgpt', 'google', 'perplexity', 'mistral', 'cohere', 'deepseek', 'grok'].includes(providerId);
}

function getGalleryProviderFilterLabel(providerId: string): string {
  if (isImageProvider(providerId)) {
    return getImageProviderDisplayName(providerId);
  }
  return getMediaProviderDisplayName(providerId);
}

function getGalleryAssetProviderLabel(asset: GalleryAsset): string {
  if (asset.source === 'image') {
    return getImageProviderDisplayName((asset.entry as GeneratedImageEntry).provider);
  }
  return getMediaProviderDisplayName(asset.providerId);
}

function getGalleryAssetModelLabel(asset: GalleryAsset): string {
  if (asset.source === 'image') {
    const image = asset.entry as GeneratedImageEntry;
    return getImageModelDisplayName(image.provider, image.model);
  }
  const media = asset.entry as GeneratedMediaEntry;
  if (isVoicePackEntry(media)) {
    return media.voicePack.kind === 'debate_podcast_playlist' ? 'Debate podcast' : 'Debate voice pack';
  }
  if (media.operation === 'debate_podcast_playlist') {
    return 'Debate podcast';
  }
  return asset.modelId;
}

function getGalleryAssetTypeLabel(type: GalleryAssetType): string {
  if (type === 'image') return 'Image';
  if (type === 'video') return 'Video';
  return 'Audio';
}

function formatGalleryDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(timestamp));
}

function formatGalleryDuration(durationSeconds?: number): string | undefined {
  if (!durationSeconds) return undefined;
  return `${durationSeconds}s`;
}

function formatVoicePackSummary(entry: GeneratedMediaEntry): string | undefined {
  if (!isVoicePackEntry(entry)) return undefined;
  const clipCount = entry.voicePack.clips.length;
  const pauseSeconds = entry.voicePack.pauseMs / 1000;
  const label = entry.voicePack.kind === 'debate_podcast_playlist' ? 'podcast clip' : 'clip';
  return `${clipCount} ${label}${clipCount === 1 ? '' : 's'} • ${pauseSeconds.toFixed(1)}s pauses`;
}

function buildFilterOptions(assets: GalleryAsset[], field: 'providerId' | 'modelId' | 'operation'): string[] {
  return Array.from(new Set(
    assets
      .map((asset) => asset[field])
      .filter((value): value is string => Boolean(value))
  )).sort((a, b) => a.localeCompare(b));
}

export default function CreateScreen() {
  const { theme, isDark } = useTheme();
  const greeting = useGreeting({ screenCategory: 'create' });
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();
  const dispatch = useDispatch<AppDispatch>();

  const { focusAssetId, focusMediaId } = route.params || {};

  const createState = useSelector(selectCreateState);
  const gallery = useSelector(selectGallery);
  const isGenerating = useSelector(selectIsGenerating);
  const apiKeys = useSelector((state: RootState) => state.settings.apiKeys || {});
  const { isDemo, canStartTrial } = useFeatureAccess();
  const subscriptionUnlockMessage = canStartTrial
    ? 'Start a free trial to unlock this feature.'
    : 'Upgrade to Premium to unlock this feature.';

  const {
    generationProgress,
    generationError: errorMessage,
    galleryHydrated,
    mediaGallery = [],
    mediaGalleryHydrated = false,
    mediaGeneration = { video: null, audio: null },
    imageGeneration = null,
  } = createState;
  const requestedFocusAssetId = focusAssetId || focusMediaId;
  const primaryTintBackground = isDark ? theme.colors.overlays.medium : theme.colors.primary[50];
  const primaryAccentColor = isDark ? theme.colors.primary[300] : theme.colors.primary[600];
  const errorSurfaceColor = isDark ? theme.colors.semantic.error : theme.colors.error[100];
  const errorTextColor = isDark ? theme.colors.error[300] : theme.colors.error[700];

  const [savingImage, setSavingImage] = useState(false);
  const [savingMediaId, setSavingMediaId] = useState<string | null>(null);
  const [sharingImageId, setSharingImageId] = useState<string | null>(null);
  const [sharingMediaId, setSharingMediaId] = useState<string | null>(null);
  const [galleryTab, setGalleryTab] = useState<GalleryTab>(route.params?.galleryTab || 'all');
  const [gallerySearch, setGallerySearch] = useState('');
  const [galleryFilters, setGalleryFilters] = useState<GalleryFilterState>(EMPTY_GALLERY_FILTERS);
  const [gallerySortMode, setGallerySortMode] = useState<GallerySortMode>('newest');
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [reportTarget, setReportTarget] = useState<GeneratedContentReportTarget | null>(null);
  const focusedAssetRef = useRef<string | undefined>(undefined);

  // Build available providers for refinement
  const availableRefinementProviders: RefinementProvider[] = useMemo(() => {
    const imageProviders: AIProvider[] = ['openai', 'google', 'grok'];
    return imageProviders.map(provider => ({
      provider,
      name: getImageProviderDisplayName(provider),
      supportsImg2Img: getImageInputModels(provider).length > 0,
      hasApiKey: isApiKeyConfigured(apiKeys[provider]),
    }));
  }, [apiKeys]);

  const galleryAssets = useMemo(
    () => normalizeGalleryAssets(gallery, mediaGallery),
    [gallery, mediaGallery]
  );
  const galleryCounts = useMemo(() => getGalleryAssetCounts(galleryAssets), [galleryAssets]);
  const activeFilterCount = useMemo(() => (
    galleryFilters.providers.length +
    galleryFilters.models.length +
    galleryFilters.operations.length +
    (galleryFilters.dateRange === 'all' ? 0 : 1) +
    (galleryFilters.availability === 'all' ? 0 : 1)
  ), [galleryFilters]);
  const tabbedGalleryAssets = useMemo(
    () => galleryTab === 'all'
      ? galleryAssets
      : galleryAssets.filter((asset) => asset.type === galleryTab),
    [galleryAssets, galleryTab]
  );
  const visibleGalleryAssets = useMemo(
    () => getSortedGalleryAssets(
      getFilteredGalleryAssets(tabbedGalleryAssets, gallerySearch, galleryFilters),
      gallerySortMode
    ),
    [galleryFilters, gallerySearch, gallerySortMode, tabbedGalleryAssets]
  );
  const selectedAsset = useMemo(
    () => galleryAssets.find((asset) => asset.id === selectedAssetId),
    [galleryAssets, selectedAssetId]
  );
  const selectedBulkAssets = useMemo(
    () => galleryAssets.filter((asset) => selectedAssetIds.includes(asset.id)),
    [galleryAssets, selectedAssetIds]
  );
  const providerFilterOptions = useMemo(() => buildFilterOptions(galleryAssets, 'providerId'), [galleryAssets]);
  const modelFilterOptions = useMemo(() => buildFilterOptions(galleryAssets, 'modelId'), [galleryAssets]);
  const operationFilterOptions = useMemo(() => buildFilterOptions(galleryAssets, 'operation'), [galleryAssets]);
  const isNearRetentionLimit = galleryAssets.length >= RETENTION_WARNING_THRESHOLD;

  // Auto-persist gallery whenever it changes
  useEffect(() => {
    if (galleryHydrated || gallery.length > 0) {
      dispatch(persistGallery(gallery));
    }
  }, [dispatch, gallery, galleryHydrated]);

  useEffect(() => {
    if (!mediaGalleryHydrated) {
      dispatch(hydrateMediaGallery());
    } else {
      dispatch(persistMediaGallery(mediaGallery));
    }
  }, [dispatch, mediaGallery, mediaGalleryHydrated]);

  useEffect(() => {
    dispatch(markCreateActivitySeen());
  }, [dispatch]);

  useEffect(() => {
    if (route.params?.galleryTab) {
      setGalleryTab(route.params.galleryTab);
    }
  }, [route.params?.galleryTab]);

  useEffect(() => {
    const validIds = new Set(galleryAssets.map((asset) => asset.id));
    setSelectedAssetIds((current) => {
      const next = current.filter((id) => validIds.has(id));
      return next.length === current.length ? current : next;
    });
    if (selectedAssetId && !validIds.has(selectedAssetId)) {
      setSelectedAssetId(null);
    }
  }, [galleryAssets, selectedAssetId]);

  const getResolvedGalleryImage = useCallback(async (imageId: string): Promise<GeneratedImageEntry | null> => {
    const image = gallery.find((entry) => entry.id === imageId);
    if (!image) return null;

    if (isDocumentImageUri(image.uri)) {
      return image;
    }

    const persistedUri = await persistImageUri(image.uri, { prefix: 'gallery' });
    if (!persistedUri) {
      return null;
    }

    if (persistedUri !== image.uri) {
      dispatch(updateGalleryEntryUri({ id: image.id, uri: persistedUri }));
      return { ...image, uri: persistedUri };
    }

    return image;
  }, [dispatch, gallery]);

  // Refine = attach the image to the Studio composer and land the user there;
  // instructions are typed in the composer, provider/model chosen via pills.
  const handleRefine = useCallback(async (imageId: string) => {
    if (isDemo) {
      ErrorService.showInfo(`Image refinement requires a subscription. ${subscriptionUnlockMessage}`, 'create');
      return;
    }

    // Check if any provider supports refinement
    const hasRefinementProvider = availableRefinementProviders.some((providerInfo) => (
      providerInfo.supportsImg2Img && providerInfo.hasApiKey
    ));
    if (!hasRefinementProvider) {
      ErrorService.showInfo('No providers with image refinement capability are configured. Add an OpenAI, Google, or Grok API key to enable refinement.', 'create');
      return;
    }

    const resolvedImage = await getResolvedGalleryImage(imageId);
    if (!resolvedImage) {
      ErrorService.handleWithToast(new Error('Image file is unavailable.'), { feature: 'create' });
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    dispatch(setAttachments({
      tab: 'image',
      attachments: [{
        uri: resolvedImage.uri,
        mimeType: getImageMimeType(resolvedImage.uri),
        galleryAssetId: resolvedImage.id,
      }],
    }));
    setSelectedAssetId(null);
    navigation.navigate('MainTabs', { screen: 'CreateTab' });
  }, [
    isDemo,
    availableRefinementProviders,
    subscriptionUnlockMessage,
    getResolvedGalleryImage,
    dispatch,
    navigation,
  ]);

  const handleSaveToPhotos = useCallback(async (imageId: string) => {
    const image = await getResolvedGalleryImage(imageId);
    if (!image) {
      ErrorService.handleWithToast(new Error('Image file is unavailable.'), { feature: 'create' });
      return;
    }

    setSavingImage(true);
    try {
      const currentPermission = await MediaLibrary.getPermissionsAsync();
      const permission = currentPermission.granted
        ? currentPermission
        : await MediaLibrary.requestPermissionsAsync();
      const { status } = permission;
      if (status !== 'granted') {
        ErrorService.showWarning('Please allow access to save images.', 'create');
        return;
      }

      await MediaLibrary.saveToLibraryAsync(image.uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      ErrorService.showSuccess('Image saved to your photo library.', 'create');
    } catch (error) {
      console.error('[CreateScreen] Save error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      ErrorService.handleWithToast(new Error('Failed to save image.'), { feature: 'create' });
    } finally {
      setSavingImage(false);
    }
  }, [getResolvedGalleryImage]);

  const handleShare = useCallback(async (imageId: string) => {
    setSharingImageId(imageId);

    try {
      const image = await getResolvedGalleryImage(imageId);
      if (!image) {
        ErrorService.handleWithToast(new Error('Image file is unavailable.'), { feature: 'create' });
        return;
      }

      const shareMessage = `Generated with ${getImageProviderDisplayName(image.provider, {
        includeModel: true,
        modelId: image.model,
      })}: "${image.originalPrompt}"`;
      const localMimeType = getImageMimeType(image.uri);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(image.uri, {
          mimeType: localMimeType,
          UTI: Platform.OS === 'ios' ? getImageShareUti(image.uri) : undefined,
          dialogTitle: 'Share Image',
        });
        return;
      }

      await Share.share({
        url: image.uri,
        message: shareMessage,
        title: 'Share Image',
      });
    } catch (error) {
      console.error('[CreateScreen] Share error:', error);
      ErrorService.handleWithToast(new Error('Failed to share image.'), { feature: 'create' });
    } finally {
      setSharingImageId(null);
    }
  }, [getResolvedGalleryImage]);

  const handleSaveMediaToPhotos = useCallback(async (mediaId: string) => {
    const media = mediaGallery.find((entry) => entry.id === mediaId);
    if (!media) return;

    setSavingMediaId(mediaId);
    try {
      if (isVoicePackEntry(media)) {
        ErrorService.showInfo('This legacy voice pack can play in the app, but podcast files are generated from the completed debate.', 'create');
        return;
      } else if (media.uri.startsWith('http')) {
        await MediaSaveService.saveRemoteUrl(media.uri, { album: 'Symposium AI' });
      } else {
        await MediaSaveService.saveFileUri(media.uri, { album: 'Symposium AI' });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      ErrorService.showSuccess(`${media.mediaType === 'video' ? 'Video' : 'Audio'} saved to your photo library.`, 'create');
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      ErrorService.handleWithToast(error, { feature: 'create' });
    } finally {
      setSavingMediaId(null);
    }
  }, [mediaGallery]);

  const handleShareMedia = useCallback(async (mediaId: string) => {
    const media = mediaGallery.find((entry) => entry.id === mediaId);
    if (!media) return;

    setSharingMediaId(mediaId);
    try {
      if (isVoicePackEntry(media)) {
        ErrorService.showInfo('This legacy voice pack can play in the app, but podcast files are generated from the completed debate.', 'create');
        return;
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(media.uri, {
          mimeType: media.mimeType,
          UTI: Platform.OS === 'ios' ? getMediaShareUti(media.mimeType) : undefined,
          dialogTitle: `Share ${media.mediaType}`,
        });
        return;
      }

      await Share.share({
        url: media.uri,
        message: `Generated with ${media.providerId}: "${media.prompt}"`,
        title: `Share ${media.mediaType}`,
      });
    } catch (error) {
      ErrorService.handleWithToast(error, { feature: 'create' });
    } finally {
      setSharingMediaId(null);
    }
  }, [mediaGallery]);

  const saveAssetToLibrary = useCallback(async (asset: GalleryAsset): Promise<void> => {
    if (asset.source === 'image') {
      const image = await getResolvedGalleryImage(asset.id);
      if (!image) {
        throw new Error('Image file is unavailable.');
      }

      const currentPermission = await MediaLibrary.getPermissionsAsync();
      const permission = currentPermission.granted
        ? currentPermission
        : await MediaLibrary.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        throw new Error('Photo library permission is required.');
      }
      await MediaLibrary.saveToLibraryAsync(image.uri);
      return;
    }

    const media = asset.entry as GeneratedMediaEntry;
    if (isVoicePackEntry(media)) {
      throw new Error('This legacy voice pack can play in the app, but podcast files are generated from the completed debate.');
    }
    if (media.uri.startsWith('http')) {
      await MediaSaveService.saveRemoteUrl(media.uri, { album: 'Symposium AI' });
    } else {
      await MediaSaveService.saveFileUri(media.uri, { album: 'Symposium AI' });
    }
  }, [getResolvedGalleryImage]);

  const handleSaveAsset = useCallback(async (asset: GalleryAsset) => {
    if (asset.source === 'image') {
      await handleSaveToPhotos(asset.id);
      return;
    }
    await handleSaveMediaToPhotos(asset.id);
  }, [handleSaveMediaToPhotos, handleSaveToPhotos]);

  const handleShareAsset = useCallback(async (asset: GalleryAsset) => {
    if (asset.source === 'image') {
      await handleShare(asset.id);
      return;
    }
    await handleShareMedia(asset.id);
  }, [handleShare, handleShareMedia]);

  const closeAssetDetail = useCallback(() => {
    setReportTarget(null);
    setSelectedAssetId(null);
  }, []);

  const handleReportAsset = useCallback((asset: GalleryAsset) => {
    setReportTarget(buildGalleryAssetReportTarget(asset));
  }, []);

  const handleDeleteAsset = useCallback((asset: GalleryAsset) => {
    const label = getGalleryAssetTypeLabel(asset.type).toLowerCase();
    Alert.alert(
      `Delete ${getGalleryAssetTypeLabel(asset.type)}`,
      `Are you sure you want to delete this ${label}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            setSelectedAssetId(null);
            setSelectedAssetIds((current) => current.filter((id) => id !== asset.id));
            if (asset.source === 'image') {
              dispatch(removeFromGalleryWithCleanup(asset.id));
            } else {
              dispatch(removeFromMediaGalleryWithCleanup(asset.id));
            }
          },
        },
      ]
    );
  }, [dispatch]);

  const handleRefineAsset = useCallback((asset: GalleryAsset) => {
    if (asset.source !== 'image') return;
    handleRefine(asset.id);
  }, [handleRefine]);

  const toggleAssetSelection = useCallback((assetId: string) => {
    setSelectedAssetIds((current) => (
      current.includes(assetId)
        ? current.filter((id) => id !== assetId)
        : [...current, assetId]
    ));
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedAssetIds([]);
  }, []);

  const handleLibraryAssetPress = useCallback((asset: GalleryAsset) => {
    if (selectionMode) {
      toggleAssetSelection(asset.id);
      return;
    }
    setSelectedAssetId(asset.id);
  }, [selectionMode, toggleAssetSelection]);

  const handleLibraryAssetLongPress = useCallback((asset: GalleryAsset) => {
    setSelectionMode(true);
    setSelectedAssetIds((current) => current.includes(asset.id) ? current : [...current, asset.id]);
  }, []);

  const handleBulkDelete = useCallback(() => {
    if (selectedBulkAssets.length === 0) return;
    Alert.alert(
      'Delete Assets',
      `Delete ${selectedBulkAssets.length} selected asset${selectedBulkAssets.length === 1 ? '' : 's'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            selectedBulkAssets.forEach((asset) => {
              if (asset.source === 'image') {
                dispatch(removeFromGalleryWithCleanup(asset.id));
              } else {
                dispatch(removeFromMediaGalleryWithCleanup(asset.id));
              }
            });
            exitSelectionMode();
          },
        },
      ]
    );
  }, [dispatch, exitSelectionMode, selectedBulkAssets]);

  const handleBulkSave = useCallback(async () => {
    if (selectedBulkAssets.length === 0 || bulkSaving) return;
    setBulkSaving(true);
    let failures = 0;
    try {
      for (const asset of selectedBulkAssets) {
        try {
          await saveAssetToLibrary(asset);
        } catch {
          failures += 1;
        }
      }

      if (failures > 0) {
        ErrorService.showWarning(
          `${selectedBulkAssets.length - failures} saved. ${failures} failed.`,
          'create'
        );
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        ErrorService.showSuccess(`${selectedBulkAssets.length} asset${selectedBulkAssets.length === 1 ? '' : 's'} saved.`, 'create');
        exitSelectionMode();
      }
    } finally {
      setBulkSaving(false);
    }
  }, [bulkSaving, exitSelectionMode, saveAssetToLibrary, selectedBulkAssets]);

  const toggleGalleryFilterValue = useCallback((field: 'providers' | 'models' | 'operations', value: string) => {
    setGalleryFilters((current) => {
      const values = current[field];
      return {
        ...current,
        [field]: values.includes(value)
          ? values.filter((item) => item !== value)
          : [...values, value],
      };
    });
  }, []);

  const resetGalleryFilters = useCallback(() => {
    setGalleryFilters(EMPTY_GALLERY_FILTERS);
    setGallerySearch('');
    setGallerySortMode('newest');
  }, []);

  const renderFilterChip = useCallback((
    label: string,
    selected: boolean,
    onPress: () => void,
    key?: string
  ) => (
    <TouchableOpacity
      key={key || label}
      style={[
        styles.libraryChip,
        {
          backgroundColor: selected ? theme.colors.primary[500] : theme.colors.surface,
          borderColor: selected ? theme.colors.primary[500] : theme.colors.border,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Typography
        variant="caption"
        weight="semibold"
        style={{ color: selected ? '#FFFFFF' : theme.colors.text.primary }}
      >
        {label}
      </Typography>
    </TouchableOpacity>
  ), [theme]);

  const renderLibraryAssetItem = useCallback(({ item }: { item: GalleryAsset }) => {
    const selected = selectedAssetIds.includes(item.id);
    const providerLabel = getGalleryAssetProviderLabel(item);
    const modelLabel = getGalleryAssetModelLabel(item);
    const title = item.originalPrompt || item.prompt || getGalleryAssetTypeLabel(item.type);
    const isAudioRow = galleryTab === 'audio';
    const isVideo = item.type === 'video';
    const isAudio = item.type === 'audio';
    const mediaEntry = item.source === 'media' ? item.entry as GeneratedMediaEntry : undefined;
    const videoThumbnailUri = isVideo ? mediaEntry?.thumbnailUri : undefined;
    const voicePackSummary = mediaEntry ? formatVoicePackSummary(mediaEntry) : undefined;
    const subtitle = voicePackSummary || `${providerLabel} • ${modelLabel}${formatGalleryDuration(item.durationSeconds) ? ` • ${formatGalleryDuration(item.durationSeconds)}` : ''}`;

    return (
      <TouchableOpacity
        style={[
          isAudioRow ? styles.audioLibraryRow : styles.libraryCard,
          {
            width: isAudioRow ? '100%' : LIBRARY_CARD_WIDTH,
            backgroundColor: theme.colors.surface,
            borderColor: selected ? theme.colors.primary[500] : theme.colors.border,
          },
        ]}
        onPress={() => handleLibraryAssetPress(item)}
        onLongPress={() => handleLibraryAssetLongPress(item)}
        delayLongPress={350}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={`${getGalleryAssetTypeLabel(item.type)} generated by ${providerLabel}`}
        accessibilityState={{ selected }}
      >
        {isAudioRow ? (
          <>
            <View style={[styles.audioLibraryIcon, { backgroundColor: primaryTintBackground }]}>
              <Ionicons name={voicePackSummary ? 'albums-outline' : 'musical-notes-outline'} size={22} color={primaryAccentColor} />
            </View>
            <View style={styles.audioLibraryText}>
              <Typography variant="body" weight="semibold" numberOfLines={1}>
                {title}
              </Typography>
              <Typography variant="caption" color="secondary" numberOfLines={1}>
                {subtitle}
              </Typography>
            </View>
          </>
        ) : (
          <>
            <View style={styles.libraryPreview}>
              {item.type === 'image' ? (
                <Image source={{ uri: item.uri }} style={styles.libraryImage} resizeMode="cover" />
              ) : videoThumbnailUri ? (
                <>
                  <Image source={{ uri: videoThumbnailUri }} style={styles.libraryImage} resizeMode="cover" />
                  <View style={styles.libraryPlayOverlay} pointerEvents="none">
                    <Ionicons name="play-circle" size={40} color="#FFFFFF" />
                  </View>
                </>
              ) : (
                <View style={[styles.libraryMediaPlaceholder, { backgroundColor: isVideo ? '#111827' : primaryTintBackground }]}>
                  <Ionicons
                    name={isVideo ? 'play-circle-outline' : 'musical-notes-outline'}
                    size={36}
                    color={isVideo ? '#FFFFFF' : primaryAccentColor}
                  />
                </View>
              )}
              <View style={[styles.libraryTypeBadge, { backgroundColor: 'rgba(0,0,0,0.65)' }]}>
                <Ionicons
                  name={isVideo ? 'videocam-outline' : isAudio ? 'musical-notes-outline' : 'image-outline'}
                  size={13}
                  color="#FFFFFF"
                />
                <Typography variant="caption" style={{ color: '#FFFFFF', fontSize: 11 }}>
                  {getGalleryAssetTypeLabel(item.type)}
                </Typography>
              </View>
              {selectionMode && (
                <View style={[styles.selectionBadge, { backgroundColor: selected ? theme.colors.primary[500] : 'rgba(0,0,0,0.45)' }]}>
                  <Ionicons name={selected ? 'checkmark' : 'ellipse-outline'} size={18} color="#FFFFFF" />
                </View>
              )}
            </View>
            <View style={styles.libraryCardBody}>
              <Typography variant="caption" weight="semibold" numberOfLines={1}>
                {title}
              </Typography>
              <Typography variant="caption" color="secondary" numberOfLines={1}>
                {providerLabel} • {modelLabel}
              </Typography>
              <Typography variant="caption" color="secondary" numberOfLines={1}>
                {formatGalleryDate(item.createdAt)}
              </Typography>
            </View>
          </>
        )}
        {isAudioRow && selectionMode && (
          <Ionicons
            name={selected ? 'checkmark-circle' : 'ellipse-outline'}
            size={24}
            color={selected ? theme.colors.primary[500] : theme.colors.text.secondary}
          />
        )}
      </TouchableOpacity>
    );
  }, [
    galleryTab,
    handleLibraryAssetLongPress,
    handleLibraryAssetPress,
    primaryAccentColor,
    primaryTintBackground,
    selectedAssetIds,
    selectionMode,
    theme,
  ]);

  const renderLibraryControls = () => (
    <View style={[styles.libraryControls, { backgroundColor: theme.colors.background }]}>
      <View style={styles.librarySummaryRow}>
        <Typography variant="caption" color="secondary">
          {galleryAssets.length} / {LOCAL_GALLERY_ASSET_LIMIT} assets
        </Typography>
        {isNearRetentionLimit && (
          <Typography variant="caption" style={{ color: theme.colors.warning[600] }}>
            Near limit
          </Typography>
        )}
      </View>

      <View style={[styles.searchBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Ionicons name="search-outline" size={18} color={theme.colors.text.secondary} />
        <TextInput
          style={[styles.searchInput, { color: theme.colors.text.primary }]}
          placeholder="Search Gallery"
          placeholderTextColor={theme.colors.text.secondary}
          value={gallerySearch}
          onChangeText={setGallerySearch}
          returnKeyType="search"
        />
        {gallerySearch.length > 0 && (
          <TouchableOpacity onPress={() => setGallerySearch('')} accessibilityRole="button" accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={theme.colors.text.secondary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryTabScroll}>
        {GALLERY_TABS.map((tab) => {
          const selected = galleryTab === tab.value;
          return (
            <TouchableOpacity
              key={tab.value}
              style={[
                styles.galleryTabButton,
                {
                  backgroundColor: selected ? theme.colors.primary[500] : theme.colors.surface,
                  borderColor: selected ? theme.colors.primary[500] : theme.colors.border,
                },
              ]}
              onPress={() => setGalleryTab(tab.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Ionicons name={tab.icon} size={16} color={selected ? '#FFFFFF' : theme.colors.text.secondary} />
              <Typography
                variant="caption"
                weight="semibold"
                style={{ color: selected ? '#FFFFFF' : theme.colors.text.primary }}
              >
                {tab.label} {galleryCounts[tab.value]}
              </Typography>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.libraryToolbar}>
        <TouchableOpacity
          style={[styles.toolbarButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
          onPress={() => setFilterSheetVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Open gallery filters"
        >
          <Ionicons name="options-outline" size={18} color={theme.colors.text.primary} />
          <Typography variant="caption" weight="semibold">
            Filters{activeFilterCount > 0 ? ` ${activeFilterCount}` : ''}
          </Typography>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toolbarButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
          onPress={() => setSelectionMode((current) => !current)}
          accessibilityRole="button"
          accessibilityLabel={selectionMode ? 'Exit select mode' : 'Select assets'}
        >
          <Ionicons name={selectionMode ? 'close-outline' : 'checkmark-circle-outline'} size={18} color={theme.colors.text.primary} />
          <Typography variant="caption" weight="semibold">
            {selectionMode ? 'Cancel' : 'Select'}
          </Typography>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderFilterSheet = () => (
    <Modal
      visible={filterSheetVisible}
      animationType="slide"
      transparent
      onRequestClose={() => setFilterSheetVisible(false)}
    >
      <View style={styles.modalScrim}>
        <View style={[styles.filterSheet, { backgroundColor: theme.colors.background }]}>
          <View style={styles.sheetHeader}>
            <Typography variant="subtitle" weight="semibold">
              Gallery Filters
            </Typography>
            <TouchableOpacity onPress={() => setFilterSheetVisible(false)} accessibilityRole="button" accessibilityLabel="Close filters">
              <Ionicons name="close-outline" size={24} color={theme.colors.text.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.filterSheetContent}>
            <View style={styles.filterGroup}>
              <Typography variant="caption" color="secondary" weight="semibold">
                Sort
              </Typography>
              <View style={styles.filterChipGrid}>
                {GALLERY_SORT_OPTIONS.map((option) => renderFilterChip(
                  option.label,
                  gallerySortMode === option.value,
                  () => setGallerySortMode(option.value),
                  option.value
                ))}
              </View>
            </View>

            <View style={styles.filterGroup}>
              <Typography variant="caption" color="secondary" weight="semibold">
                Date
              </Typography>
              <View style={styles.filterChipGrid}>
                {GALLERY_DATE_FILTERS.map((option) => renderFilterChip(
                  option.label,
                  galleryFilters.dateRange === option.value,
                  () => setGalleryFilters((current) => ({ ...current, dateRange: option.value })),
                  option.value
                ))}
              </View>
            </View>

            <View style={styles.filterGroup}>
              <Typography variant="caption" color="secondary" weight="semibold">
                Status
              </Typography>
              <View style={styles.filterChipGrid}>
                {GALLERY_AVAILABILITY_FILTERS.map((option) => renderFilterChip(
                  option.label,
                  galleryFilters.availability === option.value,
                  () => setGalleryFilters((current) => ({ ...current, availability: option.value })),
                  option.value
                ))}
              </View>
            </View>

            {providerFilterOptions.length > 0 && (
              <View style={styles.filterGroup}>
                <Typography variant="caption" color="secondary" weight="semibold">
                  Provider
                </Typography>
                <View style={styles.filterChipGrid}>
                  {providerFilterOptions.map((providerId) => renderFilterChip(
                    getGalleryProviderFilterLabel(providerId),
                    galleryFilters.providers.includes(providerId),
                    () => toggleGalleryFilterValue('providers', providerId),
                    providerId
                  ))}
                </View>
              </View>
            )}

            {modelFilterOptions.length > 0 && (
              <View style={styles.filterGroup}>
                <Typography variant="caption" color="secondary" weight="semibold">
                  Model
                </Typography>
                <View style={styles.filterChipGrid}>
                  {modelFilterOptions.map((modelId) => renderFilterChip(
                    modelId,
                    galleryFilters.models.includes(modelId),
                    () => toggleGalleryFilterValue('models', modelId),
                    modelId
                  ))}
                </View>
              </View>
            )}

            {operationFilterOptions.length > 0 && (
              <View style={styles.filterGroup}>
                <Typography variant="caption" color="secondary" weight="semibold">
                  Operation
                </Typography>
                <View style={styles.filterChipGrid}>
                  {operationFilterOptions.map((operation) => renderFilterChip(
                    operation.replace(/_/g, ' '),
                    galleryFilters.operations.includes(operation),
                    () => toggleGalleryFilterValue('operations', operation),
                    operation
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.sheetActions}>
            <TouchableOpacity
              style={[styles.sheetActionButton, { borderColor: theme.colors.border }]}
              onPress={resetGalleryFilters}
              accessibilityRole="button"
            >
              <Typography variant="body" weight="semibold">
                Reset
              </Typography>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetActionButton, { backgroundColor: theme.colors.primary[500], borderColor: theme.colors.primary[500] }]}
              onPress={() => setFilterSheetVisible(false)}
              accessibilityRole="button"
            >
              <Typography variant="body" weight="semibold" style={{ color: '#FFFFFF' }}>
                Done
              </Typography>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderDetailRow = (label: string, value?: string | number) => {
    if (value === undefined || value === null || value === '') return null;
    return (
      <View style={styles.detailMetaRow}>
        <Typography variant="caption" color="secondary">
          {label}
        </Typography>
        <Typography variant="caption" weight="semibold" style={styles.detailMetaValue}>
          {String(value)}
        </Typography>
      </View>
    );
  };

  const renderAssetDetail = () => {
    if (!selectedAsset) return null;
    const canRefineSelected = selectedAsset.source === 'image' &&
      supportsImageInput(
        (selectedAsset.entry as GeneratedImageEntry).provider,
        (selectedAsset.entry as GeneratedImageEntry).model
      );
    const title = selectedAsset.originalPrompt || selectedAsset.prompt || getGalleryAssetTypeLabel(selectedAsset.type);
    const providerLabel = getGalleryAssetProviderLabel(selectedAsset);
    const modelLabel = getGalleryAssetModelLabel(selectedAsset);
    const selectedMediaEntry = selectedAsset.source === 'media'
      ? selectedAsset.entry as GeneratedMediaEntry
      : undefined;
    const selectedVoicePack = selectedMediaEntry && isVoicePackEntry(selectedMediaEntry)
      ? selectedMediaEntry.voicePack
      : undefined;
    const isSavingSelected = selectedAsset.source === 'image'
      ? savingImage
      : savingMediaId === selectedAsset.id;
    const isSharingSelected = selectedAsset.source === 'image'
      ? sharingImageId === selectedAsset.id
      : sharingMediaId === selectedAsset.id;

    return (
      <Modal
        visible={Boolean(selectedAsset)}
        animationType="slide"
        onRequestClose={reportTarget ? () => setReportTarget(null) : closeAssetDetail}
      >
        <View style={[styles.detailContainer, { backgroundColor: theme.colors.background, paddingTop: insets.top + 8 }]}>
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={closeAssetDetail} accessibilityRole="button" accessibilityLabel="Close preview">
              <Ionicons name="close-outline" size={28} color={theme.colors.text.primary} />
            </TouchableOpacity>
            <View style={styles.detailHeaderText}>
              <Typography variant="subtitle" weight="semibold" numberOfLines={1}>
                {getGalleryAssetTypeLabel(selectedAsset.type)}
              </Typography>
              <Typography variant="caption" color="secondary" numberOfLines={1}>
                {providerLabel} • {modelLabel}
              </Typography>
            </View>
            <TouchableOpacity onPress={() => handleDeleteAsset(selectedAsset)} accessibilityRole="button" accessibilityLabel="Delete asset">
              <Ionicons name="trash-outline" size={24} color={theme.colors.error[500]} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
            {selectedAsset.type === 'image' && (
              <Image source={{ uri: selectedAsset.uri }} style={styles.detailImage} resizeMode="contain" />
            )}
            {selectedAsset.type === 'video' && (
              <VideoPreview
                mediaId={selectedAsset.id}
                uri={selectedAsset.uri}
                style={styles.detailVideo}
              />
            )}
            {selectedAsset.type === 'audio' && (
              selectedVoicePack ? (
                <VoicePackPreview manifest={selectedVoicePack} theme={theme} isDark={isDark} />
              ) : selectedMediaEntry ? (
                <AudioPreview
                  uri={selectedAsset.uri}
                  metadata={buildGeneratedAudioMetadata(selectedMediaEntry)}
                  theme={theme}
                  isDark={isDark}
                />
              ) : (
                <AudioPreview
                  uri={selectedAsset.uri}
                  metadata={{ title, artist: providerLabel, albumTitle: 'Symposium AI' }}
                  theme={theme}
                  isDark={isDark}
                />
              )
            )}

            <View style={[styles.detailPanel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Typography variant="body" weight="semibold">
                {title}
              </Typography>
              {selectedAsset.prompt !== title && (
                <Typography variant="caption" color="secondary" style={styles.detailPrompt}>
                  {selectedAsset.prompt}
                </Typography>
              )}
              <View style={styles.detailMeta}>
                {renderDetailRow('Type', getGalleryAssetTypeLabel(selectedAsset.type))}
                {renderDetailRow('Provider', providerLabel)}
                {renderDetailRow('Model', modelLabel)}
                {renderDetailRow('Operation', selectedAsset.operation?.replace(/_/g, ' '))}
                {selectedVoicePack && renderDetailRow('Clips', String(selectedVoicePack.clips.length))}
                {selectedVoicePack && renderDetailRow('Pause', `${(selectedVoicePack.pauseMs / 1000).toFixed(1)}s between speakers`)}
                {renderDetailRow('Duration', formatGalleryDuration(selectedAsset.durationSeconds))}
                {renderDetailRow('Created', formatGalleryDate(selectedAsset.createdAt))}
                {renderDetailRow('Status', selectedAsset.status)}
                {renderDetailRow('MIME', selectedVoicePack ? 'Voice pack manifest' : selectedAsset.mimeType)}
              </View>
            </View>
          </ScrollView>

          <View style={[styles.detailActions, { paddingBottom: insets.bottom + 12, borderTopColor: theme.colors.border }]}>
            <TouchableOpacity
              style={[styles.detailActionButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
              onPress={() => handleSaveAsset(selectedAsset)}
              disabled={isSavingSelected}
              accessibilityRole="button"
            >
              {isSavingSelected ? (
                <ActivityIndicator size="small" color={theme.colors.primary[500]} />
              ) : (
                <Ionicons name="download-outline" size={22} color={theme.colors.text.primary} />
              )}
              <Typography variant="caption" weight="semibold">
                Save
              </Typography>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.detailActionButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
              onPress={() => handleShareAsset(selectedAsset)}
              disabled={isSharingSelected}
              accessibilityRole="button"
            >
              {isSharingSelected ? (
                <ActivityIndicator size="small" color={theme.colors.primary[500]} />
              ) : (
                <Ionicons name="share-outline" size={22} color={theme.colors.text.primary} />
              )}
              <Typography variant="caption" weight="semibold">
                Share
              </Typography>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.detailActionButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
              onPress={() => handleReportAsset(selectedAsset)}
              accessibilityRole="button"
              accessibilityLabel="Report AI content"
              testID={`report-create-asset-${selectedAsset.id}`}
            >
              <Ionicons name="flag-outline" size={22} color={theme.colors.error[500]} />
              <Typography variant="caption" weight="semibold" style={{ color: theme.colors.error[500] }}>
                Report
              </Typography>
            </TouchableOpacity>

            {canRefineSelected && (
              <TouchableOpacity
                style={[styles.detailActionButton, { backgroundColor: theme.colors.primary[500], borderColor: theme.colors.primary[500] }]}
                onPress={() => handleRefineAsset(selectedAsset)}
                accessibilityRole="button"
              >
                <Ionicons name="color-wand-outline" size={22} color="#FFFFFF" />
                <Typography variant="caption" weight="semibold" style={{ color: '#FFFFFF' }}>
                  Refine
                </Typography>
              </TouchableOpacity>
            )}
          </View>
          <GeneratedContentReportModal
            visible={reportTarget !== null}
            target={reportTarget}
            onClose={() => setReportTarget(null)}
            presentation="overlay"
          />
        </View>
      </Modal>
    );
  };

  const renderBulkActionBar = () => {
    if (!selectionMode) return null;
    const disabled = selectedAssetIds.length === 0;
    return (
      <View style={[styles.bulkBar, { paddingBottom: insets.bottom + 10, backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }]}>
        <Typography variant="caption" weight="semibold">
          {selectedAssetIds.length} selected
        </Typography>
        <View style={styles.bulkActions}>
          <TouchableOpacity
            style={[styles.bulkButton, { borderColor: theme.colors.border }]}
            onPress={handleBulkSave}
            disabled={disabled || bulkSaving}
            accessibilityRole="button"
          >
            {bulkSaving ? (
              <ActivityIndicator size="small" color={theme.colors.primary[500]} />
            ) : (
              <Ionicons name="download-outline" size={18} color={disabled ? theme.colors.text.disabled : theme.colors.text.primary} />
            )}
            <Typography variant="caption" weight="semibold" color={disabled ? 'disabled' : 'primary'}>
              Save
            </Typography>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bulkButton, { borderColor: theme.colors.error[500] }]}
            onPress={handleBulkDelete}
            disabled={disabled}
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={18} color={disabled ? theme.colors.text.disabled : theme.colors.error[500]} />
            <Typography variant="caption" weight="semibold" style={{ color: disabled ? theme.colors.text.disabled : theme.colors.error[500] }}>
              Delete
            </Typography>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const hasActiveMediaGeneration = Boolean(mediaGeneration.video || mediaGeneration.audio);
  const libraryColumnCount = galleryTab === 'audio' ? 1 : 2;
  const headerTitle = 'Gallery';
  const headerSubtitle = `${galleryCounts.all} asset${galleryCounts.all === 1 ? '' : 's'} • ${galleryCounts.image} images • ${galleryCounts.video} videos • ${galleryCounts.audio} audio`;

  useEffect(() => {
    if (!requestedFocusAssetId || focusedAssetRef.current === requestedFocusAssetId) {
      return;
    }

    const focusedAsset = galleryAssets.find((asset) => asset.id === requestedFocusAssetId);
    if (!focusedAsset) return;

    focusedAssetRef.current = requestedFocusAssetId;
    setGalleryTab(focusedAsset.type);
    setSelectedAssetId(requestedFocusAssetId);
  }, [galleryAssets, requestedFocusAssetId]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={theme.colors.text.primary}
          />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Typography variant="subtitle">
            {headerTitle}
          </Typography>
          <Typography variant="caption" color="secondary">
            {headerSubtitle}
          </Typography>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Generation Progress (visible when the gallery is opened mid-run) */}
      {isGenerating && (
        <View style={[styles.progressContainer, { backgroundColor: theme.colors.surface }]}>
          {(imageGeneration?.providers ?? []).map(provider => {
            const progress = generationProgress[provider] || 'pending';
            return (
              <View key={provider} style={styles.progressItem}>
                <Typography variant="body">
                  {getImageModelDisplayName(provider, imageGeneration?.providerStatuses?.[provider]?.modelId)}
                </Typography>
                {progress === 'generating' && (
                  <ActivityIndicator size="small" color={theme.colors.primary[500]} />
                )}
                {progress === 'complete' && (
                  <Ionicons name="checkmark-circle" size={20} color={theme.colors.success[500]} />
                )}
                {progress === 'error' && (
                  <Ionicons name="close-circle" size={20} color={theme.colors.error[500]} />
                )}
              </View>
            );
          })}
        </View>
      )}

      {hasActiveMediaGeneration && (
        <View style={[styles.progressContainer, { backgroundColor: theme.colors.surface }]}>
          {(['video', 'audio'] as const).map((mediaType) => {
            const current = mediaGeneration[mediaType];
            if (!current) return null;
            return (
              <View key={mediaType} style={styles.progressItem}>
                <Typography variant="body">
                  {mediaType === 'video' ? 'Runway video' : 'ElevenLabs audio'}
                </Typography>
                <View style={styles.progressRight}>
                  <Typography variant="caption" color="secondary">
                    {current.message || current.phase}
                  </Typography>
                  <ActivityIndicator size="small" color={theme.colors.primary[500]} />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Error Message */}
      {errorMessage && (
        <View style={[styles.errorContainer, { backgroundColor: errorSurfaceColor }]}>
          <Typography variant="body" style={{ color: errorTextColor }}>
            {errorMessage}
          </Typography>
        </View>
      )}

      {renderLibraryControls()}

      <FlatList
        key={`gallery-library-${libraryColumnCount}`}
        data={visibleGalleryAssets}
        keyExtractor={(item) => `${item.source}_${item.id}`}
        renderItem={renderLibraryAssetItem}
        numColumns={libraryColumnCount}
        columnWrapperStyle={libraryColumnCount > 1 ? styles.libraryColumnWrapper : undefined}
        contentContainerStyle={[
          styles.libraryContent,
          { paddingBottom: (selectionMode ? 96 : 16) + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons
              name={gallerySearch || activeFilterCount > 0 ? 'search-outline' : 'images-outline'}
              size={58}
              color={theme.colors.text.secondary}
            />
            <Typography variant="body" color="secondary" style={styles.emptyText}>
              {gallerySearch || activeFilterCount > 0 ? 'No matching assets' : greeting.timeBasedGreeting}
            </Typography>
            {(gallerySearch || activeFilterCount > 0) && (
              <TouchableOpacity
                style={[styles.emptyAction, { borderColor: theme.colors.border }]}
                onPress={resetGalleryFilters}
                accessibilityRole="button"
              >
                <Typography variant="caption" weight="semibold">
                  Reset filters
                </Typography>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      {renderBulkActionBar()}
      {renderFilterSheet()}
      {renderAssetDetail()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  progressContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  progressItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
  },
  videoPlayerSurface: {
    ...StyleSheet.absoluteFill,
  },
  videoPressSurface: {
    ...StyleSheet.absoluteFill,
  },
  audioPreview: {
    width: IMAGE_SIZE,
    minHeight: 156,
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 18,
  },
  voicePackPreview: {
    width: IMAGE_SIZE,
    minHeight: 238,
    paddingHorizontal: 20,
    paddingVertical: 22,
    gap: 14,
  },
  voicePackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  voicePackTitleText: {
    flex: 1,
    minWidth: 0,
  },
  voicePackBadge: {
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  voicePackClipPanel: {
    gap: 8,
  },
  audioControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  audioControlButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioSecondaryControlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioPlaybackInfo: {
    gap: 10,
  },
  audioProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  audioProgressSlider: {
    flex: 1,
    minHeight: 36,
  },
  audioTimeText: {
    minWidth: 34,
    textAlign: 'center',
  },
  libraryControls: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  librarySummaryRow: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  searchBox: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    minHeight: 42,
    fontSize: 16,
    paddingVertical: 0,
  },
  galleryTabScroll: {
    gap: 8,
    paddingRight: 16,
  },
  galleryTabButton: {
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  libraryToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  toolbarButton: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  libraryContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: LIBRARY_GAP,
  },
  libraryColumnWrapper: {
    gap: LIBRARY_GAP,
  },
  libraryCard: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: LIBRARY_GAP,
  },
  libraryPreview: {
    width: '100%',
    aspectRatio: 1,
    overflow: 'hidden',
  },
  libraryImage: {
    width: '100%',
    height: '100%',
  },
  libraryMediaPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryPlayOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryTypeBadge: {
    position: 'absolute',
    left: 8,
    top: 8,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  selectionBadge: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryCardBody: {
    padding: 10,
    gap: 2,
  },
  audioLibraryRow: {
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: LIBRARY_GAP,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  audioLibraryIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioLibraryText: {
    flex: 1,
    minWidth: 0,
  },
  libraryChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalScrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  filterSheet: {
    maxHeight: '82%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
  },
  sheetHeader: {
    minHeight: 40,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterSheetContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    gap: 18,
  },
  filterGroup: {
    gap: 8,
  },
  filterChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sheetActions: {
    padding: 16,
    flexDirection: 'row',
    gap: 10,
  },
  sheetActionButton: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailContainer: {
    flex: 1,
  },
  detailHeader: {
    minHeight: 54,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  detailContent: {
    padding: 16,
    gap: 16,
  },
  detailImage: {
    width: '100%',
    height: Math.min(IMAGE_SIZE, 460),
  },
  detailVideo: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    borderRadius: 12,
    overflow: 'hidden',
  },
  detailPanel: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  detailPrompt: {
    marginTop: 4,
  },
  detailMeta: {
    gap: 8,
  },
  detailMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  detailMetaValue: {
    flex: 1,
    textAlign: 'right',
  },
  detailActions: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    flexDirection: 'row',
    gap: 10,
  },
  detailActionButton: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  bulkBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  bulkActions: {
    flexDirection: 'row',
    gap: 8,
  },
  bulkButton: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emptyAction: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    marginTop: 16,
  },
});
