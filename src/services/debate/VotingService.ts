/**
 * Voting Service
 * Handles voting logic including round voting, overall voting, and score calculation.
 */

import { AI, type DebateVoteResult } from '../../types';
import { DEBATE_CONSTANTS } from '../../config/debateConstants';
import {
  type AudienceDecisionResult,
  type AudienceStance,
  type AudienceVoteStage,
  type DebateSideId,
  getPresetForFormat,
  getPresetIdForRounds,
  type DebateFormatId,
  type FormatSpec,
  type MessageSpec,
  type PhaseId,
  type PresetConfig,
} from '../../config/debate/formats';

export type VoteRecord = DebateVoteResult;

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

export type { AudienceDecisionResult, AudienceStance, AudienceVoteStage };

interface VoteCheckpoint {
  label: string;
  prompt: string;
  criterion: string;
}

function isPresetConfig(value: PresetConfig | FormatSpec | undefined): value is PresetConfig {
  return Boolean(value && Array.isArray((value as PresetConfig).messages));
}

function isFormatSpec(value: PresetConfig | FormatSpec | undefined): value is FormatSpec {
  return Boolean(value && Array.isArray((value as FormatSpec).presets));
}

export class VotingService {
  private participants: AI[];
  private preset: PresetConfig;
  private formatId: DebateFormatId = 'oxford';
  private voteCheckpoints: VoteCheckpoint[];
  private totalVotes: number;
  private votes: Map<number, VoteRecord> = new Map();
  private audienceVotes: Partial<Record<AudienceVoteStage, VoteRecord>> = {};
  private overallWinner?: string;
  private overallWinnerIds: string[] = [];

  constructor(
    participants: AI[],
    presetOrFormat: PresetConfig | FormatSpec,
    legacyMaxRoundsOrFormatId?: number | DebateFormatId
  ) {
    this.participants = participants;

    if (isPresetConfig(presetOrFormat)) {
      this.preset = presetOrFormat;
      if (typeof legacyMaxRoundsOrFormatId === 'string') {
        this.formatId = legacyMaxRoundsOrFormatId;
      }
    } else if (isFormatSpec(presetOrFormat)) {
      this.formatId = presetOrFormat.id;
      const rounds = typeof legacyMaxRoundsOrFormatId === 'number'
        ? legacyMaxRoundsOrFormatId
        : undefined;
      const presetId = getPresetIdForRounds(rounds);
      this.preset = presetOrFormat.presets.find((preset) => preset.id === presetId) || presetOrFormat.presets[0];
    } else {
      this.preset = getPresetForFormat('oxford', 'short');
    }

    if (this.isAudienceStanceVoteModel()) {
      this.voteCheckpoints = [];
      this.totalVotes = Number(this.preset.initialVoteRequired) + Number(this.preset.finalVoteRequired);
    } else {
      this.voteCheckpoints = this.preset.messages
        .filter((message) => message.voteAfter)
        .map((message) => this.buildVoteCheckpoint(message));
      this.totalVotes = this.voteCheckpoints.length;
    }
  }

  isAudienceStanceVoteModel(): boolean {
    return this.preset.voteModel === 'audience_stance';
  }

  private buildVoteCheckpoint(message: MessageSpec): VoteCheckpoint {
    const label = message.votingLabel || message.label || 'Exchange';

    return {
      label,
      prompt: this.buildVotingPrompt(label, message.phase),
      criterion: this.buildVoteCriterion(label, message.phase),
    };
  }

