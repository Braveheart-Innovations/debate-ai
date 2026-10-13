import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ScrollView, Alert, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, setAIModel, preserveTopic, clearPreservedTopic, isApiKeyConfigured } from '../store';

import { Box, ResponsiveContainer } from '../components/atoms';
import { Button, Typography, GradientButton, HeaderIcon, InfoButton, SegmentedControl } from '../components/molecules';
import { useResponsive } from '../hooks/useResponsive';
import { Header, HeaderActions } from '../components/organisms';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { DebateTopicSelector } from '../components/organisms/debate';
import { DebateTeamsCard, type DebateTeamSlotDescriptor, type DebateTeamsStatusNote } from '../components/organisms/debate/DebateTeamsCard';
import { DebateSlotConfigSheet } from '../components/organisms/debate/DebateSlotConfigSheet';
import { ProviderPickerSheet } from '../components/organisms/composer/ProviderPickerSheet';
import { AIAvatar } from '../components/organisms/common/AIAvatar';

import { useTheme } from '../theme';
import { AIConfig, type DebateVoiceConfig, type DebateVoiceSelection } from '../types';
import type { ElevenLabsSharedVoiceQuery, ElevenLabsVoiceListQuery, MediaProviderOptionsResponse, MediaProviderVoiceOption } from '@/types/media';
import type { DemoDebate } from '@/types/demo';
import { AI_PROVIDERS } from '../config/aiProviders';
import { FormatModal } from '../components/organisms/debate/FormatModal';
import { TopicService } from '../services/debate/TopicService';
import type { DebateRematchSetup } from '../services/debate/debateRematch';
import { getModelById, getProviderDefaultModel, resolveProviderModelId } from '@/config/modelConfigs';
import { getAIProviderIcon } from '../utils/aiProviderAssets';
import { isValidProviderId } from '../utils/typeGuards';
import { usePreDebateValidation } from '../hooks/debate';
import { Card } from '@/components/molecules';
import { FORMATS, getPresetForFormat, getPresetIdForRounds, type DebateFormatId, type PresetConfig } from '../config/debate/formats';
import { UNIVERSAL_PERSONALITIES } from '../config/personalities';
import { TrialBanner } from '@/components/molecules/subscription/TrialBanner';
import { DemoBanner } from '@/components/molecules/subscription/DemoBanner';
import { showSheet } from '@/store';
import { RecordController } from '@/services/demo/RecordController';
import { DebateRecordPickerModal } from '@/components/organisms/demo/DebateRecordPickerModal';
import { DemoDebatePickerModal } from '@/components/organisms/demo/DemoDebatePickerModal';
import { DemoContentService } from '@/services/demo/DemoContentService';
import APIKeyService from '@/services/APIKeyService';
import MediaGenerationService from '@/services/media/MediaGenerationService';
import { ErrorService } from '@/services/errors/ErrorService';
import {
  ELEVENLABS_DEFAULT_TTS_MODEL,
  ELEVENLABS_FLASH_TTS_MODEL,
  ELEVENLABS_MULTILINGUAL_TTS_MODEL,
} from '@/config/mediaProviders';
import {
  formatElevenLabsCreditSummary,
  type ElevenLabsSubscriptionInfo,
} from '@/services/media/elevenLabsCredits';

interface DebateSetupScreenProps {
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  };
  route?: {
    params?: {
      preselectedAIs?: AIConfig[];
      prefilledTopic?: string;
      resetDebateSetup?: boolean;
      resetKey?: string;
      rematch?: DebateRematchSetup;
      rematchKey?: string;
    };
  };
}

const PRESET_BUTTON_LABELS: Record<string, string> = {
  short: 'Short',
  standard: 'Standard',
  long: 'Extended',
};

const TTS_MODEL_OPTIONS = [
  {
    id: ELEVENLABS_FLASH_TTS_MODEL,
    label: 'Flash',
    description: 'Lower-cost default for debate and podcast audio.',
  },
  {
    id: ELEVENLABS_MULTILINGUAL_TTS_MODEL,
    label: 'Multilingual',
    description: 'Higher-quality voiceover model with higher credit use.',
  },
];

const DEFAULT_DEBATE_VOICE_QUERY: ElevenLabsVoiceListQuery = {
  pageSize: 50,
  includeTotalCount: true,
  includeModels: false,
  sort: 'name',
  sortDirection: 'asc',
  voiceType: 'non-community',
};

function getDebateVoiceSourceRank(voice: MediaProviderVoiceOption): number {
  if (voice.sourceVoiceType === 'non-community' || voice.isOwner || voice.is_owner) return 0;
  if (voice.sourceVoiceType === 'saved' || voice.isBookmarked || voice.is_bookmarked) return 1;
  if (voice.sourceVoiceType === 'default') return 2;
  return 3;
}

function getDebateVoiceRoleRank(voice: MediaProviderVoiceOption, role: 'debater' | 'mc'): number {
  if (role === 'mc') {
    if (voice.category === 'professional') return 0;
    if (voice.category === 'premade') return 1;
  }
  if (voice.category === 'cloned' || voice.category === 'generated') return 0;
  if (voice.category === 'professional') return 1;
  if (voice.category === 'premade') return 2;
  return 3;
}

function sortDebateVoicesForRole(
  voices: MediaProviderVoiceOption[],
  role: 'debater' | 'mc'
): MediaProviderVoiceOption[] {
  return [...voices].sort((a, b) => (
    getDebateVoiceSourceRank(a) - getDebateVoiceSourceRank(b)
    || getDebateVoiceRoleRank(a, role) - getDebateVoiceRoleRank(b, role)
    || a.name.localeCompare(b.name)
  ));
}

function mergeDebateVoiceOptions(
  existing: MediaProviderVoiceOption[],
  incoming: MediaProviderVoiceOption[]
): MediaProviderVoiceOption[] {
  const voicesById = new Map(existing.map((voice) => [voice.id, voice]));
  incoming.forEach((voice) => {
    const current = voicesById.get(voice.id);
    if (!current) {
      voicesById.set(voice.id, voice);
      return;
    }

    const preferIncomingSource = getDebateVoiceSourceRank(voice) <= getDebateVoiceSourceRank(current);
    voicesById.set(voice.id, {
      ...current,
      ...voice,
      sourceVoiceType: preferIncomingSource ? voice.sourceVoiceType : current.sourceVoiceType,
    });
  });
  return sortDebateVoicesForRole(Array.from(voicesById.values()), 'debater');
}

const DEBATE_SLOT_ID_MARKER = '-debater-slot-';

const isDebateSlotId = (id: string): boolean => id.includes(DEBATE_SLOT_ID_MARKER);

const createDebateSlotId = (provider: AIConfig['provider'], counter: number): string =>
  `${provider}${DEBATE_SLOT_ID_MARKER}${Date.now()}-${counter}`;

const getBaseProviderName = (ai: AIConfig, configuredAIs: AIConfig[]): string =>
  configuredAIs.find((configured) => configured.provider === ai.provider)?.name || ai.name.replace(/\s+\d+$/, '');

const normalizeDebateSlotNames = (ais: AIConfig[], configuredAIs: AIConfig[]): AIConfig[] => {
  const providerCounts = ais.reduce<Record<string, number>>((acc, ai) => {
    acc[ai.provider] = (acc[ai.provider] || 0) + 1;
    return acc;
  }, {});
  const seenCounts: Record<string, number> = {};

  return ais.map((ai) => {
    const baseName = getBaseProviderName(ai, configuredAIs);
    if ((providerCounts[ai.provider] || 0) <= 1) {
      return { ...ai, name: baseName };
    }

    seenCounts[ai.provider] = (seenCounts[ai.provider] || 0) + 1;
    return { ...ai, name: `${baseName} ${seenCounts[ai.provider]}` };
  });
};

type DebaterSlot = AIConfig | null;
type SlotTarget = { kind: 'debater'; index: number } | { kind: 'mc' };

const getRequiredDebaterCountForPreset = (preset: PresetConfig): number => (preset.teamSize || 1) * 2;

