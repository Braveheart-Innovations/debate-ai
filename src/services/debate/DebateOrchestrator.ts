/**
 * DebateOrchestrator Service
 * Central service that orchestrates the entire debate flow
 * Coordinates between all other debate services and manages state transitions
 */

import { AI, Message, ChatSession, Citation, type DebateInterstitialKind, type DebateSpeechMetadata, type DebateVoiceConfig } from '../../types';
import { AIService } from '../aiAdapter';
import { DebateRulesEngine } from './DebateRulesEngine';
import { VotingService } from './VotingService';
import { DebatePromptBuilder } from './DebatePromptBuilder';
import { DEBATE_CONSTANTS } from '../../config/debateConstants';
import { UNIVERSAL_PERSONALITIES, getPersonality, PersonalityOption } from '../../config/personalities';
import { StorageService } from '../chat/StorageService';
import { store } from '../../store';
import { getStreamingService } from '../streaming/StreamingService';
import {
  type AudienceDecisionResult,
  type AudienceStance,
  type AudienceVoteStage,
  type DebateSideId,
  type OxfordAudienceQuestions,
  getFormat,
  getPresetForFormat,
  getPresetIdForRounds,
  type DebateFormatId,
  type FormatSpec,
  type MessageSpec,
  type PresetConfig,
} from '../../config/debate/formats';
import { getExpertOverrides } from '../../utils/expertMode';
import { ErrorService } from '@/services/errors/ErrorService';
import { AppError } from '@/errors/types/AppError';
import { ErrorCode } from '@/errors/codes/ErrorCodes';
import { mergeAvailabilitiesStrict } from '@/hooks/multimodal/useModalityAvailability';
import { resolveProviderModelId } from '@/config/modelConfigs';
import { buildPersonalityRuntime, mergeRuntimeModelParameters } from '@/services/personality';
import { applyDebateOutputTokenCap, getDebateSpeechLengthGuidance } from './debateSpeechLength';
import { DebateTurnRunner, type DebateTurnFailed } from './DebateTurnRunner';
import { createDebateInterstitialMessage } from './DebateInterstitialService';
import type {
  ActiveDebateSessionSnapshot,
  ActiveDebateVoteRecord,
} from '@/services/lifecycle/ActiveSessionPersistenceService';

export interface DebateSession {
  id: string;
  topic: string;
  participants: AI[];
  personalities: { [aiId: string]: string };
  /** Optional pre-merged personalities from context (includes user customizations) */
  mergedPersonalities?: Record<string, PersonalityOption>;
  startTime: number;
  status: DebateStatus;
  currentRound: number;
  messageCount: number;
  messageIndex: number;
  currentAIIndex: number;
  totalRounds: number;
  totalMessages: number;
  civility: 1 | 2 | 3 | 4 | 5;
  format: FormatSpec;
  preset: PresetConfig;
  presetId: string;
  stances: { [aiId: string]: 'pro' | 'con' };
  audienceResult?: AudienceDecisionResult;
  audienceQuestions?: OxfordAudienceQuestions;
  webSearchEnabled?: boolean; // Auto-enabled when both AIs support it
  voiceConfig?: DebateVoiceConfig;
}

export enum DebateStatus {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  ACTIVE = 'active',
  PAUSED_FOR_REVIEW = 'paused_for_review',
  VOTING_ROUND = 'voting_round',
  VOTING_OVERALL = 'voting_overall',
  COMPLETED = 'completed',
  ERROR = 'error',
}

export interface DebateError {
  type: 'rate_limit' | 'ai_error' | 'network_error' | 'validation_error';
  message: string;
  aiId?: string;
  retryable: boolean;
}

export interface DebateContinuationPrompt {
  title: string;
  message: string;
  buttonLabel: string;
  isFinalReview: boolean;
  completedMessageIndex: number;
  nextMessageIndex?: number;
  continueAction?: 'next_message' | 'vote' | 'end_debate' | 'retry_message' | 'audience_questions';
  retryMessageId?: string;
  voteRound?: number;
  isFinalRoundVote?: boolean;
}

interface PendingDebateContinuation extends DebateContinuationPrompt {
  messages: Message[];
}

export interface DebateAudienceQuestionsPrompt {
  title: string;
  message: string;
  completedMessageIndex: number;
  nextMessageIndex: number;
  affirmativeLabel: string;
  negativeLabel: string;
  required: true;
}

interface PendingAudienceQuestions extends DebateAudienceQuestionsPrompt {
  messages: Message[];
}

interface DebateRoleContext {
  sideLabel: string;
  sidePosition: 'FOR' | 'AGAINST';
  roleLabel: string;
  teammateNames: string[];
  opposingTeamNames: string[];
  primaryOpponent?: AI;
  roleBrief: string;
}

export interface DebateEvent {
  type:
    | 'message_added'
    | 'round_changed'
    | 'voting_started'
    | 'debate_ended'
    | 'error_occurred'
    | 'debate_started'
    | 'typing_started'
    | 'typing_stopped'
    | 'voting_completed'
    | 'stream_started'
    | 'stream_chunk'
    | 'stream_completed'
    | 'stream_error'
    | 'continuation_required'
    | 'audience_questions_requested'
    | 'audience_questions_submitted'
    | 'podcast_interstitial_added';
  data: Record<string, unknown>;
  timestamp: number;
}

export type DebateEventHandler = (event: DebateEvent) => void;

export class DebateOrchestrator {
  private session: DebateSession | null = null;
  private rulesEngine: DebateRulesEngine;
  private votingService: VotingService | null = null;
  private promptBuilder: DebatePromptBuilder;
  private aiService: AIService;
  private turnRunner: DebateTurnRunner = new DebateTurnRunner();
  private eventHandlers: DebateEventHandler[] = [];
  private timeouts: Map<string, NodeJS.Timeout> = new Map();
  private currentMessages: Message[] = [];
  private currentVoteIndex = 0;
  private currentAudienceVoteStage?: AudienceVoteStage;
  private pendingContinuation: PendingDebateContinuation | null = null;
  private pendingAudienceQuestions: PendingAudienceQuestions | null = null;
  
  constructor(aiService: AIService) {
    this.aiService = aiService;
    this.rulesEngine = new DebateRulesEngine();
    this.promptBuilder = new DebatePromptBuilder();
  }

  private getWebSearchEnabled(): boolean {
    return Boolean(this.session?.webSearchEnabled);
  }

  private applyWebSearchConfig(adapter?: { config?: { webSearchEnabled?: boolean } }): void {
    if (adapter?.config) {
      adapter.config.webSearchEnabled = this.getWebSearchEnabled();
    }
  }

  private getDebateConversationHistory(messages: Message[]): Message[] {
    const sessionStartTime = this.session?.startTime || 0;

    return messages.filter((message) => (
      message.timestamp >= sessionStartTime &&
      message.senderType === 'ai' &&
      Boolean(message.content.trim()) &&
      !message.metadata?.debateInterstitial
    ));
  }

  private async addDebateInterstitial(
    kind: DebateInterstitialKind,
    options: {
      completedMessageSpec?: MessageSpec;
      nextMessageSpec?: MessageSpec;
      votingLabel?: string;
      winnerName?: string;
      audienceResult?: AudienceDecisionResult;
    } = {}
  ): Promise<void> {
    if (!this.session?.voiceConfig?.podcast?.enabled) return;

    const message = await createDebateInterstitialMessage({
      aiService: this.aiService,
      session: this.session,
      kind,
      recentMcMessages: this.currentMessages
        .filter((message) => Boolean(message.metadata?.debateInterstitial))
        .slice(-3)
        .map((message) => message.content),
      ...options,
    });

    if (!message) return;
    this.emitEvent({
      type: 'message_added',
      data: { message },
      timestamp: Date.now(),
    });
    this.currentMessages = [...this.currentMessages, message];
    this.emitEvent({
      type: 'podcast_interstitial_added',
      data: {
        message,
        kind,
        flowStep: message.metadata?.debateInterstitial?.flowStep,
      },
      timestamp: Date.now(),
    });
  }

  private async addPodcastIntroInterstitial(): Promise<void> {
    if (!this.session) return;

    const introAlreadyExists = this.currentMessages.some((message) => (
      message.metadata?.debateInterstitial?.kind === 'intro'
    ));
    if (introAlreadyExists) return;

    await this.addDebateInterstitial('intro', {
      nextMessageSpec: this.session.preset.messages[0],
    });
  }

  private getRequiredParticipantCount(preset: PresetConfig): number {
    return (preset.teamSize || 1) * 2;
  }

  private getSideForParticipantIndex(index: number, preset: PresetConfig): DebateSideId {
    const teamSize = preset.teamSize || 1;
    if (teamSize <= 1) {
      return index === 0 ? 'aff' : 'neg';
    }
    return index % 2 === 0 ? 'aff' : 'neg';
  }

  private getParticipantIndexForMessage(messageSpec: MessageSpec): number {
    if (!this.session) return messageSpec.speaker === 'aff' ? 0 : 1;

    const teamSize = this.session.preset.teamSize || 1;
    if (teamSize <= 1) {
      return messageSpec.speaker === 'aff' ? 0 : 1;
    }

    const slot = Math.min(Math.max(messageSpec.speakerSlot ?? 0, 0), teamSize - 1);
    return (slot * 2) + (messageSpec.speaker === 'aff' ? 0 : 1);
  }

  private getTurnEventData(messageIndex: number, messageSpec: MessageSpec): Record<string, unknown> {
    return {
      messageIndex,
      phase: messageSpec.phase,
      messageLabel: messageSpec.label,
      cxRole: messageSpec.cxRole,
    };
  }

  private getSpeakerForMessage(messageIndex: number): { ai: AI; messageSpec: MessageSpec } | null {
    if (!this.session) return null;

    const messageSpec = this.session.preset.messages[messageIndex];
    if (!messageSpec) return null;

    const ai = this.session.participants[this.getParticipantIndexForMessage(messageSpec)];
    if (!ai) return null;

    return { ai, messageSpec };
  }