  private buildVotingPrompt(label: string, phase?: PhaseId): string {
    const normalized = label.toLowerCase();

    switch (this.formatId) {
      case 'lincoln_douglas':
        if (normalized.includes('2ar')) {
          return 'Who gave the clearer Lincoln-Douglas ballot story in the 2AR?';
        }
        if (normalized.includes('nr/2nr')) {
          return 'Who better collapsed the Lincoln-Douglas value clash in the NR/2NR?';
        }
        if (normalized.includes('1ar')) {
          return 'Who better recovered and weighed the affirmative case in the 1AR?';
        }
        if (normalized.includes('nc/1nr')) {
          return 'Who better handled the negative value framework and CX?';
        }
        return 'Who better established the Lincoln-Douglas value framework?';
      case 'policy':
        if (normalized.includes('2ar')) {
          return 'Who gave the clearer policy ballot story in the 2AR?';
        }
        if (normalized.includes('2nc')) {
          return 'Who better developed policy clash on solvency, impacts, and burdens?';
        }
        if (normalized.includes('1nc')) {
          return 'Who better framed the negative burden, links, and case clash?';
        }
        if (normalized.includes('2ac')) {
          return 'Who better rebuilt solvency and answered the negative positions?';
        }
        if (normalized.includes('1ac')) {
          return 'Who better established plan, harms, solvency, and impacts?';
        }
        return 'Who better handled the policy checkpoint?';
      case 'socratic':
        if (phase === 'synthesis' || phase === 'closing') {
          return 'Who produced the clearer synthesis?';
        }
        return `Who advanced the inquiry more clearly in ${label.toLowerCase()}?`;
      case 'oxford':
      default:
        return `Who had the stronger ${label.toLowerCase()}?`;
    }
  }

  private buildVoteCriterion(label: string, phase: PhaseId): string {
    const normalized = label.toLowerCase();

    switch (this.formatId) {
      case 'lincoln_douglas':
        if (normalized.includes('value constructives')) {
          return `${label}: choose who better established and defended their value, criterion, definitions, and contentions.`;
        }
        if (normalized.includes('ac value') || normalized.includes('nc/1nr value')) {
          return `${label}: choose who better established and defended their value, criterion, definitions, and contentions through cross-examination.`;
        }
        if (phase === 'constructive') {
          return `${label}: choose who better established their value, criterion, definitions, and initial burden.`;
        }
        if (phase === 'cross_examination') {
          return `${label}: choose who used questions and answers to expose weaknesses, clarify standards, and protect their case.`;
        }
        if (phase === 'final_rebuttal') {
          return `${label}: choose who crystallized the value clash, compared voters, and gave the clearer reason to prefer their criterion on the ballot.`;
        }
        return `${label}: choose who better answered attacks, extended key value arguments, weighed standards, and explained the ballot.`;
      case 'policy':
        if (normalized.includes('1ac') || normalized.includes('1nc')) {
          return `${label}: choose who better framed the plan or opposition, core harms, links, burden, and solvency claims.`;
        }
        if (normalized.includes('2ac') || normalized.includes('2nc')) {
          return `${label}: choose who better developed clash on solvency, disadvantages, counterplans, impact links, and comparative advantage.`;
        }
        if (normalized.includes('2ar')) {
          return `${label}: choose who better extended winning arguments, compared impacts, handled dropped arguments, and explained the ballot.`;
        }
        if (phase === 'cross_examination') {
          return `${label}: choose who turned cross-examination into useful concessions or clearer burden analysis.`;
        }
        return `${label}: choose who better extended winning arguments, compared impacts, identified drops, and explained the ballot.`;
      case 'socratic':
        if (label === 'Initial Framing') {
          return `${label}: choose who framed the central assumption or definition more clearly.`;
        }
        if (label === 'Clarification' || label === 'Focused Inquiry') {
          return `${label}: choose who advanced the inquiry with the sharper question or more direct answer.`;
        }
        if (label === 'Assumption Testing' || label === 'Counter-Questioning') {
          return `${label}: choose who tested assumptions more precisely without drifting from the issue.`;
        }
        return `${label}: choose who produced the clearer synthesis or unresolved tension.`;
      case 'oxford':
      default:
        if (phase === 'opening') {
          return `${label}: choose who gave the clearer motion framing, definitions, burden, and initial support.`;
        }
        if (phase === 'closing') {
          return `${label}: choose who gave the cleaner summary of voters and weighing without relying on new claims.`;
        }
        if (phase === 'final_rebuttal') {
          return `${label}: choose who best crystallized the decisive clash before closing.`;
        }
        return `${label}: choose who answered the other side more directly and improved their position on the motion.`;
    }
  }

