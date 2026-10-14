/**
 * CreateSetupScreen - "The Studio": composer-first entry for image, video, and
 * audio generation. Premium-only feature; each media tab shares one docked
 * composer whose pills come from that tab's provider catalog.
 */
import { useEffect, useCallback, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector, useDispatch } from 'react-redux';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme';
import { useFeatureAccess } from '../hooks/useFeatureAccess';
import { Typography, GradientButton, KeyboardAvoider } from '../components/molecules';
import {
  Header,
  HeaderActions,
  AudioConfigSheet,
  CreateComposer,
  CreateEmptyState,
  CreateGenerationStatusCard,
  CreateMediaStatusCard,
  CreateMediaTabs,
  CreateOptionsSheet,
  VideoConfigSheet,
} from '../components/organisms';
import type { CreateTabSuggestion } from '../components/organisms';
import {
  RootState,
  AppDispatch,
  isApiKeyConfigured,
  setImageOptions,
  setVideoOptions,
  setAudioOptions,
  setAttachments,
  removeAttachment,
  clearAttachments,
} from '../store';
import {
  generateCreateImages,
  setActiveCreateTab,
  markCreateActivitySeen,
  hydrateGallery,
  hydrateMediaGallery,
  backfillVideoThumbnails,
  generateCreateVideo,
  generateCreateAudio,
  clearFinishedGenerations,
  selectCreateState,
} from '../store/createSlice';
import { useCreateComposerSelection } from '../hooks/create/useCreateComposerSelection';
import { useElevenLabsOptions } from '../hooks/create/useElevenLabsOptions';
import { RootStackParamList } from '../types';
import type { CreateMediaOperation, CreateTab } from '../types/media';
import {
  ELEVENLABS_DEFAULT_VOICE_ID,
  RUNWAY_DEFAULT_ASPECT_RATIO,
  RUNWAY_DEFAULT_DURATION_SECONDS,
  RUNWAY_DEFAULT_VIDEO_MODEL,
  getMediaModels,
  getRunwayAspectRatios,
  getRunwayVideoDurations,
} from '../config/mediaProviders';
import { getImageMimeType } from '../services/images/fileCache';
import APIKeyService from '../services/APIKeyService';
import MediaGenerationService from '../services/media/MediaGenerationService';
import { getElevenLabsCreditCheck } from '../services/media/elevenLabsCredits';
import { ErrorService } from '../services/errors/ErrorService';

type NavigationProp = StackNavigationProp<RootStackParamList>;

const COMPOSER_PLACEHOLDERS: Record<CreateTab, string> = {
  image: 'Describe the image to create…',
  video: 'A cinematic tracking shot of…',
  audio: 'Read this in a warm, clear voice…',
};

const TAB_LABELS: Record<CreateTab, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
};

const TAB_SUGGESTION_ORDER: CreateTab[] = ['image', 'video', 'audio'];

const TAB_SUGGESTION_NOTES: Record<CreateTab, string> = {
  image: 'Your image AI keys work on the Image tab.',
  video: 'Your Runway key makes videos.',
  audio: 'Your ElevenLabs key makes voiceovers and sound effects.',
};

const PROMPT_MAX_LENGTHS = {
  image: 4000,
  video: 1000,
  tts: 5000,
  soundEffect: 450,
} as const;

