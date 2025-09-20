/**
 * DebateScreen - Refactored Container Component
 * Clean implementation using extracted services, hooks, and components
 * Reduced from 1055 lines to ~200 lines following atomic design principles
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
import { Typography } from '../components/molecules';
import { useTheme } from '../theme';
import { AI } from '../types';
import { getPersonality } from '../config/personalities';
import {
  useDebateSession,
  useDebateFlow,
  useDebateVoting,
  useTopicSelection,
  useDebateMessages,
} from '../hooks/debate';
import {
  Header,
  HeaderActions,
  TopicSelector,
  DebateMessageList,
  VotingInterface,
  ScoreDisplay,
} from '../components/organisms';
import { VictoryCelebration } from '../components/organisms/debate/VictoryCelebration';
import { TranscriptModal } from '../components/organisms/debate/TranscriptModal';
import { DemoBanner } from '@/components/molecules/subscription/DemoBanner';
import { getStreamingService } from '../services/streaming/StreamingService';
import useFeatureAccess from '@/hooks/useFeatureAccess';
import { DemoContentService } from '@/services/demo/DemoContentService';
import { primeDebate } from '@/services/demo/DemoPlaybackRouter';
import { DemoSamplesBar } from '@/components/organisms/demo/DemoSamplesBar';
import type { DemoDebate } from '@/types/demo';
import { useDispatch } from 'react-redux';
import { showSheet } from '@/store';
import { RecordController } from '@/services/demo/RecordController';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AppendToPackService from '@/services/demo/AppendToPackService';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';
import { DebateRecordPickerModal } from '@/components/organisms/demo/DebateRecordPickerModal';
// Topic block is now rendered inside header
// Controls modal removed – using Start Over action directly

interface DebateScreenProps {
  navigation: {
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
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
    };
  };
}

const DebateScreen: React.FC<DebateScreenProps> = ({ navigation, route }) => {
  const { theme } = useTheme();
  const dispatch = useDispatch();
  const { selectedAIs, topic: initialTopic, personalities: initialPersonalities, formatId, rounds, exchanges, civility, demoDebateId, demoSample } = route.params;
  const [showTranscript, setShowTranscript] = useState(false);
  const [debateSamples, setDebateSamples] = useState<Array<{ id: string; title: string; topic: string }>>([]);
  const [isRecording, setIsRecording] = useState(false);
  const recordModeEnabled = useSelector((state: RootState) => state.settings.recordModeEnabled ?? false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const selectedSampleRef = React.useRef<DemoDebate | null>(null);
  // No custom controls modal
  
  // Initialize all hooks
  const session = useDebateSession(selectedAIs);
  const topicSelection = useTopicSelection(initialTopic);
  const flow = useDebateFlow(session.orchestrator);
  const voting = useDebateVoting(session.orchestrator, selectedAIs);
  const messages = useDebateMessages(session.session?.startTime);
  const { isDemo } = useFeatureAccess();

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
  
  // Handle topic selection and debate start
  const handleStartDebate = useCallback(async (topic?: string) => {
    const topicToUse = topic || topicSelection.finalTopic;
    if (!topicToUse) {
      Alert.alert('Invalid Motion', 'Please select a valid motion');
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

      await session.initializeSession(
        topicToUse,
        selectedAIs,
        effectivePersonalities,
        { formatId: formatId || 'oxford', rounds: (exchanges || rounds || 3), civility: (civility as 1|2|3|4|5) || 1 }
      );
      
      // Add initial host message
      messages.addHostMessage(
        `${selectedAIs[0].name} opens the debate.`
      );
      
      // Small delay to ensure Redux has updated
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Start the debate flow
      await flow.startDebate();
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start debate';
      Alert.alert('Error', errorMessage);
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
    isDemo
  ]);
  
  // Auto-start debate if topic is provided from DebateSetupScreen
  const canAutoStart = Boolean(initialTopic && !session.isInitialized && selectedAIs.length >= 2 && session.orchestrator);
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
      const errorMessage = error instanceof Error ? error.message : 'Failed to record vote';
      Alert.alert('Error', errorMessage);
    }
  };
  
  // Handle Start Over with confirmation
  const stopDebateNow = () => {
    // Cancel any active streaming and scheduled turns immediately
    try { getStreamingService().cancelAllStreams(); } catch { /* ignore cancel errors */ }
    try { session.resetSession(); } catch { /* ignore reset errors */ }
  };

  const handleStartOver = () => {
    // Stop all activity immediately upon pressing Go Back/Start Over
    stopDebateNow();
    Alert.alert(
      'Start Over?',
      'This will end the current debate and return to setup. Are you sure?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          // No-op; debate remains stopped per requirement
        },
        {
          text: 'Start Over',
          style: 'destructive',
          onPress: () => {
            // Navigate back to the Debate tab (DebateSetupScreen)
            navigation.navigate('MainTabs', { screen: 'DebateTab' });
          },
        },
      ]
    );
  };
  
  // Handle view transcript
  const handleViewTranscript = () => {
    if (messages.messages.length === 0) {
      Alert.alert('No Transcript', 'No messages to display in transcript.');
      return;
    }
    setShowTranscript(true);
  };
  
  // Build display name with personality from setup
  const displayName = (ai: AI) => {
    const pid = initialPersonalities?.[ai.id];
    if (!pid) return ai.name;
    const p = getPersonality(pid);
    if (!p || pid === 'default') return ai.name;
    return `${ai.name} (${p.name})`;
  };

  // Show loading state while waiting for orchestrator when topic is provided
  const isLoading = initialTopic && !session.orchestrator && !session.isInitialized;
  
  // Show topic picker only if no topic was provided and debate hasn't started
  const showTopicPicker = !initialTopic && (!session.isInitialized || (!flow.isDebateActive && !flow.isDebateEnded));
  
  // Check if we're showing victory screen
  const hasScores = voting.scores && Object.keys(voting.scores).length > 0;
  const hasOverallWinner = hasScores && voting.isOverallVote && !voting.isVoting;
  const isShowingVictory = (flow.isDebateEnded && hasScores) || hasOverallWinner;
  
  // Determine what to show based on debate state
  const renderContent = () => {
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
          <DemoBanner
            subtitle="Pre‑recorded debates only in Demo. Start a free trial to create custom debates."
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
        </Animated.View>
      );
    }
    
    // Show victory celebration if debate ended and we have scores, or if overall winner determined
    if (isShowingVictory) {
      // Determine winner from scores
      const winner = Object.entries(voting.scores || {}).reduce((prev, current) => 
        prev[1].roundWins > current[1].roundWins ? prev : current
      );
      const winnerAI = selectedAIs.find(ai => ai.id === winner[0]) || selectedAIs[0];
      
      return (
        <Animated.View 
          entering={FadeIn.duration(500)}
          style={{ flex: 1 }}
        >
          <VictoryCelebration
            winner={winnerAI}
            scores={voting.scores || {}}
            rounds={[
              { round: 1, winner: winner[1].name, topic: topicSelection.finalTopic || 'Debate Topic' },
              { round: 2, winner: winner[1].name, topic: topicSelection.finalTopic || 'Debate Topic' }
            ]}
            onViewTranscript={handleViewTranscript}
            topic={topicSelection.finalTopic}
            participants={selectedAIs}
            messages={messages.messages}
          />
        </Animated.View>
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
          />
          
          {voting.isVoting && (
            <Animated.View 
              entering={FadeIn.duration(300)}
              exiting={FadeOut.duration(200)}
            >
              <VotingInterface
                participants={selectedAIs.map(ai => ({ ...ai, name: displayName(ai) }))}
                isOverallVote={voting.isOverallVote}
                isFinalVote={voting.isFinalVote}
                votingRound={voting.votingRound}
                scores={voting.scores || undefined}
                votingPrompt={voting.getVotingPrompt()}
                onVote={handleVote}
              />
            </Animated.View>
          )}
          
          {/* Show scoreboard persistently after first round */}
          {voting.scores && Object.keys(voting.scores).length > 0 && (
            <Animated.View 
              entering={FadeIn.delay(200).duration(300)}
              layout={Layout.springify()}
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
      Alert.alert('Session Error', session.error);
    }
  }, [session.error]);
  
  useEffect(() => {
    if (flow.error) {
      Alert.alert('Debate Error', flow.error);
    }
  }, [flow.error]);
  
  useEffect(() => {
    if (voting.error) {
      Alert.alert('Voting Error', voting.error);
    }
  }, [voting.error]);
  
  return (
    <SafeAreaView style={{
      flex: 1,
      backgroundColor: theme.colors.background,
    }}>
      {(() => {
        const displayedTopic = session.session?.topic || topicSelection.finalTopic || initialTopic || 'Debate Motion';
        const vsLine = selectedAIs.length >= 2 ? `${displayName(selectedAIs[0])} vs ${displayName(selectedAIs[1])}` : '';
        const subtitle = [vsLine].filter(Boolean).join('\n');
      return (
        <Header
          variant="gradient"
          title={`Motion: ${displayedTopic}`}
          subtitle={subtitle}
          showBackButton={true}
          onBack={handleStartOver}
          showTime={false}
          showDate={false}
          animated={true}
          rightElement={<HeaderActions variant="gradient" />}
          actionButton={recordModeEnabled ? {
            label: isRecording ? 'Stop' : 'Record',
            onPress: async () => {
              if (isRecording) {
                try {
                  const res = RecordController.stop();
                  if (res && res.session) {
                    const sessionData = res.session as { id?: string };
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
            variant: isRecording ? 'danger' : 'primary',
          } : undefined}
          showDemoBadge={isDemo}
          height={110}
        />
      );
      })()}
      
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
      
      {/* Transcript Modal */}
      <TranscriptModal
        visible={showTranscript}
        onClose={() => setShowTranscript(false)}
        topic={topicSelection.finalTopic || 'AI Debate'}
        participants={selectedAIs.map(ai => ({ id: ai.id, name: displayName(ai) }))}
        messages={messages.messages}
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