const normalizeDebateSlots = (slots: DebaterSlot[], configuredAIs: AIConfig[]): DebaterSlot[] => {
  const filledSlots = slots.filter((slot): slot is AIConfig => Boolean(slot));
  const normalizedFilledSlots = normalizeDebateSlotNames(filledSlots, configuredAIs);
  let filledIndex = 0;

  return slots.map((slot) => {
    if (!slot) return null;
    const normalized = normalizedFilledSlots[filledIndex];
    filledIndex += 1;
    return normalized || slot;
  });
};

const buildDebaterSlotsFromAIs = (
  ais: AIConfig[],
  slotCount: number,
  configuredAIs: AIConfig[],
): DebaterSlot[] => {
  const normalizedAIs = normalizeDebateSlotNames(ais.slice(0, slotCount), configuredAIs);
  return Array.from({ length: slotCount }, (_, index) => normalizedAIs[index] || null);
};

const DEFAULT_DEBATER_SLOT_COUNT = getRequiredDebaterCountForPreset(
  getPresetForFormat('oxford', getPresetIdForRounds(3))
);

const DebateSetupScreen: React.FC<DebateSetupScreenProps> = ({ navigation, route }) => {
  const { theme } = useTheme();
  const dispatch = useDispatch();
  const scrollViewRef = useRef<ScrollView>(null);
  const debaterSlotCounterRef = useRef(0);
  const handledResetKeyRef = useRef<string | null>(null);
  const handledRematchKeyRef = useRef<string | null>(null);
  const { rs } = useResponsive();
  const apiKeys = useSelector((state: RootState) => state.settings.apiKeys || {});
  const verifiedProviders = useSelector((state: RootState) => state.settings.verifiedProviders || []);
  const expertMode = useSelector((state: RootState) => state.settings.expertMode || {});
  const aiPersonalities = useSelector((state: RootState) => state.chat.aiPersonalities);
  const selectedModelsFromStore = useSelector((state: RootState) => state.chat.selectedModels);
  const preservedTopic = useSelector((state: RootState) => state.debateStats.preservedTopic);
  const preservedTopicMode = useSelector((state: RootState) => state.debateStats.preservedTopicMode);
  const access = useFeatureAccess();
  const recordModeEnabled = useSelector((state: RootState) => state.settings.recordModeEnabled ?? false);

  // Pre-debate validation (no side effects - just state)
  const validation = usePreDebateValidation();
  const routeParams = route?.params;

  // Get configured AIs based on which ones have API keys
  const configuredAIs = useMemo(() => {
    const DEMO_ALLOWED = new Set(['claude', 'openai', 'google']);
    const isDemo = access.isDemo;
    const providers = isDemo
      ? AI_PROVIDERS.filter(p => p.enabled && DEMO_ALLOWED.has(p.id))
      : AI_PROVIDERS.filter(provider => provider.enabled && isApiKeyConfigured(apiKeys[provider.id]));

    return providers.map(provider => {
      const iconData = getAIProviderIcon(provider.id);
      const providerDefault = isDemo
        ? ({ google: 'gemini-3.5-flash', openai: 'gpt-5', claude: 'opus-4.1' } as Record<string, string>)[provider.id] || ''
        : (getProviderDefaultModel(provider.id)?.id || '');
      const expertCfg = (expertMode as Record<string, { enabled?: boolean; selectedModel?: string }>)[provider.id];
      // Saved default model applies regardless of the Expert Mode toggle,
      // which only gates parameter overrides.
      const defaultModel = (!isDemo && expertCfg?.selectedModel)
        ? (resolveProviderModelId(provider.id, expertCfg.selectedModel) || providerDefault)
        : providerDefault;
      return {
        id: provider.id,
        provider: provider.id,
        name: provider.name,
        model: defaultModel,
        personality: 'default',
        avatar: iconData.icon,
        icon: iconData.icon,
        iconType: iconData.iconType,
        color: provider.color,
      } as AIConfig;
    });
  }, [apiKeys, expertMode, access.isDemo]);

  const [debaterSlots, setDebaterSlots] = useState<DebaterSlot[]>(
    buildDebaterSlotsFromAIs((routeParams?.preselectedAIs || [])
      .filter(ai => isValidProviderId(ai.provider))
      .map((ai, index) => ({
        ...ai,
        id: isDebateSlotId(ai.id) ? ai.id : createDebateSlotId(ai.provider, index),
        model: selectedModelsFromStore?.[ai.id] || selectedModelsFromStore?.[ai.provider] || ai.model,
        personality: ai.personality || 'default',
      })), DEFAULT_DEBATER_SLOT_COUNT, configuredAIs)
  );
  const debaterSlotsRef = useRef<DebaterSlot[]>(debaterSlots);
  const [selectedTopic, setSelectedTopic] = useState<string>(routeParams?.prefilledTopic || preservedTopic || '');
  const [customTopic, setCustomTopic] = useState(
    routeParams?.prefilledTopic || (preservedTopicMode === 'custom' ? (preservedTopic || '') : '')
  );
  const [topicMode, setTopicMode] = useState<'preset' | 'custom' | 'surprise'>(preservedTopicMode || 'preset');
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>(selectedModelsFromStore || {});
  const [formatId, setFormatId] = useState<DebateFormatId>('oxford');
  const [exchanges, setExchanges] = useState<number>(3);
  const [formatModalVisible, setFormatModalVisible] = useState(false);
  const [recordPickerVisible, setRecordPickerVisible] = useState(false);
  const [recordMeta, setRecordMeta] = useState<{
    aiConfigs: AIConfig[];
    defaultTopic: string;
    providersKey: string;
    personaKey: string;
    voiceConfig?: DebateVoiceConfig;
  } | null>(null);
  const [demoPickerVisible, setDemoPickerVisible] = useState(false);
  const [demoSamplesLoading, setDemoSamplesLoading] = useState(false);
  const [demoSamples, setDemoSamples] = useState<Array<{ id: string; title: string; topic: string }>>([]);
  const [demoMeta, setDemoMeta] = useState<{
    aiConfigs: AIConfig[];
    personaKey: string;
  } | null>(null);
  const [voiceDebateEnabled, setVoiceDebateEnabled] = useState(false);
  const [podcastModeEnabled, setPodcastModeEnabled] = useState(false);
  const [podcastMC, setPodcastMC] = useState<AIConfig | null>(null);
  const [podcastMCVoice, setPodcastMCVoice] = useState<DebateVoiceSelection | undefined>(undefined);
  const [debateTtsModelId, setDebateTtsModelId] = useState(ELEVENLABS_DEFAULT_TTS_MODEL);
  // Which slot the provider picker / config sheet is acting on.
  const [providerPickerTarget, setProviderPickerTarget] = useState<SlotTarget | null>(null);
  const [configSheetTarget, setConfigSheetTarget] = useState<SlotTarget | null>(null);
  const [debateVoiceOptions, setDebateVoiceOptions] = useState<MediaProviderVoiceOption[]>([]);
  const [debateVoiceSelections, setDebateVoiceSelections] = useState<Record<string, DebateVoiceSelection>>({});
  // Slot personalities are setup-local like voices and models: the shared chat
  // personalities are reset whenever a chat or debate session starts.
  const [slotPersonalities, setSlotPersonalities] = useState<Record<string, string>>({});
  const [debateVoicesLoading, setDebateVoicesLoading] = useState(false);
  const [debateVoiceError, setDebateVoiceError] = useState<string | null>(null);
  const [debateVoicesLoadAttempted, setDebateVoicesLoadAttempted] = useState(false);
  const [elevenLabsSubscription, setElevenLabsSubscription] = useState<ElevenLabsSubscriptionInfo | undefined>();
  const [elevenLabsSubscriptionLoading, setElevenLabsSubscriptionLoading] = useState(false);

  const presetOptions = useMemo(() => [3, 5, 7].map((rounds) => ({
    rounds,
    preset: getPresetForFormat(formatId, getPresetIdForRounds(rounds)),
  })), [formatId]);
  const selectedPreset = getPresetForFormat(formatId, getPresetIdForRounds(exchanges));
  const requiredDebaterCount = getRequiredDebaterCountForPreset(selectedPreset);
  const presetUnitLabel = selectedPreset.voteModel === 'audience_stance' && !selectedPreset.audienceQuestionCheckpoint
    ? 'speeches'
    : 'turns';
  const presetVoteLabel = selectedPreset.voteModel === 'audience_stance'
    ? 'audience votes'
    : `${selectedPreset.voteCount} judge ${selectedPreset.voteCount === 1 ? 'moment' : 'moments'}`;
  const selectedPresetTitle = formatId === 'oxford'
    ? `${selectedPreset.label} Oxford`
    : selectedPreset.label;
  const presetSummary = `${selectedPreset.messages.length} ${presetUnitLabel} · ${requiredDebaterCount} debaters · ${presetVoteLabel}`;

  const maxAIs = requiredDebaterCount;
  const selectedAIs = useMemo(
    () => debaterSlots.filter((slot): slot is AIConfig => Boolean(slot)).slice(0, maxAIs),
    [debaterSlots, maxAIs],
  );
  const filledDebaterCount = useMemo(
    () => debaterSlots.slice(0, maxAIs).filter(Boolean).length,
    [debaterSlots, maxAIs],
  );
  const areRequiredDebaterSlotsFilled = filledDebaterCount === maxAIs;
  const hasVerifiedElevenLabs = isApiKeyConfigured(apiKeys.elevenlabs) && verifiedProviders.includes('elevenlabs');
  const elevenLabsCreditSummary = formatElevenLabsCreditSummary(elevenLabsSubscription, elevenLabsSubscriptionLoading);
  const voicesRequired = podcastModeEnabled;
  const voiceControlsActive = voicesRequired || voiceDebateEnabled;
  const showVoiceSection = hasVerifiedElevenLabs || voicesRequired;

  useEffect(() => {
    debaterSlotsRef.current = debaterSlots;
  }, [debaterSlots]);

  useEffect(() => {
    debaterSlotsRef.current.slice(maxAIs).forEach((slot) => {
      if (!slot) return;
      setSelectedModels(prev => {
        if (!(slot.id in prev)) return prev;
        const next = { ...prev };
        delete next[slot.id];
        return next;
      });
      setDebateVoiceSelections(prev => {
        if (!(slot.id in prev)) return prev;
        const next = { ...prev };
        delete next[slot.id];
        return next;
      });
      setSlotPersonalities(prev => {
        if (!(slot.id in prev)) return prev;
        const next = { ...prev };
        delete next[slot.id];
        return next;
      });
    });
    setDebaterSlots((current) => {
      const resized = Array.from({ length: maxAIs }, (_, index) => current[index] || null);
      return normalizeDebateSlots(resized, configuredAIs);
    });
  }, [configuredAIs, maxAIs]);

  const loadDebateVoices = useCallback(async (
    query: ElevenLabsVoiceListQuery = DEFAULT_DEBATE_VOICE_QUERY
  ): Promise<MediaProviderOptionsResponse> => {
    if (!hasVerifiedElevenLabs) {
      throw new Error('Add and verify an ElevenLabs API key before loading voices.');
    }
    try {
      setDebateVoicesLoadAttempted(true);
      setDebateVoicesLoading(true);
      setDebateVoiceError(null);
      const key = await APIKeyService.getKey('elevenlabs');
      if (!key) {
        throw new Error('Add an ElevenLabs API key before enabling voiced debates.');
      }
      const options = await MediaGenerationService.listElevenLabsOptions(key, query);
      const voices = (options.voices || []).map((voice) => ({
        ...voice,
        sourceVoiceType: voice.sourceVoiceType || query.voiceType,
      }));
      setDebateVoiceOptions((current) => mergeDebateVoiceOptions(current, voices));
      return {
        ...options,
        voices,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load ElevenLabs voices.';
      setDebateVoiceError(message);
      ErrorService.handleWithToast(error, { feature: 'debate', provider: 'elevenlabs' });
      throw error;
    } finally {
      setDebateVoicesLoading(false);
    }
  }, [hasVerifiedElevenLabs]);

  const loadDebateSharedVoices = useCallback(async (
    query: ElevenLabsSharedVoiceQuery = {}
  ): Promise<MediaProviderOptionsResponse> => {
    if (!hasVerifiedElevenLabs) {
      throw new Error('Add and verify an ElevenLabs API key before browsing community voices.');
    }
    const key = await APIKeyService.getKey('elevenlabs');
    if (!key) {
      throw new Error('Add an ElevenLabs API key before browsing community voices.');
    }
    return MediaGenerationService.listElevenLabsSharedVoices(key, query);
  }, [hasVerifiedElevenLabs]);

  const addDebateSharedVoice = useCallback(async (
    voice: MediaProviderVoiceOption
  ): Promise<MediaProviderVoiceOption> => {
    const publicOwnerId = voice.publicOwnerId || voice.public_owner_id;
    if (!publicOwnerId) {
      throw new Error('This community voice cannot be added to your library.');
    }
    const key = await APIKeyService.getKey('elevenlabs');
    if (!key) {
      throw new Error('Add an ElevenLabs API key before adding voices.');
    }
    try {
      const newVoiceId = await MediaGenerationService.addElevenLabsSharedVoice(
        key,
        publicOwnerId,
        voice.id,
        voice.name
      );
      // The added voice now lives in the account library with a new id usable for TTS.
      const addedVoice: MediaProviderVoiceOption = {
        ...voice,
        id: newVoiceId,
        voice_id: newVoiceId,
        isCommunity: false,
        sourceVoiceType: 'personal',
        isAddedByUser: true,
        is_added_by_user: true,
      };
      setDebateVoiceOptions((current) => mergeDebateVoiceOptions(current, [addedVoice]));
      return addedVoice;
    } catch (error) {
      ErrorService.handleWithToast(error, { feature: 'debate', provider: 'elevenlabs' });
      throw error;
    }
  }, []);

  const loadInitialDebateVoices = useCallback(async () => {
    const preferredSources: ElevenLabsVoiceListQuery[] = [
      DEFAULT_DEBATE_VOICE_QUERY,
      { ...DEFAULT_DEBATE_VOICE_QUERY, voiceType: 'saved' },
      { ...DEFAULT_DEBATE_VOICE_QUERY, voiceType: 'default' },
    ];

    for (const query of preferredSources) {
      const options = await loadDebateVoices(query);
      if ((options.voices || []).length > 0) return options;
    }

    return {
      success: true,
      providerId: 'elevenlabs',
      voices: [],
      voiceHasMore: false,
      voiceNextPageToken: null,
    } as MediaProviderOptionsResponse;
  }, [loadDebateVoices]);

  useEffect(() => {
    if (!hasVerifiedElevenLabs) {
      setVoiceDebateEnabled(false);
      setDebateVoiceSelections({});
      setPodcastMCVoice(undefined);
      setDebateVoicesLoadAttempted(false);
      return;
    }
    if (
      voiceControlsActive
      && debateVoiceOptions.length === 0
      && !debateVoicesLoading
      && !debateVoicesLoadAttempted
    ) {
      void loadInitialDebateVoices().catch(() => {});
    }
  }, [
    voiceControlsActive,
    debateVoiceOptions.length,
    debateVoicesLoadAttempted,
    debateVoicesLoading,
    hasVerifiedElevenLabs,
    loadInitialDebateVoices,
  ]);

  useEffect(() => {
    let cancelled = false;
    if (!hasVerifiedElevenLabs || !voiceControlsActive) {
      setElevenLabsSubscription(undefined);
      setElevenLabsSubscriptionLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setElevenLabsSubscriptionLoading(true);
    APIKeyService.getKey('elevenlabs')
      .then((key) => key ? MediaGenerationService.getElevenLabsSubscription(key) : undefined)
      .then((subscription) => {
        if (!cancelled) setElevenLabsSubscription(subscription);
      })
      .catch(() => {
        if (!cancelled) setElevenLabsSubscription(undefined);
      })
      .finally(() => {
        if (!cancelled) setElevenLabsSubscriptionLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hasVerifiedElevenLabs, voiceControlsActive]);

  useEffect(() => {
    if (!hasVerifiedElevenLabs || debateVoiceOptions.length === 0) return;
    setDebateVoiceSelections((current) => {
      const next: Record<string, DebateVoiceSelection> = {};
      const sortedVoices = sortDebateVoicesForRole(debateVoiceOptions, 'debater');
      const usedVoiceIds = new Set<string>();
      selectedAIs.forEach((ai, index) => {
        const existing = current[ai.id];
        if (existing) {
          next[ai.id] = existing;
          usedVoiceIds.add(existing.voiceId);
          return;
        }
        const fallbackVoice = sortedVoices.find((voice) => !usedVoiceIds.has(voice.id))
          || sortedVoices[index % sortedVoices.length];
        if (fallbackVoice) {
          usedVoiceIds.add(fallbackVoice.id);
          next[ai.id] = {
            voiceId: fallbackVoice.id,
            voiceName: fallbackVoice.name,
          };
        }
      });

      const currentKeys = Object.keys(current).sort().join('|');
      const nextKeys = Object.keys(next).sort().join('|');
      if (currentKeys === nextKeys && Object.keys(next).every((key) => current[key]?.voiceId === next[key]?.voiceId)) {
        return current;
      }
      return next;
    });
  }, [debateVoiceOptions, hasVerifiedElevenLabs, selectedAIs]);

  const handleVoiceDebateToggle = useCallback((enabled: boolean) => {
    setVoiceDebateEnabled(enabled);
    if (enabled && debateVoiceOptions.length === 0) {
      void loadInitialDebateVoices().catch(() => {});
    }
  }, [debateVoiceOptions.length, loadInitialDebateVoices]);

  const handlePodcastModeToggle = useCallback((enabled: boolean) => {
    setPodcastModeEnabled(enabled);
    if (enabled) {
      setVoiceDebateEnabled(true);
      if (debateVoiceOptions.length === 0) {
        void loadInitialDebateVoices().catch(() => {});
      }
    } else {
      setProviderPickerTarget((current) => current?.kind === 'mc' ? null : current);
      setConfigSheetTarget((current) => current?.kind === 'mc' ? null : current);
      setPodcastMC(null);
      setPodcastMCVoice(undefined);
    }
  }, [debateVoiceOptions.length, loadInitialDebateVoices]);

  const handleDebateVoiceSelect = useCallback((aiId: string, voice: MediaProviderVoiceOption) => {
    setDebateVoiceSelections((current) => ({
      ...current,
      [aiId]: {
        voiceId: voice.id,
        voiceName: voice.name,
      },
    }));
  }, []);

  const handlePodcastMCVoiceSelect = useCallback((voice: MediaProviderVoiceOption) => {
    setPodcastMCVoice({
      voiceId: voice.id,
      voiceName: voice.name,
    });
  }, []);

  const buildDebateVoiceConfig = useCallback((): DebateVoiceConfig | undefined => {
    if ((!voiceDebateEnabled && !podcastModeEnabled) || !hasVerifiedElevenLabs) return undefined;
    const debaterVoices: Record<string, DebateVoiceSelection> = {};
    selectedAIs.forEach((ai) => {
      const selection = debateVoiceSelections[ai.id];
      if (selection) {
        debaterVoices[ai.id] = selection;
      }
    });

    return {
      enabled: true,
      providerId: 'elevenlabs',
      ttsModelId: debateTtsModelId,
      debaterVoices,
      ...(podcastModeEnabled && podcastMC && podcastMCVoice ? {
        podcast: {
          enabled: true,
          scriptMode: 'byok_ai',
          outputMode: 'playlist',
          mc: {
            id: podcastMC.id,
            provider: podcastMC.provider,
            name: podcastMC.name,
            model: resolveProviderModelId(podcastMC.provider, selectedModels[podcastMC.id] || selectedModels[podcastMC.provider] || podcastMC.model) || podcastMC.model,
          },
          mcVoice: podcastMCVoice,
        },
      } : {}),
    };
  }, [
    debateTtsModelId,
    debateVoiceSelections,
    hasVerifiedElevenLabs,
    podcastMC,
    podcastMCVoice,
    podcastModeEnabled,
    selectedAIs,
    selectedModels,
    voiceDebateEnabled,
  ]);

  // Save topic when navigating away
  useEffect(() => {
    return () => {
      const currentTopic = topicMode === 'custom' ? customTopic : selectedTopic;
      const preserveMode = topicMode === 'surprise' ? 'preset' : topicMode;
      if (currentTopic) {
        dispatch(preserveTopic({ topic: currentTopic, mode: preserveMode }));
      }
    };
  }, [selectedTopic, customTopic, topicMode, dispatch]);

  // Clear preserved topic when debate starts
  const clearPreservedData = () => {
    dispatch(clearPreservedTopic());
  };

  const scrollSetupToTop = useCallback((animated = false) => {
    scrollViewRef.current?.scrollTo({ y: 0, animated });
  }, []);

  useEffect(() => {
    const params = routeParams;
    if (!params) return;

    if (params.resetDebateSetup) {
      const resetKey = params.resetKey ?? 'unkeyed-reset';
      if (handledResetKeyRef.current === resetKey) {
        return;
      }
      handledResetKeyRef.current = resetKey;

      setDebaterSlots(Array.from({ length: DEFAULT_DEBATER_SLOT_COUNT }, () => null));
      setSelectedTopic('');
      setCustomTopic('');
      setTopicMode('preset');
      setSelectedModels(selectedModelsFromStore || {});
      setFormatId('oxford');
      setExchanges(3);
      setVoiceDebateEnabled(false);
      setPodcastModeEnabled(false);
      setPodcastMC(null);
      setPodcastMCVoice(undefined);
      setDebateTtsModelId(ELEVENLABS_DEFAULT_TTS_MODEL);
      setDebateVoicesLoadAttempted(false);
      setProviderPickerTarget(null);
      setConfigSheetTarget(null);
      setDebateVoiceSelections({});
      setSlotPersonalities({});
      dispatch(clearPreservedTopic());
      scrollSetupToTop(false);
      return;
    }

    if (params.rematch) {
      const rematchKey = params.rematchKey ?? 'unkeyed-rematch';
      if (handledRematchKeyRef.current === rematchKey) {
        return;
      }
      handledRematchKeyRef.current = rematchKey;

      const rematch = params.rematch;
      const debaters = rematch.selectedAIs.filter(ai => isValidProviderId(ai.provider));
      const slotCount = getRequiredDebaterCountForPreset(
        getPresetForFormat(rematch.formatId, getPresetIdForRounds(rematch.exchanges))
      );
      const voiceConfig = rematch.voiceConfig?.enabled ? rematch.voiceConfig : undefined;
      const podcast = voiceConfig?.podcast?.enabled ? voiceConfig.podcast : undefined;
      const mcBase = podcast ? configuredAIs.find(ai => ai.provider === podcast.mc.provider) : undefined;
      const mc = podcast && mcBase
        ? { ...mcBase, id: podcast.mc.id, name: podcast.mc.name, model: podcast.mc.model, personality: 'default' }
        : null;

      setFormatId(rematch.formatId);
      setExchanges(rematch.exchanges);
      setDebaterSlots(buildDebaterSlotsFromAIs(debaters, slotCount, configuredAIs));
      setSelectedModels(prev => ({
        ...prev,
        ...Object.fromEntries(debaters.map(ai => [ai.id, ai.model])),
        ...(mc ? { [mc.id]: mc.model } : {}),
      }));
      setSlotPersonalities(Object.fromEntries(debaters.map(ai => [ai.id, ai.personality || 'default'])));
      // Custom mode shows the motion in an editable field, so it can be tweaked before starting.
      setTopicMode('custom');
      setSelectedTopic(rematch.topic);
      setCustomTopic(rematch.topic);
      setVoiceDebateEnabled(Boolean(voiceConfig));
      setDebateTtsModelId(voiceConfig?.ttsModelId || ELEVENLABS_DEFAULT_TTS_MODEL);
      setDebateVoiceSelections(voiceConfig?.debaterVoices || {});
      setPodcastModeEnabled(Boolean(mc));
      setPodcastMC(mc);
      setPodcastMCVoice(mc ? podcast?.mcVoice : undefined);
      setProviderPickerTarget(null);
      setConfigSheetTarget(null);
      scrollSetupToTop(false);
      return;
    }

    if (params.preselectedAIs || typeof params.prefilledTopic === 'string') {
      const validPreselectedAIs = normalizeDebateSlotNames((params.preselectedAIs || [])
        .filter(ai => isValidProviderId(ai.provider))
        .map((ai, index) => ({
          ...ai,
          id: isDebateSlotId(ai.id) ? ai.id : createDebateSlotId(ai.provider, index),
          model: selectedModelsFromStore?.[ai.id] || selectedModelsFromStore?.[ai.provider] || ai.model,
          personality: ai.personality || 'default',
        })), configuredAIs);

      if (validPreselectedAIs.length > 0) {
        setDebaterSlots(buildDebaterSlotsFromAIs(validPreselectedAIs, maxAIs, configuredAIs));
      }

      if (typeof params.prefilledTopic === 'string') {
        setSelectedTopic(params.prefilledTopic);
        setCustomTopic(params.prefilledTopic);
      }

      scrollSetupToTop(false);
    }
  }, [
    configuredAIs,
    dispatch,
    maxAIs,
    routeParams,
    selectedModelsFromStore,
    scrollSetupToTop,
  ]);

  const buildSlotAI = useCallback((ai: AIConfig): AIConfig => {
    const slotId = createDebateSlotId(ai.provider, debaterSlotCounterRef.current++);
    const selectedModel = selectedModels[ai.id] || selectedModels[ai.provider] || ai.model;
    return {
      ...ai,
      id: slotId,
      model: selectedModel,
      personality: aiPersonalities[ai.id] || ai.personality || 'default',
    };
  }, [aiPersonalities, selectedModels]);

  const clearSlotState = useCallback((slotId?: string) => {
    if (!slotId) return;
    setSelectedModels(prev => {
      if (!(slotId in prev)) return prev;
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
    setDebateVoiceSelections(prev => {
      if (!(slotId in prev)) return prev;
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
    setSlotPersonalities(prev => {
      if (!(slotId in prev)) return prev;
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
  }, []);

  const handleProviderPicked = useCallback((providerId: string) => {
    const base = configuredAIs.find(ai => ai.provider === providerId);
    const target = providerPickerTarget;
    setProviderPickerTarget(null);
    if (!base || !target) return;

    if (target.kind === 'mc') {
      const mcId = createDebateSlotId(base.provider, debaterSlotCounterRef.current++);
      const selectedModel = selectedModels[base.id] || selectedModels[base.provider] || base.model;
      clearSlotState(podcastMC?.id);
      setPodcastMC({
        ...base,
        id: mcId,
        model: selectedModel,
        personality: 'default',
      });
    } else if (target.index >= 0 && target.index < maxAIs) {
      const nextSlot = buildSlotAI(base);
      const replacedSlotId = debaterSlots[target.index]?.id;
      clearSlotState(replacedSlotId);
      setDebaterSlots(prev => {
        const next = Array.from({ length: maxAIs }, (_, index) => prev[index] || null);
        next[target.index] = nextSlot;
        return normalizeDebateSlots(next, configuredAIs);
      });
    }
  }, [
    buildSlotAI,
    clearSlotState,
    configuredAIs,
    debaterSlots,
    maxAIs,
    podcastMC?.id,
    providerPickerTarget,
    selectedModels,
  ]);

  const handleRemoveDebaterSlot = useCallback((index: number) => {
    const removedSlotId = debaterSlots[index]?.id;
    clearSlotState(removedSlotId);
    setDebaterSlots(prev => {
      const next = Array.from({ length: maxAIs }, (_, slotIndex) => prev[slotIndex] || null);
      next[index] = null;
      return normalizeDebateSlots(next, configuredAIs);
    });
  }, [clearSlotState, configuredAIs, debaterSlots, maxAIs]);

  const handleRemovePodcastMC = useCallback(() => {
    clearSlotState(podcastMC?.id);
    setPodcastMC(null);
    setPodcastMCVoice(undefined);
  }, [clearSlotState, podcastMC?.id]);

  const handlePersonalityChange = (aiId: string, personalityId: string) => {
    setSlotPersonalities(prev => ({ ...prev, [aiId]: personalityId || 'default' }));
  };

  const getSlotPersonalityId = useCallback((ai: AIConfig): string => (
    slotPersonalities[ai.id] || ai.personality || 'default'
  ), [slotPersonalities]);

  const handleModelChange = (aiId: string, modelId: string) => {
    const providerId = debaterSlots.find(ai => ai?.id === aiId)?.provider
      || (podcastMC?.id === aiId ? podcastMC.provider : undefined)
      || (isValidProviderId(aiId) ? aiId : undefined);
    const resolvedModelId = providerId
      ? resolveProviderModelId(providerId, modelId) || modelId
      : modelId;
    dispatch(setAIModel({ aiId, modelId: resolvedModelId }));
    setSelectedModels(prev => ({
      ...prev,
      [aiId]: resolvedModelId
    }));
  };

  const getEffectiveModelId = useCallback((ai: AIConfig): string => (
    resolveProviderModelId(ai.provider, selectedModels[ai.id] || selectedModels[ai.provider] || ai.model)
    || selectedModels[ai.id]
    || selectedModels[ai.provider]
    || ai.model
  ), [selectedModels]);

  const getModelLabel = useCallback((ai: AIConfig): string => {
    const modelId = getEffectiveModelId(ai);
    return getModelById(ai.provider, modelId)?.name || modelId || 'Default model';
  }, [getEffectiveModelId]);

  const getSlotLabel = useCallback((index: number): string => {
    if (maxAIs <= 2) {
      return index === 0 ? 'Affirmative 1' : 'Negative 1';
    }
    const speakerNumber = Math.floor(index / 2) + 1;
    return index % 2 === 0
      ? `Affirmative ${speakerNumber}`
      : `Negative ${speakerNumber}`;
  }, [maxAIs]);

  const teamSlots = useMemo<DebateTeamSlotDescriptor[]>(() => (
    Array.from({ length: maxAIs }, (_, index) => {
      const ai = debaterSlots[index] || null;
      const personaMeta = ai && !access.isDemo
        ? UNIVERSAL_PERSONALITIES.find(p => p.id === getSlotPersonalityId(ai)) || UNIVERSAL_PERSONALITIES[0]
        : undefined;
      const voiceSelection = ai && voiceControlsActive && hasVerifiedElevenLabs
        ? debateVoiceSelections[ai.id]
        : undefined;
      return {
        index,
        label: getSlotLabel(index),
        side: (maxAIs <= 2 ? index === 0 : index % 2 === 0) ? 'affirmative' as const : 'negative' as const,
        ai,
        modelLabel: ai ? getModelLabel(ai) : undefined,
        personalityLabel: personaMeta ? `${personaMeta.emoji} ${personaMeta.name}` : undefined,
        voiceLabel: voiceSelection ? `🔊 ${voiceSelection.voiceName}` : undefined,
        voiceMissing: Boolean(ai && voiceControlsActive && hasVerifiedElevenLabs && !voiceSelection),
      };
    })
  ), [
    access.isDemo,
    debaterSlots,
    debateVoiceSelections,
    getModelLabel,
    getSlotLabel,
    getSlotPersonalityId,
    hasVerifiedElevenLabs,
    maxAIs,
    voiceControlsActive,
  ]);

  const liveSearchStatus = useMemo<DebateTeamsStatusNote | null>(() => {
    if (selectedAIs.length === 0) return null;

    if (!areRequiredDebaterSlotsFilled) {
      const remaining = maxAIs - filledDebaterCount;
      return {
        tone: 'neutral',
        text: `Live Search: fill ${remaining} more ${remaining === 1 ? 'slot' : 'slots'} to check availability.`,
      };
    }

    const unsupported = selectedAIs
      .map((ai) => ({ ai, model: getModelById(ai.provider, getEffectiveModelId(ai)) }))
      .filter(({ model }) => !model?.supportsWebSearch);
    if (unsupported.length === 0) {
      return { tone: 'enabled', text: 'Live Search enabled for this debate.' };
    }

    const names = unsupported
      .map(({ ai, model }) => `${ai.name} (${model?.name || getEffectiveModelId(ai)})`)
      .join(' and ');
    return {
      tone: 'unavailable',
      text: `Live Search unavailable: ${names} ${unsupported.length === 1 ? 'does' : 'do'} not support it.`,
    };
  }, [areRequiredDebaterSlotsFilled, filledDebaterCount, getEffectiveModelId, maxAIs, selectedAIs]);

  const computePersonaKey = (configs: AIConfig[]) => {
    const joined = configs
      .map(ai => (ai.personality || 'default').toLowerCase())
      .join(' ');
    if (joined.includes('george')) return 'George';
    if (joined.includes('sage')) return 'Prof. Sage';
    return 'default';
  };

  const startDebateNavigation = (
    topic: string,
    aiConfigs: AIConfig[],
    options?: { demoSampleId?: string; demoSample?: DemoDebate; voiceConfig?: DebateVoiceConfig }
  ) => {
    clearPreservedData();
    navigation.navigate('Debate', {
      selectedAIs: aiConfigs,
      topic,
      personalities: Object.fromEntries(aiConfigs.map(ai => [ai.id, ai.personality || 'default'])),
      formatId,
      rounds: exchanges,
      demoDebateId: options?.demoSampleId,
      demoSample: options?.demoSample,
      voiceConfig: options?.voiceConfig,
    });
  };

  const mapSelectedAIsWithModels = () => selectedAIs.map(ai => ({
    ...ai,
    model: resolveProviderModelId(ai.provider, selectedModels[ai.id] || selectedModels[ai.provider] || ai.model) || ai.model,
    personality: getSlotPersonalityId(ai),
  }));

  const openDemoPicker = async (aiConfigs: AIConfig[], personaKey: string) => {
    try {
      setDemoSamplesLoading(true);
      const providers = aiConfigs.map(ai => ai.provider);
      const list = await DemoContentService.listDebateSamples(providers, personaKey);
      setDemoSamples(list);
    } catch {
      setDemoSamples([]);
    } finally {
      setDemoSamplesLoading(false);
      setDemoPickerVisible(true);
    }
  };

  const finalTopic = topicMode === 'custom' ? customTopic : selectedTopic;

  const startBlocker = useMemo<string | null>(() => {
    if (!access.isDemo && !validation.isReady) {
      return 'Add at least one AI provider key to start a debate.';
    }
    if (!finalTopic) return 'Choose a motion to debate.';
    if (!areRequiredDebaterSlotsFilled) {
      const remaining = maxAIs - filledDebaterCount;
      return `Fill ${remaining} more debater ${remaining === 1 ? 'slot' : 'slots'}.`;
    }
    if (!access.isDemo && podcastModeEnabled) {
      if (!podcastMC) return 'Add a podcast MC.';
      if (!hasVerifiedElevenLabs) return 'Verify an ElevenLabs API key for Podcast Mode.';
      if (!podcastMCVoice) return 'Choose a voice for the podcast MC.';
    }
    if (!access.isDemo && voiceControlsActive) {
      if (!hasVerifiedElevenLabs) return 'Verify an ElevenLabs API key for voiced debates.';
      if (selectedAIs.some(ai => !debateVoiceSelections[ai.id])) {
        return 'Choose a voice for every debater.';
      }
    }
    return null;
  }, [
    access.isDemo,
    areRequiredDebaterSlotsFilled,
    debateVoiceSelections,
    filledDebaterCount,
    finalTopic,
    hasVerifiedElevenLabs,
    maxAIs,
    podcastMC,
    podcastMCVoice,
    podcastModeEnabled,
    selectedAIs,
    validation.isReady,
    voiceControlsActive,
  ]);

  const handleStart = () => {
    if (!finalTopic) {
      Alert.alert('Select a Motion', 'Please choose a debate motion first!');
      return;
    }
    if (!areRequiredDebaterSlotsFilled) {
      Alert.alert('Fill Debate Slots', `${selectedPreset.shortLabel} requires ${requiredDebaterCount} debaters.`);
      return;
    }

    const aiConfigsWithModels = mapSelectedAIsWithModels();

    if (access.isDemo) {
      const personaKey = computePersonaKey(aiConfigsWithModels);
      setDemoMeta({ aiConfigs: aiConfigsWithModels, personaKey });
      void openDemoPicker(aiConfigsWithModels, personaKey);
      return;
    }

    const voiceConfig = buildDebateVoiceConfig();
    if (podcastModeEnabled) {
      if (!podcastMC) {
        Alert.alert('Choose an MC', 'Podcast Mode requires an MC text provider.');
        return;
      }
      if (!hasVerifiedElevenLabs) {
        Alert.alert('Verify ElevenLabs', 'Podcast Mode requires a verified ElevenLabs API key for the MC voice.');
        return;
      }
      if (!voiceConfig?.podcast?.mcVoice) {
        Alert.alert('Choose an MC Voice', 'Choose an ElevenLabs voice for the podcast MC before starting.');
        return;
      }
      const missingDebaterVoices = aiConfigsWithModels.filter((ai) => !voiceConfig?.debaterVoices[ai.id]);
      if (missingDebaterVoices.length > 0) {
        Alert.alert('Choose Voices', 'Podcast Mode requires an ElevenLabs voice for each debater before starting.');
        return;
      }
    }
    if (voiceDebateEnabled) {
      const missingVoices = aiConfigsWithModels.filter((ai) => !voiceConfig?.debaterVoices[ai.id]);
      if (!hasVerifiedElevenLabs) {
        Alert.alert('Verify ElevenLabs', 'Voiced debates require a verified ElevenLabs API key.');
        return;
      }
      if (missingVoices.length > 0) {
        Alert.alert('Choose Voices', 'Choose an ElevenLabs voice for each debater before starting a voiced debate.');
        return;
      }
    }

    if (recordModeEnabled) {
      const providersKey = aiConfigsWithModels.map(ai => ai.provider).sort().join('+');
      const personaKey = computePersonaKey(aiConfigsWithModels);
      setRecordMeta({
        aiConfigs: aiConfigsWithModels,
        defaultTopic: finalTopic,
        providersKey,
        personaKey,
        voiceConfig,
      });
      setRecordPickerVisible(true);
      return;
    }

    startDebateNavigation(finalTopic, aiConfigsWithModels, { voiceConfig });
  };

  // Config sheet wiring for the active slot (debater or MC).
  const configSheetAI = configSheetTarget?.kind === 'mc'
    ? podcastMC
    : configSheetTarget
      ? debaterSlots[configSheetTarget.index] || null
      : null;
  const configSheetIsMC = configSheetTarget?.kind === 'mc';
  const configSheetSlotLabel = configSheetIsMC
    ? 'Podcast MC'
    : configSheetTarget
      ? getSlotLabel(configSheetTarget.index)
      : '';
  const configSheetVoice = configSheetIsMC
    ? podcastMCVoice
    : configSheetAI
      ? debateVoiceSelections[configSheetAI.id]
      : undefined;
  const configSheetShowVoice = hasVerifiedElevenLabs && voiceControlsActive;

  const podcastMCModelLabel = podcastMC ? getModelLabel(podcastMC) : undefined;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['left', 'right']}>
      <Header
        variant="gradient"
        slim
        title="The Arena"
        rightElement={
          <Box style={{ flexDirection: 'row', alignItems: 'center' }}>
            <HeaderIcon
              name="stats-chart-outline"
              onPress={() => navigation.navigate('Stats')}
              color={theme.colors.text.inverse}
              accessibilityLabel="Debate stats"
              testID="debate-stats-header-button"
            />
            <HeaderActions variant="gradient" helpTopicId="debate-formats" />
          </Box>
        }
      />
      <TrialBanner />

      {access.isDemo && (
        <DemoBanner
          subtitle={access.canStartTrial
            ? 'Pre-recorded demo debates only. Start a trial for custom debates.'
            : 'Pre-recorded demo debates only. Upgrade to Premium for custom debates.'}
          onPress={() => dispatch(showSheet({ sheet: 'subscription' }))}
        />
      )}

      <ScrollView
        ref={scrollViewRef}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: rs('lg'),
          paddingTop: rs('sm'),
          paddingBottom: rs('xl'),
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ResponsiveContainer maxWidth="lg" center>
          {/* Warning: Insufficient AIs configured (non-blocking inline card) */}
          {!validation.isReady && (
            <Box style={{
              marginTop: theme.spacing.md,
              marginBottom: theme.spacing.md,
              padding: theme.spacing.lg,
              backgroundColor: theme.colors.warning[100],
              borderRadius: theme.borderRadius.lg,
            }}>
              <Typography variant="body" style={{ textAlign: 'center', color: theme.colors.warning[900] }}>
                Add at least one AI provider to start a debate. You can reuse that provider for multiple debater slots.
              </Typography>
              <Button
                title="Add AI Keys"
                onPress={() => navigation.navigate('APIConfig')}
                variant="secondary"
                size="medium"
                style={{ marginTop: theme.spacing.md }}
              />
            </Box>
          )}

          {/* Motion */}
          <Card shadow style={{ marginBottom: theme.spacing.md }}>
            <Box style={{ marginBottom: theme.spacing.sm }}>
              <Typography variant="subtitle" weight="semibold" style={{ marginBottom: 4 }}>
                💭 Motion
              </Typography>
            </Box>
            <DebateTopicSelector
              selectedTopic={selectedTopic}
              customTopic={customTopic}
              topicMode={topicMode}
              onTopicSelect={setSelectedTopic}
              onCustomTopicChange={setCustomTopic}
              onTopicModeChange={setTopicMode}
              onSurpriseMe={() => {
                const t = TopicService.generateRandomTopicString();
                setSelectedTopic(t);
                setTopicMode('surprise');
              }}
              showHeading={false}
              compact
            />
          </Card>

          {/* Format & length */}
          <Card shadow style={{ marginBottom: theme.spacing.md }}>
            <Box style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: theme.spacing.sm }}>
              <Typography variant="subtitle" weight="semibold">
                ⚙️ Format
              </Typography>
              <InfoButton topicId="debate-formats" size="small" />
            </Box>

            <Button
              title={FORMATS[formatId].name}
              onPress={() => setFormatModalVisible(true)}
              variant="tonal"
              size="medium"
              textAlign="left"
              rightIcon="chevron-down"
              style={{ marginBottom: theme.spacing.sm }}
            />

            <Box style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {presetOptions.map(({ rounds: n, preset }) => (
                <Button
                  key={n}
                  title={formatId === 'oxford' ? preset.label : PRESET_BUTTON_LABELS[preset.id] || preset.label}
                  onPress={() => setExchanges(n)}
                  variant={n === exchanges ? 'primary' : 'tonal'}
                  size="small"
                  style={{ minWidth: 96, flexGrow: 1 }}
                />
              ))}
            </Box>

            <Typography variant="caption" color="secondary" style={{ marginTop: theme.spacing.sm }}>
              {selectedPresetTitle} · {presetSummary}
            </Typography>
          </Card>

          {/* Debate teams */}
          <Card shadow style={{ marginBottom: theme.spacing.md }}>
            <DebateTeamsCard
              slots={teamSlots}
              filledCount={filledDebaterCount}
              totalCount={maxAIs}
              onSlotPress={(slot) => {
                if (slot.ai) {
                  setConfigSheetTarget({ kind: 'debater', index: slot.index });
                } else {
                  setProviderPickerTarget({ kind: 'debater', index: slot.index });
                }
              }}
              statusNote={liveSearchStatus}
              testID="debate-teams-card"
            />
          </Card>

          {/* Debate settings */}
          {(showVoiceSection || !access.isDemo) && (
          <Card shadow style={{ marginBottom: theme.spacing.md }}>
            <Typography variant="subtitle" weight="semibold" style={{ marginBottom: theme.spacing.sm }}>
              🎛️ Debate Settings
            </Typography>

            {showVoiceSection && (
              <Box style={{ marginBottom: theme.spacing.md }}>
                <Box style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md }}>
                  <Box style={{ flex: 1 }}>
                    <Typography variant="body" weight="semibold">
                      Debate Voices
                    </Typography>
                    <Typography variant="caption" color="secondary">
                      {voicesRequired
                        ? 'Podcast Mode requires a voice for every debater and the MC.'
                        : 'Optional debater audio. Pick voices on each debater slot.'}
                    </Typography>
                  </Box>
                  {voicesRequired ? (
                    <Box style={{ paddingHorizontal: theme.spacing.sm, paddingVertical: 6, borderRadius: theme.borderRadius.full, backgroundColor: theme.colors.primary[500] }}>
                      <Typography variant="caption" weight="semibold" style={{ color: theme.colors.text.white }}>
                        Required
                      </Typography>
                    </Box>
                  ) : (
                    <Button
                      title={voiceDebateEnabled ? 'On' : 'Off'}
                      onPress={() => handleVoiceDebateToggle(!voiceDebateEnabled)}
                      variant={voiceDebateEnabled ? 'primary' : 'secondary'}
                      size="small"
                    />
                  )}
                </Box>

                {!!elevenLabsCreditSummary && voiceControlsActive && (
                  <Typography variant="caption" color="secondary" style={{ marginTop: theme.spacing.sm }}>
                    {elevenLabsCreditSummary}
                  </Typography>
                )}

                {voiceControlsActive && (
                  <Box style={{ marginTop: theme.spacing.sm, gap: theme.spacing.xs }}>
                    {debateVoicesLoading && (
                      <Typography variant="caption" color="secondary">
                        Loading ElevenLabs voices...
                      </Typography>
                    )}
                    {debateVoiceError && (
                      <Box style={{ gap: theme.spacing.xs }}>
                        <Typography variant="caption" style={{ color: theme.colors.error[600] }}>
                          {debateVoiceError}
                        </Typography>
                        <Button
                          title="Retry voices"
                          onPress={() => { void loadInitialDebateVoices().catch(() => {}); }}
                          variant="secondary"
                          size="small"
                        />
                      </Box>
                    )}
                    {!debateVoicesLoading && !debateVoiceError && debateVoiceOptions.length === 0 && (
                      <Box style={{ gap: theme.spacing.xs }}>
                        <Typography variant="caption" color="secondary">
                          No ElevenLabs voices were available for this key.
                        </Typography>
                        <Button
                          title="Reload voices"
                          onPress={() => { void loadInitialDebateVoices().catch(() => {}); }}
                          variant="secondary"
                          size="small"
                        />
                      </Box>
                    )}

                    <Box style={{ marginTop: theme.spacing.xs }}>
                      <Typography variant="caption" weight="semibold" color="secondary" style={{ marginBottom: theme.spacing.xs }}>
                        TTS Model
                      </Typography>
                      <SegmentedControl
                        options={TTS_MODEL_OPTIONS.map((model) => ({ label: model.label, value: model.id }))}
                        value={debateTtsModelId}
                        onChange={setDebateTtsModelId}
                        fullWidth
                      />
                      <Typography variant="caption" color="secondary" style={{ marginTop: theme.spacing.xs }}>
                        {TTS_MODEL_OPTIONS.find((model) => model.id === debateTtsModelId)?.description || TTS_MODEL_OPTIONS[0].description}
                      </Typography>
                    </Box>
                  </Box>
                )}
              </Box>
            )}

            {!access.isDemo && (
              <Box
                style={showVoiceSection ? {
                  paddingTop: theme.spacing.md,
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.border,
                } : undefined}
              >
                <Box style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md }}>
                  <Box style={{ flex: 1 }}>
                    <Typography variant="body" weight="semibold">
                      Podcast Mode
                    </Typography>
                    <Typography variant="caption" color="secondary">
                      Adds a BYOK MC for intro, segues, and winner announcements.
                    </Typography>
                  </Box>
                  <Button
                    title={podcastModeEnabled ? 'On' : 'Off'}
                    onPress={() => handlePodcastModeToggle(!podcastModeEnabled)}
                    variant={podcastModeEnabled ? 'primary' : 'secondary'}
                    size="small"
                  />
                </Box>

                {podcastModeEnabled && (
                  podcastMC ? (
                    <TouchableOpacity
                      onPress={() => setConfigSheetTarget({ kind: 'mc' })}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Podcast MC: ${podcastMC.name}`}
                      accessibilityHint="Opens MC configuration"
                      testID="debate-podcast-mc-row"
                      style={{
                        marginTop: theme.spacing.sm,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: theme.spacing.sm,
                        padding: theme.spacing.sm,
                        borderRadius: theme.borderRadius.md,
                        borderWidth: 1,
                        borderColor: theme.colors.primary[400],
                        backgroundColor: theme.colors.surface,
                      }}
                    >
                      <AIAvatar
                        icon={getAIProviderIcon(podcastMC.provider).icon}
                        iconType={getAIProviderIcon(podcastMC.provider).iconType}
                        size="small"
                        color={podcastMC.color}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body" weight="semibold" numberOfLines={1}>
                          {podcastMC.name}
                        </Typography>
                        <Typography variant="caption" color="secondary" numberOfLines={1}>
                          Podcast MC{podcastMCModelLabel ? ` · ${podcastMCModelLabel}` : ''}
                        </Typography>
                        {podcastMCVoice ? (
                          <Typography variant="caption" color="secondary" numberOfLines={1}>
                            🔊 {podcastMCVoice.voiceName}
                          </Typography>
                        ) : (
                          <Typography variant="caption" weight="semibold" style={{ color: theme.colors.warning[600] }}>
                            Voice needed
                          </Typography>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={theme.colors.text.secondary} />
                    </TouchableOpacity>
                  ) : (
                    <Button
                      title="Add MC"
                      onPress={() => setProviderPickerTarget({ kind: 'mc' })}
                      variant="tonal"
                      size="small"
                      style={{ marginTop: theme.spacing.sm, alignSelf: 'flex-start' }}
                    />
                  )
                )}
              </Box>
            )}
          </Card>
          )}
        </ResponsiveContainer>
      </ScrollView>

      {/* Start CTA */}
      <Box
        style={{
          paddingHorizontal: rs('lg'),
          paddingTop: rs('sm'),
          paddingBottom: rs('md'),
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.background,
        }}
      >
        <ResponsiveContainer maxWidth="lg" center>
          {startBlocker && (
            <Typography
              variant="caption"
              color="secondary"
              align="center"
              style={{ marginBottom: theme.spacing.xs }}
            >
              {startBlocker}
            </Typography>
          )}
          <GradientButton
            title={access.isDemo ? 'Watch a Demo Debate' : 'Start Debate ⚔️'}
            onPress={handleStart}
            disabled={Boolean(startBlocker)}
            gradient={theme.colors.gradients.sunset}
            fullWidth
            hapticType="medium"
            testID="start-debate-button"
          />
        </ResponsiveContainer>
      </Box>

      {/* Format modal */}
      <FormatModal visible={formatModalVisible} selected={formatId} onSelect={(id) => setFormatId(id)} onClose={() => setFormatModalVisible(false)} />

      {/* Provider picker (empty slot / change provider / MC) */}
      <ProviderPickerSheet
        visible={Boolean(providerPickerTarget)}
        onClose={() => setProviderPickerTarget(null)}
        onSelectProvider={handleProviderPicked}
        selectedProviderIds={[]}
        configuredProviderIds={configuredAIs.map((ai) => ai.provider)}
        allowedProviderIds={access.isDemo ? configuredAIs.map((ai) => ai.provider) : undefined}
        allowDuplicates
        onRequestAddKey={() => navigation.navigate('APIConfig')}
        testID="debate-provider-picker"
      />

      {/* Per-slot config sheet (model / personality / voice / provider / remove) */}
      <DebateSlotConfigSheet
        visible={Boolean(configSheetTarget && configSheetAI)}
        onClose={() => setConfigSheetTarget(null)}
        ai={configSheetAI}
        slotLabel={configSheetSlotLabel}
        modelId={configSheetAI ? getEffectiveModelId(configSheetAI) : ''}
        onChangeModel={(modelId) => {
          if (configSheetAI) handleModelChange(configSheetAI.id, modelId);
        }}
        personalityId={configSheetIsMC || access.isDemo || !configSheetAI
          ? undefined
          : getSlotPersonalityId(configSheetAI)}
        onChangePersonality={(personalityId) => {
          if (configSheetAI) handlePersonalityChange(configSheetAI.id, personalityId);
        }}
        showVoice={configSheetShowVoice}
        voiceRequired={voicesRequired}
        voice={configSheetVoice}
        onSelectVoice={(voice) => {
          if (configSheetIsMC) {
            handlePodcastMCVoiceSelect(voice);
          } else if (configSheetAI) {
            handleDebateVoiceSelect(configSheetAI.id, voice);
          }
        }}
        onLoadVoices={hasVerifiedElevenLabs ? loadDebateVoices : undefined}
        onLoadSharedVoices={hasVerifiedElevenLabs ? loadDebateSharedVoices : undefined}
        onAddSharedVoice={hasVerifiedElevenLabs ? addDebateSharedVoice : undefined}
        elevenLabsTier={elevenLabsSubscription?.tier}
        onChangeProvider={() => {
          if (configSheetTarget) setProviderPickerTarget(configSheetTarget);
        }}
        onRemove={() => {
          if (configSheetTarget?.kind === 'mc') {
            handleRemovePodcastMC();
          } else if (configSheetTarget) {
            handleRemoveDebaterSlot(configSheetTarget.index);
          }
        }}
        removeLabel={configSheetIsMC ? 'Remove MC' : 'Remove debater'}
        testID="debate-slot-config-sheet"
      />

      {recordModeEnabled && recordMeta && (
        <DebateRecordPickerModal
          visible={recordPickerVisible}
          providersKey={recordMeta.providersKey}
          personaKey={recordMeta.personaKey}
          defaultTopic={recordMeta.defaultTopic}
          onClose={() => {
            setRecordPickerVisible(false);
            setRecordMeta(null);
          }}
          onSelect={(selection) => {
            setRecordPickerVisible(false);
            if (!recordMeta) return;
            try {
              const { aiConfigs, providersKey, personaKey } = recordMeta;
              const comboKey = `${providersKey}:${personaKey}`;
              const participants = aiConfigs.map(ai => ai.name);
              if (selection.type === 'new') {
                RecordController.startDebate({ id: selection.id, topic: selection.topic, comboKey, participants });
                startDebateNavigation(selection.topic, aiConfigs, { voiceConfig: recordMeta.voiceConfig });
              } else {
                RecordController.startDebate({ id: `${selection.id}_rec_${Date.now()}`, topic: selection.topic, comboKey, participants });
                startDebateNavigation(selection.topic, aiConfigs, { voiceConfig: recordMeta.voiceConfig });
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Failed to start recording';
              Alert.alert('Recording Error', message);
            } finally {
              setRecordMeta(null);
            }
          }}
        />
      )}

      {access.isDemo && (
        <DemoDebatePickerModal
          visible={demoPickerVisible}
          loading={demoSamplesLoading}
          samples={demoSamples}
          onClose={() => {
            setDemoPickerVisible(false);
            setDemoMeta(null);
          }}
          onSelect={async (sample) => {
            if (!demoMeta) {
              setDemoPickerVisible(false);
              return;
            }
            setDemoSamplesLoading(true);
            try {
              const fullSample = await DemoContentService.findDebateById(sample.id);
              if (!fullSample) {
                Alert.alert('Unavailable', 'This demo debate is not available right now.');
                return;
              }
              setSelectedTopic(fullSample.topic);
              setTopicMode('preset');
              startDebateNavigation(fullSample.topic, demoMeta.aiConfigs, { demoSampleId: sample.id, demoSample: fullSample });
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Failed to load demo debate.';
              Alert.alert('Error', message);
            } finally {
              setDemoSamplesLoading(false);
              setDemoPickerVisible(false);
              setDemoMeta(null);
            }
          }}
        />
      )}
    </SafeAreaView>
  );
};

export default DebateSetupScreen;