export default function CreateSetupScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const dispatch = useDispatch<AppDispatch>();
  const { isDemo } = useFeatureAccess();

  const createState = useSelector(selectCreateState);
  const apiKeys = useSelector((state: RootState) => state.settings.apiKeys || {});

  const {
    activeTab = 'image',
    galleryHydrated,
    gallery,
    mediaGalleryHydrated = false,
    mediaGallery = [],
    imageGeneration = null,
    mediaGeneration = { video: null, audio: null },
    lastImageGenerationResult,
    lastMediaGenerationResult,
  } = createState;

  // Composer draft selection (pills + persisted options + attachments).
  const composer = useCreateComposerSelection(activeTab);
  const attachments = useSelector((state: RootState) => state.createSelection.attachments);
  const imageAttachments = attachments.image;
  const videoAttachment = attachments.video[0];

  const hasRunwayKey = isApiKeyConfigured(apiKeys.runway);
  const hasElevenLabsKey = isApiKeyConfigured(apiKeys.elevenlabs);
  const { videoOptions, audioOptions } = composer;
  const videoOperation: Extract<CreateMediaOperation, 'text_to_video' | 'image_to_video'> =
    videoAttachment ? 'image_to_video' : 'text_to_video';
  const activeAudioModelId =
    audioOptions.operation === 'text_to_speech'
      ? audioOptions.ttsModelId
      : audioOptions.sfxModelId;

  const elevenLabs = useElevenLabsOptions({
    enabled: activeTab === 'audio' && hasElevenLabsKey && !isDemo,
  });

  // Prompt drafts stay local like Home's inputText; sending clears them.
  const [prompts, setPrompts] = useState<Record<CreateTab, string>>({
    image: '',
    video: '',
    audio: '',
  });
  const [imageOptionsSheetOpen, setImageOptionsSheetOpen] = useState(false);
  const [videoSheetOpen, setVideoSheetOpen] = useState(false);
  const [audioSheetOpen, setAudioSheetOpen] = useState(false);

  const setPromptFor = useCallback((tab: CreateTab, text: string) => {
    setPrompts(current => ({ ...current, [tab]: text }));
  }, []);

  const clearPromptFor = useCallback((tab: CreateTab, submitted: string) => {
    setPrompts(current =>
      current[tab] === submitted ? { ...current, [tab]: '' } : current
    );
  }, []);

  // The chosen Runway model must support the active operation; adding or
  // removing a source image flips the operation, so re-clamp on change.
  useEffect(() => {
    const models = getMediaModels('runway', videoOperation);
    if (models.some(model => model.id === videoOptions.modelId)) return;

    const nextModelId = models[0]?.id || RUNWAY_DEFAULT_VIDEO_MODEL;
    const nextDurations = getRunwayVideoDurations(nextModelId, videoOperation);
    const nextRatios = getRunwayAspectRatios(nextModelId, videoOperation);
    dispatch(setVideoOptions({
      modelId: nextModelId,
      durationSeconds: nextDurations.includes(videoOptions.durationSeconds)
        ? videoOptions.durationSeconds
        : nextDurations[0] || RUNWAY_DEFAULT_DURATION_SECONDS,
      aspectRatio: nextRatios.some(ratio => ratio.id === videoOptions.aspectRatio)
        ? videoOptions.aspectRatio
        : nextRatios[0]?.id || RUNWAY_DEFAULT_ASPECT_RATIO,
    }));
  }, [dispatch, videoOperation, videoOptions]);

  // Seed the first loaded voice once, matching the old auto-select — but only
  // while the persisted choice is still the untouched factory default.
  useEffect(() => {
    const firstVoice = elevenLabs.voices[0];
    if (!firstVoice) return;
    if (audioOptions.voiceId !== ELEVENLABS_DEFAULT_VOICE_ID || audioOptions.voiceName) return;
    dispatch(setAudioOptions({ voiceId: firstVoice.id, voiceName: firstVoice.name }));
  }, [dispatch, elevenLabs.voices, audioOptions.voiceId, audioOptions.voiceName]);

  // Hydrate gallery on mount (skip in demo mode - demo images are URLs, not local files)
  useEffect(() => {
    if (!galleryHydrated && !isDemo) {
      dispatch(hydrateGallery());
    }
    if (!mediaGalleryHydrated && !isDemo) {
      dispatch(hydrateMediaGallery());
    }
  }, [dispatch, galleryHydrated, isDemo, mediaGalleryHydrated]);

  useEffect(() => {
    dispatch(markCreateActivitySeen());
  }, [dispatch]);

  // Older videos predate poster generation; give them thumbnails once hydrated.
  useEffect(() => {
    if (mediaGalleryHydrated && !isDemo) {
      dispatch(backfillVideoThumbnails());
    }
  }, [dispatch, mediaGalleryHydrated, isDemo]);

  // When leaving Create, clear the finished "session complete" result cards so
  // returning starts fresh on the empty state (the RECENT strip persists). An
  // in-flight generation is preserved by the reducer's guard.
  useFocusEffect(
    useCallback(() => () => {
      dispatch(clearFinishedGenerations());
    }, [dispatch])
  );

  // ---------------------------------------------------------------- image tab

  // An attachment turns a plain generation into a refinement; send blocks
  // only when an attachment exists and no selected model can edit images.
  const attachmentBlocked =
    imageAttachments.length > 0 && !composer.imageSupportsSourceInput;
  const imageValidationMessage = !composer.hasEnoughAIs
    ? 'Add an AI to create images'
    : attachmentBlocked
      ? 'Attached image needs a model that can edit images — tap a pill to switch models'
      : null;
  const canSendImage =
    composer.hasEnoughAIs &&
    prompts.image.trim().length > 0 &&
    !attachmentBlocked &&
    !imageGeneration;

  const recentImageAssets = useMemo(
    () =>
      gallery
        .slice(0, 10)
        .map((entry) => ({ id: entry.id, previewUri: entry.uri, type: 'image' as const })),
    [gallery]
  );

  const handlePickImageSource = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please grant access to your photo library to upload image references.',
        [{ text: 'OK' }]
      );
      return;
    }

    const imageMaxReferenceImages = composer.imageMaxReferenceImages;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: imageMaxReferenceImages > 1,
      selectionLimit: imageMaxReferenceImages,
      allowsEditing: imageMaxReferenceImages <= 1,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      const nextAttachments = result.assets
        .map((asset) => asset.uri)
        .filter(Boolean)
        .slice(0, imageMaxReferenceImages)
        .map((uri) => ({ uri, mimeType: getImageMimeType(uri) }));
      dispatch(setAttachments({ tab: 'image', attachments: nextAttachments }));
    }
  }, [composer.imageMaxReferenceImages, dispatch]);

  const handleUseLatestImageAsImageSource = useCallback(() => {
    const latest = gallery[0];
    if (!latest?.uri) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dispatch(setAttachments({
      tab: 'image',
      attachments: [{ uri: latest.uri, galleryAssetId: latest.id }],
    }));
  }, [gallery, dispatch]);

  const handleSendImage = useCallback(async (text: string) => {
    if (!canSendImage) return;

    const { providers, selectedModels, modelSettings } = composer.imageSelectionMaps;
    const { style, size, count } = composer.imageOptions;

    try {
      const result = await dispatch(generateCreateImages({
        prompt: text,
        providers,
        selectedModels,
        style,
        size,
        imageCount: count,
        modelSettings,
        sourceImages: imageAttachments.map((attachment) => ({
          uri: attachment.uri,
          mimeType: attachment.mimeType || getImageMimeType(attachment.uri),
        })),
        isUploaded: imageAttachments.length > 0,
        refinementInstructions: imageAttachments.length > 0 ? text : undefined,
      })).unwrap();

      clearPromptFor('image', text);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (result.ids.length === 1) {
        navigation.navigate('CreateSession', { focusAssetId: result.ids[0], galleryTab: 'image' });
      } else if (result.ids.length > 1) {
        navigation.navigate('CreateSession', { galleryTab: 'image' });
      }
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      ErrorService.handleWithToast(error, { feature: 'create' });
    }
  }, [
    canSendImage,
    composer.imageSelectionMaps,
    composer.imageOptions,
    clearPromptFor,
    dispatch,
    imageAttachments,
    navigation,
  ]);

  // ---------------------------------------------------------------- video tab

  const canSendVideo =
    composer.hasEnoughAIs &&
    activeTab === 'video' &&
    (prompts.video.trim().length > 0 || Boolean(videoAttachment)) &&
    !mediaGeneration.video;
  const videoValidationMessage =
    activeTab === 'video' && !hasRunwayKey ? 'Connect Runway to generate videos' : null;

  const recentVideoAssets = useMemo(
    () =>
      mediaGallery
        .filter((entry) => entry.mediaType === 'video')
        .slice(0, 10)
        .map((entry) => ({
          id: entry.id,
          type: 'video' as const,
          previewUri: entry.thumbnailUri,
          durationSeconds: entry.durationSeconds,
        })),
    [mediaGallery]
  );

  const handlePickVideoSource = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      ErrorService.showWarning('Please allow photo access to use a source image.', 'create');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.9,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      const uri = result.assets[0].uri;
      dispatch(setAttachments({
        tab: 'video',
        attachments: [{ uri, mimeType: getImageMimeType(uri) }],
      }));
    }
  }, [dispatch]);

  const handleUseLatestImageAsVideoSource = useCallback(() => {
    const latest = gallery[0];
    if (!latest?.uri) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dispatch(setAttachments({
      tab: 'video',
      attachments: [{ uri: latest.uri, galleryAssetId: latest.id }],
    }));
  }, [gallery, dispatch]);

  const handleSendVideo = useCallback(async (text: string) => {
    if (!canSendVideo) return;

    try {
      await dispatch(generateCreateVideo({
        prompt: text,
        modelId: videoOptions.modelId,
        durationSeconds: videoOptions.durationSeconds,
        aspectRatio: videoOptions.aspectRatio,
        sourceImageUri: videoAttachment?.uri,
      })).unwrap();
      clearPromptFor('video', text);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      ErrorService.handleWithToast(error, { feature: 'create', provider: 'runway' });
    }
  }, [canSendVideo, clearPromptFor, dispatch, videoAttachment, videoOptions]);

  // ---------------------------------------------------------------- audio tab

  const canSendAudio =
    composer.hasEnoughAIs &&
    activeTab === 'audio' &&
    prompts.audio.trim().length > 0 &&
    !mediaGeneration.audio;
  const audioValidationMessage =
    activeTab === 'audio' && !hasElevenLabsKey
      ? 'Connect ElevenLabs to generate audio'
      : null;

  const recentAudioAssets = useMemo(
    () =>
      mediaGallery
        .filter((entry) => entry.mediaType === 'audio')
        .slice(0, 10)
        .map((entry) => ({
          id: entry.id,
          type: 'audio' as const,
          label: entry.voicePack?.topic || entry.prompt,
          durationSeconds: entry.durationSeconds,
          operation: entry.operation,
        })),
    [mediaGallery]
  );

  const handleSendAudio = useCallback(async (text: string) => {
    if (!canSendAudio) return;

    const { operation } = audioOptions;
    try {
      if (operation === 'text_to_speech') {
        const key = await APIKeyService.getKey('elevenlabs');
        if (!key) {
          throw new Error('Add an ElevenLabs API key before generating audio.');
        }
        const subscription = await MediaGenerationService.getElevenLabsSubscription(key).catch(() => undefined);
        const creditCheck = getElevenLabsCreditCheck(text, activeAudioModelId, subscription);
        if (creditCheck.shouldBlock) {
          ErrorService.showWarning(creditCheck.message || 'Not enough ElevenLabs credits to generate audio.', 'create');
          return;
        }
        if (creditCheck.shouldWarn && creditCheck.message) {
          const confirmed = await new Promise<boolean>((resolve) => {
            Alert.alert(
              'Use ElevenLabs credits?',
              creditCheck.message,
              [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Generate', onPress: () => resolve(true) },
              ],
              { cancelable: true, onDismiss: () => resolve(false) }
            );
          });
          if (!confirmed) return;
        }
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await dispatch(generateCreateAudio({
        prompt: text,
        operation,
        modelId: activeAudioModelId,
        voiceId: operation === 'text_to_speech' ? audioOptions.voiceId : undefined,
        outputFormat: audioOptions.outputFormat,
        durationSeconds: operation === 'sound_effect' ? audioOptions.durationSeconds : undefined,
        promptInfluence: operation === 'sound_effect' ? audioOptions.promptInfluence : undefined,
      })).unwrap();
      clearPromptFor('audio', text);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      ErrorService.handleWithToast(error, { feature: 'create', provider: 'elevenlabs' });
    }
  }, [activeAudioModelId, audioOptions, canSendAudio, clearPromptFor, dispatch]);

  // ------------------------------------------------------------------ shared

  const handleGalleryPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (isDemo) {
      Alert.alert(
        'Gallery Unavailable in Demo',
        'The media gallery is available with a premium subscription. Upgrade to save and manage your generated assets.',
        [
          { text: 'Maybe Later', style: 'cancel' },
          { text: 'Upgrade', onPress: () => navigation.navigate('Subscription') },
        ]
      );
      return;
    }

    navigation.navigate('CreateSession', {});
  }, [navigation, isDemo]);

  const handleTabChange = useCallback((tab: CreateTab) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImageOptionsSheetOpen(false);
    setVideoSheetOpen(false);
    setAudioSheetOpen(false);
    dispatch(setActiveCreateTab(tab));
  }, [dispatch]);

  const handleViewMediaInGallery = useCallback((mediaId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const media = mediaGallery.find((entry) => entry.id === mediaId);
    navigation.navigate('CreateSession', media?.mediaType
      ? { focusMediaId: mediaId, galleryTab: media.mediaType }
      : { focusMediaId: mediaId });
  }, [mediaGallery, navigation]);

  const handleViewImagesInGallery = useCallback((imageIds?: string[]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const ids = imageIds || lastImageGenerationResult?.ids || [];
    navigation.navigate('CreateSession', ids.length === 1
      ? { focusAssetId: ids[0], galleryTab: 'image' }
      : { galleryTab: 'image' });
  }, [lastImageGenerationResult, navigation]);

  const handleAddKey = useCallback((providerId?: string) => {
    if (providerId) {
      navigation.navigate('APIConfig', { providerId });
    } else {
      navigation.navigate('APIConfig');
    }
  }, [navigation]);

  const handleMediaPillPress = useCallback((_index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (activeTab === 'video') setVideoSheetOpen(true);
    if (activeTab === 'audio') setAudioSheetOpen(true);
  }, [activeTab]);

  // The active tab has no provider but another tab does (e.g. only a Runway
  // key while on Image): say what the key is for and offer to switch.
  const tabSuggestion = useMemo<CreateTabSuggestion | null>(() => {
    if (composer.readyTabs[activeTab]) return null;
    const target = TAB_SUGGESTION_ORDER.find((tab) => tab !== activeTab && composer.readyTabs[tab]);
    if (!target) return null;
    return {
      note: TAB_SUGGESTION_NOTES[target],
      label: `Switch to ${TAB_LABELS[target]}`,
      onPress: () => handleTabChange(target),
    };
  }, [activeTab, composer.readyTabs, handleTabChange]);

  // Demo mode gate - only demo users should be blocked
  if (isDemo) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['left', 'right']}
      >
        <Header
          variant="gradient"
          slim
          title="The Studio"
          rightElement={<HeaderActions variant="gradient" helpCategoryId="create" />}
        />
        <View style={styles.premiumGate}>
          <Ionicons
            name="sparkles"
            size={64}
            color={theme.colors.primary[500]}
          />
          <Typography variant="title" style={styles.premiumTitle}>
            The Studio
          </Typography>
          <Typography
            variant="body"
            color="secondary"
            style={styles.premiumDescription}
          >
            Generate images, videos, voiceovers, and sound effects with your own provider keys.
            This is a premium feature.
          </Typography>
          <GradientButton
            title="Upgrade to Premium"
            onPress={() => navigation.navigate('Subscription')}
            style={styles.upgradeButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  const activeVideoStatus = mediaGeneration.video ||
    (lastMediaGenerationResult?.mediaType === 'video' ? lastMediaGenerationResult : undefined);
  const activeAudioStatus = mediaGeneration.audio ||
    (lastMediaGenerationResult?.mediaType === 'audio' ? lastMediaGenerationResult : undefined);

  const centerRegion = (() => {
    if (activeTab === 'image') {
      if (imageGeneration || lastImageGenerationResult) {
        return (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.statusScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <CreateGenerationStatusCard
              generation={imageGeneration}
              result={lastImageGenerationResult}
              selectedModels={composer.imageSelectionMaps.selectedModels}
              onViewInGallery={handleViewImagesInGallery}
            />
          </ScrollView>
        );
      }
      return (
        <CreateEmptyState
          tab="image"
          hasConfiguredProviders={composer.configuredProviderIds.length > 0}
          tabSuggestion={tabSuggestion}
          recentAssets={recentImageAssets}
          onPressRecent={(asset) =>
            navigation.navigate('CreateSession', { focusAssetId: asset.id, galleryTab: 'image' })
          }
          onConfigureProviders={() => handleAddKey()}
          testID="create-empty-state"
        />
      );
    }

    if (activeTab === 'video') {
      if (activeVideoStatus) {
        return (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.statusScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <CreateMediaStatusCard
              mediaType="video"
              label="Video"
              generation={mediaGeneration.video}
              result={lastMediaGenerationResult}
              onViewInGallery={handleViewMediaInGallery}
            />
          </ScrollView>
        );
      }
      return (
        <CreateEmptyState
          tab="video"
          hasConfiguredProviders={hasRunwayKey}
          tabSuggestion={tabSuggestion}
          recentAssets={recentVideoAssets}
          onPressRecent={(asset) =>
            navigation.navigate('CreateSession', { focusMediaId: asset.id, galleryTab: 'video' })
          }
          onConfigureProviders={() => handleAddKey('runway')}
          testID="create-empty-state"
        />
      );
    }

    if (activeAudioStatus) {
      return (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.statusScroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <CreateMediaStatusCard
            mediaType="audio"
            label={audioOptions.operation === 'text_to_speech' ? 'Voiceover' : 'Sound Effect'}
            generation={mediaGeneration.audio}
            result={lastMediaGenerationResult}
            onViewInGallery={handleViewMediaInGallery}
          />
        </ScrollView>
      );
    }
    return (
      <CreateEmptyState
        tab="audio"
        hasConfiguredProviders={hasElevenLabsKey}
        tabSuggestion={tabSuggestion}
        recentAssets={recentAudioAssets}
        onPressRecent={(asset) =>
          navigation.navigate('CreateSession', { focusMediaId: asset.id, galleryTab: 'audio' })
        }
        onConfigureProviders={() => handleAddKey('elevenlabs')}
        testID="create-empty-state"
      />
    );
  })();

  const composerPropsByTab = {
    image: {
      onSend: handleSendImage,
      canSend: canSendImage,
      validationMessage: imageValidationMessage,
      maxLength: PROMPT_MAX_LENGTHS.image,
      placeholder: COMPOSER_PLACEHOLDERS.image,
    },
    video: {
      onSend: handleSendVideo,
      canSend: canSendVideo,
      onBlockedSend: hasRunwayKey ? undefined : () => handleAddKey('runway'),
      validationMessage: videoValidationMessage,
      maxLength: PROMPT_MAX_LENGTHS.video,
      placeholder: videoAttachment
        ? 'Describe how the image should move…'
        : COMPOSER_PLACEHOLDERS.video,
    },
    audio: {
      onSend: handleSendAudio,
      canSend: canSendAudio,
      onBlockedSend: hasElevenLabsKey ? undefined : () => handleAddKey('elevenlabs'),
      validationMessage: audioValidationMessage,
      maxLength:
        audioOptions.operation === 'text_to_speech'
          ? PROMPT_MAX_LENGTHS.tts
          : PROMPT_MAX_LENGTHS.soundEffect,
      placeholder:
        audioOptions.operation === 'text_to_speech'
          ? COMPOSER_PLACEHOLDERS.audio
          : 'Soft rain on a window with distant thunder…',
    },
  }[activeTab];

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['left', 'right']}
    >
      <Header
        variant="gradient"
        slim
        title="The Studio"
        rightElement={<HeaderActions variant="gradient" helpCategoryId="create" />}
      />
      <KeyboardAvoider style={styles.flex}>
        <View style={styles.composerLayout}>
          <CreateMediaTabs
            activeTab={activeTab}
            onChange={handleTabChange}
            onGalleryPress={handleGalleryPress}
            testID="create-tabs"
          />

          {centerRegion}

          <CreateComposer
            key={activeTab}
            tab={activeTab}
            configs={composer.configs}
            maxAIs={activeTab === 'image' ? 3 : 1}
            onAddProvider={composer.addProvider}
            onUpdateConfig={composer.updateConfig}
            onRemoveConfig={composer.removeConfig}
            pickerProviders={composer.pickerProviders}
            configuredProviderIds={composer.configuredProviderIds}
            onRequestAddKey={handleAddKey}
            attachments={composer.attachments}
            onRemoveAttachment={(uri) => dispatch(removeAttachment({ tab: activeTab, uri }))}
            onOpenOptions={activeTab === 'image' ? () => setImageOptionsSheetOpen(true) : undefined}
            onAttachImage={
              activeTab === 'video'
                ? handlePickVideoSource
                : activeTab === 'image'
                  ? handlePickImageSource
                  : undefined
            }
            onMediaPillPress={handleMediaPillPress}
            inputText={prompts[activeTab]}
            onChangeText={(text) => setPromptFor(activeTab, text)}
            testID="create-composer"
            {...composerPropsByTab}
          />
        </View>
      </KeyboardAvoider>

      <CreateOptionsSheet
        visible={imageOptionsSheetOpen}
        onClose={() => setImageOptionsSheetOpen(false)}
        style={composer.imageOptions.style}
        onChangeStyle={(style) => dispatch(setImageOptions({ style }))}
        size={composer.imageOptions.size}
        onChangeSize={(size) => dispatch(setImageOptions({ size }))}
        count={composer.imageOptions.count}
        maxCount={composer.imageMaxCount}
        onChangeCount={(count) => dispatch(setImageOptions({ count }))}
        onAttachImage={handlePickImageSource}
        onUseLatestImage={gallery.length > 0 ? handleUseLatestImageAsImageSource : undefined}
        attachDisabledReason={
          composer.imageSupportsSourceInput
            ? undefined
            : 'Select a model with image input to use references'
        }
        testID="create-options-sheet"
      />

      <VideoConfigSheet
        visible={videoSheetOpen}
        onClose={() => setVideoSheetOpen(false)}
        operation={videoOperation}
        options={videoOptions}
        onChange={(patch) => dispatch(setVideoOptions(patch))}
        onUploadSource={handlePickVideoSource}
        onUseLatestImage={gallery.length > 0 ? handleUseLatestImageAsVideoSource : undefined}
        onClearSource={() => dispatch(clearAttachments({ tab: 'video' }))}
        testID="create-video-sheet"
      />

      <AudioConfigSheet
        visible={audioSheetOpen}
        onClose={() => setAudioSheetOpen(false)}
        options={audioOptions}
        onChange={(patch) => dispatch(setAudioOptions(patch))}
        voices={elevenLabs.voices}
        models={elevenLabs.models}
        voiceTotalCount={elevenLabs.voiceTotalCount}
        loadingVoices={elevenLabs.loadingOptions}
        creditSummary={hasElevenLabsKey ? elevenLabs.creditSummary : undefined}
        elevenLabsTier={elevenLabs.subscription?.tier}
        onLoadVoices={elevenLabs.loadVoices}
        onLoadSharedVoices={elevenLabs.loadSharedVoices}
        onAddSharedVoice={elevenLabs.addSharedVoice}
        onVoicePicked={elevenLabs.mergeVoice}
        testID="create-audio-sheet"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  composerLayout: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  statusScroll: {
    paddingBottom: 16,
  },
  premiumGate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  premiumTitle: {
    marginTop: 16,
    marginBottom: 8,
  },
  premiumDescription: {
    textAlign: 'center',
    marginBottom: 24,
  },
  upgradeButton: {
    width: '100%',
  },
});
