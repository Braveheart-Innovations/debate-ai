/**
 * DebateOrchestrator Service
 * Central service that orchestrates the entire debate flow
 * Coordinates between all other debate services and manages state transitions
 */

import { AI, Message, ChatSession } from '../../types';
import { AIService } from '../aiAdapter';
import { DebateRulesEngine } from './DebateRulesEngine';
import { VotingService } from './VotingService';
import { DebatePromptBuilder } from './DebatePromptBuilder';
import { DEBATE_CONSTANTS } from '../../config/debateConstants';
import { UNIVERSAL_PERSONALITIES } from '../../config/personalities';
import { StorageService } from '../chat/StorageService';
import { store } from '../../store';
import { getStreamingService } from '../streaming/StreamingService';
import { setProviderVerificationError } from '../../store/streamingSlice';
import { getFormat, type DebateFormatId, type FormatSpec } from '../../config/debate/formats';

export interface DebateSession {
  id: string;
  topic: string;
  participants: AI[];
  personalities: { [aiId: string]: string };
  startTime: number;
  status: DebateStatus;
  currentRound: number;
  messageCount: number;
  currentAIIndex: number;
  totalRounds: number;
  civility: 1 | 2 | 3 | 4 | 5;
  format: FormatSpec;
  stances: { [aiId: string]: 'pro' | 'con' };
}

export enum DebateStatus {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  ACTIVE = 'active',
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
    | 'stream_error';
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
  private eventHandlers: DebateEventHandler[] = [];
  private timeouts: Map<string, NodeJS.Timeout> = new Map();
  private currentMessages: Message[] = [];
  