  private emitTypingStartedForMessage(messageIndex: number): void {
    const turn = this.getSpeakerForMessage(messageIndex);
    if (!turn) return;

    this.emitEvent({
      type: 'typing_started',
      data: {
        aiName: turn.ai.name,
        ...this.getTurnEventData(messageIndex, turn.messageSpec),
      },
      timestamp: Date.now(),
    });
  }

  private emitTypingStoppedForAI(ai: AI): void {
    this.emitEvent({
      type: 'typing_stopped',
      data: { aiName: ai.name },
      timestamp: Date.now(),
    });
  }

  private isPodcastModeEnabled(): boolean {
    return Boolean(this.session?.voiceConfig?.podcast?.enabled);
  }

  private getParticipantsForSide(side: DebateSideId): AI[] {
    if (!this.session) return [];
    const preset = this.session.preset;
    const teamSize = preset.teamSize || 1;
    if (teamSize <= 1) {
      return side === 'aff'
        ? this.session.participants.slice(0, 1)
        : this.session.participants.slice(1, 2);
    }

    return this.session.participants.filter((_, index) => (
      this.getSideForParticipantIndex(index, preset) === side
    ));
  }

  private getOpposingParticipant(aiIndex: number): AI | undefined {
    if (!this.session) return undefined;
    const currentSide = this.getSideForParticipantIndex(aiIndex, this.session.preset);
    const opposingSide: DebateSideId = currentSide === 'aff' ? 'neg' : 'aff';
    return this.getParticipantsForSide(opposingSide)[0];
  }

  private getSideLabel(side: DebateSideId): string {
    if (this.session?.format.id === 'oxford') {
      return side === 'aff' ? 'Affirmative' : 'Negative';
    }

    return side === 'aff' ? 'Affirmative' : 'Negative';
  }

  private getOrdinalLabel(value: number): string {
    const labels = ['First', 'Second', 'Third', 'Fourth'];
    return labels[value - 1] || `Speaker ${value}`;
  }

  private buildRoleContext(aiIndex: number, messageSpec: MessageSpec): DebateRoleContext {
    if (!this.session) {
      const fallbackSide = messageSpec.speaker;
      const fallbackSideLabel = fallbackSide === 'aff' ? 'Affirmative' : 'Negative';
      const fallbackPosition = fallbackSide === 'aff' ? 'FOR' : 'AGAINST';
      return {
        sideLabel: fallbackSideLabel,
        sidePosition: fallbackPosition,
        roleLabel: `${fallbackSideLabel} speaker`,
        teammateNames: [],
        opposingTeamNames: [],
        roleBrief: `Role brief: You are the ${fallbackSideLabel} speaker (${fallbackPosition}).`,
      };
    }

    const { participants, preset } = this.session;
    const currentAI = participants[aiIndex];
    const side = this.getSideForParticipantIndex(aiIndex, preset);
    const opposingSide: DebateSideId = side === 'aff' ? 'neg' : 'aff';
    const sideLabel = this.getSideLabel(side);
    const opposingSideLabel = this.getSideLabel(opposingSide);
    const sidePosition: 'FOR' | 'AGAINST' = side === 'aff' ? 'FOR' : 'AGAINST';
    const teamSize = preset.teamSize || 1;
    const speakerNumber = (messageSpec.speakerSlot ?? 0) + 1;
    const roleLabel = teamSize > 1
      ? `${this.getOrdinalLabel(speakerNumber)} ${sideLabel} speaker`
      : `${sideLabel} speaker`;
    const teammateNames = this.getParticipantsForSide(side)
      .filter(participant => participant.id !== currentAI?.id)
      .map(participant => participant.name);
    const opposingTeam = this.getParticipantsForSide(opposingSide);
    const opposingTeamNames = opposingTeam.map(participant => participant.name);
    const primaryOpponent = opposingTeam[0];
    const isAudienceVoteModel = preset.voteModel === 'audience_stance';

    const roleLines = [
      `Role brief: You are the ${roleLabel} for ${sideLabel} (${sidePosition}).`,
      teamSize > 1 && teammateNames.length > 0
        ? `Teammate${teammateNames.length === 1 ? '' : 's'}: ${teammateNames.join(', ')}.`
        : undefined,
      opposingTeamNames.length > 0
        ? `${teamSize > 1 ? 'Opposing team' : `Opposing ${opposingSideLabel} side`}: ${opposingTeamNames.join(', ')}.`
        : undefined,
      teamSize > 1
        ? 'Coordinate with your teammate by extending the shared team case instead of repeating it.'
        : undefined,
      isAudienceVoteModel
        ? 'Audience context: the user casts an opening stance before the first speech and a final vote after the closing speeches.'
        : undefined,
      `Current speech: ${messageSpec.label}.`,
    ].filter(Boolean);

    return {
      sideLabel,
      sidePosition,
      roleLabel,
      teammateNames,
      opposingTeamNames,
      primaryOpponent,
      roleBrief: roleLines.join('\n'),
    };
  }

  private getAudienceQuestionForMessage(messageSpec: MessageSpec): string | undefined {
    const target = messageSpec.audienceQuestionTarget;
    if (!target || !this.session?.audienceQuestions) return undefined;

    return this.session.audienceQuestions[target];
  }

  private buildAIResponseMetadata(
    ai: AI,
    modelUsed?: string,
    citations?: Citation[],
    debateSpeech?: DebateSpeechMetadata
  ): Message['metadata'] {
    const metadata: Message['metadata'] = {
      aiId: ai.id,
      providerId: ai.provider,
      webSearchEnabled: this.getWebSearchEnabled(),
    };

    if (modelUsed) {
      metadata.modelUsed = modelUsed;
    }

    if (citations && citations.length > 0) {
      metadata.citations = citations;
    }

    if (debateSpeech) {
      metadata.debateSpeech = debateSpeech;
    }

    return metadata;
  }

  private buildRetryableTurnFailureContent(aiName: string, partialContent?: string): string {
    const partial = partialContent?.trim();
    const retryNote = `${aiName} could not finish this turn. Retry the turn when you are ready.`;

    return partial ? `${partial}\n\n_${retryNote}_` : retryNote;
  }

  /**
   * Renders a failed turn as a paused, retryable (or blocked) card and surfaces the retry
   * continuation. This is the single place every failure mode from DebateTurnRunner is presented,
   * replacing the previously duplicated interrupted / fallback-failure / non-recoverable branches.
   */
  private emitFailedDebateTurn(
    result: DebateTurnFailed,
    ctx: {
      currentAI: AI;
      personalityName: string;
      messageId: string;
      messageIndex: number;
      phase: MessageSpec['phase'];
      messageSpec: MessageSpec;
      debateSpeech: DebateSpeechMetadata | undefined;
      turnMessages: Message[];
      useStreaming: boolean;
    }
  ): void {
    const { currentAI, personalityName, messageId, messageIndex, phase, messageSpec, debateSpeech, turnMessages, useStreaming } = ctx;
    const partial = result.partialText.trim();

    let content: string;
    let lifecycleStatus: 'interrupted' | 'cancelled' | 'failed' = 'failed';
    let lifecycleReason: string = result.detail;
    let title = 'Debate turn failed';
    let message = 'The provider could not finish this turn. Retry when you are ready.';

    switch (result.reason) {
      case 'length':
        content = this.buildRetryableTurnFailureContent(currentAI.name, partial);
        lifecycleStatus = 'interrupted';
        lifecycleReason = 'token_limit';
        title = 'Debate turn truncated';
        message = 'The response hit the length limit before it finished. Retry this turn when you are ready.';
        break;
      case 'content_filter':
        content = `${currentAI.name}'s response was blocked by the provider's content filter.`;
        lifecycleStatus = 'failed';
        lifecycleReason = 'content_filter';
        title = 'Response blocked';
        message = 'The provider blocked this response. Retry this turn when you are ready.';
        break;
      case 'cancelled':
        content = partial
          ? `${partial}\n\n_Response stopped. Retry this debate turn when ready._`
          : 'Response stopped. Retry this debate turn when ready.';
        lifecycleStatus = 'cancelled';
        lifecycleReason = result.detail || 'cancelled';
        title = 'Debate stopped';
        message = 'The active response was stopped. Retry this turn when you are ready.';
        break;
      case 'interrupted':
        content = partial
          ? `${partial}\n\n_Response interrupted before it finished. Retry this debate turn when ready._`
          : 'Response interrupted before it finished. Retry this debate turn when ready.';
        lifecycleStatus = 'interrupted';
        lifecycleReason = result.detail || 'app_backgrounded';
        title = 'Debate interrupted';
        message = 'The active response was interrupted. Retry this turn when you are ready.';
        break;
      case 'too_short':
      case 'empty':
      case 'provider_error':
      default:
        content = this.buildRetryableTurnFailureContent(currentAI.name, partial);
        break;
    }

    const lifecycle = {
      status: lifecycleStatus,
      reason: lifecycleReason,
      interruptedAt: Date.now(),
      partial: partial.length > 0,
      retryable: true,
    };

    const failedMessage: Message = {
      id: messageId,
      sender: `${currentAI.name} (${personalityName})`,
      senderType: 'ai',
      content,
      timestamp: Date.now(),
      metadata: {
        ...this.buildAIResponseMetadata(currentAI, currentAI.model, undefined, debateSpeech),
        lifecycle,
      },
    };
    this.currentMessages = [...turnMessages, failedMessage];

    if (useStreaming) {
      this.emitEvent({
        type: 'stream_completed',
        data: { messageId, finalContent: content, modelUsed: currentAI.model, aiProvider: currentAI.id, webSearchEnabled: this.getWebSearchEnabled(), lifecycle, messageIndex, phase, messageLabel: messageSpec.label, cxRole: messageSpec.cxRole },
        timestamp: Date.now(),
      });
    } else {
      this.emitEvent({
        type: 'message_added',
        data: { message: failedMessage, messageIndex, phase, messageLabel: messageSpec.label, cxRole: messageSpec.cxRole },
        timestamp: Date.now(),
      });
    }
    this.emitTypingStoppedForAI(currentAI);

    this.emitRetryContinuation({
      title,
      message,
      completedMessageIndex: Math.max(messageIndex - 1, 0),
      nextMessageIndex: messageIndex,
      retryMessageId: messageId,
      retryMessages: turnMessages,
    });
  }

