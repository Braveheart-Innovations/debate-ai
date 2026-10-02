import { AppDispatch, addMessage, setTypingAI, updateMessage } from '@/store';
import {
  startStreaming,
  endStreaming,
  streamingError,
  clearStreamingMessage,
  setProviderVerificationError,
} from '@/store/streamingSlice';
import { ChatService } from './ChatService';
import { HOME_CONSTANTS } from '@/config/homeConstants';
import { getPersonality, PersonalityOption } from '@/config/personalities';
import { resolveProviderModelId, supportsWebSearch } from '@/config/modelConfigs';
import { getExpertOverrides } from '@/utils/expertMode';
import { ensureAnswerContent } from '@/utils/citationUtils';
import { buildGroupTurnPrompt, stripLeadingSelfLabel } from '@/lib/groupChat';
import { getStreamingService, isStreamInterruptedError } from '@/services/streaming/StreamingService';
import {
  appendStreamingContent,
  clearStreamingContent,
  completeStreamingContent,
  failStreamingContent,
  startStreamingContent,
} from '@/services/streaming/StreamingContentStore';
import { RecordController } from '@/services/demo/RecordController';
import { getCurrentTurnProviders, markProviderComplete } from '@/services/demo/DemoPlaybackRouter';
import { ErrorService } from '@/services/errors/ErrorService';
import { buildPersonalityRuntime, mergeRuntimeModelParameters, type PersonalityRuntime } from '@/services/personality';
import { AppError } from '@/errors/types/AppError';
import { ErrorCode } from '@/errors/codes/ErrorCodes';
import type { AIService, ResumptionContext } from '@/services/aiAdapter';
import type { GroupChatContext, StreamFinishReason } from '@/services/ai/types/adapter.types';
import type { AI, ChatSession, Message, MessageAttachment, ModelParameters } from '@/types';

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
  /** Optional pre-merged personalities from context (includes user customizations) */
  mergedPersonalities?: Record<string, PersonalityOption>;
  selectedModels: Record<string, string>;
  apiKeys: Record<string, unknown>;
  expertModeConfigs: Record<string, unknown>;
  streamingPreferences?: Record<string, StreamingPreferenceState | undefined>;
  globalStreamingEnabled?: boolean;
  allowStreaming: boolean;
  isDemo: boolean;
}

type TurnSettings = Pick<
  ProcessUserMessageParams,
  | 'aiPersonalities'
  | 'mergedPersonalities'
  | 'selectedModels'
  | 'apiKeys'
  | 'expertModeConfigs'
  | 'streamingPreferences'
  | 'globalStreamingEnabled'
  | 'allowStreaming'
  | 'isDemo'
>;

export interface ContinueResponseParams extends TurnSettings {
  /** The cut-off AI reply to continue. */
  messageId: string;
  /** Session messages as stored, including the cut-off reply. */
  messages: Message[];
}

type ChatAdapter = NonNullable<ReturnType<AIService['getAdapter']>>;
type ExpertOverrides = { enabled?: boolean; parameters?: Partial<ModelParameters>; model?: string } | undefined;
type MessageLifecycle = NonNullable<NonNullable<Message['metadata']>['lifecycle']>;

interface TurnTarget {
  aiForTurn: AI;
  adapter: ChatAdapter;
  shouldStream: boolean;
  webSearchEnabled: boolean;
}

interface TurnRuntime {
  personalityId: string;
  runtime: PersonalityRuntime;
  expert: ExpertOverrides;
  runtimeParameters: Partial<ModelParameters> | undefined;
}

// A reply that stopped at the provider's output token limit keeps its text and
// is marked unfinished: it stays out of other AIs' context and can be continued.
const truncatedLifecycle = (content: string): MessageLifecycle => ({
  status: 'truncated',
  reason: 'length',
  partial: content.trim().length > 0,
  retryable: true,
});

