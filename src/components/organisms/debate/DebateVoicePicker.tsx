import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, ScrollView, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useTheme } from '@/theme';
import { Button, SegmentedControl, SheetHeader, Typography } from '@/components/molecules';
import type { AIConfig, DebateVoiceSelection } from '@/types';
import type {
  ElevenLabsSharedVoiceCategory,
  ElevenLabsSharedVoiceQuery,
  ElevenLabsVoiceCategory,
  ElevenLabsVoiceListQuery,
  ElevenLabsVoiceType,
  MediaProviderOptionsResponse,
  MediaProviderVoiceOption,
} from '@/types/media';
import {
  DebateVoiceRecentService,
  type DebateRecentVoiceSelection,
} from '@/services/debate/DebateVoiceRecentService';
import { DebateVoiceFavoriteService } from '@/services/debate/DebateVoiceFavoriteService';

export type DebateVoicePickerTarget =
  | { kind: 'debater'; ai: AIConfig }
  | { kind: 'mc'; ai: AIConfig }
  // Generic single-voice selection (e.g. the Create / Audio voiceover path).
  | { kind: 'single'; label: string };

type VoiceSourceId = 'favorites' | 'my' | 'default' | 'explore';
type VoiceSourceTab = {
  id: VoiceSourceId;
  label: string;
  voiceType?: ElevenLabsVoiceType;
};

type VoiceCategoryFilter = 'all' | ElevenLabsVoiceCategory;
type TraitFilterKind = 'gender' | 'accent' | 'age' | 'tone' | 'use_case';

interface TraitFilter {
  id: string;
  kind: TraitFilterKind;
  label: string;
  value: string;
}

interface TraitFilterGroup {
  kind: TraitFilterKind;
  label: string;
  filters: TraitFilter[];
}

interface ExploreFilterState {
  category?: ElevenLabsSharedVoiceCategory;
  gender?: string;
  age?: string;
  accent?: string;
  language?: string;
  useCases: string[];
  descriptives: string[];
}

interface DebateVoicePickerProps {
  visible: boolean;
  target: DebateVoicePickerTarget | null;
  voiceSelections?: Record<string, DebateVoiceSelection>;
  podcastMCVoice?: DebateVoiceSelection;
  currentVoiceId?: string;
  elevenLabsTier?: string;
  onClose: () => void;
  onLoadVoices: (query: ElevenLabsVoiceListQuery) => Promise<MediaProviderOptionsResponse>;
  onLoadSharedVoices?: (query: ElevenLabsSharedVoiceQuery) => Promise<MediaProviderOptionsResponse>;
  onAddSharedVoice?: (voice: MediaProviderVoiceOption) => Promise<MediaProviderVoiceOption>;
  onVoiceSelect?: (aiId: string, voice: MediaProviderVoiceOption) => void;
  onPodcastMCVoiceSelect?: (voice: MediaProviderVoiceOption) => void;
  onSelectVoice?: (voice: MediaProviderVoiceOption) => void;
}

const ALL_SOURCE_TABS: VoiceSourceTab[] = [
  { id: 'favorites', label: 'Favorites' },
  { id: 'my', label: 'My Voices', voiceType: 'personal' },
  { id: 'default', label: 'Default', voiceType: 'default' },
  { id: 'explore', label: 'Explore' },
];

const CATEGORY_FILTERS: Array<{ id: VoiceCategoryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'cloned', label: 'Cloned' },
  { id: 'generated', label: 'Generated' },
  { id: 'professional', label: 'Professional' },
  { id: 'premade', label: 'Premade' },
];

const TRAIT_FILTER_ORDER: TraitFilterKind[] = ['gender', 'accent', 'age', 'tone', 'use_case'];
const TRAIT_GROUP_LABELS: Record<TraitFilterKind, string> = {
  gender: 'Gender',
  accent: 'Accent',
  age: 'Age',
  tone: 'Tone',
  use_case: 'Use case',
};
const TRAIT_LABEL_KEYS: Record<string, TraitFilterKind> = {
  gender: 'gender',
  accent: 'accent',
  age: 'age',
  descriptive: 'tone',
  description: 'tone',
  usecase: 'use_case',
  usecasecategory: 'use_case',
};

// Curated option lists for the server-side community filters. Values match ElevenLabs'
// shared-voices taxonomy so the API returns real results (the "famous" category is
// omitted because it is gated and returns nothing for most accounts).
const EXPLORE_CATEGORIES: Array<{ value: ElevenLabsSharedVoiceCategory; label: string }> = [
  { value: 'professional', label: 'Professional' },
  { value: 'high_quality', label: 'High quality' },
];
const EXPLORE_GENDERS = ['male', 'female', 'neutral'];
const EXPLORE_AGES = ['young', 'middle_aged', 'old'];
const EXPLORE_ACCENTS = ['american', 'british', 'australian', 'canadian', 'irish', 'indian', 'african', 'european', 'latin_american'];
const EXPLORE_LANGUAGES: Array<{ value: string; label: string }> = [
  { value: 'en', label: 'English' }, { value: 'es', label: 'Spanish' }, { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' }, { value: 'it', label: 'Italian' }, { value: 'pt', label: 'Portuguese' },
  { value: 'pl', label: 'Polish' }, { value: 'hi', label: 'Hindi' }, { value: 'ar', label: 'Arabic' },
  { value: 'ja', label: 'Japanese' }, { value: 'ko', label: 'Korean' }, { value: 'zh', label: 'Chinese' },
];
const EXPLORE_USE_CASES: Array<{ value: string; label: string }> = [
  { value: 'narrative_story', label: 'Narration' }, { value: 'conversational', label: 'Conversational' },
  { value: 'characters_animation', label: 'Characters' }, { value: 'social_media', label: 'Social media' },
  { value: 'entertainment_tv', label: 'Entertainment' }, { value: 'advertisement', label: 'Advertisement' },
  { value: 'informative_educational', label: 'Educational' },
];
const EXPLORE_DESCRIPTIVES = ['calm', 'confident', 'deep', 'casual', 'professional', 'upbeat', 'warm', 'crisp'];

const EXPLORE_PAGE_SIZE = 30;
const AUTO_LOAD_CAP = 1000;
const TRAITS_PER_GROUP = 16;
const PREVIEW_IDLE_TIMEOUT_MS = 12000;
const FREE_TIER_KEYWORDS = ['free', 'starter'];
const EMPTY_EXPLORE_FILTERS: ExploreFilterState = { useCases: [], descriptives: [] };

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese',
  pl: 'Polish', tr: 'Turkish', ru: 'Russian', nl: 'Dutch', cs: 'Czech', ar: 'Arabic',
  zh: 'Chinese', ja: 'Japanese', ko: 'Korean', hi: 'Hindi',
};