  private isSyntheticDebateErrorContent(content: string, aiName: string): boolean {
    const normalized = content.trim();
    if (normalized.length === 0) return false;

    return normalized === DEBATE_CONSTANTS.MESSAGES.ERROR(aiName)
      || normalized === DEBATE_CONSTANTS.MESSAGES.RATE_LIMIT(aiName)
      || /\bhad an error\. continuing\.\.\.$/i.test(normalized);
  }

  private emitRetryContinuation({
    title,
    message,
    completedMessageIndex,
    nextMessageIndex,
    retryMessageId,
    retryMessages,
  }: {
    title: string;
    message: string;
    completedMessageIndex: number;
    nextMessageIndex: number;
    retryMessageId: string;
    retryMessages: Message[];
  }): void {
    this.pendingContinuation = {
      title,
      message,
      buttonLabel: 'Retry Turn',
      isFinalReview: false,
      completedMessageIndex,
      nextMessageIndex,
      continueAction: 'retry_message',
      retryMessageId,
      messages: retryMessages,
    };
    this.updateSessionStatus(DebateStatus.PAUSED_FOR_REVIEW);
    this.emitEvent({
      type: 'continuation_required',
      data: {
        title: this.pendingContinuation.title,
        message: this.pendingContinuation.message,
        buttonLabel: this.pendingContinuation.buttonLabel,
        isFinalReview: this.pendingContinuation.isFinalReview,
        completedMessageIndex: this.pendingContinuation.completedMessageIndex,
        nextMessageIndex: this.pendingContinuation.nextMessageIndex,
        continueAction: this.pendingContinuation.continueAction,
        retryMessageId: this.pendingContinuation.retryMessageId,
      },
      timestamp: Date.now(),
    });
  }

  private buildDebateSpeechMetadata(
    messageIndex: number,
    messageSpec: MessageSpec
  ): DebateSpeechMetadata | undefined {
    if (!this.session) return undefined;

    return {
      formatId: this.session.format.id,
      presetId: this.session.presetId,
      messageIndex,
      totalMessages: this.session.totalMessages,
      phase: messageSpec.phase,
      speaker: messageSpec.speaker,
      ...(typeof messageSpec.speakerSlot === 'number' ? { speakerSlot: messageSpec.speakerSlot } : {}),
      ...(messageSpec.cxRole ? { cxRole: messageSpec.cxRole } : {}),
      ...(messageSpec.audienceQuestionTarget ? { audienceQuestionTarget: messageSpec.audienceQuestionTarget } : {}),
      label: messageSpec.label,
    };
  }
  
  /**
   * Initialize a new debate session
   */
  async initializeDebate(
    topic: string,
    participants: AI[],
    personalities: { [aiId: string]: string } = {},
    options?: {
      formatId?: DebateFormatId;
      presetId?: string;
      rounds?: number; // 1–5
      civility?: 1 | 2 | 3 | 4 | 5;
      stances?: { [aiId: string]: 'pro' | 'con' };
      /** Optional pre-merged personalities from context (includes user customizations) */
      mergedPersonalities?: Record<string, PersonalityOption>;
      voiceConfig?: DebateVoiceConfig;
    }
  ): Promise<DebateSession> {
    // Resolve configuration
    const formatId = options?.formatId || 'oxford';
    const format = getFormat(formatId);
    const presetId = options?.presetId || getPresetIdForRounds(options?.rounds);
    const preset = getPresetForFormat(formatId, presetId);

    // Validate debate setup
    const validation = this.rulesEngine.validateDebateSetup(participants, topic);
    const requiredParticipants = this.getRequiredParticipantCount(preset);
    if (participants.length < requiredParticipants) {
      validation.errors.push(`${preset.shortLabel} requires ${requiredParticipants} debaters.`);
    }
    if (!validation.valid || validation.errors.length > 0) {
      throw new AppError({
        code: ErrorCode.VALIDATION_REQUIRED,
        message: `Invalid debate setup: ${validation.errors.join(', ')}`,
        userMessage: validation.errors.join('. '),
        recoverable: true,
      });
    }

    const resolvedParticipants = participants.slice(0, requiredParticipants).map(participant => ({
      ...participant,
      model: resolveProviderModelId(participant.provider, participant.model) || participant.model,
    }));

    const totalRounds = preset.voteCount;
    const totalMessages = preset.messages.length;
    const civility = (options?.civility as 1|2|3|4|5) || 3;
    const stances: { [aiId: string]: 'pro' | 'con' } = {};
    resolvedParticipants.forEach((participant, index) => {
      const side = this.getSideForParticipantIndex(index, preset);
      stances[participant.id] = options?.stances?.[participant.id] || (side === 'aff' ? 'pro' : 'con');
    });

    // Require both resolved debater models to support web search.
    const webSearchAvailability = mergeAvailabilitiesStrict(
      resolvedParticipants.map(p => ({ provider: p.provider, model: p.model }))
    );
    const webSearchEnabled = webSearchAvailability.webSearch.supported;

    // Create new session
    const session: DebateSession = {
      id: `debate_${Date.now()}`,
      topic,
      participants: resolvedParticipants,
      personalities,
      mergedPersonalities: options?.mergedPersonalities,
      startTime: Date.now(),
      status: DebateStatus.INITIALIZING,
      currentRound: 1,
      messageCount: 0,
      messageIndex: 0,
      currentAIIndex: 0,
      totalRounds,
      totalMessages,
      civility,
      format,
      preset,
      presetId: preset.id,
      stances,
      webSearchEnabled,
      voiceConfig: options?.voiceConfig,
    };

    this.session = session;
    this.currentVoteIndex = 0;
    this.currentAudienceVoteStage = undefined;
    this.pendingContinuation = null;
    this.pendingAudienceQuestions = null;
    this.currentMessages = [];
    
    // Initialize services
    this.votingService = new VotingService(resolvedParticipants, preset, format.id);
    this.rulesEngine = new DebateRulesEngine(preset);
    
    // Update status
    this.updateSessionStatus(DebateStatus.ACTIVE);
    
    this.emitEvent({
      type: 'debate_started',
      data: { session },
      timestamp: Date.now(),
    });
    
    return session;
  }
  
  /**
   * Start the debate with the first AI
   */
  async startDebate(existingMessages: Message[]): Promise<void> {
    if (!this.session) {
      throw new AppError({
        code: ErrorCode.APP_SESSION_NOT_FOUND,
        message: 'No active debate session',
        userMessage: 'No active debate session. Please start a new debate.',
        recoverable: true,
      });
    }
    
    // Enforce storage limits BEFORE starting the debate
    // This ensures we have room for this new debate
    try {
      const state = store.getState();
      const currentUser = state.user.currentUser;
      const isPremium = currentUser?.subscription === 'pro' || currentUser?.subscription === 'business';
      
      await StorageService.enforceStorageLimits('debate', isPremium, true);
    } catch {
      // Continue anyway - don't block the debate
    }
    
    // Store the initial messages
    this.currentMessages = [...existingMessages];

    if (this.votingService?.isAudienceStanceVoteModel() && !this.votingService.hasAudienceVote('initial')) {
      this.showAudienceStanceVoting('initial');
      return;
    }

    await this.addPodcastIntroInterstitial();

    if (this.isPodcastModeEnabled()) {
      this.scheduleNextMessage(0, this.currentMessages, DEBATE_CONSTANTS.DELAYS.MC_HANDOFF_PAUSE);
      return;
    }

    await this.executeDebateMessage(0, this.currentMessages);
  }
  
