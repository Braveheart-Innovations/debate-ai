/**
 * Voting Service
 * Handles all voting logic including round voting, overall voting, and score calculation
 */

import { AI } from '../../types';
import { DEBATE_CONSTANTS } from '../../config/debateConstants';
import type { FormatSpec } from '../../config/debate/formats';

export interface VoteRecord {
  round: number;
  winnerId: string;
  timestamp: number;
}

export interface ScoreBoard {
  [aiId: string]: {
    name: string;
    roundWins: number;
    roundsWon: number[];
    isOverallWinner: boolean;
  };
}

export interface VotingState {
  votes: { [round: number]: string };
  overallWinner?: string;
  isVoting: boolean;
  votingRound: number;
  isFinalVote: boolean;
  isOverallVote: boolean;
}

export class VotingService {
  private participants: AI[];
  private format: FormatSpec;
  private maxRounds: number;
  private votes: Map<number, VoteRecord> = new Map();
  private overallWinner?: string;
  
  constructor(participants: AI[], format: FormatSpec, maxRounds: number = DEBATE_CONSTANTS.MAX_ROUNDS) {
    this.participants = participants;
    this.format = format;
    this.maxRounds = maxRounds;
  }
  
  /**
   * Record a vote for a specific round
   */
  recordRoundVote(round: number, winnerId: string): VoteRecord {
    const voteRecord: VoteRecord = {
      round,
      winnerId,
      timestamp: Date.now(),
    };
    
    this.votes.set(round, voteRecord);
    return voteRecord;
  }
  
  /**
   * Record the overall winner
   */
  recordOverallWinner(winnerId: string): void {
    this.overallWinner = winnerId;
  }
  
  /**
   * Get vote for a specific round
   */
  getRoundVote(round: number): VoteRecord | undefined {
    return this.votes.get(round);
  }
  
  /**
   * Check if a round has been voted on
   */
  hasVotedForRound(round: number): boolean {
    return this.votes.has(round);
  }
  
  /**
   * Get all votes as a simple map for compatibility
   */
  getVotesMap(): { [key: string]: string } {
    const votesMap: { [key: string]: string } = {};
    this.votes.forEach((vote, round) => {
      votesMap[round.toString()] = vote.winnerId;
    });
    if (this.overallWinner) {
      votesMap.overall = this.overallWinner;
    }
    return votesMap;
  }
  
  /**
   * Calculate current scores based on round wins
   */
  calculateScores(): ScoreBoard {
    const scoreBoard: ScoreBoard = {};
    
    // Initialize scoreboard
    this.participants.forEach(ai => {
      scoreBoard[ai.id] = {
        name: ai.name,
        roundWins: 0,
        roundsWon: [],
        isOverallWinner: ai.id === this.overallWinner,
      };
    });
    
    // Count round wins
    this.votes.forEach((vote, round) => {
      if (scoreBoard[vote.winnerId]) {
        scoreBoard[vote.winnerId].roundWins++;
        scoreBoard[vote.winnerId].roundsWon.push(round);
      }
    });
    
    return scoreBoard;
  }
  
  /**
   * Get voting prompt for UI
   */
  getVotingPrompt(round: number, _isFinalVote: boolean, isOverallVote: boolean): string {
    if (isOverallVote) {
      return DEBATE_CONSTANTS.VOTING.OVERALL_PROMPT;
    }
    const label = this.getExchangeLabel(round);
    // Keep concise and avoid the word "Round"
    return `🏅 Who won ${label}?`;
  }
  
  /**
   * Get winner announcement message
   */
  getWinnerMessage(round: number, winnerId: string, _isFinalVote: boolean): string {
    const winner = this.participants.find(ai => ai.id === winnerId);
    const winnerName = winner?.name || 'Unknown';
    const label = this.getExchangeLabel(round);
    // Use exchange label instead of numeric round
    return `${label}: ${winnerName}`;
  }
  
  /**
   * Get overall winner message
   */
  getOverallWinnerMessage(winnerId: string): string {
    const winner = this.participants.find(ai => ai.id === winnerId);
    const winnerName = winner?.name || 'Unknown';
    return DEBATE_CONSTANTS.MESSAGES.OVERALL_WINNER(winnerName);
  }
  
  /**
   * Check if all rounds have been voted on
   */
  areAllRoundsVoted(): boolean {
    for (let round = 1; round <= this.maxRounds; round++) {
      if (!this.hasVotedForRound(round)) {
        return false;
      }
    }
    return true;
  }
  
  /**
   * Get next round that needs voting
   */
  getNextVotingRound(): number | null {
    for (let round = 1; round <= this.maxRounds; round++) {
      if (!this.hasVotedForRound(round)) {
        return round;
      }
    }
    return null;
  }
  
  /**
   * Reset all votes and state
   */
  reset(): void {
    this.votes.clear();
    this.overallWinner = undefined;
  }
  
  /**
   * Get voting statistics
   */
  getVotingStats(): {
    totalRounds: number;
    votedRounds: number;
    remainingRounds: number;
    hasOverallWinner: boolean;
  } {
    return {
      totalRounds: this.maxRounds,
      votedRounds: this.votes.size,
      remainingRounds: this.maxRounds - this.votes.size,
      hasOverallWinner: !!this.overallWinner,
    };
  }

  /**
   * Derive the human-friendly exchange label (e.g., Opening, Rebuttal, Closing)
   */
  private getExchangeLabel(round: number): string {
    // If the debate uses 5 exchanges, provide canonical labels
    if (this.maxRounds === 5) {
      const MAP_5: Record<number, string> = {
        1: 'Opening',
        2: 'Rebuttal',
        3: 'Cross-examination',
        4: 'Counter',
        5: 'Closing',
      };
      return MAP_5[round] || 'Exchange';
    }
    // If the debate uses 7 exchanges, provide full mapping
    if (this.maxRounds === 7) {
      const MAP_7: Record<number, string> = {
        1: 'Opening',
        2: 'Rebuttal',
        3: 'Deep analysis',
        4: 'Cross-examination',
        5: 'Counter',
        6: 'Synthesis',
        7: 'Closing',
      };
      return MAP_7[round] || 'Exchange';
    }

    const turnsPerExchange = Math.max(2, this.participants.length);
    const turnIndex = Math.min((round - 1) * turnsPerExchange, this.format.baseTurns.length - 1);
    const phase = this.format.baseTurns[turnIndex]?.phase || 'rebuttal';
    // Prefer explicit description from format.phases
    const phaseMeta = this.format.phases.find(p => p.id === phase);
    const known: Record<string, string> = {
      opening: 'Opening',
      rebuttal: 'Rebuttal',
      closing: 'Closing',
      crossfire: 'Cross-examination',
      question: 'Question',
    };
    if (phaseMeta?.description) {
      return known[phase] || phaseMeta.description.split(':')[0];
    }
    return known[phase] || 'Exchange';
  }
}
