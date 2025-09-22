import { AppDispatch, addMessage, setTypingAI, updateMessage } from '@/store';
import {
  startStreaming,
  updateStreamingContent,
  endStreaming,
  streamingError,
  clearStreamingMessage,
  setProviderVerificationError,
} from '@/store/streamingSlice';
import { ChatService } from './ChatService';
import { PromptBuilder } from './PromptBuilder';
import { HOME_CONSTANTS } from '@/config/homeConstants';
import { getPersonality } from '@/config/personalities';
import { getExpertOverrides } from '@/utils/expertMode';
import { getStreamingService } from '@/services/streaming/StreamingService';
import { RecordController } from '@/services/demo/RecordController';
import { getCurrentTurnProviders, markProviderComplete } from '@/services/demo/DemoPlaybackRouter';
import type { AIService, ResumptionContext } from '@/services/aiAdapter';
import type { AI, ChatSession, Message, MessageAttachment, ModelParameters, PersonalityConfig } from '@/types';

interface StreamingPreferenceState {
  enabled?: boolean;
  supported?: boolean;
}

export interface ProcessUserMessageParams {
  userMessage: Message;
  existingMessages: Message[];
  mentions: string[];
  enrichedPrompt?: string;
  attachments?: MessageAttachment[];
  resumptionContext?: ResumptionContext;
  aiPersonalities: Record<string, string>;
  selectedModels: Record<string, string>;
  apiKeys: Record<string, string | undefined>;
  expertModeConfigs: Record<string, unknown>;
  streamingPreferences?: Record<string, StreamingPreferenceState | undefined>;
  globalStreamingEnabled?: boolean;
  streamingSpeed?: 'instant' | 'natural' | 'slow';
  allowStreaming: boolean;
  isDemo: boolean;
}

export class ChatOrchestrator {
  private readonly aiService: AIService;
  private readonly dispatch: AppDispatch;
  private readonly streamingService = getStreamingService();

  private session: ChatSession | null = null;
  private sessionId: string | null = null;
  private nextSpeakerIndex = 0;

  constructor(aiService: AIService, dispatch: AppDispatch) {
    this.aiService = aiService;
    this.dispatch = dispatch;
  }

  updateSession(session: ChatSession | null): void {
    if (!session) {
      this.session = null;
      this.sessionId = null;
      this.nextSpeakerIndex = 0;
      return;
    }

    if (session.id !== this.sessionId) {
      this.nextSpeakerIndex = 0;
      this.sessionId = session.id;
    }

    this.session = session;
  }