  /**
   * Execute a single debate message from the active format preset.
   */
  async executeDebateMessage(
    messageIndex: number,
    existingMessages: Message[]
  ): Promise<void> {
    if (!this.session || !this.votingService) {
      throw new AppError({
        code: ErrorCode.APP_SESSION_NOT_FOUND,
        message: 'No active debate session or voting service',
        userMessage: 'The debate session has ended or was interrupted.',
        recoverable: true,
      });
    }

    const { participants, personalities, topic, format, preset, totalRounds, civility } = this.session;
    const maxMessages = preset.messages.length;

    // Check if debate should end
    if (this.session.status === DebateStatus.COMPLETED || messageIndex >= maxMessages) {
      this.endDebate();
      return;
    }

    const messageSpec = preset.messages[messageIndex];
    if (!messageSpec) {
      this.endDebate();
      return;
    }

    // Check if we need to show voting from the prior completed speech group.
    if (!this.votingService.isAudienceStanceVoteModel() && this.currentVoteIndex > 0 && !this.votingService.hasVotedForRound(this.currentVoteIndex)) {
      const isFinalRoundVote = this.currentVoteIndex === this.session.totalRounds;
      this.showVotingForRound(this.currentVoteIndex, isFinalRoundVote);
      return;
    }

    const aiIndex = this.getParticipantIndexForMessage(messageSpec);
    const currentAI = participants[aiIndex];
    if (!currentAI) {
      this.endDebate();
      return;
    }
    const phase = messageSpec.phase;
    const debateSpeech = this.buildDebateSpeechMetadata(messageIndex, messageSpec);
    const audienceQuestion = this.getAudienceQuestionForMessage(messageSpec);
    const currentRound = this.currentVoteIndex + 1;

    if (currentRound !== this.session.currentRound) {
      this.session.currentRound = currentRound;
      this.emitEvent({
        type: 'round_changed',
        data: { round: currentRound, isFinal: currentRound >= totalRounds },
        timestamp: Date.now(),
      });
    }

    this.session.currentAIIndex = aiIndex;
    this.session.messageIndex = messageIndex;
    this.session.messageCount = messageIndex + 1;

    try {
      let turnMessages = existingMessages;
      if (audienceQuestion && this.session.voiceConfig?.podcast?.enabled) {
        if (this.currentMessages.length < existingMessages.length) {
          this.currentMessages = [...existingMessages];
        }
        const knownMessages = this.currentMessages;
        const questionCueAlreadyExists = knownMessages.some((message) => (
          message.metadata?.debateInterstitial?.kind === 'audience_question' &&
          message.content.includes(audienceQuestion)
        ));

        if (!questionCueAlreadyExists) {
          await this.addDebateInterstitial('audience_question', {
            nextMessageSpec: messageSpec,
          });
          const queuedMessages = this.currentMessages.length >= existingMessages.length
            ? this.currentMessages
            : existingMessages;
          this.scheduleNextMessage(messageIndex, queuedMessages, DEBATE_CONSTANTS.DELAYS.MC_HANDOFF_PAUSE);
          return;
        }

        if (this.currentMessages.length >= existingMessages.length) {
          turnMessages = this.currentMessages;
        }
      }

      this.emitTypingStartedForMessage(messageIndex);

      const stances = this.session.stances;
      // Build per-turn prompt with the orchestrator-resolved speech role.
      const personalityId = personalities[currentAI.id] || 'default';
      const previousMessage = this.promptBuilder.extractPreviousMessage(turnMessages, currentAI);
      const sameSpeakerPreviousMessage = phase === 'closing' || phase === 'final_rebuttal' || phase === 'synthesis'
        ? this.promptBuilder.extractPreviousMessageFromSameSpeaker(turnMessages, currentAI)
        : undefined;
      const roleContext = this.buildRoleContext(aiIndex, messageSpec);
      const speechLength = getDebateSpeechLengthGuidance({
        formatId: format.id,
        presetId: preset.id,
        phase,
        cxRole: messageSpec.cxRole,
        voiceMode: Boolean(this.session.voiceConfig?.enabled),
      });
      const minimal = this.promptBuilder.buildTurnPrompt({
        topic,
        phase,
        previousMessage,
        isFinalRound: phase === 'closing' || messageIndex >= maxMessages - 2,
        guidance: format.guidance[phase] ?? '',
        format,
        presetId: preset.id,
        civilityLevel: civility,
        personalityId,
        messageLabel: messageSpec.label,
        roleBrief: roleContext.roleBrief,
        sameSpeakerPreviousMessage,
        cxRole: messageSpec.cxRole,
        audienceQuestion,
      });
      const contextualPrompt = minimal;

      // Get debate-only conversation slice
      const debateMessages = this.getDebateConversationHistory(turnMessages);

      // Prefer streaming if adapter supports it
      const ensureAdapter = (this.aiService as { ensureAdapter?: AIService['ensureAdapter'] }).ensureAdapter;
      let adapter = ensureAdapter
        ? await ensureAdapter.call(this.aiService, currentAI.id, currentAI.provider, currentAI.model)
        : undefined;
      if (!adapter) {
        adapter = this.aiService.getAdapter(currentAI.id) || this.aiService.getAdapter(currentAI.provider);
      }
      this.applyWebSearchConfig(adapter);
      const supportsStreaming = !!adapter?.getCapabilities()?.streaming;
      // Respect global/provider streaming preferences
      const streamingState = store.getState().streaming;
      const providerId = currentAI.provider;
      const providerEnabled = streamingState?.streamingPreferences?.[providerId]?.enabled ?? true;
      const globalEnabled = streamingState?.globalStreamingEnabled ?? true;
      const providerHasVerificationError = !!streamingState?.providerVerificationErrors?.[providerId];
      const streamingAllowed = globalEnabled && providerEnabled && !providerHasVerificationError;

      // Resolve expert parameters (expert model acts as default elsewhere; currentAI.model is authoritative here)
      const expert = getExpertOverrides((store.getState().settings?.expertMode || {}) as Record<string, unknown>, currentAI.provider) as {
        enabled: boolean;
        model?: string;
        parameters?: import('../../types').ModelParameters;
      };

      const stance = stances[currentAI.id] || (aiIndex === 0 ? 'pro' : 'con');
      const persona = this.session?.mergedPersonalities?.[personalityId] || getPersonality(personalityId);
      const opponent = roleContext.primaryOpponent || this.getOpposingParticipant(aiIndex) || participants.find((_, idx) => idx !== aiIndex) || participants[(aiIndex + 1) % participants.length];
      const opponentPersonalityId = personalities[opponent?.id || ''] || 'default';
      const opponentPersona = this.session?.mergedPersonalities?.[opponentPersonalityId] || getPersonality(opponentPersonalityId);
      const runtime = buildPersonalityRuntime({
        mode: 'debate',
        personality: persona,
        ai: currentAI,
        debate: {
          topic,
          formatId: format.id,
          formatName: format.name,
          presetLabel: preset.label,
          totalRounds,
          totalMessages: this.session.totalMessages,
          stance,
          sideLabel: roleContext.sideLabel,
          roleLabel: roleContext.roleLabel,
          currentSpeechLabel: messageSpec.label,
          teamMode: preset.teamMode,
          teamSize: preset.teamSize,
          teammateNames: roleContext.teammateNames,
          opposingTeamNames: roleContext.opposingTeamNames,
          audienceVoteModel: preset.voteModel === 'audience_stance',
          initialVoteRequired: preset.initialVoteRequired,
          finalVoteRequired: preset.finalVoteRequired,
          opponentName: opponent?.name || 'Opponent',
          opponentPersonality: opponentPersona,
          civility,
        },
      });
      const runtimeParameters = applyDebateOutputTokenCap(
        mergeRuntimeModelParameters(
          expert.enabled,
          expert.parameters,
          runtime.modelParameters
        ),
        speechLength.maxTokens
      );

      // Compose a stance-aware, persona- and format-inflected system prompt for this AI
      try {
        if (adapter) {
          adapter.setTemporaryPersonality(runtime.personalityConfig);
          // Ensure debate mode is active for turn mapping
          adapter.config.isDebateMode = true;
          adapter.config.groupChat = undefined;
          // Effective parameters are applied to the adapter inside DebateTurnRunner (single owner).
          this.applyWebSearchConfig(adapter);

          // Debug logging
          try {
            const { PromptDebugLogger } = await import('../debug/PromptDebugLogger');
            const sysCombined = adapter.debugGetSystemPrompt();
            PromptDebugLogger.logTurn('streaming-turn', {
              aiId: currentAI.id,
              aiName: currentAI.name,
              model: currentAI.model,
              personalityId,
              personalityName: runtime.debug.personalityName,
              stance,
              civility,
              format: { id: format.id, name: format.name },
              phase,
              round: currentRound,
              messageCount: messageIndex + 1,
              systemPromptApplied: runtime.systemPrompt,
              systemPromptAdapter: sysCombined,
              userPrompt: contextualPrompt,
            });
          } catch { /* ignore debug log errors */ }
        }
      } catch { /* ignore persona application errors */ }

      const useStreaming = !!(adapter && supportsStreaming && streamingAllowed);
      const personalityName = UNIVERSAL_PERSONALITIES.find(p => p.id === personalityId)?.name || 'Default';
      const messageId = `msg_${Date.now()}_${currentAI.id}`;
      const turnTimestamp = Date.now();

      // For streaming, show an immediate empty placeholder + stream lifecycle so chunks render live.
      if (useStreaming) {
        const placeholderMessage: Message = {
          id: messageId,
          sender: `${currentAI.name} (${personalityName})`,
          senderType: 'ai',
          content: '',
          timestamp: turnTimestamp,
          metadata: this.buildAIResponseMetadata(currentAI, currentAI.model, undefined, debateSpeech),
        };
        this.currentMessages = [...turnMessages, placeholderMessage];
        this.emitEvent({
          type: 'message_added',
          data: { message: placeholderMessage, messageIndex, phase, messageLabel: messageSpec.label, cxRole: messageSpec.cxRole },
          timestamp: Date.now(),
        });
        this.emitEvent({
          type: 'stream_started',
          data: { messageId, aiProvider: currentAI.id, webSearchEnabled: this.getWebSearchEnabled(), messageIndex, phase, messageLabel: messageSpec.label, cxRole: messageSpec.cxRole },
          timestamp: Date.now(),
        });
        this.emitTypingStoppedForAI(currentAI);
      }

      // Single generation entry point: owns streaming vs non-streaming, the retry policy,
      // finish-reason capture, normalization and turn assessment. Returns completed | failed.
      const turnResult = await this.turnRunner.generateTurn({
        adapter,
        aiService: this.aiService,
        provider: currentAI.provider,
        providerId,
        model: currentAI.model,
        aiName: currentAI.name,
        prompt: contextualPrompt,
        history: debateMessages,
        personalityConfig: runtime.personalityConfig,
        parameters: runtimeParameters,
        minWords: speechLength.minWords,
        useStreaming,
        messageId,
        isSyntheticError: (content: string) => this.isSyntheticDebateErrorContent(content, currentAI.name),
        onChunk: useStreaming
          ? (chunk: string) => this.emitEvent({ type: 'stream_chunk', data: { messageId, chunk, aiProvider: currentAI.id, messageIndex, phase, messageLabel: messageSpec.label, cxRole: messageSpec.cxRole }, timestamp: Date.now() })
          : undefined,
        onStreamError: useStreaming
          ? (error: string) => this.emitEvent({ type: 'stream_error', data: { messageId, error, aiProvider: currentAI.id, messageIndex, phase, messageLabel: messageSpec.label, cxRole: messageSpec.cxRole }, timestamp: Date.now() })
          : undefined,
      });

      if (turnResult.status === 'failed') {
        this.emitFailedDebateTurn(turnResult, {
          currentAI,
          personalityName,
          messageId,
          messageIndex,
          phase,
          messageSpec,
          debateSpeech,
          turnMessages,
          useStreaming,
        });
        return;
      }

      const completedMessage: Message = {
        id: messageId,
        sender: `${currentAI.name} (${personalityName})`,
        senderType: 'ai',
        content: turnResult.text,
        timestamp: turnTimestamp,
        metadata: this.buildAIResponseMetadata(currentAI, turnResult.modelUsed || currentAI.model, turnResult.citations, debateSpeech),
      };
      this.currentMessages = [...turnMessages, completedMessage];

      if (useStreaming) {
        this.emitEvent({
          type: 'stream_completed',
          data: { messageId, finalContent: turnResult.text, modelUsed: turnResult.modelUsed || currentAI.model, aiProvider: currentAI.id, webSearchEnabled: this.getWebSearchEnabled(), citations: turnResult.citations, messageIndex, phase, messageLabel: messageSpec.label, cxRole: messageSpec.cxRole },
          timestamp: Date.now(),
        });
      } else {
        this.emitEvent({
          type: 'message_added',
          data: { message: completedMessage, messageIndex, phase, messageLabel: messageSpec.label, cxRole: messageSpec.cxRole },
          timestamp: Date.now(),
        });
      }
      this.emitTypingStoppedForAI(currentAI);

      await this.continueAfterMessage(messageIndex, this.currentMessages, useStreaming);

    } catch (error) {
      // Use ErrorService for centralized error handling
      const appError = ErrorService.handleError(error, {
        feature: 'debate',
        showToast: false, // We show errors in the debate UI
        context: { provider: currentAI.provider, aiName: currentAI.name, round: this.session?.currentRound },
      });
      await this.handleDebateError(appError, currentAI, messageIndex, existingMessages);
    }
  }

