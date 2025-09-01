/**
 * DebateScreen - Refactored Container Component
 * Clean implementation using extracted services, hooks, and components
 * Reduced from 1055 lines to ~200 lines following atomic design principles
 */

import React, { useEffect, useState } from 'react';
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
import { DebateTopic } from '../components/organisms/debate/DebateTopic';

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
    };
  };
}

const DebateScreen: React.FC<DebateScreenProps> = ({ navigation, route }) => {
  const { theme } = useTheme();
  const { selectedAIs, topic: initialTopic, personalities: initialPersonalities } = route.params;
  const [showTranscript, setShowTranscript] = useState(false);
  
  // Initialize all hooks
  const session = useDebateSession(selectedAIs);
  const topicSelection = useTopicSelection(initialTopic);
  const flow = useDebateFlow(session.orchestrator);
  const voting = useDebateVoting(session.orchestrator, selectedAIs);
  const messages = useDebateMessages(session.session?.startTime);
  
  // Handle topic selection and debate start
  const handleStartDebate = async (topic?: string) => {
    const topicToUse = topic || topicSelection.finalTopic;
    if (!topicToUse) {
      Alert.alert('Invalid Topic', 'Please select a valid topic');
      return;
    }
    
    try {
      // Initialize debate session
      await session.initializeSession(
        topicToUse,
        selectedAIs,
        initialPersonalities || {}
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
  };
  
  // Auto-start debate if topic is provided from DebateSetupScreen
  useEffect(() => {
    if (initialTopic && !session.isInitialized && selectedAIs.length >= 2 && session.orchestrator) {
      handleStartDebate(initialTopic);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTopic, session.isInitialized, session.orchestrator]);
  
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
  const handleStartOver = () => {
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
          onPress: () => {
            // Reset session if needed
            session.resetSession();
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
      <Header
        variant="gradient"
        title="Debate Arena"
        subtitle={selectedAIs.length >= 2 ? `${displayName(selectedAIs[0])} vs ${displayName(selectedAIs[1])}` : 'Choose Your Combatants'}
        showTime={true}
        showDate={true}
        animated={true}
        rightElement={<HeaderActions variant="gradient" />}
        actionButton={
          (flow.isDebateActive || flow.isDebateEnded)
            ? { label: 'Start Over', onPress: handleStartOver, variant: 'danger' }
            : undefined
        }
      />
      
      {/* Show the topic persistently when debate is active or ended */}
      {(flow.isDebateActive || flow.isDebateEnded) && topicSelection.finalTopic && !isShowingVictory && (
        <DebateTopic 
          topic={topicSelection.finalTopic}
          roundInfo={{ current: flow.currentRound, total: flow.maxRounds }}
        />
      )}
      
      {renderContent()}
      
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