  async processUserMessage(params: ProcessUserMessageParams): Promise<void> {
    if (!this.session) {
      throw new Error('ChatOrchestrator: no active session');
    }

    const {
      userMessage,
      existingMessages,
      mentions,
      enrichedPrompt,
      attachments,
      resumptionContext: initialResumption,
      aiPersonalities,
      selectedModels,
      apiKeys,
      expertModeConfigs,
      streamingPreferences,
      globalStreamingEnabled,
      streamingSpeed,
      allowStreaming,
      isDemo,
    } = params;

    let resumptionContext = initialResumption;
    const responders = this.getResponders(mentions, isDemo);
    if (responders.length === 0) {
      return;
    }

    let conversationContext = ChatService.buildConversationContext(existingMessages, userMessage);

    for (const ai of responders) {
      const adapter = this.aiService.getAdapter(ai.id);
      if (!adapter) {
        this.handleAdapterError(ai);
        continue;
      }

      const effectiveModel = selectedModels[ai.id] || ai.model;
      const aiForTurn: AI = { ...ai, model: effectiveModel };

      const providerPreference = streamingPreferences?.[ai.id];
      const providerStreamingEnabled = providerPreference?.enabled ?? true;
      const streamingEnabled = allowStreaming && (globalStreamingEnabled ?? true) && providerStreamingEnabled;
      const capabilities = adapter.getCapabilities();
      const shouldStream = streamingEnabled && capabilities.streaming;

      if (!shouldStream) {
        this.dispatch(setTypingAI({ ai: ai.name, isTyping: true }));
      }

      try {
        await this.sleep(ChatService.calculateTypingDelay());

        const personalityId = aiPersonalities[ai.id] || 'default';
        const personality = personalityId !== 'default' ? getPersonality(personalityId) : undefined;
        if (personality) {
          this.aiService.setPersonality(ai.id, personality);
        }

        const promptContext = {
          isFirstAI: ChatService.isFirstAIInRound(conversationContext),
          isDebateMode: conversationContext.isDebateMode,
          lastSpeaker: conversationContext.lastSpeaker,
          lastMessage: conversationContext.lastMessage,
          conversationHistory: conversationContext.messages,
          mentions,
        };

        const promptForAI = (enrichedPrompt && promptContext.isFirstAI)
          ? enrichedPrompt
          : PromptBuilder.buildAIPrompt(
              userMessage.content,
              promptContext,
              aiForTurn,
              personality
            );

        const expert = getExpertOverrides(
          expertModeConfigs as unknown as Record<string, { enabled?: boolean; parameters?: ModelParameters; model?: string }> ,
          ai.provider
        ) as { enabled?: boolean; parameters?: ModelParameters; model?: string } | undefined;

        const aiAttachments = promptContext.isFirstAI ? attachments : undefined;

        const aiMessage = shouldStream
          ? await this.handleStreamingResponse({
              ai: aiForTurn,
              personality,
              prompt: promptForAI,
              conversationContext,
              resumptionContext,
              attachments: aiAttachments,
              apiKey: apiKeys[ai.provider] || (isDemo ? 'demo' : undefined),
              expert,
              streamingSpeed,
            })
          : await this.handleNonStreamingResponse({
              ai: aiForTurn,
              personality,
              prompt: promptForAI,
              conversationContext,
              resumptionContext,
              attachments: aiAttachments,
              expert,
            });

        conversationContext = ChatService.buildRoundRobinContext(
          conversationContext.messages,
          [aiMessage]
        );
        resumptionContext = undefined;
      } catch (error) {
        const errorMessage = ChatService.createErrorMessage(ai, error as Error);
        this.dispatch(addMessage(errorMessage));
        conversationContext = ChatService.buildRoundRobinContext(
          conversationContext.messages,
          [errorMessage]
        );
      } finally {
        if (isDemo) {
          markProviderComplete(ai.provider);
        }
        if (!shouldStream) {
          this.dispatch(setTypingAI({ ai: ai.name, isTyping: false }));
        }
      }
    }
  }

  private async handleStreamingResponse(options: {
    ai: AI;
    personality?: ReturnType<typeof getPersonality>;
    prompt: string;
    conversationContext: ReturnType<typeof ChatService.buildConversationContext>;
    resumptionContext?: ResumptionContext;
    attachments?: MessageAttachment[];
    apiKey?: string;
    expert?: { enabled?: boolean; parameters?: ModelParameters } | undefined;
    streamingSpeed?: 'instant' | 'natural' | 'slow';
  }): Promise<Message> {
    const {
      ai,
      personality,
      prompt,
      conversationContext,
      resumptionContext,
      attachments,
      apiKey,
      expert,
      streamingSpeed,
    } = options;

    if (!apiKey) {
      throw new Error(`No API key configured for ${ai.provider}`);
    }

    const aiMessage = ChatService.createAIMessage(ai, '', {
      modelUsed: ai.model,
      responseTime: 0,
    });
    this.dispatch(addMessage(aiMessage));
    this.dispatch(startStreaming({ messageId: aiMessage.id, aiProvider: ai.id }));

    let streamedContent = '';
    let finalContent = '';

    await this.streamingService.streamResponse(
      {
        messageId: aiMessage.id,
        adapterConfig: {
          provider: ai.provider,
          apiKey,
          model: ai.model,
          personality: personality as PersonalityConfig | undefined,
          parameters: expert?.enabled ? expert.parameters : undefined,
          isDebateMode: conversationContext.isDebateMode,
        },
        message: prompt,
        conversationHistory: conversationContext.messages.slice(0, -1),
        resumptionContext,
        attachments,
        modelOverride: ai.model,
        speed: streamingSpeed,
      },
      (chunk: string) => {
        this.dispatch(updateStreamingContent({ messageId: aiMessage.id, chunk }));
        try {
          if (RecordController.isActive()) {
            RecordController.recordAssistantChunk(ai.provider, chunk);
          }
        } catch {
          /* noop */
        }
      },
      (finalChunk: string) => {
        streamedContent = finalChunk;
        finalContent = finalChunk;
        this.dispatch(endStreaming({ messageId: aiMessage.id, finalContent: finalChunk }));
        this.dispatch(updateMessage({ id: aiMessage.id, content: finalChunk }));
      },
      async (error: Error) => {
        this.dispatch(streamingError({ messageId: aiMessage.id, error: error.message }));
        const fallbackContent = await this.handleStreamingFallback({
          ai,
          prompt,
          conversationContext,
          resumptionContext,
          attachments,
          expert,
          aiMessageId: aiMessage.id,
          originalError: error,
          updateStreamContent: (content: string) => {
            streamedContent = content;
          },
        });
        if (typeof fallbackContent === 'string') {
          finalContent = fallbackContent;
        }
      },
      (event: unknown) => {
        try {
          const record = event as Record<string, unknown>;
          const type = String(record?.type || '');
          if (type.includes('output_image')) {
            const imageRecord = record as {
              image?: { url?: string; b64?: string; data?: string };
              delta?: { image?: { url?: string; b64?: string; data?: string } };
              image_url?: string;
            };
            const imageUrl = imageRecord?.image?.url || imageRecord?.delta?.image?.url || imageRecord?.image_url;
            const imageB64 = imageRecord?.image?.b64 || imageRecord?.delta?.image?.b64 || imageRecord?.image?.data || imageRecord?.delta?.image?.data;
            const markdown = imageUrl
              ? `\n\n![image](${imageUrl})\n\n`
              : imageB64
                ? `\n\n![image](data:image/png;base64,${imageB64})\n\n`
                : '\n\n[image content]\n\n';
            this.dispatch(updateStreamingContent({ messageId: aiMessage.id, chunk: markdown }));
            try {
              if (RecordController.isActive()) {
                RecordController.recordImageMarkdown(markdown);
              }
            } catch {
              /* noop */
            }
          }

          if (type.includes('tool')) {
            const name = (record as { tool?: { name?: string }; name?: string }).tool?.name
              || (record as { name?: string }).name
              || 'tool';
            const args = (record as { tool?: { arguments?: unknown }; arguments?: unknown; params?: unknown; parameters?: unknown }).tool?.arguments
              || (record as { arguments?: unknown }).arguments
              || (record as { params?: unknown }).params
              || (record as { parameters?: unknown }).parameters;
            const snippet = '```json\n' + JSON.stringify(args, null, 2).slice(0, 400) + '\n```';
            this.dispatch(updateStreamingContent({ messageId: aiMessage.id, chunk: `\n\n[${name} call]\n${snippet}\n` }));
          }
        } catch {
          /* noop */
        }
      }
    );

    const resolvedContent = finalContent || streamedContent;
    const completedMessage: Message = {
      ...aiMessage,
      content: resolvedContent,
    };

    return completedMessage;
  }