  /**
   * Compatibility wrapper for older callers that still think in message counts.
   */
  async executeDebateRound(
    _prompt: string,
    _aiIndex: number,
    messageCount: number,
    existingMessages: Message[]
  ): Promise<void> {
    await this.executeDebateMessage(Math.max(0, messageCount - 1), existingMessages);
  }
  
  /**
   * Handle errors during debate execution
   */
  private async handleDebateError(
    error: AppError | Error,
    currentAI: AI,
    messageIndex: number,
    existingMessages: Message[]
  ): Promise<void> {
    if (!this.session) return;

    // Determine error type from AppError code or error message
    const isRateLimit = error instanceof AppError
      ? error.code === ErrorCode.API_RATE_LIMITED
      : error.message?.includes('429');

    const debateError: DebateError = {
      type: isRateLimit ? 'rate_limit' : 'ai_error',
      message: error instanceof AppError ? error.userMessage : error.message,
      aiId: currentAI.id,
      retryable: error instanceof AppError ? error.retryable : true,
    };
    
    // Emit typing stopped
    this.emitEvent({
      type: 'typing_stopped',
      data: { aiName: currentAI.name },
      timestamp: Date.now(),
    });
    
    const userRetryable = debateError.retryable || debateError.type !== 'validation_error';
    const personalityId = this.session.personalities[currentAI.id] || 'default';
    const personalityName = UNIVERSAL_PERSONALITIES.find(p => p.id === personalityId)?.name || 'Default';
    const messageId = `msg_${Date.now()}_${currentAI.id}_failed`;
    const lifecycle = {
      status: 'failed' as const,
      reason: debateError.message,
      interruptedAt: Date.now(),
      partial: false,
      retryable: userRetryable,
    };

    // Create a failed AI turn so the user can retry exactly where the debate stopped.
    const errorMessage: Message = {
      id: messageId,
      sender: `${currentAI.name} (${personalityName})`,
      senderType: 'ai',
      content: debateError.type === 'rate_limit' 
        ? DEBATE_CONSTANTS.MESSAGES.RATE_LIMIT(currentAI.name)
        : this.buildRetryableTurnFailureContent(currentAI.name),
      timestamp: Date.now(),
      metadata: {
        ...this.buildAIResponseMetadata(currentAI, currentAI.model),
        lifecycle,
      },
    };
    
    // Emit error message
    this.emitEvent({
      type: 'message_added',
      data: { message: errorMessage },
      timestamp: Date.now(),
    });
    
    // Emit error event
    this.emitEvent({
      type: 'error_occurred',
      data: { error: debateError },
      timestamp: Date.now(),
    });
    
    // Update tracked messages with error message
    this.currentMessages = [...existingMessages, errorMessage];

    if (userRetryable) {
      this.emitRetryContinuation({
        title: 'Debate turn failed',
        message: 'The provider could not finish this turn. Retry when you are ready.',
        completedMessageIndex: Math.max(messageIndex - 1, 0),
        nextMessageIndex: messageIndex,
        retryMessageId: messageId,
        retryMessages: existingMessages,
      });
    } else {
      this.updateSessionStatus(DebateStatus.ERROR);
    }
  }
  
  /**
   * Schedule the next message with a delay
   */
  private scheduleNextMessage(
    messageIndex: number,
    messages: Message[],
    delay: number
  ): void {
    if (!this.session) return;
    
    const timeoutId = `next_message_${Date.now()}`;
    const timeout = setTimeout(() => {
      this.timeouts.delete(timeoutId);
      if (this.session?.status === DebateStatus.ACTIVE) {
        this.executeDebateMessage(messageIndex, messages);
      }
    }, delay);
    
    this.timeouts.set(timeoutId, timeout);
  }

  private shouldPauseForAudienceReview(messageIndex: number): boolean {
    if (!this.session || !this.votingService?.isAudienceStanceVoteModel()) {
      return false;
    }

    const completedSpeechCount = messageIndex + 1;
    return completedSpeechCount % 2 === 0 || completedSpeechCount >= this.session.totalMessages;
  }

  private shouldRequestAudienceQuestions(messageIndex: number): boolean {
    if (!this.session || !this.votingService?.isAudienceStanceVoteModel()) {
      return false;
    }

    const checkpoint = this.session.preset.audienceQuestionCheckpoint;
    return Boolean(
      checkpoint &&
      checkpoint.required &&
      checkpoint.afterMessageIndex === messageIndex &&
      !this.session.audienceQuestions
    );
  }

  private getAudienceReviewTitle(messageSpec?: MessageSpec): string {
    switch (messageSpec?.phase) {
      case 'opening':
        return 'Opening speeches complete';
      case 'rebuttal':
        return 'Floor speeches complete';
      case 'question':
        return 'Audience Q&A complete';
      case 'closing':
        return 'Closing speeches complete';
      default:
        return 'Review checkpoint';
    }
  }

  private pauseForAudienceReview(
    messageIndex: number,
    messages: Message[],
    nextMessageIndex?: number
  ): void {
    if (!this.session) return;

    this.timeouts.forEach(timeout => clearTimeout(timeout));
    this.timeouts.clear();

    const isFinalReview = typeof nextMessageIndex !== 'number' || nextMessageIndex >= this.session.totalMessages;
    const messageSpec = this.session.preset.messages[messageIndex];
    const prompt: DebateContinuationPrompt = {
      title: this.getAudienceReviewTitle(messageSpec),
      message: isFinalReview
        ? 'Finish any remaining clips or transcript review before casting the final audience vote.'
        : 'Review the last two speeches or finish any voice clips before the next round begins.',
      buttonLabel: isFinalReview ? 'Cast Final Vote' : 'Continue Debate',
      isFinalReview,
      completedMessageIndex: messageIndex,
      continueAction: isFinalReview ? 'end_debate' : 'next_message',
      ...(typeof nextMessageIndex === 'number' ? { nextMessageIndex } : {}),
    };

    this.pendingContinuation = {
      ...prompt,
      messages,
    };
    this.updateSessionStatus(DebateStatus.PAUSED_FOR_REVIEW);

    this.emitEvent({
      type: 'continuation_required',
      data: { ...prompt },
      timestamp: Date.now(),
    });
  }

  private requestAudienceQuestions(
    messageIndex: number,
    messages: Message[],
    nextMessageIndex: number
  ): void {
    if (!this.session) return;

    this.timeouts.forEach(timeout => clearTimeout(timeout));
    this.timeouts.clear();

    const prompt: DebateAudienceQuestionsPrompt = {
      title: 'Audience questions',
      message: 'Enter one question for each side. The teams will answer before summaries.',
      completedMessageIndex: messageIndex,
      nextMessageIndex,
      affirmativeLabel: 'Affirmative',
      negativeLabel: 'Negative',
      required: true,
    };

    this.pendingAudienceQuestions = {
      ...prompt,
      messages,
    };
    this.updateSessionStatus(DebateStatus.PAUSED_FOR_REVIEW);

    this.emitEvent({
      type: 'audience_questions_requested',
      data: { ...prompt },
      timestamp: Date.now(),
    });
  }

  private pauseForAudienceQuestionReview(
    messageIndex: number,
    messages: Message[],
    nextMessageIndex: number
  ): void {
    if (!this.session) return;

    this.timeouts.forEach(timeout => clearTimeout(timeout));
    this.timeouts.clear();

    const prompt: DebateContinuationPrompt = {
      title: 'Audience questions',
      message: 'Review the latest speeches or finish any voice clips before entering questions for each side.',
      buttonLabel: 'Continue to Questions',
      isFinalReview: false,
      completedMessageIndex: messageIndex,
      nextMessageIndex,
      continueAction: 'audience_questions',
    };

    this.pendingContinuation = {
      ...prompt,
      messages,
    };
    this.updateSessionStatus(DebateStatus.PAUSED_FOR_REVIEW);

    this.emitEvent({
      type: 'continuation_required',
      data: { ...prompt },
      timestamp: Date.now(),
    });
  }

  private pauseForVoteReview(
    messageIndex: number,
    messages: Message[],
    voteRound: number,
    isFinalRoundVote: boolean
  ): void {
    if (!this.session) return;

    this.timeouts.forEach(timeout => clearTimeout(timeout));
    this.timeouts.clear();

    const messageSpec = this.session.preset.messages[messageIndex];
    const votingLabel = this.votingService?.getVotingLabel(voteRound) || messageSpec?.votingLabel || 'Vote';
    const prompt: DebateContinuationPrompt = {
      title: isFinalRoundVote ? `Ready for final vote: ${votingLabel}` : `Ready to vote: ${votingLabel}`,
      message: isFinalRoundVote
        ? 'Review the final response or finish any voice clips before casting the final judge checkpoint.'
        : 'Review the latest response or finish any voice clips before casting this judge checkpoint.',
      buttonLabel: isFinalRoundVote ? 'Cast Final Vote' : 'Cast Vote',
      isFinalReview: isFinalRoundVote,
      completedMessageIndex: messageIndex,
      continueAction: 'vote',
      voteRound,
      isFinalRoundVote,
    };

    this.pendingContinuation = {
      ...prompt,
      messages,
    };
    this.updateSessionStatus(DebateStatus.PAUSED_FOR_REVIEW);

    this.emitEvent({
      type: 'continuation_required',
      data: { ...prompt },
      timestamp: Date.now(),
    });
  }
  
