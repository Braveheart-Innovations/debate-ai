import { VotingService } from '@/services/debate/VotingService';
import { OXFORD_FORMAT } from '@/config/debate/formats';
import type { AI } from '@/types';

describe('VotingService', () => {
  const participants: AI[] = [
    { id: 'claude', provider: 'claude', name: 'Claude', model: 'claude-3' },
    { id: 'gpt4', provider: 'openai', name: 'GPT-4o', model: 'gpt-4o' },
  ];

  it('records round winners and calculates scores', () => {
    const service = new VotingService(participants, OXFORD_FORMAT, 3);

    service.recordRoundVote(1, 'claude');
    service.recordRoundVote(2, 'gpt4');
    service.recordRoundVote(3, 'claude');
    service.recordOverallWinner('claude');

    const scores = service.calculateScores();

    expect(scores.claude.roundWins).toBe(2);
    expect(scores.gpt4.roundWins).toBe(1);
    expect(scores.claude.isOverallWinner).toBe(true);
    expect(scores.gpt4.isOverallWinner).toBe(false);
    expect(service.getRoundVote(2)?.winnerId).toBe('gpt4');
    expect(service.getVotesMap()).toEqual({ '1': 'claude', '2': 'gpt4', '3': 'claude', overall: 'claude' });
  });

  it('tracks completion state across rounds', () => {
    const service = new VotingService(participants, OXFORD_FORMAT, 2);
    expect(service.areAllRoundsVoted()).toBe(false);

    service.recordRoundVote(1, 'claude');
    expect(service.areAllRoundsVoted()).toBe(false);

    service.recordRoundVote(2, 'gpt4');
    expect(service.areAllRoundsVoted()).toBe(true);
    expect(service.getNextVotingRound()).toBe(null);
  });

  it('provides contextual prompts based on round and overall vote', () => {
    const service = new VotingService(participants, OXFORD_FORMAT, 3);

    expect(service.getVotingPrompt(2, false, false)).toContain('Who won');
    expect(service.getVotingPrompt(3, true, true)).toBe('🏆 Vote for Overall Winner!');
    expect(service.getWinnerMessage(1, 'claude', false)).toBe('Opening: Claude');
    expect(service.getOverallWinnerMessage('gpt4')).toBe('OVERALL WINNER: GPT-4o!\n\nGPT-4o won the debate.');
  });
});
