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
  type: 'message_added' | 'round_changed' | 'voting_started' | 'debate_ended' | 'error_occurred' | 'debate_started' | 'typing_started' | 'typing_stopped' | 'voting_completed';
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
    personalities: { [aiId: string]: string } = {}
  ): Promise<DebateSession> {
    // Validate debate setup
    const validation = this.rulesEngine.validateDebateSetup(participants, topic);
    if (!validation.valid) {
      throw new Error(`Invalid debate setup: ${validation.errors.join(', ')}`);
    }
    
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
    };
    
    this.session = session;
    
    // Initialize services
    this.votingService = new VotingService(participants);
    
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
    
    // Store the initial messages
    this.currentMessages = [...existingMessages];
    
    const { topic, participants, personalities } = this.session;
    const firstAI = participants[0];
    const personalityId = personalities[firstAI.id] || 'default';
    
    // Build opening prompt
    const openingPrompt = this.promptBuilder.buildOpeningPrompt({
      topic,
      ai: firstAI,
      personalityId,
      isFirstMessage: true,
      isLastRound: false,
      roundNumber: 1,
      messageCount: 1,
    });
    
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
    
    const { participants, personalities, topic } = this.session;
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
      const isFinalRoundVote = this.session.currentRound === DEBATE_CONSTANTS.MAX_ROUNDS;
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
      // Emit typing started
      this.emitEvent({
        type: 'typing_started',
        data: { aiName: currentAI.name },
        timestamp: Date.now(),
      });
      
      // Build contextual prompt
      const personalityId = personalities[currentAI.id] || 'default';
      const contextualPrompt = this.promptBuilder.buildContextualPrompt(
        topic,
        currentAI,
        personalityId,
        existingMessages,
        roundInfo.currentRound,
        messageCount,
        maxMessages
      );
      
      // Get AI response
      const debateMessages = existingMessages.filter(msg => 
        msg.timestamp >= (this.session?.startTime || 0)
      );
      
      const response = await this.aiService.sendMessage(
        currentAI.id,
        contextualPrompt,
        debateMessages,
        true, // isDebateMode
        undefined, // no resumption context
        undefined, // no attachments in debate
        currentAI.model // Pass the specific model for this AI
      );
      
      // Create AI message
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
      
      // Add message to our tracked messages
      this.currentMessages = [...existingMessages, aiMessage];
      
      // Emit message event
      this.emitEvent({
        type: 'message_added',
        data: { message: aiMessage },
        timestamp: Date.now(),
      });
      
      // Emit typing stopped
      this.emitEvent({
        type: 'typing_stopped',
        data: { aiName: currentAI.name },
        timestamp: Date.now(),
      });
      
      // Schedule next round
      const nextMessageCount = messageCount + 1;
      if (nextMessageCount <= maxMessages && this.session.status === DebateStatus.ACTIVE) {
        const nextAIIndex = this.rulesEngine.getNextAIIndex(aiIndex, participants.length);
        const delay = DEBATE_CONSTANTS.DELAYS.AI_RESPONSE;
        
        this.scheduleNextRound(nextAIIndex, nextMessageCount, this.currentMessages, delay);
      } else {
        this.endDebate();
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
    
    const { participants, personalities, topic } = this.session;
    const currentAI = participants[aiIndex];
    const personalityId = personalities[currentAI.id] || 'default';
    const previousMessage = this.promptBuilder.extractPreviousMessage(messages, currentAI);
    
    if (previousMessage) {
      return this.promptBuilder.buildResponsePrompt({
        topic,
        ai: currentAI,
        personalityId,
        isFirstMessage: false,
        isLastRound: this.session.messageCount >= this.rulesEngine.calculateMaxMessages(participants.length),
        previousMessage,
        roundNumber: this.session.currentRound,
        messageCount: this.session.messageCount,
      });
    } else {
      return this.promptBuilder.buildContinuationPrompt({
        topic,
        ai: currentAI,
        personalityId,
        isFirstMessage: false,
        isLastRound: false,
        roundNumber: this.session.currentRound,
        messageCount: this.session.messageCount,
      });
    }
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
      content: this.votingService.getWinnerMessage(round, winnerId, round === DEBATE_CONSTANTS.MAX_ROUNDS),
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
        content: `\n🏆 **OVERALL WINNER: ${winnerScore.name}!**\n\n${winnerScore.name} won ${winnerScore.roundWins} out of ${DEBATE_CONSTANTS.MAX_ROUNDS} rounds!`,
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
      // Check if user is premium
      const state = store.getState();
      const currentUser = state.user.currentUser;
      const isPremium = currentUser?.subscription === 'pro' || currentUser?.subscription === 'business';
      
      // Enforce storage limits before saving
      await StorageService.enforceStorageLimits('debate', isPremium);
      
      // Create debate session for storage
      // Messages should be added by the DebateScreen which listens to events
      const debateSession: ChatSession = {
        id: `debate_${this.session.id}`,
        sessionType: 'debate',
        selectedAIs: this.session.participants,
        messages: [], // Will be populated by DebateScreen
        isActive: false,
        createdAt: this.session.startTime,
        lastMessageAt: Date.now(),
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
    this.showVotingForRound(DEBATE_CONSTANTS.MAX_ROUNDS, true);
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