export const CONTINUE_PROMPT = 'Your previous reply was cut off at the response length limit. Continue it exactly where it stopped, mid-sentence if needed. Do not repeat anything you already wrote, and do not add a preamble or summary.';
export const RESTART_PROMPT = 'Your previous reply hit the response length limit before any answer text. Answer my last message again, more concisely.';

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
      throw new AppError({
        code: ErrorCode.APP_SESSION_NOT_FOUND,
        message: 'ChatOrchestrator: no active session',
        userMessage: 'No active chat session. Please start a new chat.',
        recoverable: true,
      });
    }

    const {
      userMessage,
      existingMessages,
      mentions,
      enrichedPrompt,
      attachments,
      resumptionContext: initialResumption,
      apiKeys,
      isDemo,
    } = params;
    const settings: TurnSettings = params;

    let resumptionContext = initialResumption;
    const responders = this.getResponders(mentions, isDemo);
    if (responders.length === 0) {
      return;
    }

    // Every responder gets the same prior-round history (speaker attribution happens in the
    // adapter) plus a turn prompt carrying this round's transcript so far.
    const history = existingMessages;
    const participantNames = this.session.selectedAIs.map(participant => participant.name);
    const isGroupChat = participantNames.length > 1;
    const responderNames = responders.map(responder => responder.name);
    const userContent = enrichedPrompt || userMessage.content;
    const roundReplies: Message[] = [];

    for (const ai of responders) {
      const target = await this.resolveTurnTarget(ai, settings);
      if (!target) {
        continue;
      }
      const { aiForTurn, adapter, shouldStream, webSearchEnabled } = target;

      if (!shouldStream) {
        this.dispatch(setTypingAI({ ai: ai.name, isTyping: true }));
      }

      try {
        await this.sleep(ChatService.calculateTypingDelay());

        const { personalityId, runtime, expert, runtimeParameters } = this.buildTurnRuntime(ai, aiForTurn, settings);

        const groupChat: GroupChatContext | undefined = isGroupChat
          ? { selfName: ai.name, participants: participantNames }
          : undefined;
        const promptForAI = groupChat
          ? buildGroupTurnPrompt({
              userMessage: userContent,
              roundReplies: roundReplies.map(reply => ({ sender: reply.sender, content: reply.content })),
              selfName: ai.name,
              responderNames,
            })
          : userContent;
        // Shared adapters may carry state from a Debate or a previous chat lineup.
        adapter.config.isDebateMode = false;
        adapter.config.groupChat = groupChat;

        await this.logPromptDebug('chat-turn', {
          ai: aiForTurn,
          personalityId,
          runtime,
          adapter,
          prompt: promptForAI,
        });

        // Send attachments to ALL AIs so each has full context
        const aiAttachments = attachments;

        const aiMessage = shouldStream
          ? await this.handleStreamingResponse({
              ai: aiForTurn,
              runtime,
              prompt: promptForAI,
              history,
              groupChat,
              resumptionContext,
              attachments: aiAttachments,
              apiKey: isDemo ? 'demo' : await this.getExecutionApiKey(ai.provider, apiKeys),
              expert,
              runtimeParameters,
              webSearchEnabled,
            })
          : await this.handleNonStreamingResponse({
              ai: aiForTurn,
              runtime,
              prompt: promptForAI,
              history,
              groupChat,
              resumptionContext,
              attachments: aiAttachments,
              expert,
              runtimeParameters,
              webSearchEnabled,
            });

        if (!aiMessage.metadata?.lifecycle) {
          roundReplies.push(aiMessage);
        }
        resumptionContext = undefined;
      } catch (error) {
        // Use ErrorService for centralized error handling
        const appError = ErrorService.handleError(error, {
          feature: 'chat',
          showToast: true,
          context: { provider: ai.provider, aiName: ai.name },
        });
        const errorMessage = ChatService.createErrorMessage(ai, appError);
        this.dispatch(addMessage(errorMessage));
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
    runtime: PersonalityRuntime;
    prompt: string;
    history: Message[];
    groupChat?: GroupChatContext;
    resumptionContext?: ResumptionContext;
    attachments?: MessageAttachment[];
    apiKey?: string;
    expert?: { enabled?: boolean; parameters?: Partial<ModelParameters> } | undefined;
    runtimeParameters?: Partial<ModelParameters> | undefined;
    webSearchEnabled?: boolean;
  }): Promise<Message> {
    const {
      ai,
      runtime,
      prompt,
      history,
      groupChat,
      resumptionContext,
      attachments,
      apiKey,
      expert,
      runtimeParameters,
      webSearchEnabled,
    } = options;

    if (!apiKey) {
      throw new AppError({
        code: ErrorCode.VALIDATION_API_KEY_INVALID,
        message: `No API key configured for ${ai.provider}`,
        userMessage: `Please add your API key for ${ai.provider} in Settings.`,
        recoverable: true,
        context: { provider: ai.provider },
      });
    }

    const aiMessage = ChatService.createAIMessage(ai, '', {
      modelUsed: ai.model,
      responseTime: 0,
      webSearchEnabled,
    });
    this.dispatch(addMessage(aiMessage));
    startStreamingContent({ messageId: aiMessage.id, aiProvider: ai.id });
    this.dispatch(startStreaming({ messageId: aiMessage.id, aiProvider: ai.id }));

    let streamedContent = '';
    let finalContent = '';
    let capturedCitations: Array<{ index: number; url: string; title?: string; snippet?: string }> | undefined;
    let lifecycle: NonNullable<Message['metadata']>['lifecycle'];
    let finishReason: StreamFinishReason | undefined;

    await this.streamingService.streamResponse(
      {
        messageId: aiMessage.id,
        adapterConfig: {
          provider: ai.provider,
          identityId: ai.id,
          apiKey,
          model: ai.model,
          personality: runtime.personalityConfig,
          parameters: runtimeParameters,
          isDebateMode: false,
          webSearchEnabled,
          groupChat,
        },
        message: prompt,
        conversationHistory: history,
        resumptionContext,
        attachments,
        modelOverride: ai.model,
      },
      (chunk: string) => {
        streamedContent += chunk;
        appendStreamingContent(aiMessage.id, chunk);
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
        completeStreamingContent(aiMessage.id, finalChunk);
        this.dispatch(endStreaming({ messageId: aiMessage.id, finalContent: finalChunk }));
        this.dispatch(updateMessage({ id: aiMessage.id, content: finalChunk }));
      },
      async (error: Error) => {
        if (isStreamInterruptedError(error)) {
          const partialContent = streamedContent.trim();
          const interruptedContent = partialContent.length > 0
            ? `${partialContent}\n\n_Response ${error.reason === 'interrupted' ? 'paused when the app backgrounded' : 'stopped'}. Retry when ready._`
            : `Response ${error.reason === 'interrupted' ? 'paused when the app backgrounded' : 'stopped'}. Retry when ready.`;
          failStreamingContent(aiMessage.id, error.message, error.reason);
          this.dispatch(streamingError({ messageId: aiMessage.id, error: error.message }));
          this.dispatch(updateMessage({
            id: aiMessage.id,
            content: interruptedContent,
            metadata: {
              lifecycle: {
                status: error.reason,
                reason: error.message,
                interruptedAt: Date.now(),
                partial: partialContent.length > 0,
              },
            },
          }));
          finalContent = interruptedContent;
          lifecycle = {
            status: error.reason,
            reason: error.message,
            interruptedAt: Date.now(),
            partial: partialContent.length > 0,
          };
          return;
        }

        failStreamingContent(aiMessage.id, error.message);
        this.dispatch(streamingError({ messageId: aiMessage.id, error: error.message }));
        const fallbackContent = await this.handleStreamingFallback({
          ai,
          prompt,
          history,
          resumptionContext,
          attachments,
          expert,
          runtimeParameters,
          aiMessageId: aiMessage.id,
          originalError: error,
          updateStreamContent: (content: string) => {
            streamedContent = content;
          },
        });
        if (fallbackContent) {
          finalContent = fallbackContent.content;
          if (fallbackContent.failed) {
            lifecycle = { status: 'failed', reason: error.message, partial: false, retryable: false };
          }
        } else {
          lifecycle = { status: 'failed', reason: error.message, partial: false, retryable: false };
        }
      },
      (event: unknown) => {
        try {
          const record = event as Record<string, unknown>;
          const type = String(record?.type || '');

          if (type === 'finish') {
            finishReason = record.reason as StreamFinishReason | undefined;
          }

          // Handle citations event from Perplexity and other providers
          if (type === 'citations') {
            const citations = (record as { citations?: Array<{ index: number; url: string; title?: string; snippet?: string }> }).citations;
            if (citations && citations.length > 0) {
              capturedCitations = citations;
            }
          }

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
            appendStreamingContent(aiMessage.id, markdown);
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
            appendStreamingContent(aiMessage.id, `\n\n[${name} call]\n${snippet}\n`);
          }
        } catch {
          /* noop */
        }
      }
    );

    const rawContent = finalContent || streamedContent;
    const normalizedAnswer = ensureAnswerContent(
      groupChat ? stripLeadingSelfLabel(rawContent, ai.name) : rawContent,
      capturedCitations,
      ai.name
    );
    if (!lifecycle && finishReason === 'length') {
      lifecycle = truncatedLifecycle(rawContent);
    }
    const completedMessage: Message = {
      ...aiMessage,
      content: normalizedAnswer.content,
      metadata: {
        ...aiMessage.metadata,
        webSearchEnabled,
        citations: normalizedAnswer.citations,
        ...(lifecycle ? { lifecycle } : {}),
      },
    };

    // Update the stored message when normalization changed it, citations arrived, or the turn
    // failed or was cut off (lifecycle keeps the turn out of later AIs' context).
    if (normalizedAnswer.content !== rawContent
      || (normalizedAnswer.citations && normalizedAnswer.citations.length > 0)
      || lifecycle) {
      this.dispatch(updateMessage({
        id: aiMessage.id,
        content: normalizedAnswer.content,
        metadata: completedMessage.metadata,
      }));
    }

    return completedMessage;
  }

  private async handleNonStreamingResponse(options: {
    ai: AI;
    runtime: PersonalityRuntime;
    prompt: string;
    history: Message[];
    groupChat?: GroupChatContext;
    resumptionContext?: ResumptionContext;
    attachments?: MessageAttachment[];
    expert?: { enabled?: boolean; parameters?: Partial<ModelParameters> } | undefined;
    runtimeParameters?: Partial<ModelParameters> | undefined;
    webSearchEnabled?: boolean;
  }): Promise<Message> {
    const { ai, runtime, prompt, history, groupChat, resumptionContext, attachments, runtimeParameters, webSearchEnabled } = options;

    if (runtimeParameters) {
      try {
        const adapter = this.aiService.getAdapter(ai.id);
        if (adapter) {
          adapter.config.parameters = runtimeParameters;
        }
      } catch {
        /* noop */
      }
    }

    const responseStart = Date.now();
    const result = await this.aiService.sendMessage(
      ai.id,
      prompt,
      history,
      runtime.personalityConfig || false,
      resumptionContext,
      attachments,
      ai.model
    );
    const responseTime = Date.now() - responseStart;

    const response = typeof result === 'string' ? result : result.response;
    const modelUsed = typeof result === 'string' ? ai.model : (result.modelUsed || ai.model);
    const metadata = typeof result === 'string' ? undefined : (result as Record<string, unknown>).metadata as { citations?: Array<{ index: number; url: string; title?: string; snippet?: string }> } | undefined;
    const answerContent = groupChat
      ? stripLeadingSelfLabel(response, ai.name)
      : response;
    const normalizedAnswer = ensureAnswerContent(answerContent, metadata?.citations, ai.name);

    const createdMessage = ChatService.createAIMessage(ai, normalizedAnswer.content, {
      modelUsed,
      responseTime,
      webSearchEnabled,
      citations: normalizedAnswer.citations,
    });
    const finishReason = typeof result === 'string' ? undefined : result.finishReason;
    const aiMessage: Message = finishReason === 'length'
      ? { ...createdMessage, metadata: { ...createdMessage.metadata, lifecycle: truncatedLifecycle(response) } }
      : createdMessage;
    this.dispatch(addMessage(aiMessage));

    try {
      if (RecordController.isActive()) {
            RecordController.recordAssistantMessage(ai.provider, normalizedAnswer.content);
      }
    } catch {
      /* noop */
    }
    return aiMessage;
  }

  private async handleStreamingFallback(options: {
    ai: AI;
    prompt: string;
    history: Message[];
    resumptionContext?: ResumptionContext;
    attachments?: MessageAttachment[];
    expert?: { enabled?: boolean; parameters?: Partial<ModelParameters> } | undefined;
    runtimeParameters?: Partial<ModelParameters> | undefined;
    aiMessageId: string;
    originalError: Error;
    updateStreamContent: (content: string) => void;
  }): Promise<{ content: string; failed: boolean } | null> {
    const { ai, prompt, history, resumptionContext, attachments, runtimeParameters, aiMessageId, originalError, updateStreamContent } = options;

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
      if (runtimeParameters) {
        try {
          const fallbackAdapter = this.aiService.getAdapter(ai.id);
          if (fallbackAdapter) {
            fallbackAdapter.config.parameters = runtimeParameters;
          }
        } catch {
          /* noop */
        }
      }

      const result = await this.aiService.sendMessage(
        ai.id,
        prompt,
        history,
        false,
        resumptionContext,
        attachments,
        ai.model
      );

      const response = typeof result === 'string' ? result : result.response;
      clearStreamingContent(aiMessageId);
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
      return { content: response, failed: false };
    } catch (fallbackError) {
      // Use ErrorService for centralized error handling (silent - no toast since we're already showing message in chat)
      const appError = ErrorService.handleError(fallbackError, {
        feature: 'chat',
        showToast: false,
        context: { provider: ai.provider, aiName: ai.name, isFallback: true },
      });
      const userMessage = appError.userMessage || `Failed to get response from ${ai.name}`;

      this.dispatch(updateMessage({ id: aiMessageId, content: userMessage }));
      failStreamingContent(aiMessageId, userMessage);
      this.dispatch(streamingError({ messageId: aiMessageId, error: userMessage }));
      updateStreamContent(userMessage);
      return { content: userMessage, failed: true };
    }
  }

  /**
   * Continue a reply that stopped at the provider's output token limit. The same AI gets the
   * conversation up to and including its partial reply and is asked to resume where it stopped;
   * the continuation is appended to the same message. A reply that is cut off again stays
   * 'truncated' so it can be continued again.
   */
  async continueResponse(params: ContinueResponseParams): Promise<void> {
    if (!this.session) {
      throw new AppError({
        code: ErrorCode.APP_SESSION_NOT_FOUND,
        message: 'ChatOrchestrator: no active session',
        userMessage: 'No active chat session. Please start a new chat.',
        recoverable: true,
      });
    }

    const { messageId, messages, apiKeys, isDemo } = params;
    const targetIndex = messages.findIndex(message => message.id === messageId);
    const targetMessage = targetIndex >= 0 ? messages[targetIndex] : undefined;
    if (!targetMessage || targetMessage.metadata?.lifecycle?.status !== 'truncated') {
      return;
    }
    const ai = this.session.selectedAIs.find(participant => participant.id === targetMessage.metadata?.aiId);
    if (!ai) {
      return;
    }

    const target = await this.resolveTurnTarget(ai, params);
    if (!target) {
      return;
    }
    const { aiForTurn, adapter, shouldStream } = target;
    const { runtime, runtimeParameters } = this.buildTurnRuntime(ai, aiForTurn, params);

    const participantNames = this.session.selectedAIs.map(participant => participant.name);
    const groupChat: GroupChatContext | undefined = participantNames.length > 1
      ? { selfName: ai.name, participants: participantNames }
      : undefined;
    adapter.config.isDebateMode = false;
    adapter.config.groupChat = groupChat;

    const partial = targetMessage.content;
    const hasPartial = partial.trim().length > 0;
    // The partial reply joins the history as this AI's own turn (without the lifecycle tag that
    // otherwise keeps it out of context). An empty reply is dropped and the question re-asked.
    const history = [
      ...messages.slice(0, targetIndex),
      ...(hasPartial ? [{ ...targetMessage, metadata: { ...targetMessage.metadata, lifecycle: undefined } }] : []),
    ];
    const prompt = hasPartial ? CONTINUE_PROMPT : RESTART_PROMPT;

    if (!shouldStream) {
      this.dispatch(setTypingAI({ ai: ai.name, isTyping: true }));
    }

    let continuation = '';
    let finishReason: StreamFinishReason | undefined;
    try {
      if (shouldStream) {
        const apiKey = isDemo ? 'demo' : await this.getExecutionApiKey(ai.provider, apiKeys);
        if (!apiKey) {
          throw new AppError({
            code: ErrorCode.VALIDATION_API_KEY_INVALID,
            message: `No API key configured for ${ai.provider}`,
            userMessage: `Please add your API key for ${ai.provider} in Settings.`,
            recoverable: true,
            context: { provider: ai.provider },
          });
        }
        startStreamingContent({ messageId, aiProvider: ai.id });
        if (hasPartial) {
          appendStreamingContent(messageId, partial);
        }
        this.dispatch(startStreaming({ messageId, aiProvider: ai.id }));

        let streamError: Error | undefined;
        await this.streamingService.streamResponse(
          {
            messageId,
            adapterConfig: {
              provider: ai.provider,
              identityId: ai.id,
              apiKey,
              model: aiForTurn.model,
              personality: runtime.personalityConfig,
              parameters: runtimeParameters,
              isDebateMode: false,
              // The reply's sources came from the first pass; a second search would
              // number its citations from [1] again and clash with them.
              webSearchEnabled: false,
              groupChat,
            },
            message: prompt,
            conversationHistory: history,
            modelOverride: aiForTurn.model,
          },
          (chunk: string) => {
            continuation += chunk;
            appendStreamingContent(messageId, chunk);
          },
          (finalChunk: string) => {
            continuation = finalChunk;
          },
          (error: Error) => {
            streamError = error;
          },
          (event: unknown) => {
            const record = event as Record<string, unknown> | null;
            if (record?.type === 'finish') {
              finishReason = record.reason as StreamFinishReason | undefined;
            }
          }
        );
        // A stopped or failed continuation is still unfinished: keep what arrived and leave the
        // reply continuable.
        if (streamError) {
          if (!isStreamInterruptedError(streamError)) {
            ErrorService.handleError(streamError, {
              feature: 'chat',
              showToast: true,
              context: { provider: ai.provider, aiName: ai.name, isContinuation: true },
            });
          }
          finishReason = 'length';
        }
      } else {
        if (runtimeParameters) {
          adapter.config.parameters = runtimeParameters;
        }
        const result = await this.aiService.sendMessage(
          ai.id,
          prompt,
          history,
          runtime.personalityConfig || false,
          undefined,
          undefined,
          aiForTurn.model
        );
        continuation = typeof result === 'string' ? result : result.response;
        finishReason = typeof result === 'string' ? undefined : result.finishReason;
      }
    } catch (error) {
      ErrorService.handleError(error, {
        feature: 'chat',
        showToast: true,
        context: { provider: ai.provider, aiName: ai.name, isContinuation: true },
      });
      finishReason = 'length';
    } finally {
      if (!shouldStream) {
        this.dispatch(setTypingAI({ ai: ai.name, isTyping: false }));
      }
    }

    const cleanContinuation = groupChat ? stripLeadingSelfLabel(continuation, ai.name) : continuation;
    const content = hasPartial ? `${partial}${cleanContinuation}` : cleanContinuation;
    const stillTruncated = finishReason === 'length';
    if (shouldStream) {
      // Hand display back to the stored message so the bubble shows the final content and the
      // cut-off note (if any) rather than a live stream or a stream error.
      clearStreamingContent(messageId);
      this.dispatch(clearStreamingMessage(messageId));
    }
    this.dispatch(updateMessage({
      id: messageId,
      content,
      metadata: { lifecycle: stillTruncated ? truncatedLifecycle(content) : undefined },
    }));
  }

  private async resolveTurnTarget(ai: AI, settings: TurnSettings): Promise<TurnTarget | null> {
    const effectiveModel = resolveProviderModelId(
      ai.provider,
      settings.selectedModels[ai.id] || ai.model
    ) || ai.model;
    const aiForTurn: AI = { ...ai, model: effectiveModel };
    // Per-AI, capability-driven: each model that supports web search uses
    // it; the rest of the lineup is unaffected.
    const webSearchEnabled = supportsWebSearch(ai.provider, effectiveModel);
    const adapter = typeof this.aiService.ensureAdapter === 'function'
      ? await this.aiService.ensureAdapter(ai.id, ai.provider, effectiveModel)
      : this.aiService.getAdapter(ai.id);
    if (!adapter) {
      this.handleAdapterError(ai);
      return null;
    }

    const providerPreference = settings.streamingPreferences?.[ai.id];
    const providerStreamingEnabled = providerPreference?.enabled ?? true;
    const streamingEnabled = settings.allowStreaming
      && (settings.globalStreamingEnabled ?? true)
      && providerStreamingEnabled;
    const shouldStream = streamingEnabled && adapter.getCapabilities().streaming;

    return { aiForTurn, adapter, shouldStream, webSearchEnabled };
  }

  private buildTurnRuntime(ai: AI, aiForTurn: AI, settings: TurnSettings): TurnRuntime {
    const personalityId = settings.aiPersonalities[ai.id] || 'default';
    // Use pre-merged personality from context if available, otherwise fall back to base.
    // Default intentionally resolves to undefined runtime config so reused adapters are cleared.
    const personality = settings.mergedPersonalities?.[personalityId] || getPersonality(personalityId);
    const runtime = buildPersonalityRuntime({
      mode: 'chat',
      personality,
      ai: aiForTurn,
    });
    this.aiService.setPersonality(ai.id, runtime.personalityConfig);

    const expert = getExpertOverrides(
      settings.expertModeConfigs as unknown as Record<string, { enabled?: boolean; parameters?: ModelParameters; model?: string }>,
      ai.provider
    ) as ExpertOverrides;
    const runtimeParameters = mergeRuntimeModelParameters(
      expert?.enabled,
      expert?.parameters,
      runtime.modelParameters,
      aiForTurn.parameters
    );

    return { personalityId, runtime, expert, runtimeParameters };
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
    const appError = new AppError({
      code: ErrorCode.APP_ADAPTER_NOT_FOUND,
      message: `No adapter found for ${ai.name}`,
      userMessage: `Unable to connect to ${ai.name}. The provider may not be configured properly.`,
      context: { provider: ai.provider, aiName: ai.name },
    });
    // Log via ErrorService (silent - we show in chat instead)
    ErrorService.handleSilent(appError, { provider: ai.provider });
    const errorMessage = ChatService.createErrorMessage(ai, appError);
    this.dispatch(addMessage(errorMessage));
  }

  private async sleep(duration: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, duration));
  }

  private async logPromptDebug(
    label: string,
    options: {
      ai: AI;
      personalityId: string;
      runtime: PersonalityRuntime;
      adapter?: { debugGetSystemPrompt?: () => string };
      prompt: string;
    }
  ): Promise<void> {
    try {
      const { PromptDebugLogger } = await import('../debug/PromptDebugLogger');
      PromptDebugLogger.logTurn(label, {
        aiId: options.ai.id,
        aiName: options.ai.name,
        model: options.ai.model,
        personalityId: options.personalityId,
        personalityName: options.runtime.debug.personalityName,
        systemPromptApplied: options.runtime.systemPrompt,
        systemPromptAdapter: options.adapter?.debugGetSystemPrompt?.(),
        userPrompt: options.prompt,
      });
    } catch {
      /* ignore debug log errors */
    }
  }

  private async getExecutionApiKey(
    provider: string,
    apiKeys: Record<string, unknown>
  ): Promise<string | undefined> {
    if (typeof this.aiService.getApiKey === 'function') {
      return await this.aiService.getApiKey(provider) || undefined;
    }

    const legacyValue = apiKeys[provider];
    return typeof legacyValue === 'string' ? legacyValue : undefined;
  }
}
