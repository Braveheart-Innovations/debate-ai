import React, { useState, useCallback, useRef } from 'react';
import { StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { RootState } from '../store';

import { 
  Header, 
  CompareSplitView, 
  CompareUserMessage 
} from '../components/organisms';
import { ChatInputBar } from '../components/organisms/chat';
import { Box } from '../components/atoms';
import { Button } from '../components/molecules';

import { useTheme } from '../theme';
import { useAIService } from '../providers/AIServiceProvider';
import { AIConfig, Message } from '../types';

interface CompareScreenProps {
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    goBack: () => void;
  };
  route: {
    params: {
      leftAI: AIConfig;
      rightAI: AIConfig;
    };
  };
}

type ViewMode = 'split' | 'left-full' | 'right-full' | 'left-only' | 'right-only';

const CompareScreen: React.FC<CompareScreenProps> = ({ navigation, route }) => {
  const { theme } = useTheme();
  const { aiService, isInitialized } = useAIService();
  const { leftAI, rightAI } = route.params;
  
  // Get models from Redux
  const selectedModels = useSelector((state: RootState) => state.chat.selectedModels);
  
  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [continuedSide, setContinuedSide] = useState<'left' | 'right' | null>(null);
  
  // State for messages
  const [userMessages, setUserMessages] = useState<Message[]>([]);
  const [leftMessages, setLeftMessages] = useState<Message[]>([]);
  const [rightMessages, setRightMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  
  // Streaming and typing states
  const [leftTyping, setLeftTyping] = useState(false);
  const [rightTyping, setRightTyping] = useState(false);
  const [leftStreamingContent, setLeftStreamingContent] = useState('');
  const [rightStreamingContent, setRightStreamingContent] = useState('');
  
  // Track conversation history separately for each AI
  const leftHistoryRef = useRef<Message[]>([]);
  const rightHistoryRef = useRef<Message[]>([]);
  
  const handleSend = useCallback(async () => {
    if (!inputText.trim() || !aiService || !isInitialized) return;
    
    const messageText = inputText.trim();
    setInputText('');
    
    // Create user message
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      sender: 'You',
      senderType: 'user',
      content: messageText,
      timestamp: Date.now(),
    };
    
    // Add to user messages display
    setUserMessages(prev => [...prev, userMessage]);
    
    // Add to both histories
    leftHistoryRef.current.push(userMessage);
    rightHistoryRef.current.push(userMessage);
    
    // Start typing indicators based on mode
    if (viewMode === 'split' && !continuedSide) {
      setLeftTyping(true);
      setRightTyping(true);
    } else if (continuedSide === 'left' || viewMode === 'left-only') {
      setLeftTyping(true);
    } else if (continuedSide === 'right' || viewMode === 'right-only') {
      setRightTyping(true);
    }
    
    // Send to left AI if active
    if ((viewMode === 'split' && !continuedSide) || continuedSide === 'left' || viewMode === 'left-only' || viewMode === 'left-full') {
      aiService.sendMessage(
      leftAI.id,
      messageText,
      leftHistoryRef.current,
      false,
      undefined,
      undefined,
      selectedModels[leftAI.id] || leftAI.model
    ).then(response => {
      const leftMessage: Message = {
        id: `msg_left_${Date.now()}`,
        sender: leftAI.name,
        senderType: 'ai',
        content: typeof response === 'string' ? response : response.response,
        timestamp: Date.now(),
        metadata: {
          modelUsed: selectedModels[leftAI.id] || leftAI.model,
        },
      };
      setLeftMessages(prev => [...prev, leftMessage]);
      leftHistoryRef.current.push(leftMessage);
      setLeftTyping(false);
      setLeftStreamingContent('');
    }).catch(error => {
      console.error('Left AI error:', error);
      setLeftTyping(false);
      Alert.alert('Error', `Failed to get response from ${leftAI.name}`);
    });
    }
    
    // Send to right AI if active
    if ((viewMode === 'split' && !continuedSide) || continuedSide === 'right' || viewMode === 'right-only' || viewMode === 'right-full') {
      aiService.sendMessage(
      rightAI.id,
      messageText,
      rightHistoryRef.current,
      false,
      undefined,
      undefined,
      selectedModels[rightAI.id] || rightAI.model
    ).then(response => {
      const rightMessage: Message = {
        id: `msg_right_${Date.now()}`,
        sender: rightAI.name,
        senderType: 'ai',
        content: typeof response === 'string' ? response : response.response,
        timestamp: Date.now(),
        metadata: {
          modelUsed: selectedModels[rightAI.id] || rightAI.model,
        },
      };
      setRightMessages(prev => [...prev, rightMessage]);
      rightHistoryRef.current.push(rightMessage);
      setRightTyping(false);
      setRightStreamingContent('');
    }).catch(error => {
      console.error('Right AI error:', error);
      setRightTyping(false);
      Alert.alert('Error', `Failed to get response from ${rightAI.name}`);
    });
    }
    
  }, [inputText, aiService, isInitialized, leftAI, rightAI, selectedModels, viewMode, continuedSide]);
  
  const handleContinueWithLeft = useCallback(() => {
    Alert.alert(
      'Continue with ' + leftAI.name,
      'This will end the comparison and continue chatting with only ' + leftAI.name + '. The other conversation will be disabled. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Continue', 
          onPress: () => {
            setViewMode('left-only');
            setContinuedSide('left');
          }
        }
      ]
    );
  }, [leftAI]);
  
  const handleContinueWithRight = useCallback(() => {
    Alert.alert(
      'Continue with ' + rightAI.name,
      'This will end the comparison and continue chatting with only ' + rightAI.name + '. The other conversation will be disabled. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Continue', 
          onPress: () => {
            setViewMode('right-only');
            setContinuedSide('right');
          }
        }
      ]
    );
  }, [rightAI]);
  
  const handleExpandLeft = useCallback(() => {
    setViewMode(viewMode === 'left-full' ? 'split' : 'left-full');
  }, [viewMode]);
  
  const handleExpandRight = useCallback(() => {
    setViewMode(viewMode === 'right-full' ? 'split' : 'right-full');
  }, [viewMode]);
  
  const handleStartOver = () => {
    Alert.alert(
      'Start Over',
      'This will end the current comparison. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start Over', onPress: () => navigation.goBack() }
      ]
    );
  };
  
  const isProcessing = leftTyping || rightTyping;
  
  return (
    <KeyboardAvoidingView 
      style={styles.keyboardContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <SafeAreaView 
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['top', 'left', 'right']}
      >
        <Header
          variant="gradient"
          title="Comparing"
          subtitle={`${leftAI.name} vs ${rightAI.name}`}
          showTime={false}
          showDate={true}
          animated={true}
          rightElement={
            <Button
              title="Start Over"
              onPress={handleStartOver}
              variant="ghost"
              size="small"
            />
          }
        />
        
        <ScrollView 
          style={styles.mainContent}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* User Messages */}
          {userMessages.map((message, index) => (
            <React.Fragment key={message.id}>
              <CompareUserMessage message={message} />
              
              {/* Show split view after each user message */}
              {index < userMessages.length && (
                <CompareSplitView
                  leftAI={leftAI}
                  rightAI={rightAI}
                  leftMessages={leftMessages.filter((_, i) => i === index)}
                  rightMessages={rightMessages.filter((_, i) => i === index)}
                  leftTyping={index === userMessages.length - 1 && leftTyping}
                  rightTyping={index === userMessages.length - 1 && rightTyping}
                  leftStreamingContent={index === userMessages.length - 1 ? leftStreamingContent : undefined}
                  rightStreamingContent={index === userMessages.length - 1 ? rightStreamingContent : undefined}
                  onContinueWithLeft={handleContinueWithLeft}
                  onContinueWithRight={handleContinueWithRight}
                  viewMode={viewMode}
                  continuedSide={continuedSide}
                  onExpandLeft={handleExpandLeft}
                  onExpandRight={handleExpandRight}
                />
              )}
            </React.Fragment>
          ))}
        </ScrollView>
        
        {/* Input Bar */}
        <Box style={styles.inputContainer}>
          <ChatInputBar
            inputText={inputText}
            onInputChange={setInputText}
            onSend={handleSend}
            placeholder={
              continuedSide === 'left' ? `Ask ${leftAI.name}...` :
              continuedSide === 'right' ? `Ask ${rightAI.name}...` :
              "Ask both AIs..."
            }
            disabled={isProcessing}
          />
        </Box>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  mainContent: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 16,
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
});

export default CompareScreen;