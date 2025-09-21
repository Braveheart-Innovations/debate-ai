import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { addMessage, updateMessage, setTypingAI } from '../../store';
import { 
  startStreaming, 
  updateStreamingContent, 
  endStreaming,
  streamingError,
  clearStreamingMessage,
  selectStreamingSpeed,
  setProviderVerificationError,
} from '../../store/streamingSlice';
import { Message, MessageAttachment, PersonalityConfig } from '../../types';
import { useAIService } from '../../providers/AIServiceProvider';
import { ChatService, PromptBuilder } from '../../services/chat';
import { getPersonality } from '../../config/personalities';
import { getStreamingService } from '../../services/streaming/StreamingService';
import type { ResumptionContext } from '../../services/aiAdapter';
import { getExpertOverrides } from '../../utils/expertMode';
import useFeatureAccess from '@/hooks/useFeatureAccess';
import { RecordController } from '@/services/demo/RecordController';
import { getCurrentTurnProviders, markProviderComplete } from '@/services/demo/DemoPlaybackRouter';
import { HOME_CONSTANTS } from '@/config/homeConstants';

export interface AIResponsesHook {
  typingAIs: string[];
  isAnyAITyping: boolean;
  sendAIResponses: (
    userMessage: Message, 
    enrichedPrompt?: string,
    attachments?: MessageAttachment[]
  ) => Promise<void>;
  sendQuickStartResponses: (
    userPrompt: string,
    enrichedPrompt: string
  ) => Promise<void>;
  isProcessing: boolean;
}