  /**
   * Advance the debate after a message resolves.
   */
  private async continueAfterMessage(messageIndex: number, messages: Message[], usedStreaming: boolean): Promise<void> {
    if (!this.session) return;

    const messageSpec = this.session.preset.messages[messageIndex];
    if (messageSpec?.voteAfter && !this.votingService?.isAudienceStanceVoteModel()) {
      this.currentVoteIndex = this.rulesEngine.getVoteIndex(messageIndex);
      const isFinalRoundVote = this.currentVoteIndex === this.session.totalRounds;
      await this.addDebateInterstitial('vote_segue', {
        completedMessageSpec: messageSpec,
        votingLabel: this.votingService?.getVotingLabel(this.currentVoteIndex) || messageSpec.votingLabel,
      });
      this.pauseForVoteReview(
        messageIndex,
        this.currentMessages.length >= messages.length ? this.currentMessages : messages,
        this.currentVoteIndex,
        isFinalRoundVote
      );
      return;
    }

    const nextMessageIndex = messageIndex + 1;
    if (this.shouldRequestAudienceQuestions(messageIndex) && nextMessageIndex < this.session.totalMessages) {
      await this.addDebateInterstitial('phase_segue', {
        completedMessageSpec: messageSpec,
        nextMessageSpec: this.session.preset.messages[nextMessageIndex],
      });
      this.pauseForAudienceQuestionReview(
        messageIndex,
        this.currentMessages.length >= messages.length ? this.currentMessages : messages,
        nextMessageIndex
      );
      return;
    }

    if (this.shouldPauseForAudienceReview(messageIndex)) {
      const isFinalReview = nextMessageIndex >= this.session.totalMessages;
      await this.addDebateInterstitial(isFinalReview ? 'vote_segue' : 'phase_segue', {
        completedMessageSpec: messageSpec,
        nextMessageSpec: this.session.preset.messages[nextMessageIndex],
        votingLabel: isFinalReview ? 'Final Audience Vote' : undefined,
      });
      this.pauseForAudienceReview(
        messageIndex,
        this.currentMessages.length >= messages.length ? this.currentMessages : messages,
        nextMessageIndex < this.session.totalMessages ? nextMessageIndex : undefined
      );
      return;
    }

    if (nextMessageIndex < this.session.totalMessages && this.session.status === DebateStatus.ACTIVE) {
      const nextMessageSpec = this.session.preset.messages[nextMessageIndex];
      if (nextMessageSpec && nextMessageSpec.phase !== messageSpec?.phase) {
        await this.addDebateInterstitial('phase_segue', {
          completedMessageSpec: messageSpec,
          nextMessageSpec,
        });
      }
      const nextMessages = this.currentMessages.length >= messages.length ? this.currentMessages : messages;
      const delay = usedStreaming
        ? DEBATE_CONSTANTS.DELAYS.POST_STREAM_PAUSE
        : DEBATE_CONSTANTS.DELAYS.AI_RESPONSE;
      this.scheduleNextMessage(nextMessageIndex, nextMessages, delay);
    } else {
      this.endDebate();
    }
  }

  continueDebate(): void {
    if (!this.session || !this.pendingContinuation) return;

    const pending = this.pendingContinuation;
    this.pendingContinuation = null;

    if (pending.continueAction === 'vote') {
      if (typeof pending.voteRound !== 'number') {
        return;
      }

      this.currentVoteIndex = pending.voteRound;
      this.updateSessionStatus(DebateStatus.ACTIVE);

      if (pending.isFinalRoundVote) {
        this.endDebate();
      } else {
        this.showVotingForRound(pending.voteRound, false);
      }
      return;
    }

    if (pending.continueAction === 'audience_questions') {
      if (typeof pending.nextMessageIndex !== 'number') {
        return;
      }

      this.requestAudienceQuestions(
        pending.completedMessageIndex,
        pending.messages,
        pending.nextMessageIndex
      );
      return;
    }

    if (pending.continueAction === 'retry_message') {
      if (typeof pending.nextMessageIndex !== 'number') {
        return;
      }
      this.updateSessionStatus(DebateStatus.ACTIVE);
      this.emitTypingStartedForMessage(pending.nextMessageIndex);
      this.scheduleNextMessage(
        pending.nextMessageIndex,
        pending.messages,
        DEBATE_CONSTANTS.DELAYS.VOTING_CONTINUATION
      );
      return;
    }

    if (pending.isFinalReview) {
      this.updateSessionStatus(DebateStatus.ACTIVE);
      this.endDebate();
      return;
    }

    if (typeof pending.nextMessageIndex !== 'number') {
      return;
    }

    this.updateSessionStatus(DebateStatus.ACTIVE);
    this.emitTypingStartedForMessage(pending.nextMessageIndex);
    this.scheduleNextMessage(
      pending.nextMessageIndex,
      pending.messages,
      DEBATE_CONSTANTS.DELAYS.VOTING_CONTINUATION
    );
  }

  submitAudienceQuestions(questions: OxfordAudienceQuestions): void {
    if (!this.session || !this.pendingAudienceQuestions) {
      throw new AppError({
        code: ErrorCode.APP_SESSION_NOT_FOUND,
        message: 'No active audience question checkpoint',
        userMessage: 'Audience questions are not available right now.',
        recoverable: true,
      });
    }

    const audienceQuestions: OxfordAudienceQuestions = {
      aff: typeof questions.aff === 'string' ? questions.aff.trim() : '',
      neg: typeof questions.neg === 'string' ? questions.neg.trim() : '',
    };

    if (!audienceQuestions.aff || !audienceQuestions.neg) {
      throw new AppError({
        code: ErrorCode.VALIDATION_REQUIRED,
        message: 'Both Oxford audience questions are required',
        userMessage: 'Enter a question for both the Affirmative and Negative teams.',
        recoverable: true,
      });
    }

    const pending = this.pendingAudienceQuestions;
    this.pendingAudienceQuestions = null;
    this.session.audienceQuestions = audienceQuestions;

    const questionMessage: Message = {
      id: `msg_${Date.now()}_audience_questions`,
      sender: 'Debate Host',
      senderType: 'user',
      content: [
        'Audience questions submitted:',
        `Affirmative: ${audienceQuestions.aff}`,
        `Negative: ${audienceQuestions.neg}`,
      ].join('\n\n'),
      timestamp: Date.now(),
      metadata: {
        debateAudienceQuestions: audienceQuestions,
      },
    };

    this.currentMessages = [...pending.messages, questionMessage];
    this.emitEvent({
      type: 'message_added',
      data: { message: questionMessage },
      timestamp: Date.now(),
    });
    this.emitEvent({
      type: 'audience_questions_submitted',
      data: { audienceQuestions },
      timestamp: Date.now(),
    });

    this.updateSessionStatus(DebateStatus.ACTIVE);
    this.emitTypingStartedForMessage(pending.nextMessageIndex);
    this.scheduleNextMessage(
      pending.nextMessageIndex,
      this.currentMessages,
      DEBATE_CONSTANTS.DELAYS.VOTING_CONTINUATION
    );
  }
  