function mergeVoices(existing: MediaProviderVoiceOption[], incoming: MediaProviderVoiceOption[]): MediaProviderVoiceOption[] {
  const voicesById = new Map(existing.map((voice) => [voice.id, voice]));
  incoming.forEach((voice) => {
    const current = voicesById.get(voice.id);
    voicesById.set(voice.id, current ? { ...current, ...voice } : voice);
  });
  return Array.from(voicesById.values());
}

function getPreviewUrl(voice: MediaProviderVoiceOption): string | null {
  if (voice.previewUrl || voice.preview_url) return voice.previewUrl || voice.preview_url || null;
  const languages = voice.verifiedLanguages || voice.verified_languages || [];
  for (const language of languages) {
    const url = language.previewUrl || language.preview_url;
    if (url) return url;
  }
  return null;
}

function getVoiceLabels(voice: MediaProviderVoiceOption): Record<string, string> {
  return voice.labels || {};
}

function isCommunityVoice(voice: MediaProviderVoiceOption): boolean {
  return Boolean(voice.isCommunity) && !(voice.isAddedByUser || voice.is_added_by_user);
}

function getCreatedAt(voice: MediaProviderVoiceOption): number {
  return voice.createdAtUnix ?? voice.created_at_unix ?? 0;
}

function normalizeFilterText(value: string): string {
  return value.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function toTitleCase(value: string): string {
  return normalizeFilterText(value).split(' ').filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function normalizeLabelKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]/g, '');
}

function getSourceLabel(voice: MediaProviderVoiceOption): string {
  if (isCommunityVoice(voice)) return 'Community';
  if (voice.sourceVoiceType === 'default') return 'Default';
  if (voice.sourceVoiceType === 'personal' || voice.isOwner || voice.is_owner) return 'My Voice';
  if (voice.category) return toTitleCase(voice.category);
  return 'Voice';
}

function formatLanguageLabel(value: string): string {
  const normalized = value.trim();
  if (!normalized) return '';
  const [languageCode, regionCode] = normalized.split(/[-_]/);
  const languageName = LANGUAGE_NAMES[languageCode.toLowerCase()] || toTitleCase(languageCode);
  return regionCode ? `${languageName} (${regionCode.toUpperCase()})` : languageName;
}

function getUniqueLanguageLabels(voice: MediaProviderVoiceOption): string[] {
  const labelsById = new Map<string, string>();
  (voice.verifiedLanguages || voice.verified_languages || []).forEach((language) => {
    const rawValue = language.locale || language.language;
    if (!rawValue) return;
    labelsById.set(rawValue.toLowerCase(), formatLanguageLabel(rawValue));
  });
  return Array.from(labelsById.values());
}

function getVoiceMetadataChips(voice: MediaProviderVoiceOption): string[] {
  const chips: string[] = [];
  const seen = new Set<string>();
  const pushChip = (value?: string | null) => {
    if (!value) return;
    const label = toTitleCase(value);
    const id = label.toLowerCase();
    if (!label || seen.has(id)) return;
    seen.add(id);
    chips.push(label);
  };
  Object.entries(getVoiceLabels(voice)).forEach(([rawKey, rawValue]) => {
    if (!rawValue) return;
    const kind = TRAIT_LABEL_KEYS[normalizeLabelKey(rawKey)];
    if (!kind) return;
    pushChip(rawValue);
  });
  getUniqueLanguageLabels(voice).forEach((label) => pushChip(label));
  return chips.slice(0, 5);
}

function getVoiceTraitFilters(voice: MediaProviderVoiceOption): TraitFilter[] {
  const filters: TraitFilter[] = [];
  Object.entries(getVoiceLabels(voice)).forEach(([rawKey, rawValue]) => {
    const value = normalizeFilterText(rawValue);
    if (!value) return;
    const kind = TRAIT_LABEL_KEYS[normalizeLabelKey(rawKey)];
    if (!kind) return;
    filters.push({ id: `${kind}:${value.toLowerCase()}`, kind, value: value.toLowerCase(), label: toTitleCase(value) });
  });
  return filters;
}

function buildTraitFilters(voices: MediaProviderVoiceOption[]): TraitFilter[] {
  const filtersById = new Map<string, TraitFilter>();
  voices.forEach((voice) => {
    getVoiceTraitFilters(voice).forEach((filter) => filtersById.set(filter.id, filter));
  });
  return Array.from(filtersById.values()).sort((a, b) => (
    TRAIT_FILTER_ORDER.indexOf(a.kind) - TRAIT_FILTER_ORDER.indexOf(b.kind) || a.label.localeCompare(b.label)
  ));
}

function buildTraitFilterGroups(filters: TraitFilter[]): TraitFilterGroup[] {
  const byKind = new Map<TraitFilterKind, TraitFilter[]>();
  filters.forEach((filter) => {
    const group = byKind.get(filter.kind) || [];
    group.push(filter);
    byKind.set(filter.kind, group);
  });
  return TRAIT_FILTER_ORDER.filter((kind) => byKind.has(kind)).map((kind) => ({
    kind,
    label: TRAIT_GROUP_LABELS[kind],
    filters: (byKind.get(kind) || []).slice(0, TRAITS_PER_GROUP),
  }));
}

function countTraitMatches(voices: MediaProviderVoiceOption[]): Map<string, number> {
  const counts = new Map<string, number>();
  voices.forEach((voice) => {
    new Set(getVoiceTraitFilters(voice).map((filter) => filter.id)).forEach((id) => {
      counts.set(id, (counts.get(id) || 0) + 1);
    });
  });
  return counts;
}

function voiceMatchesTraitFilters(voice: MediaProviderVoiceOption, activeTraitIds: Set<string>): boolean {
  if (activeTraitIds.size === 0) return true;
  const voiceTraitIds = new Set(getVoiceTraitFilters(voice).map((filter) => filter.id));
  return Array.from(activeTraitIds).every((filterId) => voiceTraitIds.has(filterId));
}