  private getOverallVoteCriterion(): string {
    switch (this.formatId) {
      case 'lincoln_douglas':
        return 'Final decision: weigh the value clash across all checkpoints and choose the debater whose criterion should decide the debate.';
      case 'policy':
        return 'Final decision: weigh solvency, risks, impacts, and dropped arguments across the full policy debate.';
      case 'socratic':
        return 'Final decision: choose who most improved understanding through clear questions, direct answers, and useful synthesis.';
      case 'oxford':
      default:
        return this.isAudienceStanceVoteModel()
          ? 'Final audience vote: choose where you stand on the motion after hearing both sides.'
          : 'Final decision: weigh the checkpoint wins and choose who carried the motion more convincingly overall.';
    }
  }

  getAudienceVotingPrompt(stage: AudienceVoteStage): string {
    return stage === 'initial'
      ? 'Before the debate, where do you stand on the motion?'
      : 'After hearing the debate, where do you stand now?';
  }

  getAudienceVoteCriterion(stage: AudienceVoteStage): string {
    return stage === 'initial'
      ? 'Opening audience stance: mark your starting point before any arguments are heard.'
      : 'Final audience vote: choose the side that has persuaded you by the end of the debate.';
  }

  getAudienceVoteOptions(stage: AudienceVoteStage): Array<{
    id: AudienceStance;
    label: string;
    description: string;
  }> {
    const options: Array<{
      id: AudienceStance;
      label: string;
      description: string;
    }> = [
      { id: 'for', label: 'For', description: 'You currently support the motion.' },
      { id: 'against', label: 'Against', description: 'You currently oppose the motion.' },
    ];

    if (stage === 'initial') {
      options.push({ id: 'undecided', label: 'Undecided', description: 'You want to hear the arguments first.' });
    }

    return options;
  }

  getVoteCriterion(roundOrIsOverallVote: number | boolean = 1, maybeIsOverallVote: boolean = false): string {
    const isOverallVote = typeof roundOrIsOverallVote === 'boolean'
      ? roundOrIsOverallVote
      : maybeIsOverallVote;
    const round = typeof roundOrIsOverallVote === 'number'
      ? roundOrIsOverallVote
      : 1;

    if (isOverallVote) {
      return this.getOverallVoteCriterion();
    }

    return this.getVoteCheckpoint(round)?.criterion || this.buildVoteCriterion('Exchange', 'rebuttal');
  }

  recordRoundVote(round: number, winnerId: string): VoteRecord {
    if (this.isAudienceStanceVoteModel()) {
      throw new Error('Oxford audience-stance debates do not record checkpoint winners.');
    }

    const winner = this.participants.find((ai) => ai.id === winnerId);
    const voteRecord: VoteRecord = {
      round,
      winnerId,
      winnerName: winner?.name,
      votingLabel: this.getVotingLabel(round),
      criterion: this.getVoteCriterion(round, false),
      timestamp: Date.now(),
    };

    this.votes.set(round, voteRecord);
    return voteRecord;
  }

  recordAudienceVote(stage: AudienceVoteStage, stance: AudienceStance): VoteRecord {
    if (!this.isAudienceStanceVoteModel()) {
      throw new Error('Audience stance voting is only available for audience-vote debate presets.');
    }

    if (stage === 'final' && stance === 'undecided') {
      throw new Error('Final Oxford audience vote must be For or Against.');
    }

    const voteRecord: VoteRecord = {
      round: stage === 'initial' ? 0 : 1,
      winnerId: stance,
      winnerName: this.getAudienceStanceLabel(stance),
      votingLabel: stage === 'initial' ? 'Opening Audience Stance' : 'Final Audience Vote',
      criterion: this.getAudienceVoteCriterion(stage),
      timestamp: Date.now(),
      voteKind: 'audience_stance',
      audienceVoteStage: stage,
      audienceStance: stance,
    };

    this.audienceVotes[stage] = voteRecord;
    return voteRecord;
  }

  recordOverallWinner(winnerId: string, winnerIds: string[] = [winnerId]): void {
    this.overallWinner = winnerId;
    this.overallWinnerIds = winnerIds;
  }

  getRoundVote(round: number): VoteRecord | undefined {
    return this.votes.get(round);
  }

