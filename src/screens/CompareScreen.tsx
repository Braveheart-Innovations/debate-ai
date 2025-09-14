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
import { DemoBanner } from '@/components/molecules/subscription/DemoBanner';
import { useDispatch } from 'react-redux';
import { showSheet } from '@/store';
import { DemoContentService } from '@/services/demo/DemoContentService';
import { primeCompare } from '@/services/demo/DemoPlaybackRouter';
import { DemoSamplesBar } from '@/components/organisms/demo/DemoSamplesBar';
import { getStreamingService } from '@/services/streaming/StreamingService';

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
  const dispatch = useDispatch();
  const { isDemo } = useFeatureAccess();
  
  // Get models and user status from Redux
  const selectedModels = useSelector((state: RootState) => state.chat.selectedModels);
  const expertModeConfigs = useSelector((state: RootState) => state.settings.expertMode || {});
  const currentUser = useSelector((state: RootState) => state.user.currentUser);
  const streamingState = useSelector((state: RootState) => state.streaming);
  const apiKeys = useSelector((state: RootState) => state.settings.apiKeys || ({} as Record<string, string | undefined>));
  
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
  const [compareSamples, setCompareSamples] = useState<Array<{ id: string; title: string }>>([]);
  
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
    if (isDemo) { dispatch(showSheet({ sheet: 'subscription' })); return; }
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
    
    // Determine streaming capability and preferences for each side
    const leftAdapter = aiService.getAdapter(leftAI.provider);
    const rightAdapter = aiService.getAdapter(rightAI.provider);
    const globalEnabled = streamingState?.globalStreamingEnabled ?? true;
    const leftEnabled = streamingState?.streamingPreferences?.[leftAI.id]?.enabled ?? true;
    const rightEnabled = streamingState?.streamingPreferences?.[rightAI.id]?.enabled ?? true;
    const leftBlocked = !!streamingState?.providerVerificationErrors?.[leftAI.id];
    const rightBlocked = !!streamingState?.providerVerificationErrors?.[rightAI.id];
    const hasLeftKey = Boolean(apiKeys[leftAI.provider]);
    const hasRightKey = Boolean(apiKeys[rightAI.provider]);
    const shouldStreamLeft = globalEnabled && leftEnabled && !leftBlocked && (hasLeftKey || isDemo);
    const shouldStreamRight = globalEnabled && rightEnabled && !rightBlocked && (hasRightKey || isDemo);
    const streamSpeed = (streamingState?.streamingSpeed as 'instant' | 'natural' | 'slow') || 'natural';

    // Start typing indicators only for non-streaming sides
    const leftActive = (viewMode === 'split' && !continuedSide) || continuedSide === 'left' || viewMode === 'left-only' || viewMode === 'left-full';
    const rightActive = (viewMode === 'split' && !continuedSide) || continuedSide === 'right' || viewMode === 'right-only' || viewMode === 'right-full';
    if (leftActive && !shouldStreamLeft) setLeftTyping(true);
    if (rightActive && !shouldStreamRight) setRightTyping(true);
    
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
        if (p) aiService.setPersonality(leftAI.provider, p);
      }
      if (rightAI?.personality && rightAI.personality !== 'default') {
        const { getPersonality } = await import('../config/personalities');
        const p = getPersonality(rightAI.personality);
        if (p) aiService.setPersonality(rightAI.provider, p);
      }
    } catch { /* ignore */ }

    // Send to left AI if active
    if (leftActive) {
      // Apply expert parameters to adapter if enabled
      try {
        const adapter = leftAdapter;
        const leftParams = leftExp && leftExp.parameters;
        if (adapter && leftExp.enabled && leftParams) {
          adapter.config.parameters = leftParams as never;
        }
      } catch { /* ignore */ }
      if (shouldStreamLeft) {
        // Reset streaming content and start streaming via StreamingService
        setLeftStreamingContent('');
        getStreamingService().streamResponse(
          {
            messageId: `cmp_left_${Date.now()}`,
            adapterConfig: {
              provider: leftAI.provider,
              apiKey: apiKeys[leftAI.provider] || 'demo',
              model: leftEffModel,
              parameters: (leftExp && leftExp.enabled) ? (leftExp.parameters as never) : undefined,
              isDebateMode: false,
            },
            message: messageText,
            conversationHistory: leftHistoryRef.current,
            modelOverride: leftEffModel,
            speed: streamSpeed,
          },
          // onChunk
          (chunk: string) => {
            setLeftStreamingContent(prev => prev + chunk);
          },
          // onComplete
          (finalContent: string) => {
            const leftMessage: Message = {
              id: `msg_left_${Date.now()}`,
              sender: leftAI.name,
              senderType: 'ai',
              content: finalContent,
              timestamp: Date.now(),
              metadata: { modelUsed: leftEffModel },
            };
            setLeftMessages(prev => [...prev, leftMessage]);
            leftHistoryRef.current.push(leftMessage);
            setLeftStreamingContent('');
            setLeftTyping(false);
          },
          // onError
          async (err: Error) => {
            const msg = err?.message || '';
            const isVerification = msg.toLowerCase().includes('verification');
            const isOverload = msg.toLowerCase().includes('overload') || msg.toLowerCase().includes('rate limit');
            try {
              const response = await aiService.sendMessage(leftAI.provider, messageText, leftHistoryRef.current, false, undefined, undefined, leftEffModel);
              const leftMessage: Message = {
                id: `msg_left_${Date.now()}`,
                sender: leftAI.name,
                senderType: 'ai',
                content: typeof response === 'string' ? response : response.response,
                timestamp: Date.now(),
                metadata: { modelUsed: leftEffModel },
              };
              setLeftMessages(prev => [...prev, leftMessage]);
              leftHistoryRef.current.push(leftMessage);
            } catch (fallbackError) {
              console.error('Left AI streaming error:', err, 'fallback error:', fallbackError);
              Alert.alert('Error', isVerification ? `${leftAI.name} requires org verification to stream.` : isOverload ? `${leftAI.name} is overloaded. Try again soon.` : `Failed to get response from ${leftAI.name}`);
            } finally {
              setLeftStreamingContent('');
              setLeftTyping(false);
            }
          },
          // onEvent (log provider events; inline images if present)
          (event: unknown) => {
            try {
              const e = event as Record<string, unknown>;
              const type = String(e?.type || '');
              if (type.includes('output_image')) {
                const ee = e as { image?: { url?: string; b64?: string; data?: string }; delta?: { image?: { url?: string; b64?: string; data?: string } }; image_url?: string };
                const imageUrl = ee?.image?.url || ee?.delta?.image?.url || ee?.image_url;
                const imageB64 = ee?.image?.b64 || ee?.delta?.image?.b64 || ee?.image?.data || ee?.delta?.image?.data;
                if (imageUrl) setLeftStreamingContent(prev => prev + `\n\n![image](${imageUrl})\n\n`);
                else if (imageB64) setLeftStreamingContent(prev => prev + `\n\n![image](data:image/png;base64,${imageB64})\n\n`);
                else setLeftStreamingContent(prev => prev + `\n\n[image content]\n\n`);
              }
              if (type.includes('tool')) {
                const name = (e as { tool?: { name?: string }; name?: string }).tool?.name || (e as { name?: string }).name || 'tool';
                const args = (e as { tool?: { arguments?: unknown }; arguments?: unknown; params?: unknown; parameters?: unknown }).tool?.arguments || (e as { arguments?: unknown }).arguments || (e as { params?: unknown }).params || (e as { parameters?: unknown }).parameters;
                const snippet = '```json\n' + JSON.stringify(args, null, 2).slice(0, 400) + '\n```';
                setLeftStreamingContent(prev => prev + `\n\n[${name} call]\n${snippet}\n`);
              }
              if (process.env.NODE_ENV === 'development') {
                console.warn(`[${leftAI.provider}] event`, JSON.stringify(event).slice(0, 200));
              }
            } catch { /* noop */ }
          }
        ).catch(() => {
          // Safety: ensure typing cleared on unexpected promise rejection
          setLeftTyping(false);
        });
      } else {
        aiService
          .sendMessage(leftAI.provider, messageText, leftHistoryRef.current, false, undefined, undefined, leftEffModel)
          .then(response => {
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
          })
          .catch(error => {
            console.error('Left AI error:', error);
            setLeftTyping(false);
            Alert.alert('Error', `Failed to get response from ${leftAI.name}`);
          });
      }
    }
    
    // Send to right AI if active
    if (rightActive) {
      // Apply expert parameters to adapter if enabled
      try {
        const adapter = rightAdapter;
        const rightParams = rightExp && rightExp.parameters;
        if (adapter && rightExp.enabled && rightParams) {
          adapter.config.parameters = rightParams as never;
        }
      } catch { /* ignore */ }
      if (shouldStreamRight) {
        setRightStreamingContent('');
        getStreamingService().streamResponse(
          {
            messageId: `cmp_right_${Date.now()}`,
            adapterConfig: {
              provider: rightAI.provider,
              apiKey: apiKeys[rightAI.provider] || 'demo',
              model: rightEffModel,
              parameters: (rightExp && rightExp.enabled) ? (rightExp.parameters as never) : undefined,
              isDebateMode: false,
            },
            message: messageText,
            conversationHistory: rightHistoryRef.current,
            modelOverride: rightEffModel,
            speed: streamSpeed,
          },
          (chunk: string) => {
            setRightStreamingContent(prev => prev + chunk);
          },
          (finalContent: string) => {
            const rightMessage: Message = {
              id: `msg_right_${Date.now()}`,
              sender: rightAI.name,
              senderType: 'ai',
              content: finalContent,
              timestamp: Date.now(),
              metadata: { modelUsed: rightEffModel },
            };
            setRightMessages(prev => [...prev, rightMessage]);
            rightHistoryRef.current.push(rightMessage);
            setRightStreamingContent('');
            setRightTyping(false);
          },
          async (err: Error) => {
            const msg = err?.message || '';
            const isVerification = msg.toLowerCase().includes('verification');
            const isOverload = msg.toLowerCase().includes('overload') || msg.toLowerCase().includes('rate limit');
            try {
              const response = await aiService.sendMessage(rightAI.provider, messageText, rightHistoryRef.current, false, undefined, undefined, rightEffModel);
              const rightMessage: Message = {
                id: `msg_right_${Date.now()}`,
                sender: rightAI.name,
                senderType: 'ai',
                content: typeof response === 'string' ? response : response.response,
                timestamp: Date.now(),
                metadata: { modelUsed: rightEffModel },
              };
              setRightMessages(prev => [...prev, rightMessage]);
              rightHistoryRef.current.push(rightMessage);
            } catch (fallbackError) {
              console.error('Right AI streaming error:', err, 'fallback error:', fallbackError);
              Alert.alert('Error', isVerification ? `${rightAI.name} requires org verification to stream.` : isOverload ? `${rightAI.name} is overloaded. Try again soon.` : `Failed to get response from ${rightAI.name}`);
            } finally {
              setRightStreamingContent('');
              setRightTyping(false);
            }
          },
          (event: unknown) => {
            try {
              const e = event as Record<string, unknown>;
              const type = String(e?.type || '');
              if (type.includes('output_image')) {
                const ee = e as { image?: { url?: string; b64?: string; data?: string }; delta?: { image?: { url?: string; b64?: string; data?: string } }; image_url?: string };
                const imageUrl = ee?.image?.url || ee?.delta?.image?.url || ee?.image_url;
                const imageB64 = ee?.image?.b64 || ee?.delta?.image?.b64 || ee?.image?.data || ee?.delta?.image?.data;
                if (imageUrl) setRightStreamingContent(prev => prev + `\n\n![image](${imageUrl})\n\n`);
                else if (imageB64) setRightStreamingContent(prev => prev + `\n\n![image](data:image/png;base64,${imageB64})\n\n`);
                else setRightStreamingContent(prev => prev + `\n\n[image content]\n\n`);
              }
              if (type.includes('tool')) {
                const name = (e as { tool?: { name?: string }; name?: string }).tool?.name || (e as { name?: string }).name || 'tool';
                const args = (e as { tool?: { arguments?: unknown }; arguments?: unknown; params?: unknown; parameters?: unknown }).tool?.arguments || (e as { arguments?: unknown }).arguments || (e as { params?: unknown }).params || (e as { parameters?: unknown }).parameters;
                const snippet = '```json\n' + JSON.stringify(args, null, 2).slice(0, 400) + '\n```';
                setRightStreamingContent(prev => prev + `\n\n[${name} call]\n${snippet}\n`);
              }
              if (process.env.NODE_ENV === 'development') {
                console.warn(`[${rightAI.provider}] event`, JSON.stringify(event).slice(0, 200));
              }
            } catch { /* noop */ }
          }
        ).catch(() => {
          setRightTyping(false);
        });
      } else {
        aiService
          .sendMessage(rightAI.provider, messageText, rightHistoryRef.current, false, undefined, undefined, rightEffModel)
          .then(response => {
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
          })
          .catch(error => {
            console.error('Right AI error:', error);
            setRightTyping(false);
            Alert.alert('Error', `Failed to get response from ${rightAI.name}`);
          });
      }
    }
    
    // Save session after sending messages
    if (!hasBeenSaved) {
      setHasBeenSaved(true);
    }
    // Auto-save the session after new messages
    setTimeout(() => {
      saveComparisonSession();
    }, 1000);
    
  }, [
    dispatch,
    inputText,
    aiService,
    isInitialized,
    leftAI,
    rightAI,
    viewMode,
    continuedSide,
    hasBeenSaved,
    saveComparisonSession,
    expertModeConfigs,
    selectedModels,
    isDemo,
    apiKeys,
    streamingState?.globalStreamingEnabled,
    streamingState?.streamingPreferences,
    streamingState?.providerVerificationErrors,
    streamingState?.streamingSpeed,
  ]);

  // Demo Mode: auto-start playback when both AIs are selected and no messages yet
  React.useEffect(() => {
    const run = async () => {
      if (!isInitialized || !aiService) return;
      if (!isDemo) return;
      if (!leftAI || !rightAI) return;
      if (userMessages.length > 0) return;
      try {
        const sample = await DemoContentService.getCompareSampleForProviders([leftAI.provider, rightAI.provider]);
        if (!sample) return;
        primeCompare(sample);
        const messageText = `Demo prompt: ${sample.title}`;
        const userMessage: Message = { id: `msg_${Date.now()}`, sender: 'You', senderType: 'user', content: messageText, timestamp: Date.now() };
        setUserMessages(prev => [...prev, userMessage]);
        leftHistoryRef.current.push(userMessage);
        rightHistoryRef.current.push(userMessage);
        setLeftTyping(true);
        setRightTyping(true);

        const leftEffModel = selectedModels[leftAI.id] || leftAI.model;
        const rightEffModel = selectedModels[rightAI.id] || rightAI.model;

        aiService.sendMessage(leftAI.id, messageText, leftHistoryRef.current, false, undefined, undefined, leftEffModel)
          .then(response => {
            const leftMessage: Message = { id: `msg_left_${Date.now()}`, sender: leftAI.name, senderType: 'ai', content: typeof response === 'string' ? response : response.response, timestamp: Date.now(), metadata: { modelUsed: leftEffModel } };
            setLeftMessages(prev => [...prev, leftMessage]);
            leftHistoryRef.current.push(leftMessage);
            setLeftTyping(false);
            setLeftStreamingContent('');
          })
          .catch(() => setLeftTyping(false));

        aiService.sendMessage(rightAI.id, messageText, rightHistoryRef.current, false, undefined, undefined, rightEffModel)
          .then(response => {
            const rightMessage: Message = { id: `msg_right_${Date.now()}`, sender: rightAI.name, senderType: 'ai', content: typeof response === 'string' ? response : response.response, timestamp: Date.now(), metadata: { modelUsed: rightEffModel } };
            setRightMessages(prev => [...prev, rightMessage]);
            rightHistoryRef.current.push(rightMessage);
            setRightTyping(false);
            setRightStreamingContent('');
          })
          .catch(() => setRightTyping(false));
      } catch { /* ignore */ }
    };
    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo, leftAI, rightAI, isInitialized, aiService, userMessages.length]);

  // Demo Mode: fetch compare samples list for current pair
  React.useEffect(() => {
    const run = async () => {
      if (!isDemo || !leftAI || !rightAI) { setCompareSamples([]); return; }
      const list = await DemoContentService.listCompareSamples([leftAI.provider, rightAI.provider]);
      setCompareSamples(list);
    };
    run();
  }, [isDemo, leftAI, rightAI]);
  
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
          onPress={() => dispatch(showSheet({ sheet: 'subscription' }))}
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
          showDemoBadge={isDemo}
        />

        {isDemo && compareSamples.length > 0 && (
          <DemoSamplesBar
            label="Demo Samples"
            samples={compareSamples}
            onSelect={async (sampleId) => {
              try {
                const sample = await DemoContentService.findCompareById(sampleId);
                if (!sample || !leftAI || !rightAI || !aiService) return;
                primeCompare(sample);
                const messageText = `Demo prompt: ${sample.title}`;
                const userMessage: Message = { id: `msg_${Date.now()}`, sender: 'You', senderType: 'user', content: messageText, timestamp: Date.now() };
                setUserMessages(prev => [...prev, userMessage]);
                leftHistoryRef.current.push(userMessage);
                rightHistoryRef.current.push(userMessage);
                setLeftTyping(true);
                setRightTyping(true);
                const leftEffModel = selectedModels[leftAI.id] || leftAI.model;
                const rightEffModel = selectedModels[rightAI.id] || rightAI.model;
                aiService.sendMessage(leftAI.id, messageText, leftHistoryRef.current, false, undefined, undefined, leftEffModel)
                  .then(response => {
                    const leftMessage: Message = { id: `msg_left_${Date.now()}`, sender: leftAI.name, senderType: 'ai', content: typeof response === 'string' ? response : response.response, timestamp: Date.now(), metadata: { modelUsed: leftEffModel } };
                    setLeftMessages(prev => [...prev, leftMessage]);
                    leftHistoryRef.current.push(leftMessage);
                    setLeftTyping(false);
                    setLeftStreamingContent('');
                  })
                  .catch(() => setLeftTyping(false));
                aiService.sendMessage(rightAI.id, messageText, rightHistoryRef.current, false, undefined, undefined, rightEffModel)
                  .then(response => {
                    const rightMessage: Message = { id: `msg_right_${Date.now()}`, sender: rightAI.name, senderType: 'ai', content: typeof response === 'string' ? response : response.response, timestamp: Date.now(), metadata: { modelUsed: rightEffModel } };
                    setRightMessages(prev => [...prev, rightMessage]);
                    rightHistoryRef.current.push(rightMessage);
                    setRightTyping(false);
                    setRightStreamingContent('');
                  })
                  .catch(() => setRightTyping(false));
              } catch { /* ignore */ }
            }}
          />
        )}
        
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