  private async handleNonStreamingResponse(options: {
    ai: AI;
    personality?: ReturnType<typeof getPersonality>;
    prompt: string;
    conversationContext: ReturnType<typeof ChatService.buildConversationContext>;
    resumptionContext?: ResumptionContext;
    attachments?: MessageAttachment[];
    expert?: { enabled?: boolean; parameters?: ModelParameters } | undefined;
  }): Promise<Message> {
    const { ai, prompt, conversationContext, resumptionContext, attachments, expert } = options;

    if (expert?.enabled && expert.parameters) {
      try {
        const adapter = this.aiService.getAdapter(ai.id);
        if (adapter) {
          adapter.config.parameters = expert.parameters;
        }
      } catch {
        /* noop */
      }
    }

    const responseStart = Date.now();
    const result = await this.aiService.sendMessage(
      ai.id,
      prompt,
      conversationContext.messages.slice(0, -1),
      conversationContext.isDebateMode,
      resumptionContext,
      attachments,
      ai.model
    );
    const responseTime = Date.now() - responseStart;

    const response = typeof result === 'string' ? result : result.response;
    const modelUsed = typeof result === 'string' ? ai.model : (result.modelUsed || ai.model);
    const metadata = typeof result === 'string' ? undefined : (result as Record<string, unknown>).metadata as { citations?: Array<{ index: number; url: string; title?: string; snippet?: string }> } | undefined;

    const aiMessage = ChatService.createAIMessage(ai, response, {
      modelUsed,
      responseTime,
      citations: metadata?.citations,
    });
    this.dispatch(addMessage(aiMessage));

    try {
      if (RecordController.isActive()) {
        RecordController.recordAssistantMessage(ai.provider, response);
      }
    } catch {
      /* noop */
    }
    return aiMessage;
  }