  getVoteRecords(): VoteRecord[] {
    if (this.isAudienceStanceVoteModel()) {
      return (['initial', 'final'] as AudienceVoteStage[])
        .map((stage) => this.audienceVotes[stage])
        .filter((vote): vote is VoteRecord => Boolean(vote));
    }

    return Array.from(this.votes.values()).sort((a, b) => a.round - b.round);
  }

  hasVotedForRound(round: number): boolean {
    return this.votes.has(round);
  }

  getVotesMap(): { [key: string]: string } {
    const votesMap: { [key: string]: string } = {};
    if (this.isAudienceStanceVoteModel()) {
      if (this.audienceVotes.initial?.audienceStance) {
        votesMap.initial = this.audienceVotes.initial.audienceStance;
      }
      if (this.audienceVotes.final?.audienceStance) {
        votesMap.final = this.audienceVotes.final.audienceStance;
      }
      if (this.overallWinner) {
        votesMap.overall = this.overallWinner;
      }
      return votesMap;
    }

    this.votes.forEach((vote, round) => {
      votesMap[round.toString()] = vote.winnerId;
    });
    if (this.overallWinner) {
      votesMap.overall = this.overallWinner;
    }
    return votesMap;
  }

  calculateScores(): ScoreBoard {
    const scoreBoard: ScoreBoard = {};

    if (this.isAudienceStanceVoteModel()) {
      const result = this.getAudienceDecisionResult();
      if (!result) {
        return scoreBoard;
      }
      const winningSide = result?.winningSide;
      const affName = this.getSideLabel('aff');
      const negName = this.getSideLabel('neg');

      scoreBoard.aff = {
        name: affName,
        roundWins: winningSide === 'aff' ? 1 : 0,
        roundsWon: winningSide === 'aff' ? [1] : [],
        isOverallWinner: winningSide === 'aff',
      };
      scoreBoard.neg = {
        name: negName,
        roundWins: winningSide === 'neg' ? 1 : 0,
        roundsWon: winningSide === 'neg' ? [1] : [],
        isOverallWinner: winningSide === 'neg',
      };
      return scoreBoard;
    }

    this.participants.forEach((ai) => {
      scoreBoard[ai.id] = {
        name: ai.name,
        roundWins: 0,
        roundsWon: [],
        isOverallWinner: ai.id === this.overallWinner,
      };
    });

    this.votes.forEach((vote, round) => {
      if (scoreBoard[vote.winnerId]) {
        scoreBoard[vote.winnerId].roundWins += 1;
        scoreBoard[vote.winnerId].roundsWon.push(round);
      }
    });

    return scoreBoard;
  }

  getVotingLabel(voteIndex: number): string {
    return this.getVoteCheckpoint(voteIndex)?.label || 'Exchange';
  }

  private getVoteCheckpoint(voteIndex: number): VoteCheckpoint | undefined {
    if (voteIndex >= 1 && voteIndex <= this.voteCheckpoints.length) {
      return this.voteCheckpoints[voteIndex - 1];
    }
    return undefined;
  }

  getVotingPrompt(round: number, _isFinalVote: boolean, isOverallVote: boolean): string {
    if (isOverallVote) {
      return DEBATE_CONSTANTS.VOTING.OVERALL_PROMPT;
    }
    return this.getVoteCheckpoint(round)?.prompt || this.buildVotingPrompt('exchange');
  }

  getWinnerMessage(round: number, winnerId: string, _isFinalVote: boolean): string {
    const winner = this.participants.find((ai) => ai.id === winnerId);
    const winnerName = winner?.name || 'Unknown';
    return `${this.getVotingLabel(round)}: ${winnerName}`;
  }

  getOverallWinnerMessage(winnerId: string): string {
    const winner = this.participants.find((ai) => ai.id === winnerId);
    const winnerName = winner?.name || 'Unknown';
    return DEBATE_CONSTANTS.MESSAGES.OVERALL_WINNER(winnerName);
  }