export const DebateVoicePicker: React.FC<DebateVoicePickerProps> = ({
  visible,
  target,
  voiceSelections = {},
  podcastMCVoice,
  currentVoiceId,
  elevenLabsTier,
  onClose,
  onLoadVoices,
  onLoadSharedVoices,
  onAddSharedVoice,
  onVoiceSelect,
  onPodcastMCVoiceSelect,
  onSelectVoice,
}) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const sourceTabs = useMemo(
    () => ALL_SOURCE_TABS.filter((tab) => tab.id !== 'explore' || Boolean(onLoadSharedVoices)),
    [onLoadSharedVoices]
  );

  const [activeSourceId, setActiveSourceId] = useState<VoiceSourceId>('default');
  const [activeCategory, setActiveCategory] = useState<VoiceCategoryFilter>('all');
  const [activeTraitIds, setActiveTraitIds] = useState<Set<string>>(() => new Set());
  const [exploreFilters, setExploreFilters] = useState<ExploreFilterState>(EMPTY_EXPLORE_FILTERS);
  const [sortBy, setSortBy] = useState<'name' | 'newest'>('name');
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [loadedVoices, setLoadedVoices] = useState<MediaProviderVoiceOption[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [localVoiceListsReady, setLocalVoiceListsReady] = useState(false);
  const [recentVoices, setRecentVoices] = useState<DebateRecentVoiceSelection[]>([]);
  const [favoriteVoices, setFavoriteVoices] = useState<MediaProviderVoiceOption[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [busyVoiceId, setBusyVoiceId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ voiceId: string | null; url?: string; nonce: number }>({ voiceId: null, url: undefined, nonce: 0 });

  const requestIdRef = useRef(0);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewPlayer = useAudioPlayer(preview.url, { updateInterval: 250 });
  const previewStatus = useAudioPlayerStatus(previewPlayer);

  const isExplore = activeSourceId === 'explore';
  const isFavorites = activeSourceId === 'favorites';
  const activeSource = sourceTabs.find((source) => source.id === activeSourceId) || sourceTabs[0];
  const isFreeTier = Boolean(elevenLabsTier && FREE_TIER_KEYWORDS.some((k) => elevenLabsTier.toLowerCase().includes(k)));
  const filterPanelMaxHeight = Math.round(windowHeight * 0.82);

  const selectedVoiceId = target?.kind === 'mc'
    ? podcastMCVoice?.voiceId
    : target?.kind === 'single'
      ? currentVoiceId
      : target?.kind === 'debater' ? voiceSelections[target.ai.id]?.voiceId : undefined;
  const targetKey = target?.kind === 'single' ? target.label : target?.ai.id;
  const targetSubtitle = target?.kind === 'mc' ? 'Podcast MC' : target?.kind === 'single' ? target.label : target?.ai.name;

  const unavailableVoiceIds = useMemo(() => {
    const ids = new Set<string>();
    Object.entries(voiceSelections).forEach(([aiId, selection]) => {
      if (target?.kind === 'debater' && aiId === target.ai.id) return;
      ids.add(selection.voiceId);
    });
    if (podcastMCVoice?.voiceId && target?.kind !== 'mc') ids.add(podcastMCVoice.voiceId);
    return ids;
  }, [podcastMCVoice?.voiceId, target, voiceSelections]);

  const recentVoiceOptions = useMemo(() => recentVoices.map(DebateVoiceRecentService.toVoiceOption), [recentVoices]);

  const traitFilters = useMemo(() => buildTraitFilters(loadedVoices), [loadedVoices]);
  const traitFilterGroups = useMemo(() => buildTraitFilterGroups(traitFilters), [traitFilters]);
  const traitCounts = useMemo(() => countTraitMatches(loadedVoices), [loadedVoices]);

  const availableCategoryIds = useMemo(() => {
    const ids = new Set<string>();
    loadedVoices.forEach((voice) => { if (voice.category) ids.add(voice.category.toLowerCase()); });
    return ids;
  }, [loadedVoices]);

  const visibleCategoryFilters = useMemo(() => {
    if (activeCategory !== 'all' || availableCategoryIds.size === 0) return CATEGORY_FILTERS;
    return CATEGORY_FILTERS.filter((category) => category.id === 'all' || availableCategoryIds.has(category.id));
  }, [activeCategory, availableCategoryIds]);

  const exploreFilterCount = (exploreFilters.category ? 1 : 0) + (exploreFilters.gender ? 1 : 0)
    + (exploreFilters.age ? 1 : 0) + (exploreFilters.accent ? 1 : 0) + (exploreFilters.language ? 1 : 0)
    + exploreFilters.useCases.length + exploreFilters.descriptives.length;

  const activeFilterCount = isExplore ? exploreFilterCount : activeTraitIds.size + (activeCategory !== 'all' ? 1 : 0);

  const displayedVoices = useMemo(() => {
    const sinkUnavailable = (a: MediaProviderVoiceOption, b: MediaProviderVoiceOption) =>
      Number(unavailableVoiceIds.has(a.id)) - Number(unavailableVoiceIds.has(b.id));
    if (isExplore) return [...loadedVoices].sort(sinkUnavailable);
    const query = searchText.trim().toLowerCase();
    return loadedVoices
      .filter((voice) => voiceMatchesTraitFilters(voice, activeTraitIds))
      .filter((voice) => !isFavorites || !query || voice.name.toLowerCase().includes(query))
      .sort((a, b) => sinkUnavailable(a, b)
        || (sortBy === 'newest' ? getCreatedAt(b) - getCreatedAt(a) : a.name.localeCompare(b.name)));
  }, [activeTraitIds, isExplore, isFavorites, loadedVoices, searchText, sortBy, unavailableVoiceIds]);

  const resultCountLabel = totalCount !== undefined
    ? `${displayedVoices.length} shown · ${loadedVoices.length} of ${totalCount} loaded`
    : `${displayedVoices.length} shown · ${loadedVoices.length} loaded`;

  const clearPreviewTimer = useCallback(() => {
    if (previewTimerRef.current) { clearTimeout(previewTimerRef.current); previewTimerRef.current = null; }
  }, []);

  const stopPreview = useCallback(() => {
    clearPreviewTimer();
    previewPlayer.pause();
    void previewPlayer.seekTo(0);
    setPreview((current) => (current.voiceId || current.url ? { voiceId: null, url: undefined, nonce: 0 } : current));
  }, [clearPreviewTimer, previewPlayer]);

  const refreshFavorites = useCallback(() => {
    Promise.all([DebateVoiceFavoriteService.list(), DebateVoiceFavoriteService.listIds()]).then(([favorites, ids]) => {
      setFavoriteVoices(favorites);
      setFavoriteIds(new Set(ids));
    }).catch(() => {});
  }, []);

  const loadVoices = useCallback(async (options: { append?: boolean; page?: number } = {}) => {
    if (!visible) return;
    const append = Boolean(options.append);
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (append) setLoadingMore(true); else setLoading(true);
    setLoadError(null);

    try {
      if (isExplore) {
        if (!onLoadSharedVoices) return;
        const page = options.page ?? 0;
        const response = await onLoadSharedVoices({
          pageSize: EXPLORE_PAGE_SIZE,
          page,
          search: searchText.trim() || undefined,
          category: exploreFilters.category,
          gender: exploreFilters.gender,
          age: exploreFilters.age,
          accent: exploreFilters.accent,
          language: exploreFilters.language,
          useCases: exploreFilters.useCases.length ? exploreFilters.useCases : undefined,
          descriptives: exploreFilters.descriptives.length ? exploreFilters.descriptives : undefined,
        });
        if (requestIdRef.current !== requestId) return;
        const incoming = response.voices || [];
        setLoadedVoices((current) => (append ? mergeVoices(current, incoming) : incoming));
        setHasMore(Boolean(response.voiceHasMore));
        setNextPageToken(response.voiceNextPageToken || null);
        setTotalCount(response.voiceTotalCount);
        return;
      }

      let accumulated: MediaProviderVoiceOption[] = [];
      let token: string | null = null;
      let more = false;
      do {
        const response = await onLoadVoices({
          pageSize: 50,
          includeTotalCount: true,
          includeModels: false,
          sort: sortBy === 'newest' ? 'created_at_unix' : 'name',
          sortDirection: sortBy === 'newest' ? 'desc' : 'asc',
          voiceType: activeSource.voiceType,
          category: activeCategory === 'all' ? undefined : activeCategory,
          search: searchText.trim() || undefined,
          nextPageToken: token || undefined,
        });
        if (requestIdRef.current !== requestId) return;
        const incoming = (response.voices || []).map((voice) => ({
          ...voice,
          sourceVoiceType: voice.sourceVoiceType || activeSource.voiceType,
        }));
        accumulated = mergeVoices(accumulated, incoming);
        more = Boolean(response.voiceHasMore);
        token = response.voiceNextPageToken || null;
        setLoadedVoices(accumulated);
        setTotalCount(response.voiceTotalCount);
        if (accumulated.length >= AUTO_LOAD_CAP) break;
      } while (more && token);
      if (requestIdRef.current !== requestId) return;
      setHasMore(false);
      setNextPageToken(null);
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      setLoadError(error instanceof Error ? error.message : 'Failed to load ElevenLabs voices.');
      if (!append) setLoadedVoices([]);
      setHasMore(false);
      setNextPageToken(null);
      setTotalCount(undefined);
    } finally {
      if (requestIdRef.current === requestId) { setLoading(false); setLoadingMore(false); }
    }
  }, [activeCategory, activeSource.voiceType, exploreFilters, isExplore, onLoadSharedVoices, onLoadVoices, searchText, sortBy, visible]);

  useEffect(() => {
    if (!visible) return;
    setActiveCategory('all');
    setActiveTraitIds(new Set());
    setExploreFilters(EMPTY_EXPLORE_FILTERS);
    setSortBy('name');
    setFilterSheetVisible(false);
    setSearchText('');
    setLoadedVoices([]);
    setHasMore(false);
    setNextPageToken(null);
    setTotalCount(undefined);
    setLoadError(null);
    setLocalVoiceListsReady(false);
    setBusyVoiceId(null);
    requestIdRef.current += 1;
    let cancelled = false;
    Promise.all([DebateVoiceRecentService.list(), DebateVoiceFavoriteService.list(), DebateVoiceFavoriteService.listIds()])
      .then(([recents, favorites, favoriteVoiceIds]) => {
        if (cancelled) return;
        setRecentVoices(recents);
        setFavoriteVoices(favorites);
        setFavoriteIds(new Set(favoriteVoiceIds));
        setActiveSourceId(favorites.length > 0 ? 'favorites' : 'default');
        setLocalVoiceListsReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setRecentVoices([]);
        setFavoriteVoices([]);
        setFavoriteIds(new Set());
        setActiveSourceId('default');
        setLocalVoiceListsReady(true);
      });
    return () => { cancelled = true; };
  }, [targetKey, target?.kind, visible]);

  useEffect(() => {
    setActiveTraitIds((current) => {
      if (current.size === 0) return current;
      const availableIds = new Set(traitFilters.map((filter) => filter.id));
      const next = new Set(Array.from(current).filter((filterId) => availableIds.has(filterId)));
      return next.size === current.size ? current : next;
    });
  }, [traitFilters]);

  // Favorites are local — mirror them straight into the list.
  useEffect(() => {
    if (!visible || activeSourceId !== 'favorites') return;
    requestIdRef.current += 1;
    setLoadedVoices(favoriteVoices);
    setHasMore(false);
    setNextPageToken(null);
    setTotalCount(favoriteVoices.length);
    setLoadError(null);
    setLoading(false);
  }, [activeSourceId, favoriteVoices, visible]);

  // Network sources (re)load on filter/search/sort changes.
  useEffect(() => {
    if (!visible || !localVoiceListsReady || activeSourceId === 'favorites') return;
    const delay = searchText.trim() ? 350 : 0;
    const timer = setTimeout(() => { void loadVoices({ page: 0 }); }, delay);
    return () => clearTimeout(timer);
  }, [activeCategory, activeSourceId, exploreFilters, loadVoices, localVoiceListsReady, searchText, sortBy, visible]);

  useEffect(() => { if (!visible) stopPreview(); }, [stopPreview, visible]);

  // Start playback for the requested preview. We don't seek-before-load (that races
  // the source swap and was leaving valid previews stuck); instead we kick play() now
  // and again once the source reports loaded. A soft timeout only resets to idle — it
  // never permanently disables a voice that genuinely has a preview URL.
  useEffect(() => {
    if (!preview.url || !preview.voiceId) return;
    const voiceId = preview.voiceId;
    previewPlayer.play();
    const timer = setTimeout(() => {
      setPreview((current) => (current.voiceId === voiceId ? { voiceId: null, url: undefined, nonce: 0 } : current));
    }, PREVIEW_IDLE_TIMEOUT_MS);
    previewTimerRef.current = timer;
    return () => clearTimeout(timer);
  }, [preview.nonce, preview.url, preview.voiceId, previewPlayer]);

  useEffect(() => {
    if (preview.voiceId && previewStatus.isLoaded && !previewStatus.playing && !previewStatus.didJustFinish) {
      previewPlayer.play();
    }
  }, [preview.voiceId, previewPlayer, previewStatus.didJustFinish, previewStatus.isLoaded, previewStatus.playing]);

  useEffect(() => {
    if (previewStatus.playing && previewTimerRef.current) clearPreviewTimer();
  }, [clearPreviewTimer, previewStatus.playing]);

  useEffect(() => { if (previewStatus.didJustFinish) stopPreview(); }, [previewStatus.didJustFinish, stopPreview]);

  const handleClose = useCallback(() => { stopPreview(); onClose(); }, [onClose, stopPreview]);

  const commitSelection = useCallback((voice: MediaProviderVoiceOption) => {
    if (target?.kind === 'mc') onPodcastMCVoiceSelect?.(voice);
    else if (target?.kind === 'single') onSelectVoice?.(voice);
    else if (target?.kind === 'debater') onVoiceSelect?.(target.ai.id, voice);
    DebateVoiceRecentService.record(voice).then(() => DebateVoiceRecentService.list()).then(setRecentVoices).catch(() => {});
    onClose();
  }, [onClose, onPodcastMCVoiceSelect, onSelectVoice, onVoiceSelect, target]);

  const handleSelect = useCallback((voice: MediaProviderVoiceOption) => {
    stopPreview();
    if (isCommunityVoice(voice)) {
      if (!onAddSharedVoice) return;
      setBusyVoiceId(voice.id);
      onAddSharedVoice(voice)
        .then((added) => {
          // Using a community voice also curates it into Favorites.
          DebateVoiceFavoriteService.add(added, [voice.id]).then(refreshFavorites).catch(() => {});
          commitSelection(added);
        })
        .catch(() => { /* error toast surfaced upstream */ })
        .finally(() => setBusyVoiceId(null));
      return;
    }
    commitSelection(voice);
  }, [commitSelection, onAddSharedVoice, refreshFavorites, stopPreview]);

  const handleToggleFavorite = useCallback((voice: MediaProviderVoiceOption) => {
    if (favoriteIds.has(voice.id)) {
      setFavoriteIds((prev) => { const next = new Set(prev); next.delete(voice.id); return next; });
      DebateVoiceFavoriteService.remove(voice.id).then(refreshFavorites).catch(() => {});
      return;
    }
    if (isCommunityVoice(voice)) {
      if (!onAddSharedVoice) return;
      setBusyVoiceId(voice.id);
      onAddSharedVoice(voice)
        .then((added) => DebateVoiceFavoriteService.add(added, [voice.id]).then(() => {
          setFavoriteIds((prev) => { const next = new Set(prev); next.add(voice.id); next.add(added.id); return next; });
          refreshFavorites();
        }))
        .catch(() => {})
        .finally(() => setBusyVoiceId(null));
      return;
    }
    setFavoriteIds((prev) => new Set(prev).add(voice.id));
    DebateVoiceFavoriteService.add(voice).then(refreshFavorites).catch(() => {});
  }, [favoriteIds, onAddSharedVoice, refreshFavorites]);

  const handlePreview = useCallback((voice: MediaProviderVoiceOption) => {
    const url = getPreviewUrl(voice);
    if (!url) return;
    if (preview.voiceId === voice.id && Boolean(previewStatus.playing)) { stopPreview(); return; }
    clearPreviewTimer();
    previewPlayer.pause();
    setPreview((current) => ({ voiceId: voice.id, url, nonce: current.nonce + 1 }));
  }, [clearPreviewTimer, preview.voiceId, previewPlayer, previewStatus.playing, stopPreview]);

  const handleSourceChange = useCallback((sourceId: VoiceSourceId) => {
    stopPreview();
    setActiveSourceId(sourceId);
    setActiveCategory('all');
    setActiveTraitIds(new Set());
    setExploreFilters(EMPTY_EXPLORE_FILTERS);
  }, [stopPreview]);

  const handleClearFilters = useCallback(() => {
    setActiveTraitIds(new Set());
    setActiveCategory('all');
    setExploreFilters(EMPTY_EXPLORE_FILTERS);
  }, []);

  const toggleExploreSingle = useCallback(<K extends 'category' | 'gender' | 'age' | 'accent' | 'language'>(key: K, value: ExploreFilterState[K]) => {
    setExploreFilters((current) => ({ ...current, [key]: current[key] === value ? undefined : value }));
  }, []);

  const toggleExploreMulti = useCallback((key: 'useCases' | 'descriptives', value: string) => {
    setExploreFilters((current) => {
      const list = current[key];
      return { ...current, [key]: list.includes(value) ? list.filter((item) => item !== value) : [...list, value] };
    });
  }, []);

  // Distinct accent per filter group so the sheet reads as colorful categories
  // rather than a monochrome wall of pills.
  const groupAccents = useMemo(() => [
    theme.colors.primary[500],
    theme.colors.success[500],
    theme.colors.warning[500],
    theme.colors.error[500],
    theme.colors.info[500],
  ], [theme.colors.error, theme.colors.info, theme.colors.primary, theme.colors.success, theme.colors.warning]);

  const renderFilterChip = useCallback((options: { key: string; label: string; active: boolean; onPress: () => void; count?: number; accent?: string }) => {
    const { key, label, active, onPress, count } = options;
    const accent = options.accent || theme.colors.primary[500];
    return (
      <TouchableOpacity
        key={key}
        onPress={onPress}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          borderRadius: theme.borderRadius.full, borderWidth: 1,
          borderColor: active ? accent : `${accent}59`,
          backgroundColor: active ? accent : `${accent}1A`,
          paddingHorizontal: 14, paddingVertical: 9, marginRight: 8, marginBottom: 8,
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
      >
        <Typography variant="caption" weight={active ? 'bold' : 'semibold'} style={{ color: active ? theme.colors.text.white : theme.colors.text.primary }}>
          {label}
        </Typography>
        {typeof count === 'number' && (
          <View style={{ minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? 'rgba(255,255,255,0.28)' : `${accent}33` }}>
            <Typography variant="caption" weight="semibold" style={{ fontSize: 11, lineHeight: 14, color: active ? theme.colors.text.white : theme.colors.text.secondary }}>{count}</Typography>
          </View>
        )}
      </TouchableOpacity>
    );
  }, [theme.borderRadius.full, theme.colors.primary, theme.colors.text.primary, theme.colors.text.secondary, theme.colors.text.white]);

  const renderFilterGroup = useCallback((key: string, label: string, accent: string, children: React.ReactNode) => (
    <View key={key} style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} />
        <Typography variant="caption" weight="bold" style={{ color: theme.colors.text.secondary, letterSpacing: 0.8, textTransform: 'uppercase' }}>
          {label}
        </Typography>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{children}</View>
    </View>
  ), [theme.colors.text.secondary, theme.spacing.sm]);

  const renderSourceTabs = useCallback(() => (
    <View style={{ flexDirection: 'row', backgroundColor: theme.colors.card, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, padding: 3 }}>
      {sourceTabs.map((tab) => {
        const active = activeSourceId === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            onPress={() => handleSourceChange(tab.id)}
            style={{ flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? theme.colors.primary[500] : 'transparent' }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Typography variant="caption" weight={active ? 'bold' : 'medium'} numberOfLines={1} style={{ fontSize: 13, color: active ? theme.colors.text.white : theme.colors.text.secondary }}>
              {tab.label}
            </Typography>
          </TouchableOpacity>
        );
      })}
    </View>
  ), [activeSourceId, handleSourceChange, sourceTabs, theme.colors.border, theme.colors.card, theme.colors.primary, theme.colors.text.secondary, theme.colors.text.white]);

  const renderCompactVoiceButton = useCallback((voice: MediaProviderVoiceOption, testPrefix: string) => {
    const selected = selectedVoiceId === voice.id;
    return (
      <TouchableOpacity
        key={`${testPrefix}-${voice.id}`}
        onPress={() => handleSelect(voice)}
        style={{
          minWidth: 148, maxWidth: 220, borderWidth: 1,
          borderColor: selected ? theme.colors.primary[500] : theme.colors.border,
          backgroundColor: selected ? `${theme.colors.primary[500]}18` : theme.colors.card,
          borderRadius: theme.borderRadius.md, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.sm, marginRight: theme.spacing.sm,
        }}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        testID={`${testPrefix}-${voice.id}`}
      >
        <Typography variant="caption" weight="semibold" numberOfLines={1}>{voice.name}</Typography>
        <Typography variant="caption" color="secondary" numberOfLines={1}>{getSourceLabel(voice)}</Typography>
      </TouchableOpacity>
    );
  }, [handleSelect, selectedVoiceId, theme.borderRadius.md, theme.colors.border, theme.colors.card, theme.colors.primary, theme.spacing.sm]);

  const renderVoice = useCallback(({ item }: { item: MediaProviderVoiceOption }) => {
    const selected = selectedVoiceId === item.id;
    // Availability is metadata-driven: a voice either ships a preview clip or it doesn't.
    const previewAvailable = Boolean(getPreviewUrl(item));
    const requested = preview.voiceId === item.id;
    const previewPlaying = requested && Boolean(previewStatus.playing);
    const previewBuffering = requested && previewAvailable && !previewPlaying;
    const disabledByDuplicate = unavailableVoiceIds.has(item.id);
    const busy = busyVoiceId === item.id;
    const community = isCommunityVoice(item);
    const proOnly = community && item.free_users_allowed === false && isFreeTier;
    const favorited = favoriteIds.has(item.id);
    const metadataChips = getVoiceMetadataChips(item);

    return (
      <TouchableOpacity
        onPress={() => { if (!disabledByDuplicate && !busy) handleSelect(item); }}
        disabled={disabledByDuplicate || busy}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
          paddingVertical: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
          opacity: disabledByDuplicate ? 0.52 : 1,
        }}
        accessibilityRole="button"
        accessibilityState={{ selected, disabled: disabledByDuplicate }}
        testID={`debate-voice-option-${item.id}`}
      >
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Typography variant="body" weight={selected ? 'semibold' : 'medium'} numberOfLines={1} style={{ flexShrink: 1 }}>{item.name}</Typography>
            <View style={{ borderRadius: theme.borderRadius.full, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: selected ? theme.colors.primary[500] : theme.colors.surface, borderWidth: selected ? 0 : 1, borderColor: theme.colors.border }}>
              <Typography variant="caption" weight="semibold" style={{ color: selected ? theme.colors.text.white : theme.colors.text.secondary }}>{getSourceLabel(item)}</Typography>
            </View>
            {selected && <Ionicons name="checkmark-circle" size={17} color={theme.colors.primary[500]} />}
          </View>

          {!!item.description && <Typography variant="caption" color="secondary" numberOfLines={2}>{item.description}</Typography>}

          {metadataChips.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {metadataChips.map((chip) => (
                <View key={`${item.id}-${chip}`} style={{ borderRadius: theme.borderRadius.full, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: `${theme.colors.info[500]}1A` }}>
                  <Typography variant="caption" color="secondary">{chip}</Typography>
                </View>
              ))}
            </View>
          )}

          {disabledByDuplicate ? (
            <Typography variant="caption" color="secondary">Already assigned to another role.</Typography>
          ) : busy ? (
            <Typography variant="caption" color="secondary">Adding…</Typography>
          ) : proOnly ? (
            <Typography variant="caption" style={{ color: theme.colors.warning[600] }}>Paid plan required to favorite</Typography>
          ) : null}
        </View>

        {/* Favorite toggle */}
        <TouchableOpacity
          onPress={() => { if (!busy) handleToggleFavorite(item); }}
          disabled={busy}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ width: 36, height: 40, alignItems: 'center', justifyContent: 'center' }}
          accessibilityRole="button"
          accessibilityState={{ selected: favorited }}
          accessibilityLabel={favorited ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`}
          testID={`debate-voice-favorite-${item.id}`}
        >
          {busy ? (
            <ActivityIndicator size="small" color={theme.colors.primary[500]} />
          ) : (
            <Ionicons name={favorited ? 'star' : 'star-outline'} size={20} color={favorited ? theme.colors.warning[500] : theme.colors.text.disabled} />
          )}
        </TouchableOpacity>

        {/* Preview — or a clear "no preview" affordance when the voice ships no clip */}
        <TouchableOpacity
          onPress={() => handlePreview(item)}
          disabled={!previewAvailable}
          style={{
            width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
            backgroundColor: previewPlaying ? theme.colors.primary[500] : previewAvailable ? theme.colors.surface : 'transparent',
            borderWidth: previewAvailable ? 1 : 0,
            borderColor: previewPlaying ? theme.colors.primary[500] : theme.colors.border,
          }}
          accessibilityRole="button"
          accessibilityState={{ disabled: !previewAvailable }}
          accessibilityLabel={previewAvailable ? `${previewPlaying ? 'Stop' : 'Preview'} ${item.name}` : `No preview available for ${item.name}`}
          testID={`debate-voice-preview-${item.id}`}
        >
          {previewBuffering ? (
            <ActivityIndicator size="small" color={theme.colors.primary[500]} />
          ) : !previewAvailable ? (
            <Ionicons name="volume-mute-outline" size={18} color={theme.colors.text.disabled} />
          ) : (
            <Ionicons name={previewPlaying ? 'stop' : 'play'} size={18} color={previewPlaying ? theme.colors.text.white : theme.colors.primary[500]} />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }, [
    busyVoiceId, favoriteIds, handlePreview, handleSelect, handleToggleFavorite, isFreeTier,
    preview.voiceId, previewStatus.playing, selectedVoiceId,
    theme.borderRadius.full, theme.colors.border, theme.colors.info, theme.colors.primary, theme.colors.surface,
    theme.colors.text.disabled, theme.colors.text.secondary, theme.colors.text.white, theme.colors.warning,
    theme.spacing.md, theme.spacing.sm, unavailableVoiceIds,
  ]);

  const emptyLabel = loadError
    || (isExplore ? 'No community voices matched. Try fewer filters.'
      : isFavorites ? 'No favorites yet. Tap the ☆ on any voice to build your shortlist.'
        : loadedVoices.length > 0 ? 'No loaded voices match these filters.'
          : activeSourceId === 'my' ? 'No personal voices yet.' : 'No voices matched.');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top', 'bottom']}>
        <SheetHeader title="Choose Voice" onClose={handleClose} testID="debate-voice-picker" />

        <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.sm, gap: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          <Typography variant="caption" color="secondary" align="center" numberOfLines={1}>
            {targetSubtitle}
          </Typography>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, paddingHorizontal: theme.spacing.md, backgroundColor: theme.colors.card }}>
            <Ionicons name="search" size={18} color={theme.colors.text.disabled} />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder={isExplore ? 'Search community voices' : 'Search voices'}
              placeholderTextColor={theme.colors.text.disabled}
              style={{ flex: 1, paddingVertical: theme.spacing.sm, color: theme.colors.text.primary }}
              testID="debate-voice-search-input"
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')} accessibilityRole="button" accessibilityLabel="Clear search" testID="debate-voice-search-clear">
                <Ionicons name="close-circle" size={18} color={theme.colors.text.disabled} />
              </TouchableOpacity>
            )}
          </View>

          {renderSourceTabs()}

          {(
            <TouchableOpacity
              onPress={() => setFilterSheetVisible(true)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: theme.spacing.xs }}
              accessibilityRole="button"
              testID="debate-voice-filters-toggle"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="options-outline" size={18} color={theme.colors.text.secondary} />
                <Typography variant="body" weight="semibold">Filters</Typography>
                {activeFilterCount > 0 && (
                  <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary[500] }}>
                    <Typography variant="caption" weight="semibold" style={{ color: theme.colors.text.white }}>{activeFilterCount}</Typography>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {!isExplore && <Typography variant="caption" color="secondary">{sortBy === 'newest' ? 'Newest' : 'Name'}</Typography>}
                <Ionicons name="chevron-forward" size={16} color={theme.colors.text.secondary} />
              </View>
            </TouchableOpacity>
          )}

          {recentVoiceOptions.length > 0 && activeSourceId !== 'favorites' && (
            <View style={{ gap: theme.spacing.xs }}>
              <Typography variant="caption" weight="semibold" color="secondary">Recent</Typography>
              <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false}>
                {recentVoiceOptions.slice(0, 6).map((voice) => renderCompactVoiceButton(voice, 'debate-recent-voice'))}
              </ScrollView>
            </View>
          )}
        </View>

        <View style={{ flex: 1, paddingHorizontal: theme.spacing.lg }}>
          {loading && loadedVoices.length === 0 ? (
            <View style={{ paddingVertical: theme.spacing.xl, alignItems: 'center', gap: theme.spacing.sm }}>
              <ActivityIndicator size="small" color={theme.colors.primary[500]} />
              <Typography variant="caption" color="secondary">{isExplore ? 'Searching the community library…' : 'Loading ElevenLabs voices…'}</Typography>
            </View>
          ) : (
            <FlatList
              data={displayedVoices}
              keyExtractor={(voice) => voice.id}
              keyboardShouldPersistTaps="handled"
              renderItem={renderVoice}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingTop: theme.spacing.md, paddingBottom: theme.spacing.xl + insets.bottom }}
              ListHeaderComponent={(
                <View style={{ paddingBottom: theme.spacing.xs }}>
                  <Typography variant="caption" color="secondary">{loadError || resultCountLabel}</Typography>
                </View>
              )}
              ListEmptyComponent={(
                <View style={{ paddingVertical: theme.spacing.lg, alignItems: 'center', gap: theme.spacing.sm }}>
                  <Typography variant="caption" color="secondary" align="center">{emptyLabel}</Typography>
                  {!isExplore && !isFavorites && loadedVoices.length > 0 && activeFilterCount > 0 && !loadError && (
                    <Button title="Clear Filters" onPress={handleClearFilters} variant="secondary" size="small" />
                  )}
                  {(isFavorites || activeSourceId === 'my') && loadedVoices.length === 0 && !loadError && (
                    <Button title="Show Default" onPress={() => handleSourceChange('default')} variant="secondary" size="small" />
                  )}
                  {!!loadError && <Button title="Retry" onPress={() => loadVoices({ page: 0 })} variant="secondary" size="small" />}
                </View>
              )}
              ListFooterComponent={(
                <View style={{ paddingTop: theme.spacing.md, paddingBottom: theme.spacing.sm }}>
                  {isExplore && hasMore && nextPageToken ? (
                    <Button title={loadingMore ? 'Loading…' : 'Load more'} onPress={() => loadVoices({ append: true, page: Number(nextPageToken) })} variant="secondary" size="small" disabled={loadingMore} fullWidth />
                  ) : loading && loadedVoices.length > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm }}>
                      <ActivityIndicator size="small" color={theme.colors.primary[500]} />
                      <Typography variant="caption" color="secondary">{`Loading… (${loadedVoices.length} loaded)`}</Typography>
                    </View>
                  ) : loadedVoices.length > 0 ? (
                    <Typography variant="caption" color="secondary" align="center">{isExplore ? 'End of results' : 'Showing all loaded voices'}</Typography>
                  ) : null}
                </View>
              )}
            />
          )}
        </View>
      </SafeAreaView>

      <Modal visible={filterSheetVisible} transparent animationType="slide" onRequestClose={() => setFilterSheetVisible(false)}>
        <View style={{ flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end' }}>
          <View style={{ maxHeight: filterPanelMaxHeight, backgroundColor: theme.colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' }}>
            <View style={{ alignItems: 'center', paddingTop: theme.spacing.sm }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
              <Typography variant="subtitle" weight="semibold">Filters</Typography>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                {activeFilterCount > 0 && <Button title="Clear" onPress={handleClearFilters} variant="ghost" size="small" />}
                <Button title="Done" onPress={() => setFilterSheetVisible(false)} variant="primary" size="small" />
              </View>
            </View>

            <ScrollView
              style={{ paddingHorizontal: theme.spacing.lg }}
              contentContainerStyle={{ gap: theme.spacing.lg, paddingVertical: theme.spacing.lg, paddingBottom: theme.spacing.xl + insets.bottom }}
              keyboardShouldPersistTaps="handled"
            >
              {isExplore ? (
                <>
                  {renderFilterGroup('category', 'Category', groupAccents[0], EXPLORE_CATEGORIES.map((option) => renderFilterChip({ key: `cat-${option.value}`, label: option.label, active: exploreFilters.category === option.value, accent: groupAccents[0], onPress: () => toggleExploreSingle('category', option.value) })))}
                  {renderFilterGroup('gender', 'Gender', groupAccents[1], EXPLORE_GENDERS.map((value) => renderFilterChip({ key: `gender-${value}`, label: toTitleCase(value), active: exploreFilters.gender === value, accent: groupAccents[1], onPress: () => toggleExploreSingle('gender', value) })))}
                  {renderFilterGroup('age', 'Age', groupAccents[2], EXPLORE_AGES.map((value) => renderFilterChip({ key: `age-${value}`, label: toTitleCase(value), active: exploreFilters.age === value, accent: groupAccents[2], onPress: () => toggleExploreSingle('age', value) })))}
                  {renderFilterGroup('accent', 'Accent', groupAccents[3], EXPLORE_ACCENTS.map((value) => renderFilterChip({ key: `accent-${value}`, label: toTitleCase(value), active: exploreFilters.accent === value, accent: groupAccents[3], onPress: () => toggleExploreSingle('accent', value) })))}
                  {renderFilterGroup('language', 'Language', groupAccents[4], EXPLORE_LANGUAGES.map((option) => renderFilterChip({ key: `lang-${option.value}`, label: option.label, active: exploreFilters.language === option.value, accent: groupAccents[4], onPress: () => toggleExploreSingle('language', option.value) })))}
                  {renderFilterGroup('usecase', 'Use case', groupAccents[0], EXPLORE_USE_CASES.map((option) => renderFilterChip({ key: `use-${option.value}`, label: option.label, active: exploreFilters.useCases.includes(option.value), accent: groupAccents[0], onPress: () => toggleExploreMulti('useCases', option.value) })))}
                  {renderFilterGroup('tone', 'Tone', groupAccents[1], EXPLORE_DESCRIPTIVES.map((value) => renderFilterChip({ key: `tone-${value}`, label: toTitleCase(value), active: exploreFilters.descriptives.includes(value), accent: groupAccents[1], onPress: () => toggleExploreMulti('descriptives', value) })))}
                </>
              ) : (
                <>
                  <View style={{ gap: theme.spacing.sm }}>
                    <Typography variant="caption" weight="bold" style={{ color: theme.colors.text.secondary, letterSpacing: 0.8, textTransform: 'uppercase' }}>Sort</Typography>
                    <SegmentedControl fullWidth options={[{ label: 'Name', value: 'name' as const }, { label: 'Newest', value: 'newest' as const }]} value={sortBy} onChange={setSortBy} />
                  </View>
                  {renderFilterGroup('type', 'Type', groupAccents[0], visibleCategoryFilters.map((category) => renderFilterChip({ key: `category-${category.id}`, label: category.label, active: activeCategory === category.id, accent: groupAccents[0], onPress: () => { setActiveCategory(category.id); setActiveTraitIds(new Set()); } })))}
                  {traitFilterGroups.map((group, index) => {
                    const accent = groupAccents[(index + 1) % groupAccents.length];
                    return renderFilterGroup(group.kind, group.label, accent, group.filters.map((filter) => renderFilterChip({
                      key: filter.id,
                      label: filter.label,
                      active: activeTraitIds.has(filter.id),
                      count: traitCounts.get(filter.id),
                      accent,
                      onPress: () => setActiveTraitIds((current) => {
                        const next = new Set(current);
                        if (next.has(filter.id)) next.delete(filter.id); else next.add(filter.id);
                        return next;
                      }),
                    })));
                  })}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

export default DebateVoicePicker;