  constructor(aiService: AIService) {
    this.aiService = aiService;
    this.rulesEngine = new DebateRulesEngine();
    this.promptBuilder = new DebatePromptBuilder();
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
      rounds?: number; // 1–5
      civility?: 1 | 2 | 3 | 4 | 5;
      stances?: { [aiId: string]: 'pro' | 'con' };
    }
  ): Promise<DebateSession> {
    // Validate debate setup
    const validation = this.rulesEngine.validateDebateSetup(participants, topic);
    if (!validation.valid) {
      throw new Error(`Invalid debate setup: ${validation.errors.join(', ')}`);
    }
    
    // Resolve configuration
    const format = getFormat(options?.formatId || 'oxford');
    // Allow 3–7 rounds only; default to provided format default (usually 3)
    const desired = options?.rounds ?? format.defaultRounds;
    const totalRounds = Math.max(3, Math.min(desired, 7));
    const civility = (options?.civility as 1|2|3|4|5) || 1;
    const stances: { [aiId: string]: 'pro' | 'con' } = {};
    if (participants[0]) stances[participants[0].id] = options?.stances?.[participants[0].id] || 'pro';
    if (participants[1]) stances[participants[1].id] = options?.stances?.[participants[1].id] || 'con';

    // Create new session
    const session: DebateSession = {
      id: `debate_${Date.now()}`,
      topic,
      participants,
      personalities,
      startTime: Date.now(),
      status: DebateStatus.INITIALIZING,
      currentRound: 1,
      messageCount: 0,
      currentAIIndex: 0,
      totalRounds,
      civility,
      format,
      stances,
    };
    
    this.session = session;
    
    // Initialize services
    this.votingService = new VotingService(participants, format, totalRounds);
    // Apply custom round rules
    this.rulesEngine = new DebateRulesEngine({ maxRounds: totalRounds });
    
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
      throw new Error('No active debate session');
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
    
    const { topic, participants, personalities, format, totalRounds, civility, stances } = this.session;
    const firstAI = participants[0];
    const personalityId = personalities[firstAI.id] || 'default';
    // Build opening prompt with one‑time Role Brief
    const roleBrief = this.promptBuilder.buildRoleBrief({
      topic,
      ai: firstAI,
      personalityId,
      opponentName: participants[1]?.name || 'Opponent',
      opponentPersonalityId: personalities[participants[1]?.id || ''] || 'default',
      stance: stances[firstAI.id] || 'pro',
      rounds: totalRounds,
      civility,
      format,
    });
    const openingPrompt = `${roleBrief}\n\n${this.promptBuilder.buildTurnPrompt({ topic, phase: 'opening', guidance: format.guidance.opening, format })}`;
    
    // Start the debate round
    await this.executeDebateRound(openingPrompt, 0, 1, this.currentMessages);
  }
  
  /**
   * Execute a single debate round
   */
  async executeDebateRound(
    _prompt: string,
    aiIndex: number,
    messageCount: number,
    existingMessages: Message[]
  ): Promise<void> {
    if (!this.session || !this.votingService) {
      throw new Error('No active debate session');
    }
    
    const { participants, personalities, topic, format, totalRounds, civility, stances } = this.session;
    const currentAI = participants[aiIndex];
    const maxMessages = this.rulesEngine.calculateMaxMessages(participants.length);
    
    // Check if debate should end
    if (this.session.status === DebateStatus.COMPLETED || messageCount > maxMessages) {
      this.endDebate();
      return;
    }
    
    // Get round information
    const roundInfo = this.rulesEngine.getRoundInfo(
      messageCount,
      aiIndex,
      participants.length,
      this.session.currentRound
    );
    
    // Check if we need to show voting
    if (roundInfo.shouldShowVoting && !this.votingService.hasVotedForRound(this.session.currentRound)) {
      // We're voting for the round that just ended (currentRound), not the new round
      const isFinalRoundVote = this.session.currentRound === this.session.totalRounds;
      this.showVotingForRound(this.session.currentRound, isFinalRoundVote);
      return;
    }
    
    // Update session state
    if (roundInfo.isNewRound) {
      this.session.currentRound = roundInfo.currentRound;
      
      // Emit round change event
      this.emitEvent({
        type: 'round_changed',
        data: { round: roundInfo.currentRound, isFinal: roundInfo.isFinalRound },
        timestamp: Date.now(),
      });
    }
    
    this.session.currentAIIndex = aiIndex;
    this.session.messageCount = messageCount;
    
    try {
      // Build per‑turn prompt; include Role Brief only the first time this AI speaks
      const personalityId = personalities[currentAI.id] || 'default';
      const hasSpokenBefore = existingMessages.some(m => m.senderType === 'ai' && m.sender.startsWith(currentAI.name));
      const previousMessage = this.promptBuilder.extractPreviousMessage(existingMessages, currentAI);
      const turnIndex = Math.min(messageCount - 1, format.baseTurns.length - 1);
      const phase = format.baseTurns[turnIndex]?.phase || 'rebuttal';
      const minimal = this.promptBuilder.buildTurnPrompt({
        topic,
        phase,
        previousMessage,
        isFinalRound: phase === 'closing' || roundInfo.currentRound >= totalRounds,
        guidance: format.guidance[phase] as string,
        format,
        civilityLevel: civility,
      });
      let contextualPrompt = minimal;
      if (!hasSpokenBefore && aiIndex === 1 && messageCount === 2) {
        // First turn for AI2: provide its Role Brief once
      const brief = this.promptBuilder.buildRoleBrief({
        topic,
        ai: currentAI,
        personalityId,
        opponentName: participants[0]?.name || 'Opponent',
        opponentPersonalityId: personalities[participants[0]?.id || ''] || 'default',
        stance: stances[currentAI.id] || 'con',
        rounds: totalRounds,
        civility,
        format,
      });
        contextualPrompt = `${brief}\n\n${minimal}`;
      }

      // Get debate-only conversation slice
      const debateMessages = existingMessages.filter(msg => msg.timestamp >= (this.session?.startTime || 0));

      // Prefer streaming if adapter supports it
      const adapter = this.aiService.getAdapter(currentAI.id);
      const supportsStreaming = !!adapter?.getCapabilities()?.streaming;
      // Respect global/provider streaming preferences
      const streamingState = store.getState().streaming;
      const providerId = currentAI.id;
      const providerEnabled = streamingState?.streamingPreferences?.[providerId]?.enabled ?? true;
      const globalEnabled = streamingState?.globalStreamingEnabled ?? true;
      const providerHasVerificationError = !!streamingState?.providerVerificationErrors?.[providerId];
      const streamingAllowed = globalEnabled && providerEnabled && !providerHasVerificationError;
      const streamSpeed = (streamingState?.streamingSpeed as 'instant' | 'natural' | 'slow') || 'natural';

      if (adapter && supportsStreaming && streamingAllowed) {
        // Create placeholder message and emit immediately
        const personalityName = UNIVERSAL_PERSONALITIES.find(p => p.id === personalityId)?.name || 'Default';
        const placeholderMessage: Message = {
          id: `msg_${Date.now()}_${currentAI.id}`,
          sender: `${currentAI.name} (${personalityName})`,
          senderType: 'ai',
          content: '',
          timestamp: Date.now(),
          metadata: { modelUsed: currentAI.model },
        };

        const messageId = placeholderMessage.id;
        this.currentMessages = [...existingMessages, placeholderMessage];
        this.emitEvent({ type: 'message_added', data: { message: placeholderMessage }, timestamp: Date.now() });
        this.emitEvent({ type: 'stream_started', data: { messageId, aiProvider: currentAI.id }, timestamp: Date.now() });

        const streamingService = getStreamingService();
        let finalContent = '';
        let hadError = false;

        let errorForFallback: string | null = null;
        await streamingService.streamResponse(
          {
            messageId,
            adapter,
            message: contextualPrompt,
            conversationHistory: debateMessages,
            modelOverride: currentAI.model,
            speed: streamSpeed,
          },
          (chunk: string) => {
            this.emitEvent({ type: 'stream_chunk', data: { messageId, chunk }, timestamp: Date.now() });
          },
          (completeText: string) => {
            finalContent = completeText;
            this.emitEvent({ type: 'stream_completed', data: { messageId, finalContent: completeText, modelUsed: currentAI.model }, timestamp: Date.now() });
          },
          (err: Error) => {
            hadError = true;
            const msg = err?.message || '';
            errorForFallback = msg;
            this.emitEvent({ type: 'stream_error', data: { messageId, error: msg }, timestamp: Date.now() });
          }
        );

        if (!hadError) {
          // Update local message content for subsequent prompts/history
          const updated = { ...placeholderMessage, content: finalContent };
          this.currentMessages = [...existingMessages, updated];
        } else {
          // Determine if we should fallback to non-streaming
          const msgStr = String(errorForFallback || '');
          const isVerificationError = (
            msgStr.includes('organization verification') ||
            msgStr.includes('Streaming requires organization verification') ||
            msgStr.includes('must be verified to stream') ||
            msgStr.includes('Verify Organization')
          );
          const lower = msgStr.toLowerCase();
          const isOverloadError = (
            lower.includes('overload') ||
            lower.includes('temporarily busy') ||
            lower.includes('rate limit')
          );

          if (isVerificationError) {
            try {
              store.dispatch(setProviderVerificationError({ providerId, hasError: true }));
            } catch { /* ignore */ }
          }

          if (isVerificationError || isOverloadError) {
            try {
              const fallback = await this.aiService.sendMessage(
                currentAI.id,
                contextualPrompt,
                debateMessages,
                true,
                undefined,
                undefined,
                currentAI.model
              );
              const { response: text } = typeof fallback === 'string' ? { response: fallback } : fallback;
              finalContent = text;
              // Emit completion to update the placeholder message and end stream state in UI
              this.emitEvent({ type: 'stream_completed', data: { messageId, finalContent: text, modelUsed: currentAI.model }, timestamp: Date.now() });
              const updated = { ...placeholderMessage, content: text };
              this.currentMessages = [...existingMessages, updated];
            } catch {
              // As last resort, append a host error message so the flow continues
              const errorMessage: Message = {
                id: `msg_${Date.now()}_error`,
                sender: 'Debate Host',
                senderType: 'user',
                content: DEBATE_CONSTANTS.MESSAGES.ERROR(currentAI.name),
                timestamp: Date.now(),
              };
              this.emitEvent({ type: 'message_added', data: { message: errorMessage }, timestamp: Date.now() });
              this.currentMessages = [...existingMessages, placeholderMessage, errorMessage];
            }
          } else {
            // Non-recoverable error: add a host error message
            const errorMessage: Message = {
              id: `msg_${Date.now()}_error`,
              sender: 'Debate Host',
              senderType: 'user',
              content: DEBATE_CONSTANTS.MESSAGES.ERROR(currentAI.name),
              timestamp: Date.now(),
            };
            this.emitEvent({ type: 'message_added', data: { message: errorMessage }, timestamp: Date.now() });
            this.currentMessages = [...existingMessages, placeholderMessage, errorMessage];
          }
        }

        // Schedule next round
        const nextMessageCount = messageCount + 1;
        if (nextMessageCount <= maxMessages && this.session.status === DebateStatus.ACTIVE) {
          const nextAIIndex = this.rulesEngine.getNextAIIndex(aiIndex, participants.length);
          // When streaming was used, we've already consumed user reading time during the stream.
          // Use a shorter post-message pause to keep the debate flowing naturally.
          const delay = DEBATE_CONSTANTS.DELAYS.POST_STREAM_PAUSE;
          this.scheduleNextRound(nextAIIndex, nextMessageCount, this.currentMessages, delay);
        } else {
          this.endDebate();
        }
      } else {
        // Non-streaming fallback (retain existing typing behavior)
        this.emitEvent({ type: 'typing_started', data: { aiName: currentAI.name }, timestamp: Date.now() });

        const response = await this.aiService.sendMessage(
          currentAI.id,
          contextualPrompt,
          debateMessages,
          true,
          undefined,
          undefined,
          currentAI.model
        );

        const personalityName = UNIVERSAL_PERSONALITIES.find(p => p.id === personalityId)?.name || 'Default';
        const { response: responseText, modelUsed } = response;
        const aiMessage: Message = {
          id: `msg_${Date.now()}_${currentAI.id}`,
          sender: `${currentAI.name} (${personalityName})`,
          senderType: 'ai',
          content: responseText,
          timestamp: Date.now(),
          metadata: modelUsed ? { modelUsed } : undefined,
        };
        this.currentMessages = [...existingMessages, aiMessage];
        this.emitEvent({ type: 'message_added', data: { message: aiMessage }, timestamp: Date.now() });
        this.emitEvent({ type: 'typing_stopped', data: { aiName: currentAI.name }, timestamp: Date.now() });

        const nextMessageCount = messageCount + 1;
        if (nextMessageCount <= maxMessages && this.session.status === DebateStatus.ACTIVE) {
          const nextAIIndex = this.rulesEngine.getNextAIIndex(aiIndex, participants.length);
          // Non-streaming path: keep the longer delay to allow reading time.
          const delay = DEBATE_CONSTANTS.DELAYS.AI_RESPONSE;
          this.scheduleNextRound(nextAIIndex, nextMessageCount, this.currentMessages, delay);
        } else {
          this.endDebate();
        }
      }

    } catch (error) {
      await this.handleDebateError(error as Error, currentAI, aiIndex, messageCount, existingMessages);
    }
  }
  
  /**
   * Handle errors during debate execution
   */
  private async handleDebateError(
    error: Error,
    currentAI: AI,
    aiIndex: number,
    messageCount: number,
    existingMessages: Message[]
  ): Promise<void> {
    if (!this.session) return;
    
    const debateError: DebateError = {
      type: error.message?.includes('429') ? 'rate_limit' : 'ai_error',
      message: error.message,
      aiId: currentAI.id,
      retryable: true,
    };
    
    // Emit typing stopped
    this.emitEvent({
      type: 'typing_stopped',
      data: { aiName: currentAI.name },
      timestamp: Date.now(),
    });
    
    // Create error message
    const errorMessage: Message = {
      id: `msg_${Date.now()}_error`,
      sender: 'Debate Host',
      senderType: 'user',
      content: debateError.type === 'rate_limit' 
        ? DEBATE_CONSTANTS.MESSAGES.RATE_LIMIT(currentAI.name)
        : DEBATE_CONSTANTS.MESSAGES.ERROR(currentAI.name),
      timestamp: Date.now(),
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
    
    // Continue with next AI after delay
    const nextMessageCount = messageCount + 1;
    const maxMessages = this.rulesEngine.calculateMaxMessages(this.session.participants.length);
    
    if (nextMessageCount <= maxMessages && this.session.status === DebateStatus.ACTIVE) {
      const nextAIIndex = this.rulesEngine.getNextAIIndex(aiIndex, this.session.participants.length);
      const delay = debateError.type === 'rate_limit' 
        ? DEBATE_CONSTANTS.DELAYS.RATE_LIMIT_RECOVERY 
        : DEBATE_CONSTANTS.DELAYS.ERROR_RECOVERY;
      
      this.scheduleNextRound(nextAIIndex, nextMessageCount, this.currentMessages, delay);
    } else {
      this.endDebate();
    }
  }
  
  /**
   * Schedule the next round with a delay
   */
  private scheduleNextRound(
    aiIndex: number,
    messageCount: number,
    messages: Message[],
    delay: number
  ): void {
    if (!this.session) return;
    
    const timeoutId = `next_round_${Date.now()}`;
    const timeout = setTimeout(() => {
      this.timeouts.delete(timeoutId);
      if (this.session?.status === DebateStatus.ACTIVE) {
        const prompt = this.buildContinuationPrompt(aiIndex, messages);
        this.executeDebateRound(prompt, aiIndex, messageCount, messages);
      }
    }, delay);
    
    this.timeouts.set(timeoutId, timeout);
  }
  
  /**
   * Build continuation prompt for next AI
   */
  private buildContinuationPrompt(aiIndex: number, messages: Message[]): string {
    if (!this.session) return '';
    
    const { participants, personalities, topic, format, totalRounds, civility, stances } = this.session;
    const currentAI = participants[aiIndex];
    const personalityId = personalities[currentAI.id] || 'default';
    const previousMessage = this.promptBuilder.extractPreviousMessage(messages, currentAI);
    const turnIndex = Math.min(this.session.messageCount - 1, format.baseTurns.length - 1);
    const phase = format.baseTurns[turnIndex]?.phase || 'rebuttal';
    const minimal = this.promptBuilder.buildTurnPrompt({
      topic,
      phase,
      previousMessage,
      isFinalRound: phase === 'closing' || this.session.currentRound >= totalRounds,
      guidance: format.guidance[phase] as string,
    });
    // Role brief injection only if this AI has not spoken yet
    const hasSpokenBefore = messages.some(m => m.senderType === 'ai' && m.sender.startsWith(currentAI.name));
    if (!hasSpokenBefore) {
      const opponent = participants[(aiIndex + 1) % participants.length];
      const brief = this.promptBuilder.buildRoleBrief({
        topic,
        ai: currentAI,
        personalityId,
        opponentName: opponent?.name || 'Opponent',
        opponentPersonalityId: personalities[opponent?.id || ''] || 'default',
        stance: stances[currentAI.id] || (aiIndex === 0 ? 'pro' : 'con'),
        rounds: totalRounds,
        civility,
        format,
      });
      return `${brief}\n\n${minimal}`;
    }
    return minimal;
  }
  
  /**
   * Show voting interface for a round
   */
  private showVotingForRound(round: number, isFinalRound: boolean): void {
    this.updateSessionStatus(DebateStatus.VOTING_ROUND);
    
    this.emitEvent({
      type: 'voting_started',
      data: { round, isFinalRound, isOverallVote: false },
      timestamp: Date.now(),
    });
  }
  
  /**
   * Record a vote and continue the debate
   */
  async recordVote(round: number, winnerId: string, _isOverallVote: boolean = false): Promise<void> {
    if (!this.votingService || !this.session) {
      throw new Error('No active voting session');
    }
    
    // Record round vote
    this.votingService.recordRoundVote(round, winnerId);
    
    // Emit round winner message
    const winnerMessage: Message = {
      id: `msg_${Date.now()}_round_${round}`,
      sender: 'Debate Host',
      senderType: 'user',
      content: this.votingService.getWinnerMessage(round, winnerId, round === this.session.totalRounds),
      timestamp: Date.now(),
    };
    
    this.emitEvent({
      type: 'message_added',
      data: { message: winnerMessage },
      timestamp: Date.now(),
    });
    
    // Update scores after voting (UI will display persistent scoreboard)
    const scores = this.votingService.calculateScores();
    
    // Emit score update event instead of message
    this.emitEvent({
      type: 'voting_completed',
      data: { round, winnerId, scores },
      timestamp: Date.now(),
    });
    
    // Check if all rounds are complete
    if (this.votingService.areAllRoundsVoted()) {
      // Declare overall winner based on scores (no more voting)
      this.declareOverallWinner();
    } else {
      // Continue the debate after voting
      this.updateSessionStatus(DebateStatus.ACTIVE);
      
      // Resume debate with the next round
      this.resumeDebateAfterVoting();
    }
  }
  
  /**
   * Resume debate after voting is complete
   */
  private resumeDebateAfterVoting(): void {
    if (!this.session || !this.votingService) return;
    
    const { participants } = this.session;
    
    // Continue with the next message in the debate
    const nextMessageCount = this.session.messageCount + 1;
    const nextAIIndex = this.rulesEngine.getNextAIIndex(this.session.currentAIIndex, participants.length);
    
    // Use shorter delay for faster flow after voting
    const delay = DEBATE_CONSTANTS.DELAYS.VOTING_CONTINUATION;
    
    // Schedule the next round with the accumulated messages
    this.scheduleNextRound(nextAIIndex, nextMessageCount, this.currentMessages, delay);
  }
  
  /**
   * Declare overall winner based on scores
   */
  private declareOverallWinner(): void {
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
      winnerMessage = {
        id: `msg_${Date.now()}_overall_winner`,
        sender: 'Debate Host',
        senderType: 'user',
        content: `\n🏆 **DEBATE ENDED IN A TIE!**\n\n${tiedAIs.join(' and ')} both won ${winnerScore.roundWins} ${winnerScore.roundWins === 1 ? 'round' : 'rounds'}!`,
        timestamp: Date.now(),
      };
    } else {
      winnerMessage = {
        id: `msg_${Date.now()}_overall_winner`,
        sender: 'Debate Host',
        senderType: 'user',
        content: `\n🏆 **OVERALL WINNER: ${winnerScore.name}!**\n\n${winnerScore.name} won ${winnerScore.roundWins} out of ${this.session.totalRounds} rounds!`,
        timestamp: Date.now(),
      };
    }
    
    this.updateSessionStatus(DebateStatus.COMPLETED);
    
    this.emitEvent({
      type: 'message_added',
      data: { message: winnerMessage },
      timestamp: Date.now(),
    });
    
    this.emitEvent({
      type: 'debate_ended',
      data: { session: this.session, overallWinner: winnerId, finalScores: scores },
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
      
      const debateSession: ChatSession = {
        id: sessionId,
        sessionType: 'debate',
        topic: this.session.topic, // Store the debate topic directly
        selectedAIs: this.session.participants,
        messages: this.currentMessages, // Use the actual messages from the debate
        isActive: false,
        createdAt: this.session.startTime,
        lastMessageAt: Date.now(),
        debateConfig: {
          formatId: this.session.format.id,
          rounds: this.session.totalRounds,
          tempo: 'streaming',
          postStreamPauseMs: DEBATE_CONSTANTS.DELAYS.POST_STREAM_PAUSE,
          civility: this.session.civility,
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
    
    // Show voting for final round
    this.showVotingForRound(this.session.totalRounds, true);
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
    this.timeouts.forEach(timeout => clearTimeout(timeout));
    this.timeouts.clear();
    this.session = null;
    this.votingService = null;
    this.eventHandlers = [];
    this.currentMessages = [];
  }
}