  areAllRoundsVoted(): boolean {
    if (this.isAudienceStanceVoteModel()) {
      return Boolean(
        (!this.preset.initialVoteRequired || this.audienceVotes.initial) &&
        (!this.preset.finalVoteRequired || this.audienceVotes.final)
      );
    }

    for (let round = 1; round <= this.totalVotes; round += 1) {
      if (!this.hasVotedForRound(round)) {
        return false;
      }
    }
    return true;
  }

  getNextVotingRound(): number | null {
    if (this.isAudienceStanceVoteModel()) {
      return this.areAllRoundsVoted() ? null : 1;
    }

    for (let round = 1; round <= this.totalVotes; round += 1) {
      if (!this.hasVotedForRound(round)) {
        return round;
      }
    }
    return null;
  }

  getTotalVotes(): number {
    return this.totalVotes;
  }

  reset(): void {
    this.votes.clear();
    this.audienceVotes = {};
    this.overallWinner = undefined;
    this.overallWinnerIds = [];
  }

  getVotingStats(): {
    totalRounds: number;
    votedRounds: number;
    remainingRounds: number;
    hasOverallWinner: boolean;
  } {
    const votedRounds = this.isAudienceStanceVoteModel()
      ? this.getVoteRecords().length
      : this.votes.size;
    return {
      totalRounds: this.totalVotes,
      votedRounds,
      remainingRounds: this.totalVotes - votedRounds,
      hasOverallWinner: !!this.overallWinner,
    };
  }

  hasAudienceVote(stage: AudienceVoteStage): boolean {
    return Boolean(this.audienceVotes[stage]);
  }

  getAudienceVote(stage: AudienceVoteStage): VoteRecord | undefined {
    return this.audienceVotes[stage];
  }

  getAudienceDecisionResult(): AudienceDecisionResult | undefined {
    const initial = this.audienceVotes.initial?.audienceStance;
    const final = this.audienceVotes.final?.audienceStance;
    if (!initial || !final || final === 'undecided') {
      return undefined;
    }

    const winningSide: DebateSideId = final === 'for' ? 'aff' : 'neg';
    const winningParticipantIds = this.getSideParticipants(winningSide).map((participant) => participant.id);
    const resultVerb = initial === 'undecided'
      ? 'persuaded'
      : initial === final
        ? 'held'
        : 'flipped';
    const winningSideLabel = this.getSideLabel(winningSide);
    const summary = this.buildAudienceResultSummary(initial, final, winningSideLabel, resultVerb);

    return {
      initialStance: initial,
      finalStance: final,
      winningSide,
      winningSideLabel,
      resultVerb,
      summary,
      winningParticipantIds,
    };
  }

  getOverallWinnerIds(): string[] {
    return [...this.overallWinnerIds];
  }

  private getAudienceStanceLabel(stance: AudienceStance): string {
    if (stance === 'for') return 'For';
    if (stance === 'against') return 'Against';
    return 'Undecided';
  }

  private getSideLabel(side: DebateSideId): string {
    return side === 'aff' ? 'Affirmative' : 'Negative';
  }

  private getSideParticipants(side: DebateSideId): AI[] {
    const teamSize = this.preset.teamSize || 1;
    if (teamSize <= 1) {
      return side === 'aff'
        ? this.participants.slice(0, 1)
        : this.participants.slice(1, 2);
    }

    return this.participants.filter((_, index) => {
      const sideForIndex: DebateSideId = index % 2 === 0 ? 'aff' : 'neg';
      return sideForIndex === side;
    });
  }

  private buildAudienceResultSummary(
    initial: AudienceStance,
    final: Exclude<AudienceStance, 'undecided'>,
    sideLabel: string,
    resultVerb: AudienceDecisionResult['resultVerb']
  ): string {
    const finalLabel = this.getAudienceStanceLabel(final);
    if (resultVerb === 'persuaded') {
      return `${sideLabel} persuaded the audience from Undecided to ${finalLabel}.`;
    }
    if (resultVerb === 'flipped') {
      return `${sideLabel} flipped the audience from ${this.getAudienceStanceLabel(initial)} to ${finalLabel}.`;
    }
    return `${sideLabel} held the audience at ${finalLabel}.`;
  }
}
