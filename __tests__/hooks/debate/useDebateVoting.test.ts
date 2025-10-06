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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates voting state from orchestrator events and records votes', async () => {
    const orchestrator = new MockOrchestrator();
    const { result, store } = renderHookWithProviders(() => useDebateVoting(orchestrator as unknown as never, []), {
      preloadedState: baseState,
    });

    store.dispatch(startDebate({ debateId: 'debate-1', topic: 'AI', participants: ['claude', 'gpt4'] }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(orchestrator.votingService.calculateScores).toHaveBeenCalledTimes(1);
    expect(result.current.scores).toEqual(orchestrator.votingService.scores);

    expect(result.current.getVotingPrompt()).toBe('🏅 Who won Opening?');
    expect(orchestrator.votingService.getVotingPrompt).toHaveBeenCalledWith(0, false, false);

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

    act(() => {
      orchestrator.emit({ type: 'voting_started', data: { round: 3, isFinalRound: true, isOverallVote: true }, timestamp: Date.now() });
    });

    await act(async () => {
      await result.current.recordVote('gpt4');
    });

    expect(orchestrator.recordVote).toHaveBeenLastCalledWith(3, 'gpt4', true);
    expect(store.getState().debateStats.history).toHaveLength(1);
    expect(store.getState().debateStats.history[0]?.overallWinner).toBe('gpt4');
    expect(result.current.getVotingPrompt()).toBe('🏆 Vote for Overall Winner!');
    expect(orchestrator.votingService.getVotingPrompt).toHaveBeenLastCalledWith(3, true, true);

    act(() => {
      orchestrator.emit({ type: 'debate_ended', data: { overallWinner: 'claude' }, timestamp: Date.now() });
    });

    expect(store.getState().debateStats.history[0]?.overallWinner).toBe('gpt4');
    expect(result.current.isVoting).toBe(false);
  });

  it('handles missing orchestrator, vote failures, and helper fallbacks', async () => {
    let currentOrchestrator: MockOrchestrator | null = null;
    const participants = [];

    const { result, rerender } = renderHookWithProviders(
      () => useDebateVoting(currentOrchestrator as unknown as MockOrchestrator | null, participants),
      { preloadedState: baseState },
    );

    expect(result.current.getVotingPrompt()).toBe('');
    expect(result.current.hasVotedForRound(5)).toBe(false);

    await act(async () => {
      await result.current.recordVote('claude');
    });

    expect(result.current.error).toBe('No active orchestrator');

    const orchestrator = new MockOrchestrator();
    orchestrator.recordVote.mockRejectedValueOnce(new Error('vote-failed'));
    currentOrchestrator = orchestrator;

    await act(async () => {
      rerender();
      await Promise.resolve();
    });

    act(() => {
      orchestrator.emit({ type: 'voting_started', data: { round: 2, isFinalRound: false, isOverallVote: false }, timestamp: Date.now() });
    });

    await act(async () => {
      await result.current.recordVote('claude');
    });

    expect(orchestrator.recordVote).toHaveBeenCalledWith(2, 'claude', false);
    expect(result.current.error).toBe('vote-failed');

    orchestrator.recordVote.mockResolvedValueOnce(undefined);

    act(() => {
      orchestrator.emit({ type: 'voting_started', data: { round: 4, isFinalRound: true, isOverallVote: true }, timestamp: Date.now() });
    });

    await act(async () => {
      await result.current.recordVote('claude');
    });

    expect(orchestrator.recordVote).toHaveBeenLastCalledWith(4, 'claude', true);
    expect(result.current.error).toBeNull();
  });
});
