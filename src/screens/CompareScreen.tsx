import React, { useState, useCallback, useRef } from 'react';
import { StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { RootState } from '../store';

import { 
  Header,
  HeaderActions, 
  CompareSplitView, 
  CompareUserMessage 
} from '../components/organisms';
import { ChatInputBar } from '../components/organisms/chat';
import { useMergedModalityAvailability } from '../hooks/multimodal/useModalityAvailability';

import { useTheme } from '../theme';
import { useAIService } from '../providers/AIServiceProvider';
import { AIConfig, Message, ChatSession } from '../types';
import { StorageService } from '../services/chat/StorageService';
import { getExpertOverrides } from '../utils/expertMode';
import useFeatureAccess from '@/hooks/useFeatureAccess';
import { showTrialCTA } from '@/utils/demoGating';
import { DemoBanner } from '@/components/molecules/subscription/DemoBanner';

interface CompareScreenProps {
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    goBack: () => void;
  };
  route: {
    params: {
      leftAI?: AIConfig;
      rightAI?: AIConfig;
      sessionId?: string;
      resuming?: boolean;
    };
  };
}

type ViewMode = 'split' | 'left-full' | 'right-full' | 'left-only' | 'right-only';

const CompareScreen: React.FC<CompareScreenProps> = ({ navigation, route }) => {
  const { theme } = useTheme();
  const { aiService, isInitialized } = useAIService();
  const { isDemo } = useFeatureAccess();
  
  // Get models and user status from Redux
  const selectedModels = useSelector((state: RootState) => state.chat.selectedModels);
  const expertModeConfigs = useSelector((state: RootState) => state.settings.expertMode || {});
  const currentUser = useSelector((state: RootState) => state.user.currentUser);
  
  // Check if we're resuming a session
  const currentSession = useSelector((state: RootState) => 
    route.params?.resuming ? state.chat.currentSession : null
  );
  
  // Use AIs from resumed session or from params
  const leftAI = currentSession?.selectedAIs[0] || route.params?.leftAI;
  const rightAI = currentSession?.selectedAIs[1] || route.params?.rightAI;
  
  // Check if resumed session had diverged
  const resumedSessionData = currentSession as ChatSession & { hasDiverged?: boolean; continuedWithAI?: string };
  const hadDiverged = resumedSessionData?.hasDiverged || false;
  const continuedWithAIName = resumedSessionData?.continuedWithAI;
  
  // View mode state - initialize based on resumed session state
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (hadDiverged && continuedWithAIName && leftAI) {
      return continuedWithAIName === leftAI.name ? 'left-only' : 'right-only';
    }
    return 'split';
  });
  
  const [continuedSide, setContinuedSide] = useState<'left' | 'right' | null>(() => {
    if (hadDiverged && continuedWithAIName && leftAI) {
      return continuedWithAIName === leftAI.name ? 'left' : 'right';
    }
    return null;
  });
  
  // State for messages - initialize from resumed session if available
  const [userMessages, setUserMessages] = useState<Message[]>(() => {
    if (currentSession && route.params?.resuming) {
      return currentSession.messages.filter(m => m.sender === 'You');
    }
    return [];
  });
  
  const [leftMessages, setLeftMessages] = useState<Message[]>(() => {
    if (currentSession && route.params?.resuming && leftAI) {
      return currentSession.messages.filter(m => m.sender === leftAI.name);
    }
    return [];
  });
  
  const [rightMessages, setRightMessages] = useState<Message[]>(() => {
    if (currentSession && route.params?.resuming && rightAI) {
      return currentSession.messages.filter(m => m.sender === rightAI.name);
    }
    return [];
  });
  const [inputText, setInputText] = useState('');
  
  // Streaming and typing states
  const [leftTyping, setLeftTyping] = useState(false);
  const [rightTyping, setRightTyping] = useState(false);
  const [leftStreamingContent, setLeftStreamingContent] = useState('');
  const [rightStreamingContent, setRightStreamingContent] = useState('');
  
  // Track conversation history separately for each AI
  const leftHistoryRef = useRef<Message[]>(currentSession && route.params?.resuming && leftAI
    ? currentSession.messages.filter(m => m.sender === 'You' || m.sender === leftAI.name)
    : []);
  const rightHistoryRef = useRef<Message[]>(currentSession && route.params?.resuming && rightAI
    ? currentSession.messages.filter(m => m.sender === 'You' || m.sender === rightAI.name)
    : []);
  
  // Save comparison session to history
  // Use a stable session ID - either from resumed session or create new one
  const sessionId = useRef(currentSession?.id || `compare_${Date.now()}`).current;
  const [hasBeenSaved, setHasBeenSaved] = useState(route.params?.resuming || false);
  
  const saveComparisonSession = useCallback(async () => {
    if (userMessages.length === 0) return; // Don't save empty sessions
    
    try {
      const isPremium = currentUser?.subscription === 'pro' || currentUser?.subscription === 'business';
      
      // Check if this session already exists
      const existingSession = await StorageService.loadSession(sessionId);
      
      // Only enforce storage limits for truly NEW sessions (not updates)
      if (!existingSession && !hasBeenSaved) {
        await StorageService.enforceStorageLimits('comparison', isPremium, true);
      }
      
      // Combine all messages for storage
      const allMessages: Message[] = [];
      userMessages.forEach((userMsg, index) => {
        allMessages.push(userMsg);
        if (leftMessages[index]) {
          allMessages.push(leftMessages[index]);
        }
        if (rightMessages[index]) {
          allMessages.push(rightMessages[index]);
        }
      });
      
      // Create comparison session with divergence metadata if applicable
      const comparisonSession: ChatSession & { hasDiverged?: boolean; continuedWithAI?: string } = {
        id: sessionId,
        sessionType: 'comparison',
        selectedAIs: [leftAI!, rightAI!], // We know they exist here as this is only called when messages exist
        messages: allMessages,
        isActive: false,
        createdAt: Date.now(),
        lastMessageAt: Date.now(),
        ...(continuedSide && {
          hasDiverged: true,
          continuedWithAI: continuedSide === 'left' ? leftAI!.name : rightAI!.name
        })
      };
      
      // Save to storage
      await StorageService.saveSession(comparisonSession);
    } catch (error) {
      console.error('Failed to save comparison to history:', error);
    }
  }, [userMessages, leftMessages, rightMessages, leftAI, rightAI, currentUser, continuedSide, sessionId, hasBeenSaved]);
  
  const handleSend = useCallback(async () => {
    if (isDemo) {
      showTrialCTA(navigation.navigate, { message: 'Live comparisons require a Free Trial.' });
      return;
    }
    if (!inputText.trim() || !aiService || !isInitialized || !leftAI || !rightAI) return;
    
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
    
    // Compute effective models and expert params at send time
    const leftEffModel = selectedModels[leftAI.id] || leftAI.model;
    const rightEffModel = selectedModels[rightAI.id] || rightAI.model;
    const leftExp = getExpertOverrides(expertModeConfigs as Record<string, unknown>, leftAI.provider);
    const rightExp = getExpertOverrides(expertModeConfigs as Record<string, unknown>, rightAI.provider);

    // Apply personalities (unless default) before sending
    try {
      if (leftAI?.personality && leftAI.personality !== 'default') {
        const { getPersonality } = await import('../config/personalities');
        const p = getPersonality(leftAI.personality);
        if (p) aiService.setPersonality(leftAI.id, p);
      }
      if (rightAI?.personality && rightAI.personality !== 'default') {
        const { getPersonality } = await import('../config/personalities');
        const p = getPersonality(rightAI.personality);
        if (p) aiService.setPersonality(rightAI.id, p);
      }
    } catch { /* ignore */ }

    // Send to left AI if active
    if ((viewMode === 'split' && !continuedSide) || continuedSide === 'left' || viewMode === 'left-only' || viewMode === 'left-full') {
      // Apply expert parameters to adapter if enabled
      try {
        const adapter = aiService.getAdapter(leftAI.id);
        const leftParams = leftExp && leftExp.parameters;
        if (adapter && leftExp.enabled && leftParams) {
          adapter.config.parameters = leftParams as never;
        }
      } catch { /* ignore */ }
      aiService.sendMessage(
      leftAI.id,
      messageText,
      leftHistoryRef.current,
      false,
      undefined,
      undefined,
      leftEffModel
    ).then(response => {
      const leftMessage: Message = {
        id: `msg_left_${Date.now()}`,
        sender: leftAI.name,
        senderType: 'ai',
        content: typeof response === 'string' ? response : response.response,
        timestamp: Date.now(),
        metadata: {
          modelUsed: leftEffModel,
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
      // Apply expert parameters to adapter if enabled
      try {
        const adapter = aiService.getAdapter(rightAI.id);
        const rightParams = rightExp && rightExp.parameters;
        if (adapter && rightExp.enabled && rightParams) {
          adapter.config.parameters = rightParams as never;
        }
      } catch { /* ignore */ }
      aiService.sendMessage(
      rightAI.id,
      messageText,
      rightHistoryRef.current,
      false,
      undefined,
      undefined,
      rightEffModel
    ).then(response => {
      const rightMessage: Message = {
        id: `msg_right_${Date.now()}`,
        sender: rightAI.name,
        senderType: 'ai',
        content: typeof response === 'string' ? response : response.response,
        timestamp: Date.now(),
        metadata: {
          modelUsed: rightEffModel,
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
    
    // Save session after sending messages
    if (!hasBeenSaved) {
      setHasBeenSaved(true);
    }
    // Auto-save the session after new messages
    setTimeout(() => {
      saveComparisonSession();
    }, 1000);
    
  }, [inputText, aiService, isInitialized, leftAI, rightAI, viewMode, continuedSide, hasBeenSaved, saveComparisonSession, expertModeConfigs, selectedModels, isDemo, navigation.navigate]);
  
  const handleContinueWithLeft = useCallback(() => {
    if (!leftAI) return;
    Alert.alert(
      'Continue with ' + leftAI.name,
      'This will end the comparison and continue chatting with only ' + leftAI.name + '. The other conversation will be disabled. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Continue', 
          onPress: async () => {
            setViewMode('left-only');
            setContinuedSide('left');
            // Save the comparison session as diverged
            await saveComparisonSession();
          }
        }
      ]
    );
  }, [leftAI, saveComparisonSession]);
  
  const handleContinueWithRight = useCallback(() => {
    if (!rightAI) return;
    Alert.alert(
      'Continue with ' + rightAI.name,
      'This will end the comparison and continue chatting with only ' + rightAI.name + '. The other conversation will be disabled. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Continue', 
          onPress: async () => {
            setViewMode('right-only');
            setContinuedSide('right');
            // Save the comparison session as diverged
            await saveComparisonSession();
          }
        }
      ]
    );
  }, [rightAI, saveComparisonSession]);
  
  const handleExpandLeft = useCallback(() => {
    setViewMode(viewMode === 'left-full' ? 'split' : 'left-full');
  }, [viewMode]);
  
  const handleExpandRight = useCallback(() => {
    setViewMode(viewMode === 'right-full' ? 'split' : 'right-full');
  }, [viewMode]);
  
  const handleStartOver = useCallback(() => {
    Alert.alert(
      'Start Over',
      'This will end the current comparison. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Start Over', 
          onPress: async () => {
            // Save the comparison session before leaving
            await saveComparisonSession();
            navigation.goBack();
          }
        }
      ]
    );
  }, [saveComparisonSession, navigation]);
  
  const isProcessing = leftTyping || rightTyping;
  const leftEffectiveModel = leftAI ? (selectedModels[leftAI.id] || leftAI.model) : '';
  const rightEffectiveModel = rightAI ? (selectedModels[rightAI.id] || rightAI.model) : '';

  const selectedList: Array<{ provider: string; model: string }> = (() => {
    if (!leftAI || !rightAI) return [];
    if (viewMode === 'left-only' || continuedSide === 'left') return [{ provider: leftAI.provider, model: leftEffectiveModel }];
    if (viewMode === 'right-only' || continuedSide === 'right') return [{ provider: rightAI.provider, model: rightEffectiveModel }];
    return [
      { provider: leftAI.provider, model: leftEffectiveModel },
      { provider: rightAI.provider, model: rightEffectiveModel },
    ];
  })();
  const availability = useMergedModalityAvailability(selectedList);
  const imageGenerationEnabled = availability.imageGeneration.supported;
  
  // Navigate back if AIs are not provided (must be after all hooks)
  if (!leftAI || !rightAI) {
    navigation.goBack();
    return null;
  }
  
  return (
    <KeyboardAvoidingView 
      style={styles.keyboardContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <SafeAreaView 
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['top', 'left', 'right', 'bottom']}
      >
        <DemoBanner
          subtitle="Sample comparisons only. Start a free trial for live runs."
          onPress={() => showTrialCTA(navigation.navigate)}
        />
        <Header
          variant="gradient"
          title="Comparing"
          subtitle={`${leftAI.name} vs ${rightAI.name}`}
          showTime={false}
          showDate={false}
          animated={true}
          rightElement={<HeaderActions variant="gradient" />}
          showBackButton={true}
          onBack={handleStartOver}
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
        <SafeAreaView edges={['bottom']} style={styles.inputContainer}>
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
            imageGenerationEnabled={imageGenerationEnabled}
            modalityAvailability={{
              imageUpload: availability.imageUpload.supported,
              documentUpload: availability.documentUpload.supported,
              imageGeneration: availability.imageGeneration.supported,
              videoGeneration: availability.videoGeneration.supported,
              voice: availability.voiceInput.supported,
            }}
            modalityReasons={{
              imageUpload: availability.imageUpload.supported ? undefined : 'Selected model(s) do not support image input',
              documentUpload: availability.documentUpload.supported ? undefined : 'Selected model(s) do not support document/PDF input',
              imageGeneration: availability.imageGeneration.supported ? undefined : 'Selected provider(s) do not support image generation',
              videoGeneration: availability.videoGeneration.supported ? undefined : 'Selected provider(s) do not support video generation',
              voice: availability.voiceInput.supported ? undefined : 'Selected model(s) do not support voice input',
            }}
          />
        </SafeAreaView>
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
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
});

export default CompareScreen;