export const useAIResponsesWithStreaming = (isResuming?: boolean): AIResponsesHook => {
  const dispatch = useDispatch();
  const { aiService, isInitialized } = useAIService();
  const { 
    currentSession, 
    typingAIs, 
    aiPersonalities 
  } = useSelector((state: RootState) => state.chat);
  
  // Get API keys for dynamic adapter creation
  const apiKeys = useSelector((state: RootState) => state.settings.apiKeys);
  const expertModeConfigs = useSelector((state: RootState) => state.settings.expertMode || {});
  
  // Get streaming settings from state
  const streamingSpeed = useSelector(selectStreamingSpeed);
  const streamingPreferences = useSelector((state: RootState) => state.streaming?.streamingPreferences || {});
  const globalStreamingEnabled = useSelector((state: RootState) => state.streaming?.globalStreamingEnabled ?? true);

  const messages = currentSession?.messages || [];
  const selectedAIs = currentSession?.selectedAIs || [];
  const { isDemo } = useFeatureAccess();
  
  // Track if this is the first message after resuming
  const [hasResumed, setHasResumed] = useState(false);
  
  // Get streaming service
  const streamingService = getStreamingService();

  const sendAIResponses = async (
    userMessage: Message,
    enrichedPrompt?: string,
    attachments?: MessageAttachment[]
  ): Promise<void> => {
    if (!aiService || !isInitialized || !currentSession) {
      console.error('AI service not ready or no active session');
      return;
    }

    // Determine which AIs should respond
    const mentions = userMessage.mentions || [];
    let respondingAIs = ChatService.determineRespondingAIs(
      mentions,
      selectedAIs,
      HOME_CONSTANTS.MAX_AIS_FOR_CHAT
    );

    if (isDemo) {
      const scriptedProviders = getCurrentTurnProviders().map(p => p.toLowerCase());
      if (scriptedProviders.length > 0) {
        const orderMap = new Map(scriptedProviders.map((provider, index) => [provider, index]));
        const scriptedSet = new Set(scriptedProviders);
        const filtered = respondingAIs.filter(ai => scriptedSet.has(ai.provider.toLowerCase()));
        if (filtered.length > 0) {
          respondingAIs = filtered.sort((a, b) => (orderMap.get(a.provider.toLowerCase()) ?? 99) - (orderMap.get(b.provider.toLowerCase()) ?? 99));
        } else {
          const fallback = selectedAIs
            .filter(ai => scriptedSet.has(ai.provider.toLowerCase()))
            .sort((a, b) => (orderMap.get(a.provider.toLowerCase()) ?? 99) - (orderMap.get(b.provider.toLowerCase()) ?? 99));
          if (fallback.length > 0) respondingAIs = fallback;
        }
      }
    }

    // Build resumption context if this is first message after resuming
    let resumptionContext: ResumptionContext | undefined;
    if (isResuming && !hasResumed && messages.length > 0) {
      resumptionContext = {
        originalPrompt: messages[0],
        isResuming: true
      };
      setHasResumed(true);
    }
    
    // Build conversation context
    let conversationContext = ChatService.buildConversationContext(messages, userMessage);
    
    // Process AI responses sequentially
    for (const ai of respondingAIs) {
      // Get adapter for this AI
      const adapter = aiService.getAdapter(ai.id);
      if (!adapter) {
        dispatch(setTypingAI({ ai: ai.name, isTyping: false }));
        throw new Error(`No adapter found for ${ai.name}`);
      }

      // Check if streaming is enabled globally and for this provider
      const providerStreamingEnabled = streamingPreferences[ai.id]?.enabled ?? true;
      const streamingEnabled = globalStreamingEnabled && providerStreamingEnabled;
      
      // Check if adapter supports streaming
      const capabilities = adapter.getCapabilities();
      const shouldStream = streamingEnabled && capabilities.streaming;
      
      // Only show typing indicator if NOT streaming
      if (!shouldStream) {
        dispatch(setTypingAI({ ai: ai.name, isTyping: true }));
      }

      try {
        // Natural typing delay
        await new Promise(resolve => 
          setTimeout(resolve, ChatService.calculateTypingDelay())
        );

        // Apply personality if set
        const personalityId = aiPersonalities[ai.id] || 'default';
        const personality = getPersonality(personalityId);
        if (personality) {
          aiService.setPersonality(ai.id, personality);
        }

        // Build prompt based on context
        const isFirstAI = ChatService.isFirstAIInRound(conversationContext);
        const promptContext = {
          isFirstAI,
          isDebateMode: conversationContext.isDebateMode,
          lastSpeaker: conversationContext.lastSpeaker,
          lastMessage: conversationContext.lastMessage,
          conversationHistory: conversationContext.messages,
          mentions,
        };

        const promptForAI = enrichedPrompt && isFirstAI 
          ? enrichedPrompt 
          : PromptBuilder.buildAIPrompt(
              userMessage.content,
              promptContext,
              ai,
              personality
            );

        // Only pass attachments to first AI
        const aiAttachments = isFirstAI ? attachments : undefined;
        
        // Resolve expert parameters for this provider (treat expert model as default only; ai.model is authoritative)
        const expert = getExpertOverrides(expertModeConfigs as Record<string, unknown>, ai.provider) as {
          enabled: boolean;
          model?: string;
          parameters?: import('../../types').ModelParameters;
        };

        if (shouldStream) {
          // Create placeholder message for streaming
          const aiMessage = ChatService.createAIMessage(ai, '', {
            modelUsed: ai.model,
            responseTime: 0,
          });
          dispatch(addMessage(aiMessage));
          
          // Start streaming state
          dispatch(startStreaming({ 
            messageId: aiMessage.id, 
            aiProvider: ai.id 
          }));

          // Variable to store the final content after streaming
          let streamedContent = '';

          // Get API key for this provider
          const apiKey = apiKeys[ai.provider] || (isDemo ? 'demo' : undefined);
          if (!apiKey) {
            throw new Error(`No API key configured for ${ai.provider}`);
          }
          
          // Stream the response with dynamic adapter creation
          await streamingService.streamResponse(
            {
              messageId: aiMessage.id,
              adapterConfig: {
                provider: ai.provider,
                apiKey,
                model: ai.model,
                personality: personality as PersonalityConfig | undefined,
                parameters: expert.enabled ? expert.parameters : undefined,
                isDebateMode: conversationContext.isDebateMode,
              },
              message: promptForAI,
              conversationHistory: conversationContext.messages.slice(0, -1),
              resumptionContext,
              attachments: aiAttachments,
              modelOverride: ai.model,
              speed: streamingSpeed,
            },
            // On chunk received
            (chunk: string) => {
              dispatch(updateStreamingContent({ 
                messageId: aiMessage.id, 
                chunk 
              }));
              // If recording, capture the assistant chunk
              try { if (RecordController.isActive()) { RecordController.recordAssistantChunk(ai.provider, chunk); } } catch { /* ignore */ }
            },
            // On complete
            (finalContent: string) => {
              streamedContent = finalContent; // Store the final content
              dispatch(endStreaming({ 
                messageId: aiMessage.id, 
                finalContent 
              }));
              // Update the message in the chat store with final content
              dispatch(updateMessage({
                id: aiMessage.id,
                content: finalContent,
              }));
            },
            // On error
            async (error: Error) => {
              dispatch(streamingError({ 
                messageId: aiMessage.id, 
                error: error.message 
              }));
              console.error(`Streaming error for ${ai.name}:`, error);
              
              // Check if this is a verification error or overload error and fallback to non-streaming
              const isVerificationError = error.message.includes('Streaming requires organization verification') || 
                  error.message.includes('organization must be verified') ||
                  error.message.includes('Your organization must be verified to stream') ||
                  error.message.includes('Verify Organization');
              
              const isOverloadError = error.message.includes('overload') || 
                  error.message.includes('Overloaded') ||
                  error.message.includes('temporarily busy') ||
                  error.message.includes('rate limit');
              
              if (isVerificationError || isOverloadError) {
                if (isVerificationError) {
                  // Falling back to non-streaming due to verification requirement
                  // Mark this provider as having verification errors
                  dispatch(setProviderVerificationError({ 
                    providerId: ai.id, 
                    hasError: true 
                  }));
                } else {
                  // Service overloaded, falling back to non-streaming
                }
                
                // Don't clear the streaming message yet - we need to keep the error state
                // It will be updated with either success or failure
                
                // Fallback to non-streaming request
                try {
                  // Ensure adapter gets expert parameters for fallback
                  try {
                    const fallbackAdapter = aiService.getAdapter(ai.id);
                    if (fallbackAdapter && expert.enabled && expert.parameters) {
                      fallbackAdapter.config.parameters = expert.parameters;
                      // Do not force model; ai.model remains the session authority
                    }
                  } catch { /* ignore */ }
                  const result = await aiService.sendMessage(
                    ai.id,
                    promptForAI,
                    conversationContext.messages.slice(0, -1),
                    conversationContext.isDebateMode,
                    resumptionContext,
                    aiAttachments,
                    ai.model
                  );
                  
                  const response = typeof result === 'string' ? result : result.response;
                  
                  // Success! Clear the error and update with the response
                  dispatch(clearStreamingMessage(aiMessage.id)); // Clear the error state
                  dispatch(updateMessage({
                    id: aiMessage.id,
                    content: response,
                  }));
                  
                  streamedContent = response; // Update for context building
                } catch (fallbackError) {
                  console.error(`Fallback to non-streaming also failed:`, fallbackError);
                  
                  // Update the message to show the error
                  const errorMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
                  const userFriendlyError = errorMsg.includes('Overloaded') || errorMsg.includes('overload')
                    ? `${ai.name} is currently overloaded. Please try again in a few moments.`
                    : `Failed to get response from ${ai.name}: ${errorMsg}`;
                  
                  dispatch(updateMessage({
                    id: aiMessage.id,
                    content: userFriendlyError,
                  }));
                  
                  // Also update the streaming error state so the UI shows error styling
                  dispatch(streamingError({ 
                    messageId: aiMessage.id, 
                    error: userFriendlyError 
                  }));
                }
              }
            },
            (event: unknown) => {
              try {
                const e = event as Record<string, unknown>;
                const type = String(e?.type || '');
                // Handle output images inline (best-effort)
                if (type.includes('output_image')) {
                  const ee = e as { image?: { url?: string; b64?: string; data?: string }; delta?: { image?: { url?: string; b64?: string; data?: string } }; image_url?: string };
                  const imageUrl = ee?.image?.url || ee?.delta?.image?.url || ee?.image_url;
                  const imageB64 = ee?.image?.b64 || ee?.delta?.image?.b64 || ee?.image?.data || ee?.delta?.image?.data;
                  if (imageUrl) {
                    dispatch(updateStreamingContent({ messageId: aiMessage.id, chunk: `\n\n![image](${imageUrl})\n\n` }));
                    try { if (RecordController.isActive()) { RecordController.recordImageMarkdown(imageUrl); } } catch { /* ignore */ }
                  } else if (imageB64) {
                    const dataUrl = `data:image/png;base64,${imageB64}`;
                    dispatch(updateStreamingContent({ messageId: aiMessage.id, chunk: `\n\n![image](${dataUrl})\n\n` }));
                    try { if (RecordController.isActive()) { RecordController.recordImageMarkdown(dataUrl); } } catch { /* ignore */ }
                  } else {
                    dispatch(updateStreamingContent({ messageId: aiMessage.id, chunk: `\n\n[image content]\n\n` }));
                  }
                }
                // Handle tool calls by appending a small inline block
                if (type.includes('tool')) {
                  const name = (e as { tool?: { name?: string }; name?: string }).tool?.name || (e as { name?: string }).name || 'tool';
                  const args = (e as { tool?: { arguments?: unknown }; arguments?: unknown; params?: unknown; parameters?: unknown }).tool?.arguments || (e as { arguments?: unknown }).arguments || (e as { params?: unknown }).params || (e as { parameters?: unknown }).parameters;
                  const snippet = '```json\n' + JSON.stringify(args, null, 2).slice(0, 400) + '\n```';
                  dispatch(updateStreamingContent({ messageId: aiMessage.id, chunk: `\n\n[${name} call]\n${snippet}\n` }));
                }
                if (process.env.NODE_ENV === 'development') {
                  console.warn(`[${ai.name}] event`, JSON.stringify(event).slice(0, 200));
                }
              } catch (e) { void e; }
            }
          );

          // Update context with the streamed message (with final content)
          conversationContext = ChatService.buildRoundRobinContext(
            conversationContext.messages,
            [{ ...aiMessage, content: streamedContent }]
          );

        } else {
          // Fallback to non-streaming behavior
          const responseStart = Date.now();
          // Ensure adapter picks up expert parameters if enabled
          try {
            if (expert.enabled && expert.parameters) {
              const nonStreamAdapter = aiService.getAdapter(ai.id);
              if (nonStreamAdapter) {
                nonStreamAdapter.config.parameters = expert.parameters;
                // Do not force model; ai.model remains the session authority
              }
            }
          } catch { /* ignore */ }
          const result = await aiService.sendMessage(
            ai.id,
            promptForAI,
            conversationContext.messages.slice(0, -1),
            conversationContext.isDebateMode,
            resumptionContext,
            aiAttachments,
            ai.model
          );
          const responseTime = Date.now() - responseStart;

          // Extract response and metadata
          const response = typeof result === 'string' ? result : result.response;
          const modelUsed = typeof result === 'string' ? undefined : result.modelUsed;
          const resultObj = typeof result === 'object' ? result as Record<string, unknown> : null;
          const metadata = resultObj?.metadata as { citations?: unknown } | undefined;
          const citations = metadata?.citations as Array<{ 
            index: number; 
            url: string; 
            title?: string; 
            snippet?: string 
          }> | undefined;

          // Create AI message with metadata
          const aiMessage = ChatService.createAIMessage(ai, response, {
            modelUsed: modelUsed || ai.model,
            responseTime,
            citations
          });
          dispatch(addMessage(aiMessage));

          // Update context for next AI
          conversationContext = ChatService.buildRoundRobinContext(
            conversationContext.messages,
            [aiMessage]
          );
        }
        
        // Clear resumption context after first AI responds
        resumptionContext = undefined;
        
      } catch (error) {
        console.error(`Error getting response from ${ai.name}:`, error);
        
        // Add error message
        const errorMessage = ChatService.createErrorMessage(ai, error as Error);
        dispatch(addMessage(errorMessage));

        // Even error messages are part of the conversation context
        conversationContext = ChatService.buildRoundRobinContext(
          conversationContext.messages,
          [errorMessage]
        );
      } finally {
        if (isDemo) {
          markProviderComplete(ai.provider);
        }
        // Only clear typing indicator if it was set (non-streaming)
        if (!shouldStream) {
          dispatch(setTypingAI({ ai: ai.name, isTyping: false }));
        }
      }
    }
  };

  const sendQuickStartResponses = async (
    userPrompt: string,
    enrichedPrompt: string
  ): Promise<void> => {
    if (!aiService || !isInitialized || !currentSession) {
      console.error('AI service not ready or no active session');
      return;
    }

    // Create user message with user-visible prompt
    const userMessage = ChatService.createUserMessage(userPrompt, []);
    dispatch(addMessage(userMessage));

    // Use enriched prompt for AI responses capped at the session limit
    const respondingAIs = selectedAIs.slice(0, HOME_CONSTANTS.MAX_AIS_FOR_CHAT);
    let conversationContext = ChatService.buildConversationContext(messages, userMessage);
    
    for (const ai of respondingAIs) {
      // Get adapter and check streaming support first
      if (!aiService || !isInitialized) {
        throw new Error('AI service not ready');
      }

      const adapter = aiService.getAdapter(ai.id);
      if (!adapter) {
        throw new Error(`No adapter found for ${ai.name}`);
      }

      const providerStreamingEnabled = streamingPreferences[ai.id]?.enabled ?? true;
      const streamingEnabled = globalStreamingEnabled && providerStreamingEnabled;
      const capabilities = adapter.getCapabilities();
      const shouldStream = streamingEnabled && capabilities.streaming;
      
      // Only show typing indicator if NOT streaming
      if (!shouldStream) {
        dispatch(setTypingAI({ ai: ai.name, isTyping: true }));
      }

      try {
        await new Promise(resolve => 
          setTimeout(resolve, ChatService.calculateTypingDelay())
        );

        // Build prompt
        const isFirstAI = conversationContext.messages[conversationContext.messages.length - 1].senderType === 'user';
        let promptForAI: string;
        let historyToPass: Message[];
        
        if (isFirstAI) {
          promptForAI = enrichedPrompt;
          historyToPass = conversationContext.messages.slice(0, -1);
        } else {
          const lastSpeaker = conversationContext.messages[conversationContext.messages.length - 1].sender;
          const lastMessage = conversationContext.messages[conversationContext.messages.length - 1].content;
          promptForAI = PromptBuilder.buildRoundRobinPrompt(lastSpeaker, lastMessage);
          historyToPass = conversationContext.messages.slice(0, -1);
        }

        if (shouldStream) {
          // Create placeholder message for streaming
          const aiMessage = ChatService.createAIMessage(ai, '', {
            modelUsed: ai.model,
            responseTime: 0,
          });
          dispatch(addMessage(aiMessage));
          
          // Start streaming
          dispatch(startStreaming({ 
            messageId: aiMessage.id, 
            aiProvider: ai.id 
          }));

          // Variable to store the final content after streaming
          let streamedContent = '';

          await streamingService.streamResponse(
            {
              messageId: aiMessage.id,
              adapter,
              message: promptForAI,
              conversationHistory: historyToPass,
              modelOverride: ai.model,
              speed: streamingSpeed,
            },
            (chunk: string) => {
              dispatch(updateStreamingContent({ 
                messageId: aiMessage.id, 
                chunk 
              }));
            },
            (finalContent: string) => {
              streamedContent = finalContent; // Store the final content
              dispatch(endStreaming({ 
                messageId: aiMessage.id, 
                finalContent 
              }));
              // Update the message in the chat store with final content
              dispatch(updateMessage({
                id: aiMessage.id,
                content: finalContent,
              }));
            },
            async (error: Error) => {
              dispatch(streamingError({ 
                messageId: aiMessage.id, 
                error: error.message 
              }));
              
              // Check if this is a verification error or overload error and fallback to non-streaming  
              const isVerificationError = error.message.includes('Streaming requires organization verification') || 
                  error.message.includes('organization must be verified') ||
                  error.message.includes('Your organization must be verified to stream') ||
                  error.message.includes('Verify Organization');
              
              const isOverloadError = error.message.includes('overload') || 
                  error.message.includes('Overloaded') ||
                  error.message.includes('temporarily busy') ||
                  error.message.includes('rate limit');
              
              if (isVerificationError || isOverloadError) {
                if (isVerificationError) {
                  console.error(`[${ai.name}] Falling back to non-streaming in quick start due to verification requirement`);
                  // Mark this provider as having verification errors
                  dispatch(setProviderVerificationError({ 
                    providerId: ai.id, 
                    hasError: true 
                  }));
                } else {
                  console.error(`[${ai.name}] Service overloaded in quick start, falling back to non-streaming`);
                }
                
                // Don't clear the streaming message yet - we need to keep the error state
                // It will be updated with either success or failure
                
                // Fallback to non-streaming request
                try {
                  const result = await aiService.sendMessage(
                    ai.id,
                    promptForAI,
                    historyToPass,
                    false,
                    undefined,
                    undefined,
                    ai.model
                  );
                  
          const response = typeof result === 'string' ? result : result.response;
          
          // Success! Clear the error and update with the response
          dispatch(clearStreamingMessage(aiMessage.id)); // Clear the error state
          dispatch(updateMessage({
            id: aiMessage.id,
            content: response,
          }));
          // If recording (non-streaming fallback), capture the assistant message
          try { if (RecordController.isActive()) { RecordController.recordAssistantMessage(ai.provider, response); } } catch { /* ignore */ }
          
          streamedContent = response; // Update for context building
        } catch (fallbackError) {
                  console.error(`Fallback to non-streaming also failed:`, fallbackError);
                  
                  // Update the message to show the error
                  const errorMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
                  const userFriendlyError = errorMsg.includes('Overloaded') || errorMsg.includes('overload')
                    ? `${ai.name} is currently overloaded. Please try again in a few moments.`
                    : `Failed to get response from ${ai.name}: ${errorMsg}`;
                  
                  dispatch(updateMessage({
                    id: aiMessage.id,
                    content: userFriendlyError,
                  }));
                  
                  // Also update the streaming error state so the UI shows error styling
                  dispatch(streamingError({ 
                    messageId: aiMessage.id, 
                    error: userFriendlyError 
                  }));
                }
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
                  if (imageUrl) {
                    dispatch(updateStreamingContent({ messageId: aiMessage.id, chunk: `\n\n![image](${imageUrl})\n\n` }));
                  } else if (imageB64) {
                    const dataUrl = `data:image/png;base64,${imageB64}`;
                    dispatch(updateStreamingContent({ messageId: aiMessage.id, chunk: `\n\n![image](${dataUrl})\n\n` }));
                  } else {
                    dispatch(updateStreamingContent({ messageId: aiMessage.id, chunk: `\n\n[image content]\n\n` }));
                  }
                }
                if (type.includes('tool')) {
                  const name = (e as { tool?: { name?: string }; name?: string }).tool?.name || (e as { name?: string }).name || 'tool';
                  const args = (e as { tool?: { arguments?: unknown }; arguments?: unknown; params?: unknown; parameters?: unknown }).tool?.arguments || (e as { arguments?: unknown }).arguments || (e as { params?: unknown }).params || (e as { parameters?: unknown }).parameters;
                  const snippet = '```json\n' + JSON.stringify(args, null, 2).slice(0, 400) + '\n```';
                  dispatch(updateStreamingContent({ messageId: aiMessage.id, chunk: `\n\n[${name} call]\n${snippet}\n` }));
                }
                if (process.env.NODE_ENV === 'development') {
                  console.warn(`[${ai.name}] event`, JSON.stringify(event).slice(0, 200));
                }
              } catch (e) { void e; }
            }
          );

          conversationContext = ChatService.buildRoundRobinContext(
            conversationContext.messages,
            [{ ...aiMessage, content: streamedContent }]
          );

        } else {
          // Non-streaming fallback
          const responseStart = Date.now();
          const result = await aiService.sendMessage(
            ai.id,
            promptForAI,
            historyToPass,
            false,
            undefined,
            undefined,
            ai.model
          );
          const responseTime = Date.now() - responseStart;

          const response = typeof result === 'string' ? result : result.response;
          const modelUsed = typeof result === 'string' ? undefined : result.modelUsed;
          const resultObj = typeof result === 'object' ? result as Record<string, unknown> : null;
          const metadata = resultObj?.metadata as { citations?: unknown } | undefined;
          const citations = metadata?.citations as Array<{ 
            index: number; 
            url: string; 
            title?: string; 
            snippet?: string 
          }> | undefined;

          const aiMessage = ChatService.createAIMessage(ai, response, {
            modelUsed,
            responseTime,
            citations
          });
          dispatch(addMessage(aiMessage));
          
          conversationContext = ChatService.buildRoundRobinContext(
            conversationContext.messages,
            [aiMessage]
          );
        }
        
      } catch (error) {
        console.error(`Error getting response from ${ai.name}:`, error);
        
        const errorMessage = ChatService.createErrorMessage(ai, error as Error);
        dispatch(addMessage(errorMessage));
        
        conversationContext = ChatService.buildRoundRobinContext(
          conversationContext.messages,
          [errorMessage]
        );
      } finally {
        // Only clear typing indicator if it was set (non-streaming)
        if (!shouldStream) {
          dispatch(setTypingAI({ ai: ai.name, isTyping: false }));
        }
      }
    }
  };

  return {
    typingAIs,
    isAnyAITyping: typingAIs.length > 0,
    sendAIResponses,
    sendQuickStartResponses,
    isProcessing: typingAIs.length > 0,
  };
};