  /**
   * Show voting interface for a round
   */
  private showVotingForRound(round: number, isFinalRound: boolean): void {
    this.updateSessionStatus(DebateStatus.VOTING_ROUND);
    
    this.emitEvent({
      type: 'voting_started',
      data: {
        round,
        isFinalRound,
        isOverallVote: false,
        votingLabel: this.votingService?.getVotingLabel(round),
        voteCriterion: this.votingService?.getVoteCriterion(round, false),
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Show required Oxford audience stance voting.
   */
  private showAudienceStanceVoting(stage: AudienceVoteStage): void {
    if (!this.votingService) return;

    this.currentAudienceVoteStage = stage;
    this.updateSessionStatus(DebateStatus.VOTING_ROUND);

    this.emitEvent({
      type: 'voting_started',
      data: {
        round: stage === 'initial' ? 0 : 1,
        isFinalRound: stage === 'final',
        isOverallVote: stage === 'final',
        voteKind: 'audience_stance',
        audienceVoteStage: stage,
        votingLabel: stage === 'initial' ? 'Opening Audience Stance' : 'Final Audience Vote',
        voteCriterion: this.votingService.getAudienceVoteCriterion(stage),
        audienceVoteOptions: this.votingService.getAudienceVoteOptions(stage),
      },
      timestamp: Date.now(),
    });
  }
  
  /**
   * Record a vote and continue the debate
   */
  async recordVote(round: number, winnerId: string, _isOverallVote: boolean = false): Promise<void> {
    if (!this.votingService || !this.session) {
      throw new AppError({
        code: ErrorCode.APP_SESSION_NOT_FOUND,
        message: 'No active voting session',
        userMessage: 'Voting is not available. Please restart the debate.',
        recoverable: true,
      });
    }

    if (this.votingService.isAudienceStanceVoteModel()) {
      await this.recordAudienceVote(winnerId as AudienceStance);
      return;
    }
    
    // Record round vote
    const voteRecord = this.votingService.recordRoundVote(round, winnerId);
    
    // Emit round winner message
    const winnerMessage: Message = {
      id: `msg_${Date.now()}_round_${round}`,
      sender: 'Debate Host',
      senderType: 'user',
      content: this.votingService.getWinnerMessage(round, winnerId, round === this.session.totalRounds),
      timestamp: Date.now(),
      metadata: {
        debateVote: voteRecord,
      },
    };
    
    this.emitEvent({
      type: 'message_added',
      data: { message: winnerMessage },
      timestamp: Date.now(),
    });
    this.currentMessages = [...this.currentMessages, winnerMessage];
    
    // Update scores after voting (UI will display persistent scoreboard)
    const scores = this.votingService.calculateScores();
    
    // Emit score update event instead of message
    this.emitEvent({
      type: 'voting_completed',
      data: { round, winnerId, scores, voteRecord },
      timestamp: Date.now(),
    });
    
    // Check if all rounds are complete
    if (this.votingService.areAllRoundsVoted()) {
      // Declare overall winner based on scores (no more voting)
      await this.declareOverallWinner();
    } else {
      // Continue the debate after voting
      this.updateSessionStatus(DebateStatus.ACTIVE);
      
      // Resume debate with the next round
      this.resumeDebateAfterVoting();
    }
  }

  private async recordAudienceVote(stance: AudienceStance): Promise<void> {
    if (!this.votingService || !this.session || !this.currentAudienceVoteStage) {
      throw new AppError({
        code: ErrorCode.APP_SESSION_NOT_FOUND,
        message: 'No active audience voting session',
        userMessage: 'Voting is not available. Please restart the debate.',
        recoverable: true,
      });
    }

    const stage = this.currentAudienceVoteStage;
    const voteRecord = this.votingService.recordAudienceVote(stage, stance);
    const stageLabel = stage === 'initial' ? 'Opening audience stance' : 'Final audience vote';
    const voteMessage: Message = {
      id: `msg_${Date.now()}_audience_${stage}`,
      sender: 'Debate Host',
      senderType: 'user',
      content: `${stageLabel}: ${voteRecord.winnerName}`,
      timestamp: Date.now(),
      metadata: {
        debateVote: voteRecord,
      },
    };

    this.emitEvent({
      type: 'message_added',
      data: { message: voteMessage },
      timestamp: Date.now(),
    });
    this.currentMessages = [...this.currentMessages, voteMessage];

    this.emitEvent({
      type: 'voting_completed',
      data: {
        round: voteRecord.round,
        winnerId: voteRecord.winnerId,
        voteRecord,
        voteKind: 'audience_stance',
        audienceVoteStage: stage,
        audienceResult: this.votingService.getAudienceDecisionResult(),
      },
      timestamp: Date.now(),
    });

    this.currentAudienceVoteStage = undefined;

    if (stage === 'initial') {
      this.updateSessionStatus(DebateStatus.ACTIVE);
      await this.addPodcastIntroInterstitial();
      if (this.isPodcastModeEnabled()) {
        this.scheduleNextMessage(0, this.currentMessages, DEBATE_CONSTANTS.DELAYS.MC_HANDOFF_PAUSE);
        return;
      }

      await this.executeDebateMessage(0, this.currentMessages);
      return;
    }

    await this.declareAudienceDecision();
  }
  
  /**
   * Resume debate after voting is complete
   */
  private resumeDebateAfterVoting(): void {
    if (!this.session || !this.votingService) return;

    // Continue with the next message in the debate
    const nextMessageIndex = this.session.messageIndex + 1;
    if (nextMessageIndex >= this.session.totalMessages) {
      this.endDebate();
      return;
    }
    
    // Use shorter delay for faster flow after voting
    const delay = DEBATE_CONSTANTS.DELAYS.VOTING_CONTINUATION;
    
    // Schedule the next message with the accumulated messages
    this.emitTypingStartedForMessage(nextMessageIndex);
    this.scheduleNextMessage(nextMessageIndex, this.currentMessages, delay);
  }

  private async declareAudienceDecision(): Promise<void> {
    if (!this.votingService || !this.session) return;

    const audienceResult = this.votingService.getAudienceDecisionResult();
    if (!audienceResult) {
      this.showAudienceStanceVoting('final');
      return;
    }

    this.session.audienceResult = audienceResult;
    const [winnerId] = audienceResult.winningParticipantIds;
    if (winnerId) {
      this.votingService.recordOverallWinner(winnerId, audienceResult.winningParticipantIds);
    }

    const scores = this.votingService.calculateScores();
    await this.addDebateInterstitial('winner', {
      audienceResult,
      winnerName: audienceResult.winningSideLabel,
    });
    const winnerMessage: Message = {
      id: `msg_${Date.now()}_audience_decision`,
      sender: 'Debate Host',
      senderType: 'user',
      content: `\n🏛️ **AUDIENCE DECISION: ${audienceResult.winningSideLabel}!**\n\n${audienceResult.summary}`,
      timestamp: Date.now(),
    };

    this.updateSessionStatus(DebateStatus.COMPLETED);

    this.emitEvent({
      type: 'message_added',
      data: { message: winnerMessage },
      timestamp: Date.now(),
    });
    this.currentMessages = [...this.currentMessages, winnerMessage];

    this.emitEvent({
      type: 'debate_ended',
      data: {
        session: this.session,
        overallWinner: winnerId,
        overallWinnerIds: audienceResult.winningParticipantIds,
        finalScores: scores,
        voteRecords: this.votingService.getVoteRecords(),
        audienceResult,
      },
      timestamp: Date.now(),
    });

    this.saveDebateToHistory();
  }
  
  /**
   * Declare overall winner based on scores
   */
  private async declareOverallWinner(): Promise<void> {
    if (!this.votingService || !this.session) return;
    
    const scores = this.votingService.calculateScores();
    const sortedAIs = Object.entries(scores)
      .sort((a, b) => b[1].roundWins - a[1].roundWins);
    
    if (sortedAIs.length === 0) return;
    
    const [winnerId, winnerScore] = sortedAIs[0];
    const isTie = sortedAIs.length > 1 && sortedAIs[1][1].roundWins === winnerScore.roundWins;
    
    // Record the overall winner in the voting service
    if (!isTie) {
      this.votingService.recordOverallWinner(winnerId);
    }
    
    // Create overall winner message (simplified)
    let winnerMessage: Message;
    if (isTie) {
      const tiedAIs = sortedAIs
        .filter(([_, score]) => score.roundWins === winnerScore.roundWins)
        .map(([_, score]) => score.name);
      await this.addDebateInterstitial('winner', {
        winnerName: tiedAIs.join(' and '),
      });
      winnerMessage = {
        id: `msg_${Date.now()}_overall_winner`,
        sender: 'Debate Host',
        senderType: 'user',
        content: `\n🏆 **DEBATE ENDED IN A TIE!**\n\n${tiedAIs.join(' and ')} both won ${winnerScore.roundWins} ${winnerScore.roundWins === 1 ? 'judge checkpoint' : 'judge checkpoints'}!`,
        timestamp: Date.now(),
      };
    } else {
      await this.addDebateInterstitial('winner', {
        winnerName: winnerScore.name,
      });
      winnerMessage = {
        id: `msg_${Date.now()}_overall_winner`,
        sender: 'Debate Host',
        senderType: 'user',
        content: `\n🏆 **OVERALL WINNER: ${winnerScore.name}!**\n\n${winnerScore.name} won ${winnerScore.roundWins} out of ${this.session.totalRounds} judge checkpoints!`,
        timestamp: Date.now(),
      };
    }
    
    this.updateSessionStatus(DebateStatus.COMPLETED);
    
    this.emitEvent({
      type: 'message_added',
      data: { message: winnerMessage },
      timestamp: Date.now(),
    });
    this.currentMessages = [...this.currentMessages, winnerMessage];
    
    this.emitEvent({
      type: 'debate_ended',
      data: {
        session: this.session,
        overallWinner: winnerId,
        finalScores: scores,
        voteRecords: this.votingService.getVoteRecords(),
      },
      timestamp: Date.now(),
    });

    // Save the debate to history
    this.saveDebateToHistory();
  }

  /**
   * Save completed debate to history
   * Note: Messages should be collected by the DebateScreen via events
   */
  private async saveDebateToHistory(): Promise<void> {
    if (!this.session) return;

    try {
      // Use the session ID directly (it's already prefixed with 'debate_')
      const sessionId = this.session.id;
      
      const reduxSession = store.getState().chat.currentSession;
      const reduxMessages = reduxSession?.sessionType === 'debate' ? reduxSession.messages : undefined;
      const messagesForHistory = reduxMessages && reduxMessages.length >= this.currentMessages.length
        ? reduxMessages
        : this.currentMessages;

      const debateSession: ChatSession = {
        id: sessionId,
        sessionType: 'debate',
        topic: this.session.topic, // Store the debate topic directly
        selectedAIs: this.session.participants,
        messages: messagesForHistory,
        isActive: false,
        createdAt: this.session.startTime,
        lastMessageAt: Date.now(),
        debateConfig: {
          formatId: this.session.format.id,
          presetId: this.session.presetId,
          rounds: this.session.totalRounds,
          tempo: 'streaming',
          postStreamPauseMs: DEBATE_CONSTANTS.DELAYS.POST_STREAM_PAUSE,
          civility: this.session.civility,
          voteResults: this.votingService?.getVoteRecords(),
          audienceResult: this.session.audienceResult,
          audienceQuestions: this.session.audienceQuestions,
          voiceConfig: this.session.voiceConfig,
        }
      };
      
      // Save to storage
      await StorageService.saveSession(debateSession);
    } catch (error) {
      console.error('Failed to save debate to history:', error);
    }
  }
  
  /**
   * End the debate
   */
  endDebate(): void {
    if (!this.session) return;

    if (this.votingService?.isAudienceStanceVoteModel()) {
      if (this.votingService.hasAudienceVote('final')) {
        void this.declareAudienceDecision();
        return;
      }

      this.updateSessionStatus(DebateStatus.VOTING_ROUND);

      // Clear any pending timeouts
      this.timeouts.forEach(timeout => clearTimeout(timeout));
      this.timeouts.clear();

      const endMessage: Message = {
        id: `msg_${Date.now()}_end`,
        sender: 'Debate Host',
        senderType: 'user',
        content: 'The debate is complete. Cast your final audience vote.',
        timestamp: Date.now(),
      };

      this.emitEvent({
        type: 'message_added',
        data: { message: endMessage },
        timestamp: Date.now(),
      });
      this.currentMessages = [...this.currentMessages, endMessage];
      this.showAudienceStanceVoting('final');
      return;
    }

    if (this.votingService?.areAllRoundsVoted()) {
      void this.declareOverallWinner();
      return;
    }
    
    this.updateSessionStatus(DebateStatus.VOTING_ROUND);
    
    // Clear any pending timeouts
    this.timeouts.forEach(timeout => clearTimeout(timeout));
    this.timeouts.clear();
    
    // Add debate complete message
    const endMessage: Message = {
      id: `msg_${Date.now()}_end`,
      sender: 'Debate Host',
      senderType: 'user',
      content: DEBATE_CONSTANTS.MESSAGES.DEBATE_COMPLETE,
      timestamp: Date.now(),
    };
    
    this.emitEvent({
      type: 'message_added',
      data: { message: endMessage },
      timestamp: Date.now(),
    });
    this.currentMessages = [...this.currentMessages, endMessage];

    const nextVoteRound = this.votingService?.getNextVotingRound() ?? this.session.totalRounds;
    const activeVoteRound = this.currentVoteIndex > 0 && !this.votingService?.hasVotedForRound(this.currentVoteIndex)
      ? this.currentVoteIndex
      : nextVoteRound;
    this.currentVoteIndex = activeVoteRound;

    // Show voting for the final pending checkpoint.
    this.showVotingForRound(activeVoteRound, activeVoteRound === this.session.totalRounds);
  }
  
  /**
   * Update session status
   */
  private updateSessionStatus(status: DebateStatus): void {
    if (this.session) {
      this.session.status = status;
    }
  }
  
  /**
   * Add event handler
   */
  addEventListener(handler: DebateEventHandler): void {
    this.eventHandlers.push(handler);
  }
  
  /**
   * Remove event handler
   */
  removeEventListener(handler: DebateEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index > -1) {
      this.eventHandlers.splice(index, 1);
    }
  }
  
  /**
   * Emit event to all handlers
   */
  private emitEvent(event: DebateEvent): void {
    this.eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in debate event handler:', error);
      }
    });
  }
  
