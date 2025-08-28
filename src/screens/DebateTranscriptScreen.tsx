import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TranscriptModal } from '../components/organisms/debate/TranscriptModal';
import { ChatSession } from '../types';
import { useTheme } from '../theme';

interface DebateTranscriptScreenProps {
  navigation: {
    goBack: () => void;
  };
  route: {
    params: {
      session: ChatSession;
    };
  };
}

const DebateTranscriptScreen: React.FC<DebateTranscriptScreenProps> = ({ navigation, route }) => {
  const { theme } = useTheme();
  const { session } = route.params;
  
  // Use stored topic first, fall back to extraction for older sessions
  let topic = session.topic || 'Unknown Topic';
  
  if (!session.topic) {
    // For older sessions without stored topic, extract from host message
    const topicMessage = session.messages.find(m => m.sender === 'Debate Host');
    if (topicMessage) {
      const topicMatch = topicMessage.content.match(/^"([^"]+)"/);
      topic = topicMatch ? topicMatch[1] : 'Unknown Topic';
    }
    console.warn('No topic field in session, extracted:', topic);
  }
  
  // Extract winner and scores from the final host message
  let winner: { id: string; name: string } | undefined;
  const scores: Record<string, { name: string; roundWins: number }> = {};
  
  const winnerMessage = session.messages.find(m => 
    m.sender === 'Debate Host' && m.content.includes('OVERALL WINNER')
  );
  
  if (winnerMessage) {
    const winnerMatch = winnerMessage.content.match(/OVERALL WINNER: (.+?)!/);
    const tieMatch = winnerMessage.content.includes('DEBATE ENDED IN A TIE');
    
    if (!tieMatch && winnerMatch) {
      const winnerName = winnerMatch[1];
      const winnerAI = session.selectedAIs.find(ai => ai.name === winnerName);
      if (winnerAI) {
        winner = { id: winnerAI.id, name: winnerAI.name };
      }
    }
    
    // Extract scores - count round wins per AI
    session.selectedAIs.forEach(ai => {
      const roundWins = (winnerMessage.content.match(new RegExp(`${ai.name}.*?(\\d+)\\s+round`, 'i')) || [])[1];
      scores[ai.id] = {
        name: ai.name,
        roundWins: parseInt(roundWins || '0', 10)
      };
    });
  }
  
  // If scores are empty, create default scores
  if (Object.keys(scores).length === 0) {
    session.selectedAIs.forEach(ai => {
      scores[ai.id] = {
        name: ai.name,
        roundWins: 0
      };
    });
  }
  
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <TranscriptModal
        visible={true}
        onClose={() => navigation.goBack()}
        topic={topic}
        participants={session.selectedAIs.map(ai => ({ id: ai.id, name: ai.name }))}
        messages={session.messages}
        winner={winner}
        scores={scores}
      />
    </SafeAreaView>
  );
};

export default DebateTranscriptScreen;