  private async handleStreamingFallback(options: {
    ai: AI;
    prompt: string;
    conversationContext: ReturnType<typeof ChatService.buildConversationContext>;
    resumptionContext?: ResumptionContext;
    attachments?: MessageAttachment[];
    expert?: { enabled?: boolean; parameters?: ModelParameters } | undefined;
    aiMessageId: string;
    originalError: Error;
    updateStreamContent: (content: string) => void;
  }): Promise<string | null> {
    const { ai, prompt, conversationContext, resumptionContext, attachments, expert, aiMessageId, originalError, updateStreamContent } = options;

    const message = originalError.message || '';
    const requiresVerification = message.includes('organization must be verified')
      || message.includes('Streaming requires organization verification')
      || message.includes('Verify Organization');
    const isOverloaded = message.includes('overload')
      || message.includes('Overloaded')
      || message.includes('temporarily busy')
      || message.includes('rate limit');

    if (requiresVerification) {
      this.dispatch(setProviderVerificationError({ providerId: ai.id, hasError: true }));
    }

    if (!requiresVerification && !isOverloaded) {
      return null;
    }

    try {
      if (expert?.enabled && expert.parameters) {
        try {
          const fallbackAdapter = this.aiService.getAdapter(ai.id);
          if (fallbackAdapter) {
            fallbackAdapter.config.parameters = expert.parameters;
          }
        } catch {
          /* noop */
        }
      }

      const result = await this.aiService.sendMessage(
        ai.id,
        prompt,
        conversationContext.messages.slice(0, -1),
        conversationContext.isDebateMode,
        resumptionContext,
        attachments,
        ai.model
      );

      const response = typeof result === 'string' ? result : result.response;
      this.dispatch(clearStreamingMessage(aiMessageId));
      this.dispatch(updateMessage({ id: aiMessageId, content: response }));
      updateStreamContent(response);

      try {
        if (RecordController.isActive()) {
          RecordController.recordAssistantMessage(ai.provider, response);
        }
      } catch {
        /* noop */
      }
      return response;
    } catch (fallbackError) {
      const errorMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      const userMessage = errorMsg.includes('Overloaded') || errorMsg.includes('overload')
        ? `${ai.name} is currently overloaded. Please try again in a few moments.`
        : `Failed to get response from ${ai.name}: ${errorMsg}`;

      this.dispatch(updateMessage({ id: aiMessageId, content: userMessage }));
      this.dispatch(streamingError({ messageId: aiMessageId, error: userMessage }));
      updateStreamContent(userMessage);
      return userMessage;
    }
  }

  private getResponders(mentions: string[], isDemo: boolean): AI[] {
    const participants = this.session?.selectedAIs || [];
    if (participants.length === 0) {
      return [];
    }

    const normalizedMentions = mentions.map(m => m.toLowerCase());

    if (normalizedMentions.length > 0) {
      return participants
        .filter(ai => normalizedMentions.includes(ai.name.toLowerCase()))
        .slice(0, HOME_CONSTANTS.MAX_AIS_FOR_CHAT);
    }

    const rotated = this.rotateParticipants(participants);
    let responders = rotated.slice(0, HOME_CONSTANTS.MAX_AIS_FOR_CHAT);

    if (isDemo) {
      const scriptedProviders = getCurrentTurnProviders().map(provider => provider.toLowerCase());
      if (scriptedProviders.length > 0) {
        const orderMap = new Map(scriptedProviders.map((provider, idx) => [provider, idx]));
        const scriptedSet = new Set(scriptedProviders);
        const filtered = responders.filter(ai => scriptedSet.has(ai.provider.toLowerCase()));
        if (filtered.length > 0) {
          responders = filtered.sort((a, b) => (orderMap.get(a.provider.toLowerCase()) ?? 99) - (orderMap.get(b.provider.toLowerCase()) ?? 99));
        } else {
          const fallback = rotated.filter(ai => scriptedSet.has(ai.provider.toLowerCase()))
            .sort((a, b) => (orderMap.get(a.provider.toLowerCase()) ?? 99) - (orderMap.get(b.provider.toLowerCase()) ?? 99));
          if (fallback.length > 0) {
            responders = fallback.slice(0, HOME_CONSTANTS.MAX_AIS_FOR_CHAT);
          }
        }
      }
    }

    return responders;
  }

  private rotateParticipants(participants: AI[]): AI[] {
    if (participants.length <= 1) {
      return participants;
    }

    const startIndex = this.nextSpeakerIndex % participants.length;
    const rotated = participants.slice(startIndex).concat(participants.slice(0, startIndex));
    this.nextSpeakerIndex = (startIndex + 1) % participants.length;
    return rotated;
  }

  private handleAdapterError(ai: AI): void {
    const errorMessage = ChatService.createErrorMessage(ai, `No adapter found for ${ai.name}`);
    this.dispatch(addMessage(errorMessage));
  }

  private async sleep(duration: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, duration));
  }
}
