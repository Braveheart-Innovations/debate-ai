/**
 * DebateScreen - Refactored Container Component
 * Clean implementation using extracted services, hooks, and components
 * Reduced from 1055 lines to ~200 lines following atomic design principles
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Alert, ActivityIndicator, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ErrorService } from '@/services/errors/ErrorService';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
import { ContextBar, Typography, KeyboardAvoider } from '../components/molecules';
import { useTheme } from '../theme';
import type { AI, DebateVoiceConfig, Message } from '../types';
import { usePersonality } from '@/hooks/usePersonality';
import {
  useDebateSession,
  useDebateFlow,
  useDebateVoting,
  useTopicSelection,
  useDebateMessages,
  useDebateVoiceGeneration,
} from '../hooks/debate';
import {
  Header,
  HeaderActions,
  TopicSelector,
  DebateMessageList,
  VotingInterface,
  AudienceQuestionsModal,
  ScoreDisplay,
  DebateSessionHeader,
  type DebateSessionHeaderTeam,
} from '../components/organisms';
import { VictoryCelebration } from '../components/organisms/debate/VictoryCelebration';
import { DebateVoicePackModal } from '../components/organisms/debate/DebateVoicePackModal';
import { TranscriptModal } from '../components/organisms/debate/TranscriptModal';
import { DemoBanner } from '@/components/molecules/subscription/DemoBanner';
import { getStreamingService } from '../services/streaming/StreamingService';
import useFeatureAccess from '@/hooks/useFeatureAccess';
import { DemoContentService } from '@/services/demo/DemoContentService';
import { primeDebate } from '@/services/demo/DemoPlaybackRouter';
import { DemoSamplesBar } from '@/components/organisms/demo/DemoSamplesBar';
import type { DemoDebate } from '@/types/demo';
import { useDispatch } from 'react-redux';
import { showSheet, type AppDispatch } from '@/store';
import { addToMediaGalleryWithCleanup } from '@/store/createSlice';
import { RecordController } from '@/services/demo/RecordController';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AppendToPackService from '@/services/demo/AppendToPackService';
import { shallowEqual, useSelector } from 'react-redux';
import type { RootState } from '@/store';
import { getStreamingContentSnapshot } from '@/services/streaming/StreamingContentStore';
import { DebateRecordPickerModal } from '@/components/organisms/demo/DebateRecordPickerModal';
import { FORMATS, getPresetForFormat, getPresetIdForRounds, type OxfordAudienceQuestions } from '@/config/debate/formats';
import { getDebateSpeakerRoleLabel } from '@/utils/debateLabels';
import {
  buildDebatePodcastCompilePlan,
  createDebatePodcastGalleryEntry,
  getDebateVoicePackCandidates,
  type DebateVoicePackCandidate,
} from '@/services/debate';
import DebateAudioCompileService, { type DebateAudioCompileStage } from '@/services/debate/debateAudioCompileService';
import { sanitizeDebateSpeechForTTS } from '@/services/debate/debateAudioSanitizer';
import { estimateElevenLabsTtsCreditCost } from '@/services/media/elevenLabsCredits';
import { ActiveSessionPersistenceService, type ActiveDebateSessionSnapshot } from '@/services/lifecycle/ActiveSessionPersistenceService';
import { AppLifecycleService } from '@/services/lifecycle/AppLifecycleService';
import { useRecoverableExitGuard } from '@/hooks/lifecycle/useRecoverableExitGuard';
import { GeneratedContentReportModal } from '@/components/organisms/report/GeneratedContentReportModal';
import type { GeneratedContentReportTarget } from '@/services/reports/GeneratedContentReportService';
import { buildMessageReportTarget } from '@/utils/generatedContentReportTargets';
// Topic block is now rendered inside header
// Controls modal removed – using Start Over action directly

interface DebateScreenProps {
  navigation: {
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    replace: (screen: string, params?: Record<string, unknown>) => void;
    dispatch?: (action: unknown) => void;
    addListener?: (event: 'beforeRemove', callback: (event: { preventDefault: () => void; data?: { action?: unknown } }) => void) => (() => void) | undefined;
  };
  route: {
    params: {
      selectedAIs: AI[];
      topic?: string;
      personalities?: { [key: string]: string };
      formatId?: 'oxford' | 'lincoln_douglas' | 'policy' | 'socratic';
      rounds?: number;
      exchanges?: number;
      civility?: 1|2|3|4|5;
      demoDebateId?: string;
      demoSample?: DemoDebate;
      rematchKey?: string;
      voiceConfig?: DebateVoiceConfig;
    };
  };
}

const GALLERY_NAVIGATION_DELAY_MS = 450;

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function getPodcastGenerationLabel(stage: DebateAudioCompileStage | null): string | undefined {
  switch (stage) {
    case 'preparing':
      return 'Preparing...';
    case 'creating_session':
      return 'Starting compile...';
    case 'uploading':
      return 'Uploading clips...';
    case 'compiling':
      return 'Compiling podcast...';
    case 'downloading':
      return 'Downloading file...';
    default:
      return undefined;
  }
}

const DebateScreen: React.FC<DebateScreenProps> = ({ navigation, route }) => {
  const { theme } = useTheme();
  const dispatch = useDispatch<AppDispatch>();
  const { selectedAIs, topic: initialTopic, personalities: initialPersonalities, formatId, rounds, exchanges, civility, demoDebateId, demoSample, voiceConfig } = route.params;
  const [showTranscript, setShowTranscript] = useState(false);
  const [debateSamples, setDebateSamples] = useState<Array<{ id: string; title: string; topic: string }>>([]);
  const [isRecording, setIsRecording] = useState(false);
  const recordModeEnabled = useSelector((state: RootState) => state.settings.recordModeEnabled ?? false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [votingOverlayHeight, setVotingOverlayHeight] = useState(0);
  const [scoreOverlayHeight, setScoreOverlayHeight] = useState(0);
  const [continuationOverlayHeight, setContinuationOverlayHeight] = useState(0);
  const [voicePackModalVisible, setVoicePackModalVisible] = useState(false);
  const [voicePackSelectedIds, setVoicePackSelectedIds] = useState<string[]>([]);
  const [isSavingVoicePack, setIsSavingVoicePack] = useState(false);
  const [voicePackSaveStage, setVoicePackSaveStage] = useState<DebateAudioCompileStage | null>(null);
  const [pendingGalleryFocusMediaId, setPendingGalleryFocusMediaId] = useState<string | null>(null);
  const [debateRecoveryChecked, setDebateRecoveryChecked] = useState(false);
  const [reportTarget, setReportTarget] = useState<GeneratedContentReportTarget | null>(null);
  const selectedSampleRef = React.useRef<DemoDebate | null>(null);
  // No custom controls modal
  
  // Initialize all hooks
  const session = useDebateSession(selectedAIs);
  const topicSelection = useTopicSelection(initialTopic);
  const flow = useDebateFlow(session.orchestrator);
  const voting = useDebateVoting(session.orchestrator, selectedAIs);
  const messages = useDebateMessages(session.session?.startTime);
  const debateVoice = useDebateVoiceGeneration({
    sessionId: session.session?.id,
    voiceConfig,
    messages: messages.messages,
    participants: session.session?.participants || selectedAIs,
  });
  const { isDemo, canStartTrial } = useFeatureAccess();
  const { getPersonality: getMergedPersonality } = usePersonality();
  const activeStreamingMessageIds = useSelector((state: RootState) => (
    Object.values(state.streaming.streamingMessages)
      .filter(stream => stream.isStreaming)
      .map(stream => stream.messageId)
  ), shallowEqual);
  const activeDebateStreamIds = useMemo(() => {
    const debateMessageIds = new Set(messages.messages.map(message => message.id));
    return activeStreamingMessageIds.filter(messageId => debateMessageIds.has(messageId));
  }, [activeStreamingMessageIds, messages.messages]);
  const voicePackCandidates = useMemo(
    () => getDebateVoicePackCandidates(messages.messages),
    [messages.messages]
  );
  const readyVoicePackCandidates = useMemo(
    () => voicePackCandidates.filter((candidate) => candidate.status === 'ready'),
    [voicePackCandidates]
  );
  const readyVoicePackIds = useMemo(
    () => readyVoicePackCandidates.map((candidate) => candidate.id),
    [readyVoicePackCandidates]
  );
  const shouldOfferPodcastGeneration = Boolean(voiceConfig?.enabled && voicePackCandidates.length > 0);

  const saveActiveDebateSnapshot = useCallback(async (
    status: ActiveDebateSessionSnapshot['status'] = 'active',
    reason?: string
  ) => {
    if (typeof session.orchestrator?.createSnapshot !== 'function') return;
    const messagesWithStreamingContent = messages.messages.map((message) => {
      const stream = getStreamingContentSnapshot(message.id);
      return stream.exists && stream.content ? { ...message, content: stream.content } : message;
    });
    const snapshot = session.orchestrator.createSnapshot(status, messagesWithStreamingContent);
    if (!snapshot) return;
    const pendingMessageIds = activeDebateStreamIds.length > 0
      ? activeDebateStreamIds
      : snapshot.interruptedMessageIds || [];
    const shouldPersistPendingTurn = status === 'interrupted'
      || (status === 'active' && pendingMessageIds.length > 0);

    await ActiveSessionPersistenceService.saveSnapshot({
      ...snapshot,
      status,
      pendingTurn: shouldPersistPendingTurn
        ? {
          kind: 'debate_message',
          reason,
          messageIds: pendingMessageIds,
          interruptedAt: status === 'interrupted' ? Date.now() : undefined,
        }
        : snapshot.pendingTurn,
    });
  }, [activeDebateStreamIds, messages.messages, session.orchestrator]);

  const debateRecoveryAttemptedRef = React.useRef(false);
  useEffect(() => {
    if (debateRecoveryAttemptedRef.current || !session.orchestrator || session.isInitialized) return;
    debateRecoveryAttemptedRef.current = true;

    const restoreDebateSnapshot = async () => {
      try {
        const snapshot = await ActiveSessionPersistenceService.loadLatestSnapshot<ActiveDebateSessionSnapshot>('debate');
        if (!snapshot || snapshot.status === 'completed') return;

        const snapshotParticipantIds = snapshot.debateSession.participants.map(ai => ai.id).join('|');
        const routeParticipantIds = selectedAIs.map(ai => ai.id).join('|');
        const matchesParticipants = snapshotParticipantIds === routeParticipantIds;
        const matchesTopic = !initialTopic || snapshot.debateSession.topic === initialTopic;
        if (!matchesParticipants || !matchesTopic) return;

        const stalePendingTurn = snapshot.status === 'active' ? snapshot.pendingTurn : undefined;
        const shouldTreatAsStaleTurn = Boolean(stalePendingTurn);
        const snapshotToHydrate: ActiveDebateSessionSnapshot = stalePendingTurn
          ? {
            ...snapshot,
            status: 'interrupted',
            pendingTurn: {
              ...stalePendingTurn,
              reason: stalePendingTurn.reason || 'stale_active_restore',
              interruptedAt: stalePendingTurn.interruptedAt || Date.now(),
            },
          }
          : snapshot;

        if (shouldTreatAsStaleTurn) {
          await ActiveSessionPersistenceService.saveSnapshot(snapshotToHydrate);
        }

        await session.hydrateSessionFromSnapshot(snapshotToHydrate);
      } finally {
        setDebateRecoveryChecked(true);
      }
    };

    void restoreDebateSnapshot();
  }, [initialTopic, selectedAIs, session]);

  useEffect(() => {
    if (!session.session) return undefined;

    return AppLifecycleService.register({
      id: `debate-${session.session.id}`,
      onBackground: () => saveActiveDebateSnapshot(
        activeDebateStreamIds.length > 0 ? 'active' : 'backgrounded',
        'app_backgrounded'
      ),
    });
  }, [activeDebateStreamIds.length, saveActiveDebateSnapshot, session.session]);

  useEffect(() => {
    if (!session.session) return;
    void saveActiveDebateSnapshot(activeDebateStreamIds.length > 0 ? 'active' : 'backgrounded');
  }, [
    activeDebateStreamIds.length,
    flow.continuation,
    flow.audienceQuestionsPrompt,
    messages.messages.length,
    saveActiveDebateSnapshot,
    session.session,
    voting.voteRecords.length,
  ]);

  const handleOpenVoicePackModal = useCallback(() => {
    if (voicePackCandidates.length === 0) {
      ErrorService.showInfo('No voiced debate clips are available yet.', 'debate');
      return;
    }

    setVoicePackSelectedIds((current) => (
      areStringArraysEqual(current, readyVoicePackIds) ? current : readyVoicePackIds
    ));
    setVoicePackModalVisible(true);
  }, [readyVoicePackIds, voicePackCandidates.length]);

  const handleSelectAllReadyVoicePackClips = useCallback(() => {
    setVoicePackSelectedIds((current) => (
      areStringArraysEqual(current, readyVoicePackIds) ? current : readyVoicePackIds
    ));
  }, [readyVoicePackIds]);

  const handleClearVoicePackSelection = useCallback(() => {
    setVoicePackSelectedIds((current) => (current.length === 0 ? current : []));
  }, []);

  const handleCloseVoicePackModal = useCallback(() => {
    setVoicePackModalVisible(false);
  }, []);

  const handleToggleVoicePackClip = useCallback((id: string) => {
    setVoicePackSelectedIds((current) => (
      current.includes(id)
        ? current.filter((candidateId) => candidateId !== id)
        : [...current, id]
    ));
  }, []);

  const handleRetryDebateAudio = useCallback((message: Message, speakerName?: string) => {
    const audioStatus = message.metadata?.debateAudio?.status;
    if (audioStatus === 'ready' || audioStatus === 'generating') return;
    const spokenText = sanitizeDebateSpeechForTTS(message.content);
    const estimatedCost = estimateElevenLabsTtsCreditCost(spokenText, voiceConfig?.ttsModelId);
    const label = speakerName || message.sender;
    Alert.alert(
      'Retry voice clip?',
      `Retrying ${label}'s clip will use about ${estimatedCost.toLocaleString()} ElevenLabs credits.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Retry',
          onPress: () => debateVoice.retryMessageAudio(message),
        },
      ],
      { cancelable: true }
    );
  }, [debateVoice, voiceConfig?.ttsModelId]);

  const handleRetryVoicePackClip = useCallback((candidate: DebateVoicePackCandidate) => {
    if (candidate.status === 'ready' || candidate.status === 'generating') return;
    handleRetryDebateAudio(candidate.message, candidate.speakerName);
  }, [handleRetryDebateAudio]);

  useEffect(() => {
    if (!voicePackModalVisible) return;
    setVoicePackSelectedIds((current) => {
      const nextSelectedIds = current.filter((id) => readyVoicePackIds.includes(id));
      return areStringArraysEqual(current, nextSelectedIds) ? current : nextSelectedIds;
    });
  }, [readyVoicePackIds, voicePackModalVisible]);

  useEffect(() => {
    if (!pendingGalleryFocusMediaId || voicePackModalVisible) return;

    const navigationTimer = setTimeout(() => {
      navigation.navigate('CreateSession', {
        focusMediaId: pendingGalleryFocusMediaId,
        galleryTab: 'audio',
      });
      setPendingGalleryFocusMediaId(null);
    }, GALLERY_NAVIGATION_DELAY_MS);

    return () => {
      clearTimeout(navigationTimer);
    };
  }, [navigation, pendingGalleryFocusMediaId, voicePackModalVisible]);

  useEffect(() => {
    if (demoSample) {
      selectedSampleRef.current = demoSample;
    }
  }, [demoSample]);

  useEffect(() => {
    let cancelled = false;
    if (demoDebateId && !demoSample) {
      DemoContentService.findDebateById(demoDebateId).then(sample => {
        if (!cancelled && sample) {
          selectedSampleRef.current = sample;
        }
      }).catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [demoDebateId, demoSample]);

  useEffect(() => {
    if (!voting.isVoting) {
      setVotingOverlayHeight(0);
    }
  }, [voting.isVoting]);

  useEffect(() => {
    if (!flow.continuation) {
      setContinuationOverlayHeight(0);
    }
  }, [flow.continuation]);

  useEffect(() => {
    if (!voting.scores || Object.keys(voting.scores).length === 0) {
      setScoreOverlayHeight(0);
    }
  }, [voting.scores]);
  
  // Handle topic selection and debate start
  const handleStartDebate = useCallback(async (topic?: string) => {
    const topicToUse = topic || topicSelection.finalTopic;
    if (!topicToUse) {
      ErrorService.showWarning('Please select a valid motion', 'debate');
      return;
    }
    
    try {
      // Initialize debate session
      // Merge any explicit personalities from setup with defaults on selected AIs
      const explicit = Object.entries(initialPersonalities || {}).reduce((acc, [aiId, personaId]) => {
        acc[aiId] = personaId || 'default';
        return acc;
      }, {} as { [aiId: string]: string });
      const defaultsFromAIs = selectedAIs.reduce((acc, ai) => {
        if (!acc[ai.id]) acc[ai.id] = ai.personality || 'default';
        return acc;
      }, {} as { [aiId: string]: string });
      const effectivePersonalities = { ...defaultsFromAIs, ...explicit };

      // In Demo, prime playback queues for selected sample or persona
      if (isDemo) {
        if (selectedSampleRef.current) {
          primeDebate(selectedSampleRef.current);
        } else {
          const joined = Object.values((initialPersonalities || {})).join(' ').toLowerCase();
          const personaKey = joined.includes('george') ? 'George' : joined.includes('sage') ? 'Prof. Sage' : 'default';
          try {
            const sample = await DemoContentService.getDebateSampleForProviders(selectedAIs.map(a => a.provider), personaKey);
            if (sample) primeDebate(sample);
          } catch { /* ignore */ }
        }
      }

      // Build merged personalities map from context
      const mergedPersonalities: Record<string, NonNullable<ReturnType<typeof getMergedPersonality>>> = {};
      Object.values(effectivePersonalities).forEach((personalityId) => {
        if (personalityId && personalityId !== 'default' && !mergedPersonalities[personalityId]) {
          const merged = getMergedPersonality(personalityId);
          if (merged) {
            mergedPersonalities[personalityId] = merged;
          }
        }
      });

      await session.initializeSession(
        topicToUse,
        selectedAIs,
        effectivePersonalities,
        {
          formatId: formatId || 'oxford',
          rounds: (exchanges || rounds || 3),
          civility: (civility as 1|2|3|4|5) || 3,
          mergedPersonalities,
          voiceConfig,
        }
      );
      
      // Add initial host message
      messages.addHostMessage(
        (formatId || 'oxford') === 'oxford'
          ? 'Cast your opening audience stance before the first speech.'
          : `${selectedAIs[0].name} opens the debate.`
      );
      
      // Small delay to ensure Redux has updated
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Start the debate flow
      await flow.startDebate();
      
    } catch (error) {
      ErrorService.handleWithToast(error, { feature: 'debate' });
    }
  }, [
    topicSelection.finalTopic,
    initialPersonalities,
    selectedAIs,
    formatId,
    exchanges,
    rounds,
    civility,
    session,
    messages,
    flow,
    isDemo,
    getMergedPersonality,
    voiceConfig,
  ]);
  
  // Auto-start debate if topic is provided from DebateSetupScreen
  const canAutoStart = Boolean(initialTopic && debateRecoveryChecked && !session.isInitialized && selectedAIs.length >= 2 && session.orchestrator);
  const autoStartedRef = React.useRef(false);
  useEffect(() => {
    if (canAutoStart && !autoStartedRef.current) {
      autoStartedRef.current = true;
      handleStartDebate(initialTopic);
    }
  }, [canAutoStart, initialTopic, handleStartDebate]);

  useEffect(() => {
    setIsRecording(RecordController.isActive());
  }, []);

  const providersKey = React.useMemo(() => selectedAIs.map(a => a.provider).join('+'), [selectedAIs]);
  const personaKey = React.useMemo(() => {
    const joined = Object.values((initialPersonalities || {})).join(' ').toLowerCase();
    return joined.includes('george') ? 'George' : joined.includes('sage') ? 'Prof. Sage' : 'default';
  }, [initialPersonalities]);

  // Demo: fetch debate samples list based on selection + persona
  useEffect(() => {
    const run = async () => {
      if (!isDemo) { setDebateSamples([]); return; }
      const list = await DemoContentService.listDebateSamples(providersKey.split('+').filter(Boolean), personaKey);
      setDebateSamples(list);
    };
    run();
  }, [isDemo, providersKey, personaKey]);
  
  // Handle voting
  const handleVote = async (aiId: string) => {
    try {
      await voting.recordVote(aiId);
      
      // Debate completion will be handled by the UI components themselves
    } catch (error) {
      ErrorService.handleWithToast(error, { feature: 'debate' });
    }
  };

  const handleSubmitAudienceQuestions = useCallback((questions: OxfordAudienceQuestions) => {
    try {
      flow.submitAudienceQuestions(questions);
    } catch (error) {
      ErrorService.handleWithToast(error, { feature: 'debate' });
    }
  }, [flow]);
  
  // Handle Start Over with confirmation
  const stopDebateNow = useCallback(() => {
    // Cancel any active streaming and scheduled turns immediately
    try { getStreamingService().cancelAllStreams(); } catch { /* ignore cancel errors */ }
    try { session.resetSession(); } catch { /* ignore reset errors */ }
  }, [session]);

  const confirmDebateLeave = useRecoverableExitGuard({
    navigation,
    shouldGuard: Boolean(flow.isDebateActive && !flow.isDebateEnded),
    title: 'Leave this debate?',
    message: 'The debate will be paused and saved so you can retry or continue it later.',
    onSaveAndLeave: async () => {
      await saveActiveDebateSnapshot('interrupted', 'user_exit');
      try { getStreamingService().cancelAllStreams('cancelled'); } catch { /* ignore */ }
      try { session.resetSession(); } catch { /* ignore */ }
    },
  });

  const navigateToDebateSetup = useCallback(() => {
    navigation.navigate('MainTabs', {
      screen: 'DebateTab',
      params: {
        resetDebateSetup: true,
        resetKey: Date.now().toString(),
      },
    });
  }, [navigation]);

  const handleStartOver = () => {
    if (flow.isDebateActive && !flow.isDebateEnded) {
      confirmDebateLeave(navigateToDebateSetup);
      return;
    }

    Alert.alert(
      'Start Over?',
      'This will end the current debate and return to setup. Are you sure?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Start Over',
          style: 'destructive',
          onPress: async () => {
            await saveActiveDebateSnapshot('interrupted', 'start_over');
            stopDebateNow();
            // Navigate back to the Debate tab (DebateSetupScreen)
            navigateToDebateSetup();
          },
        },
      ]
    );
  };

  const handleVictoryStartOver = useCallback(() => {
    stopDebateNow();
    setShowTranscript(false);
    navigateToDebateSetup();
  }, [navigateToDebateSetup, stopDebateNow]);

  const handleRematch = useCallback(() => {
    const rematchTopic = session.session?.topic || topicSelection.finalTopic || initialTopic;
    if (!rematchTopic) {
      ErrorService.showWarning('No debate motion is available for a rematch.', 'debate');
      return;
    }

    stopDebateNow();
    setShowTranscript(false);

    const rematchParams = {
      ...route.params,
      selectedAIs,
      topic: rematchTopic,
      personalities: initialPersonalities,
      formatId: formatId || 'oxford',
      rounds,
      exchanges,
      civility,
      demoDebateId,
      demoSample,
      rematchKey: Date.now().toString(),
    };

    navigation.replace('Debate', rematchParams);
  }, [
    civility,
    demoDebateId,
    demoSample,
    exchanges,
    formatId,
    initialPersonalities,
    initialTopic,
    navigation,
    route.params,
    rounds,
    selectedAIs,
    session.session?.topic,
    stopDebateNow,
    topicSelection.finalTopic,
  ]);
  
  // Handle view transcript
  const handleViewTranscript = () => {
    if (messages.messages.length === 0) {
      ErrorService.showInfo('No messages to display in transcript.', 'debate');
      return;
    }
    setShowTranscript(true);
  };

  const handleReportDebateContent = useCallback((message: Message) => {
    setReportTarget(buildMessageReportTarget(
      message,
      'debate',
      session.session?.id
    ));
  }, [session.session?.id]);
  
  // Build display name with personality from setup
  const displayName = (ai: AI) => {
    const pid = initialPersonalities?.[ai.id];
    if (!pid) return ai.name;
    const p = getMergedPersonality(pid);
    if (!p || pid === 'default') return ai.name;
    return `${ai.name} (${p.name})`;
  };

  const getPersonaHeaderMeta = useCallback((ai: AI) => {
    const pid = initialPersonalities?.[ai.id] || ai.personality;
    if (!pid || pid === 'default') return undefined;
    const persona = getMergedPersonality(pid);
    if (!persona) return undefined;
    return {
      label: persona.name,
      icon: persona.emoji,
    };
  }, [getMergedPersonality, initialPersonalities]);

  const voteResults = voting.voteRecords.map((record) => {
    const winnerAI = selectedAIs.find((ai) => ai.id === record.winnerId);
    return {
      ...record,
      winnerName: winnerAI ? displayName(winnerAI) : record.winnerName,
    };
  });

  // Show loading state while waiting for orchestrator when topic is provided
  const isLoading = initialTopic && !session.orchestrator && !session.isInitialized;
  
  // Show topic picker only if no topic was provided and debate hasn't started
  const showTopicPicker = !initialTopic && (!session.isInitialized || (!flow.isDebateActive && !flow.isDebateEnded));
  
  const activeFormatId = session.session?.format?.id || formatId || 'oxford';
  const activePreset = session.session?.preset || getPresetForFormat(activeFormatId, getPresetIdForRounds(exchanges || rounds || 3));
  const activeFormatName = session.session?.format?.name || FORMATS[activeFormatId].name;
  const isAudienceStanceDebate = activePreset?.voteModel === 'audience_stance' || voting.voteKind === 'audience_stance' || Boolean(voting.audienceResult);

  // Check if we're showing victory screen
  const hasScores = !isAudienceStanceDebate && voting.scores && Object.keys(voting.scores).length > 0;
  const winningScoreEntry = voting.scores && Object.keys(voting.scores).length > 0
    ? Object.entries(voting.scores).reduce((prev, current) =>
      prev[1].roundWins > current[1].roundWins ? prev : current
    )
    : undefined;
  const winningScoreAI = winningScoreEntry
    ? selectedAIs.find(ai => ai.id === winningScoreEntry[0]) || selectedAIs[0]
    : undefined;
  const hasOverallWinner = hasScores && voting.isOverallVote && !voting.isVoting;
  const isShowingVictory = (isAudienceStanceDebate && flow.isDebateEnded && voting.audienceResult) || (flow.isDebateEnded && hasScores) || hasOverallWinner;
  
  // Determine what to show based on debate state
  const displayedTopic = session.session?.topic || topicSelection.finalTopic || initialTopic || 'Debate Motion';
  const handleGeneratePodcastFile = useCallback(async () => {
    if (!session.session?.id) {
      ErrorService.showWarning('Debate session is not ready for podcast generation.', 'debate');
      return;
    }

    if (voicePackSelectedIds.length === 0) {
      ErrorService.showWarning('Select at least one ready voice clip first.', 'debate');
      return;
    }

    setIsSavingVoicePack(true);
    try {
      const plan = buildDebatePodcastCompilePlan({
        sessionId: session.session.id,
        topic: displayedTopic,
        participants: selectedAIs,
        candidates: voicePackCandidates,
        selectedCandidateIds: voicePackSelectedIds,
      });
      const compiledAudio = await DebateAudioCompileService.compileDebateVoicePack(plan.manifest, {
        onStageChange: setVoicePackSaveStage,
      });
      const entry = createDebatePodcastGalleryEntry(plan, compiledAudio);

      await dispatch(addToMediaGalleryWithCleanup(entry)).unwrap();
      setVoicePackModalVisible(false);
      setVoicePackSelectedIds([]);
      ErrorService.showSuccess('Podcast file generated and saved to Gallery.', 'debate');
      setPendingGalleryFocusMediaId(entry.id);
    } catch (error) {
      ErrorService.handleWithToast(error, { feature: 'debate' });
    } finally {
      setVoicePackSaveStage(null);
      setIsSavingVoicePack(false);
    }
  }, [
    dispatch,
    displayedTopic,
    selectedAIs,
    session.session?.id,
    voicePackCandidates,
    voicePackSelectedIds,
  ]);
  const debateTeams = useMemo<DebateSessionHeaderTeam[]>(() => {
    const teamSize = activePreset?.teamSize || 1;
    const buildTeam = (side: 'aff' | 'neg', label: string): DebateSessionHeaderTeam => ({
      side,
      label,
      participants: selectedAIs
        .filter((_, index) => {
          if (teamSize <= 1) {
            return side === 'aff' ? index === 0 : index === 1;
          }
          return side === 'aff' ? index % 2 === 0 : index % 2 === 1;
        })
        .map((ai) => {
          const personaMeta = getPersonaHeaderMeta(ai);
          return {
            id: ai.id,
            name: ai.name,
            personaLabel: personaMeta?.label,
            personaIcon: personaMeta?.icon,
          };
        }),
    });

    return [
      buildTeam('aff', 'Affirmative'),
      buildTeam('neg', 'Negative'),
    ];
  }, [activePreset?.teamSize, getPersonaHeaderMeta, selectedAIs]);

  const genericHeaderSubtitle = selectedAIs.length >= 2
    ? `${selectedAIs[0].name} vs ${selectedAIs[1].name}`
    : undefined;

  const renderContent = () => {
    const bottomInset = votingOverlayHeight + scoreOverlayHeight + continuationOverlayHeight;

    if (isLoading) {
      return (
        <Animated.View 
          entering={FadeIn.duration(300)}
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
        >
          <ActivityIndicator 
            size="large" 
            color={theme.colors.primary[500]} 
            style={{ marginBottom: 24 }}
          />
          <Typography variant="title" align="center">Initializing Debate...</Typography>
          <Typography variant="body" color="secondary" align="center" style={{ marginTop: 8 }}>
            Setting up the arena for {selectedAIs[0] ? displayName(selectedAIs[0]) : ''} vs {selectedAIs[1] ? displayName(selectedAIs[1]) : ''}
          </Typography>
        </Animated.View>
      );
    }
    
    if (showTopicPicker) {
      return (
        <Animated.View
          entering={FadeIn.duration(400)}
          layout={Layout.springify()}
          style={{ flex: 1 }}
        >
          <KeyboardAvoider>
            <DemoBanner
              subtitle={canStartTrial
                ? 'Pre-recorded debates only in Demo. Start a free trial to create custom debates.'
                : 'Pre-recorded debates only in Demo. Upgrade to Premium to create custom debates.'}
              onPress={() => dispatch(showSheet({ sheet: 'subscription' }))}
            />
            {isDemo && debateSamples.length > 0 && (
              <DemoSamplesBar
                label="Demo Debate Samples"
                samples={debateSamples.map(s => ({ id: s.id, title: s.title }))}
                onSelect={async (id) => {
                  try {
                    const sample = await DemoContentService.findDebateById(id);
                    if (!sample) return;
                    selectedSampleRef.current = sample;
                    // Start with sample's topic
                    handleStartDebate(sample.topic);
                  } catch { /* ignore */ }
                }}
              />
            )}
            <TopicSelector
              {...topicSelection}
              onStartDebate={handleStartDebate}
            />
          </KeyboardAvoider>
        </Animated.View>
      );
    }
    
    // Show victory celebration if debate ended and we have scores, or if overall winner determined
    if (isShowingVictory) {
      if (isAudienceStanceDebate && voting.audienceResult) {
        return (
          <VictoryCelebration
            scores={voting.scores || {}}
            rounds={[]}
            audienceResult={voting.audienceResult}
            voteResults={voteResults}
            onViewTranscript={handleViewTranscript}
            onRematch={handleRematch}
            onStartOver={handleVictoryStartOver}
            onSaveVoicePack={shouldOfferPodcastGeneration ? handleOpenVoicePackModal : undefined}
            voicePackClipCount={voicePackCandidates.length}
            voicePackActionLabel="Podcast"
            topic={displayedTopic}
            participants={selectedAIs}
            messages={messages.messages}
          />
        );
      }

      // Determine winner from scores
      const winner = winningScoreEntry;
      const winnerAI = winningScoreAI || selectedAIs[0];
      
      return (
        <VictoryCelebration
          winner={winnerAI}
          scores={voting.scores || {}}
          rounds={[
            ...(voteResults.length > 0
              ? voteResults.map((record) => ({
                round: record.round,
                winner: record.winnerName || record.winnerId,
                topic: topicSelection.finalTopic || 'Debate Topic',
              }))
              : [
                { round: 1, winner: winner?.[1].name || winnerAI.name, topic: topicSelection.finalTopic || 'Debate Topic' },
                { round: 2, winner: winner?.[1].name || winnerAI.name, topic: topicSelection.finalTopic || 'Debate Topic' },
              ])
          ]}
          voteResults={voteResults}
          onViewTranscript={handleViewTranscript}
          onRematch={handleRematch}
          onStartOver={handleVictoryStartOver}
          onSaveVoicePack={shouldOfferPodcastGeneration ? handleOpenVoicePackModal : undefined}
          voicePackClipCount={voicePackCandidates.length}
          voicePackActionLabel="Podcast"
          topic={topicSelection.finalTopic}
          participants={selectedAIs}
          messages={messages.messages}
        />
      );
    }
    
    if (flow.isDebateActive || flow.isDebateEnded) {
      return (
        <Animated.View 
          entering={FadeIn.duration(400)}
          layout={Layout.springify()}
          style={{ flex: 1 }}
        >
          <DebateMessageList
            messages={messages.messages}
            typingAIs={messages.typingAIs}
            bottomInset={bottomInset}
            canRetryAudio={debateVoice.canRetryAudio}
            onRetryAudio={handleRetryDebateAudio}
            retryTurnMessageId={flow.continuation?.continueAction === 'retry_message' ? flow.continuation.retryMessageId : undefined}
            onRetryTurn={flow.continueDebate}
            onReportContent={handleReportDebateContent}
          />

          {flow.continuation && !(flow.continuation.continueAction === 'retry_message' && flow.continuation.retryMessageId) && !voting.isVoting && (
            <Animated.View
              entering={FadeIn.duration(250)}
              exiting={FadeOut.duration(180)}
              onLayout={({ nativeEvent }) => setContinuationOverlayHeight(nativeEvent.layout.height)}
              style={{
                backgroundColor: theme.colors.card,
                borderTopWidth: 1,
                borderColor: theme.colors.border,
                paddingHorizontal: 16,
                paddingTop: 10,
                paddingBottom: 12,
                shadowColor: theme.colors.shadowDark,
                shadowOpacity: 0.18,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: -6 },
                elevation: 8,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    marginRight: 8,
                    backgroundColor: flow.continuation.isFinalReview
                      ? theme.colors.warning[500]
                      : theme.colors.primary[500],
                  }}
                />
                <Typography
                  variant="caption"
                  color={flow.continuation.isFinalReview ? 'warning' : 'brand'}
                  weight="semibold"
                  style={{ textTransform: 'uppercase' }}
                >
                  {flow.continuation.isFinalReview ? 'Final review' : 'Review checkpoint'}
                </Typography>
              </View>
              <Typography variant="body" weight="bold" numberOfLines={1} style={{ marginBottom: 2 }}>
                {flow.continuation.title}
              </Typography>
              <Typography variant="caption" color="secondary" numberOfLines={2} style={{ marginBottom: 10 }}>
                {flow.continuation.message}
              </Typography>
              <Pressable
                testID="debate-continuation-button"
                onPress={flow.continueDebate}
                accessibilityRole="button"
                accessibilityLabel={flow.continuation.buttonLabel}
                accessibilityHint="Continues the debate after you finish reviewing the current speeches."
                style={({ pressed }) => ({
                  minHeight: 42,
                  borderRadius: 8,
                  backgroundColor: theme.colors.primary[500],
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  opacity: pressed ? 0.82 : 1,
                })}
              >
                <Typography variant="button" color="inverse" weight="semibold">
                  {flow.continuation.buttonLabel}
                </Typography>
                <Ionicons
                  name={flow.continuation.isFinalReview ? 'checkmark-circle' : 'arrow-forward'}
                  size={17}
                  color={theme.colors.text.inverse}
                  style={{ marginLeft: 8 }}
                />
              </Pressable>
            </Animated.View>
          )}
          
          {voting.isVoting && (
            <Animated.View 
              entering={FadeIn.duration(300)}
              exiting={FadeOut.duration(200)}
              onLayout={({ nativeEvent }) => setVotingOverlayHeight(nativeEvent.layout.height)}
            >
              <VotingInterface
                participants={selectedAIs.map(ai => ({ ...ai, name: displayName(ai) }))}
                isOverallVote={voting.isOverallVote}
                isFinalVote={voting.isFinalVote}
                votingRound={voting.votingRound}
                voteKind={voting.voteKind}
                audienceVoteStage={voting.audienceVoteStage}
                scores={voting.scores || undefined}
                votingPrompt={voting.getVotingPrompt()}
                voteCriterion={voting.getVoteCriterion()}
                onVote={handleVote}
              />
            </Animated.View>
          )}
          
          {/* Show scoreboard persistently after first round */}
          {!isAudienceStanceDebate && voting.scores && Object.keys(voting.scores).length > 0 && (
            <Animated.View 
              entering={FadeIn.delay(200).duration(300)}
              layout={Layout.springify()}
              onLayout={({ nativeEvent }) => setScoreOverlayHeight(nativeEvent.layout.height)}
            >
              <ScoreDisplay
                participants={selectedAIs.map(ai => ({ ...ai, name: displayName(ai) }))}
                scores={voting.scores}
              />
            </Animated.View>
          )}
        </Animated.View>
      );
    }
    
    return null;
  };
  
  // Handle error states
  useEffect(() => {
    if (session.error) {
      ErrorService.handleWithToast(new Error(session.error), { feature: 'debate' });
    }
  }, [session.error]);

  useEffect(() => {
    if (flow.error) {
      ErrorService.handleWithToast(new Error(flow.error), { feature: 'debate' });
    }
  }, [flow.error]);

  useEffect(() => {
    if (voting.error) {
      ErrorService.handleWithToast(new Error(voting.error), { feature: 'debate' });
    }
  }, [voting.error]);

  const timelineMessages = session.session?.preset?.messages || activePreset?.messages || [];
  const activeTimelineIndex = timelineMessages.length > 0
    ? Math.min(Math.max(flow.currentMessageIndex, 0), timelineMessages.length - 1)
    : 0;
  const activeTimelineMessage = timelineMessages[activeTimelineIndex];
  const debatePresetLabel = `${activeFormatName} · ${activePreset.shortLabel || activePreset.label}`;
  const showDebateSessionHeader = (flow.isDebateActive || flow.isDebateEnded) && !isShowingVictory;
  const showStandardHeader = !isShowingVictory;
  const displayedMotion = displayedTopic.replace(/^\s*Motion:\s*/i, '').trim() || displayedTopic;
  const headerTimelineMessages = isShowingVictory ? [] : timelineMessages;
  const headerCurrentMessageIndex = isShowingVictory && timelineMessages.length > 0
    ? timelineMessages.length - 1
    : flow.currentMessageIndex;
  const headerCurrentTurnLabel = isShowingVictory
    ? (voting.audienceResult ? 'Audience decision' : 'Debate complete')
    : flow.currentTurnLabel;
  const headerActiveSideLabel = isShowingVictory
    ? (
      voting.audienceResult
        ? `${voting.audienceResult.winningSideLabel} won`
        : winningScoreAI
          ? `${winningScoreAI.name} won`
          : 'Final result'
    )
    : activeTimelineMessage ? getDebateSpeakerRoleLabel(activeTimelineMessage) : undefined;
  const recordAction = recordModeEnabled ? {
    label: isRecording ? 'Stop' : 'Record',
    onPress: async () => {
      if (isRecording) {
        try {
          const res = RecordController.stop();
          if (res && res.session) {
            const sessionData = res.session;
            const json = JSON.stringify(sessionData, null, 2);
            console.warn('[DEMO_RECORDING_DEBATE]', json);
            try { await Clipboard.setStringAsync(json); } catch (e) { console.warn('clipboard failed', e); }
            try {
              const fileName = `${sessionData.id || 'debate'}_${Date.now()}.json`.replace(/[^a-zA-Z0-9_.-]/g, '_');
              const path = `${FileSystem.cacheDirectory}${fileName}`;
              await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });
              if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(path, { mimeType: 'application/json' });
              }
            } catch (e) { console.warn('share failed', e); }
            try {
              Alert.alert(
                'Recording captured',
                'Copied to clipboard, saved to a temp file, and printed to logs.',
                [
                  { text: 'OK' },
                  { text: 'Append to Pack (dev)', onPress: async () => {
                    try {
                      const resp = await AppendToPackService.append(sessionData);
                      if (!resp.ok) {
                        Alert.alert('Append failed', resp.error || 'Unknown error. Is dev packer server running on :8889?');
                      } else {
                        Alert.alert('Appended', 'Recording appended to pack.');
                      }
                    } catch (e) {
                      Alert.alert('Append error', (e as Error)?.message || String(e));
                    }
                  }},
                ]
              );
            } catch (e) { console.warn('append alert failed', e); }
          }
        } finally {
          setIsRecording(false);
        }
      } else {
        setPickerVisible(true);
      }
    },
    variant: isRecording ? 'danger' as const : 'primary' as const,
  } : undefined;
  
  return (
    <SafeAreaView style={{
      flex: 1,
      backgroundColor: theme.colors.background,
    }} edges={isShowingVictory ? ['top', 'left', 'right', 'bottom'] : ['left', 'right', 'bottom']}>
      {showDebateSessionHeader ? (
        <>
          <Header
            variant="gradient"
            slim
            title="The Arena"
            showBackButton={true}
            onBack={handleStartOver}
            animated={true}
            rightElement={<HeaderActions variant="gradient" helpTopicId="debate-arena" />}
            actionButton={recordAction}
            showDemoBadge={isDemo}
          />
          <DebateSessionHeader
            topic={displayedTopic}
            teams={debateTeams}
            presetLabel={debatePresetLabel}
            currentMessageIndex={headerCurrentMessageIndex}
            totalMessages={timelineMessages.length}
            currentTurnLabel={headerCurrentTurnLabel}
            activeSideLabel={headerActiveSideLabel}
            timelineMessages={headerTimelineMessages}
            onBack={handleStartOver}
            chrome="context"
          />
        </>
      ) : showStandardHeader ? (
        <>
          <Header
            variant="gradient"
            slim
            title="The Arena"
            showBackButton={true}
            onBack={handleStartOver}
            animated={true}
            rightElement={<HeaderActions variant="gradient" helpTopicId="debate-arena" />}
            actionButton={recordAction}
            showDemoBadge={isDemo}
          />
          <ContextBar
            title="In the Arena"
            subtitle={displayedMotion}
            rightElement={
              genericHeaderSubtitle ? (
                <Typography variant="caption" color="secondary" numberOfLines={1}>
                  {genericHeaderSubtitle}
                </Typography>
              ) : undefined
            }
            testID="debate-context-bar"
          />
        </>
      ) : null}
      
      {/* Topic moved into header */}

  {renderContent()}

  {/* Record picker for Debate */}
  {recordModeEnabled && (
    <DebateRecordPickerModal
      visible={pickerVisible}
      providersKey={providersKey}
      personaKey={personaKey}
      defaultTopic={topicSelection.finalTopic || initialTopic || ''}
      onClose={() => setPickerVisible(false)}
      onSelect={async (selection) => {
        setPickerVisible(false);
        try {
          const providers = selectedAIs.map(a => a.provider);
          const comboKey = `${providers.sort().join('+')}:${personaKey || 'default'}`;
          if (selection.type === 'new') {
            RecordController.startDebate({ id: selection.id, topic: selection.topic, comboKey, participants: selectedAIs.map(a => a.name) });
            setIsRecording(true);
            // Start the live debate with the chosen topic
            await handleStartDebate(selection.topic);
            return;
          }
          // Existing sample: use its topic but record live
          RecordController.startDebate({ id: `${selection.id}_rec_${Date.now()}`, topic: selection.topic, comboKey, participants: selectedAIs.map(a => a.name) });
          setIsRecording(true);
          await handleStartDebate(selection.topic);
        } catch (e) { console.warn('record picker selection failed', e); }
      }}
    />
  )}

      {/* No custom Exit modal */}

      <DebateVoicePackModal
        visible={voicePackModalVisible}
        candidates={voicePackCandidates}
        selectedIds={voicePackSelectedIds}
        isSaving={isSavingVoicePack}
        savingLabel={getPodcastGenerationLabel(voicePackSaveStage)}
        canRetryAudio={debateVoice.canRetryAudio}
        onToggleClip={handleToggleVoicePackClip}
        onSelectAllReady={handleSelectAllReadyVoicePackClips}
        onClearSelection={handleClearVoicePackSelection}
        onRetryClip={handleRetryVoicePackClip}
        onClose={handleCloseVoicePackModal}
        onSave={handleGeneratePodcastFile}
      />
      <AudienceQuestionsModal
        visible={Boolean(flow.audienceQuestionsPrompt)}
        title={flow.audienceQuestionsPrompt?.title}
        message={flow.audienceQuestionsPrompt?.message}
        affirmativeLabel={flow.audienceQuestionsPrompt?.affirmativeLabel}
        negativeLabel={flow.audienceQuestionsPrompt?.negativeLabel}
        onSubmit={handleSubmitAudienceQuestions}
      />
      <GeneratedContentReportModal
        visible={reportTarget !== null}
        target={reportTarget}
        onClose={() => setReportTarget(null)}
      />
      
      {/* Transcript Modal */}
      <TranscriptModal
        visible={showTranscript}
        onClose={() => setShowTranscript(false)}
        topic={topicSelection.finalTopic || 'AI Debate'}
        participants={selectedAIs.map(ai => ({ id: ai.id, name: displayName(ai) }))}
        messages={messages.messages}
        voteResults={voteResults}
        audienceResult={voting.audienceResult}
        winner={voting.scores && Object.keys(voting.scores).length > 0 ? (() => {
          const winner = Object.entries(voting.scores).reduce((prev, current) => 
            prev[1].roundWins > current[1].roundWins ? prev : current
          );
          const winnerAI = selectedAIs.find(ai => ai.id === winner[0]);
          return winnerAI ? { id: winnerAI.id, name: displayName(winnerAI) } : undefined;
        })() : undefined}
        scores={voting.scores || undefined}
      />
    </SafeAreaView>
  );
};

export default DebateScreen;
