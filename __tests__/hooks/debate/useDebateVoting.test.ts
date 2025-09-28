import { act } from '@testing-library/react-native';
import { useDebateVoting } from '@/hooks/debate/useDebateVoting';
import type { DebateEvent, ScoreBoard } from '@/services/debate';
import type { RootState } from '@/store';
import { startDebate } from '@/store';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';

class MockVotingService {
  public prompt = '🏅 Who won Opening?';
  public scores: ScoreBoard = {
    claude: { name: 'Claude', roundWins: 1, roundsWon: [1], isOverallWinner: false },
  };
  public voted = new Set<number>();

  calculateScores = jest.fn(() => this.scores);
  getVotingPrompt = jest.fn(() => this.prompt);
  hasVotedForRound = jest.fn((round: number) => this.voted.has(round));
}

type EventHandler = (event: DebateEvent) => void;

class MockOrchestrator {
  public votingService = new MockVotingService();
  public recordVote = jest.fn(async () => undefined);
  private handlers = new Set<EventHandler>();

  addEventListener(handler: EventHandler) {
    this.handlers.add(handler);
  }

  removeEventListener(handler: EventHandler) {
    this.handlers.delete(handler);
  }

  emit(event: DebateEvent) {
    this.handlers.forEach(handler => handler(event));
  }

  getVotingService() {
    return this.votingService;
  }
}

describe('useDebateVoting', () => {
  const baseState = {} as Partial<RootState>;

  it('updates voting state from orchestrator events and records votes', async () => {
    const orchestrator = new MockOrchestrator();
    const { result, store } = renderHookWithProviders(() => useDebateVoting(orchestrator as unknown as never, []), {
      preloadedState: baseState,
    });

    store.dispatch(startDebate({ debateId: 'debate-1', topic: 'AI', participants: ['claude', 'gpt4'] }));

    expect(result.current.getVotingPrompt()).toBe('🏅 Who won Opening?');

    act(() => {
      orchestrator.emit({ type: 'voting_started', data: { round: 1, isFinalRound: false, isOverallVote: false }, timestamp: Date.now() });
    });
    expect(result.current.isVoting).toBe(true);
    expect(result.current.votingRound).toBe(1);

    orchestrator.votingService.voted.add(1);
    expect(result.current.hasVotedForRound(1)).toBe(true);

    act(() => {
      orchestrator.emit({ type: 'voting_completed', data: { scores: orchestrator.votingService.scores }, timestamp: Date.now() });
    });
    expect(result.current.scores).toEqual(orchestrator.votingService.scores);

    await act(async () => {
      await result.current.recordVote('claude');
    });

    expect(orchestrator.recordVote).toHaveBeenCalledWith(1, 'claude', false);
    expect(store.getState().debateStats.currentDebate?.roundWinners[1]).toBe('claude');

    orchestrator.votingService.prompt = '🏆 Vote for Overall Winner!';
    expect(result.current.getVotingPrompt()).toBe('🏆 Vote for Overall Winner!');
  });
});