  /**
   * Get current session
   */
  getSession(): DebateSession | null {
    return this.session;
  }

  createSnapshot(
    status: ActiveDebateSessionSnapshot['status'] = 'active',
    messages: Message[] = this.currentMessages
  ): ActiveDebateSessionSnapshot | null {
    if (!this.session) return null;

    return {
      version: 1,
      mode: 'debate',
      sessionId: this.session.id,
      status,
      createdAt: this.session.startTime,
      updatedAt: Date.now(),
      selectedAIs: this.session.participants,
      messages,
      debateSession: {
        id: this.session.id,
        topic: this.session.topic,
        participants: this.session.participants,
        personalities: this.session.personalities,
        startTime: this.session.startTime,
        status: this.session.status,
        currentRound: this.session.currentRound,
        messageCount: this.session.messageCount,
        messageIndex: this.session.messageIndex,
        currentAIIndex: this.session.currentAIIndex,
        totalRounds: this.session.totalRounds,
        totalMessages: this.session.totalMessages,
        civility: this.session.civility,
        formatId: this.session.format.id,
        presetId: this.session.presetId,
        stances: this.session.stances,
        audienceResult: this.session.audienceResult,
        audienceQuestions: this.session.audienceQuestions,
        webSearchEnabled: this.session.webSearchEnabled,
        voiceConfig: this.session.voiceConfig,
      },
      voteRecords: this.votingService?.getVoteRecords() as ActiveDebateVoteRecord[] | undefined,
      currentVoteIndex: this.currentVoteIndex,
      currentAudienceVoteStage: this.currentAudienceVoteStage,
      continuation: this.pendingContinuation
        ? {
          title: this.pendingContinuation.title,
          message: this.pendingContinuation.message,
          buttonLabel: this.pendingContinuation.buttonLabel,
          isFinalReview: this.pendingContinuation.isFinalReview,
          completedMessageIndex: this.pendingContinuation.completedMessageIndex,
          nextMessageIndex: this.pendingContinuation.nextMessageIndex,
          continueAction: this.pendingContinuation.continueAction,
          retryMessageId: this.pendingContinuation.retryMessageId,
          voteRound: this.pendingContinuation.voteRound,
          isFinalRoundVote: this.pendingContinuation.isFinalRoundVote,
        }
        : null,
      audienceQuestionsPrompt: this.pendingAudienceQuestions
        ? {
          title: this.pendingAudienceQuestions.title,
          message: this.pendingAudienceQuestions.message,
          completedMessageIndex: this.pendingAudienceQuestions.completedMessageIndex,
          nextMessageIndex: this.pendingAudienceQuestions.nextMessageIndex,
          affirmativeLabel: this.pendingAudienceQuestions.affirmativeLabel,
          negativeLabel: this.pendingAudienceQuestions.negativeLabel,
          required: true,
        }
        : null,
      interruptedMessageIds: messages
        .filter(message => message.metadata?.lifecycle?.status === 'interrupted')
        .map(message => message.id),
    };
  }

  hydrateFromSnapshot(snapshot: ActiveDebateSessionSnapshot): DebateSession {
    const format = getFormat(snapshot.debateSession.formatId);
    const preset = getPresetForFormat(snapshot.debateSession.formatId, snapshot.debateSession.presetId);
    const session: DebateSession = {
      id: snapshot.debateSession.id,
      topic: snapshot.debateSession.topic,
      participants: snapshot.debateSession.participants,
      personalities: snapshot.debateSession.personalities,
      startTime: snapshot.debateSession.startTime,
      status: snapshot.status === 'interrupted'
        ? DebateStatus.PAUSED_FOR_REVIEW
        : snapshot.debateSession.status as DebateStatus,
      currentRound: snapshot.debateSession.currentRound,
      messageCount: snapshot.debateSession.messageCount,
      messageIndex: snapshot.debateSession.messageIndex,
      currentAIIndex: snapshot.debateSession.currentAIIndex,
      totalRounds: snapshot.debateSession.totalRounds,
      totalMessages: snapshot.debateSession.totalMessages,
      civility: snapshot.debateSession.civility,
      format,
      preset,
      presetId: preset.id,
      stances: snapshot.debateSession.stances,
      audienceResult: snapshot.debateSession.audienceResult,
      audienceQuestions: snapshot.debateSession.audienceQuestions,
      webSearchEnabled: snapshot.debateSession.webSearchEnabled,
      voiceConfig: snapshot.debateSession.voiceConfig,
    };

    this.session = session;
    this.currentMessages = snapshot.messages || [];
    this.currentVoteIndex = snapshot.currentVoteIndex || 0;
    this.currentAudienceVoteStage = snapshot.currentAudienceVoteStage;
    this.votingService = new VotingService(session.participants, preset, format.id);
    this.votingService.hydrateVoteRecords(snapshot.voteRecords || []);
    this.rulesEngine = new DebateRulesEngine(preset);
    this.pendingContinuation = snapshot.continuation
      ? {
        ...snapshot.continuation,
        messages: snapshot.messages || [],
      }
      : snapshot.status === 'interrupted'
        ? {
          title: 'Debate paused',
          message: 'The active response was interrupted. Retry this turn when you are ready.',
          buttonLabel: 'Retry Turn',
          isFinalReview: false,
          completedMessageIndex: Math.max(session.messageIndex - 1, 0),
          nextMessageIndex: session.messageIndex,
          continueAction: 'retry_message',
          retryMessageId: snapshot.interruptedMessageIds?.[0],
          messages: snapshot.messages || [],
        }
        : null;
    this.pendingAudienceQuestions = snapshot.audienceQuestionsPrompt
      ? {
        ...snapshot.audienceQuestionsPrompt,
        messages: snapshot.messages || [],
      }
      : null;

    return session;
  }

  getPendingContinuation(): DebateContinuationPrompt | null {
    if (!this.pendingContinuation) return null;
    return {
      title: this.pendingContinuation.title,
      message: this.pendingContinuation.message,
      buttonLabel: this.pendingContinuation.buttonLabel,
      isFinalReview: this.pendingContinuation.isFinalReview,
      completedMessageIndex: this.pendingContinuation.completedMessageIndex,
      nextMessageIndex: this.pendingContinuation.nextMessageIndex,
      continueAction: this.pendingContinuation.continueAction,
      retryMessageId: this.pendingContinuation.retryMessageId,
      voteRound: this.pendingContinuation.voteRound,
      isFinalRoundVote: this.pendingContinuation.isFinalRoundVote,
    };
  }

  getPendingAudienceQuestions(): DebateAudienceQuestionsPrompt | null {
    if (!this.pendingAudienceQuestions) return null;
    return {
      title: this.pendingAudienceQuestions.title,
      message: this.pendingAudienceQuestions.message,
      completedMessageIndex: this.pendingAudienceQuestions.completedMessageIndex,
      nextMessageIndex: this.pendingAudienceQuestions.nextMessageIndex,
      affirmativeLabel: this.pendingAudienceQuestions.affirmativeLabel,
      negativeLabel: this.pendingAudienceQuestions.negativeLabel,
      required: true,
    };
  }

  getCurrentVoteIndex(): number {
    return this.currentVoteIndex;
  }

  getCurrentAudienceVoteStage(): AudienceVoteStage | undefined {
    return this.currentAudienceVoteStage;
  }
  
  /**
   * Get voting service
   */
  getVotingService(): VotingService | null {
    return this.votingService;
  }
  
  /**
   * Reset and cleanup
   */
  reset(): void {
    // Cancel any pending scheduled turns
    this.timeouts.forEach(timeout => clearTimeout(timeout));
    this.timeouts.clear();
    // Proactively cancel any active provider streams
    try {
      const streaming = getStreamingService();
      streaming.cancelAllStreams();
    } catch {
      // ignore
    }
    this.session = null;
    this.votingService = null;
    this.eventHandlers = [];
    this.currentMessages = [];
    this.currentVoteIndex = 0;
    this.currentAudienceVoteStage = undefined;
    this.pendingContinuation = null;
    this.pendingAudienceQuestions = null;
  }
}
