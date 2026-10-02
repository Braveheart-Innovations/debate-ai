import { act } from '@testing-library/react-native';
import { useDebateVoting } from '@/hooks/debate/useDebateVoting';
import {
  DebateOrchestrator,
  DebateStatus,
  VotingService,
  type DebateEvent,
  type DebateEventHandler,
  type DebateSession,
  type ScoreBoard,
  type VoteRecord,
} from '@/services/debate';
import { AIService } from '@/services/aiAdapter';
import { startDebate } from '@/store';
import type { AI } from '@/types';
import { getFormat, getPresetForFormat } from '@/config/debate/formats';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';
import type { RootStateOverrides } from '../../../test-utils/services/state';

const createDebateSession = (overrides: Partial<DebateSession> = {}): DebateSession => {
  const preset = getPresetForFormat('oxford', 'short');
  return {
    id: 'debate-1',
    topic: 'AI',
    participants: [],
    personalities: {},
    startTime: 0,
    status: DebateStatus.ACTIVE,
    currentRound: 1,
    messageCount: 0,
    messageIndex: 0,
    currentAIIndex: 0,
    totalRounds: 3,
    totalMessages: preset.messages.length,
    civility: 3,
    format: getFormat('oxford'),
    preset,
    presetId: preset.id,
    stances: {},
    ...overrides,
  };
};

/** A real VotingService whose read methods are stubbed from mutable test fields. */
class MockVotingService {
  public prompt = 'Who had the stronger opening?';
  public scores: ScoreBoard = {
    claude: { name: 'Claude', roundWins: 1, roundsWon: [1], isOverallWinner: false },
  };
  public voteRecords: VoteRecord[] = [
    {
      round: 1,
      winnerId: 'claude',
      winnerName: 'Claude',
      votingLabel: 'Opening',
      criterion: 'Opening: choose who framed the motion more clearly.',
      timestamp: 100,
    },
  ];
  public voted = new Set<number>();
  public readonly instance = new VotingService([], getPresetForFormat('oxford', 'short'));

  calculateScores = jest.spyOn(this.instance, 'calculateScores').mockImplementation(() => this.scores);
  getVotingPrompt = jest.spyOn(this.instance, 'getVotingPrompt').mockImplementation(() => this.prompt);
  getVoteCriterion = jest
    .spyOn(this.instance, 'getVoteCriterion')
    .mockImplementation(() => 'Opening: choose who framed the motion more clearly.');
  getAudienceVotingPrompt = jest
    .spyOn(this.instance, 'getAudienceVotingPrompt')
    .mockImplementation((stage) => `${stage} audience prompt`);
  getAudienceVoteCriterion = jest
    .spyOn(this.instance, 'getAudienceVoteCriterion')
    .mockImplementation((stage) => `${stage} audience criterion`);
  getVotingLabel = jest.spyOn(this.instance, 'getVotingLabel').mockImplementation(() => 'Opening');
  getVoteRecords = jest.spyOn(this.instance, 'getVoteRecords').mockImplementation(() => this.voteRecords);
  hasVotedForRound = jest
    .spyOn(this.instance, 'hasVotedForRound')
    .mockImplementation((round) => this.voted.has(round));
}

/**
 * A real DebateOrchestrator (no AI keys) with its voting service, vote recording,
 * session, and event bus stubbed so tests can drive the hook by emitting events.
 */
class MockOrchestrator {
  public readonly instance = new DebateOrchestrator(new AIService());
  public votingService = new MockVotingService();
  public session = createDebateSession();
  public recordVote = jest.spyOn(this.instance, 'recordVote').mockResolvedValue(undefined);
  private handlers = new Set<DebateEventHandler>();

  constructor() {
    jest.spyOn(this.instance, 'getVotingService').mockImplementation(() => this.votingService.instance);
    jest.spyOn(this.instance, 'getSession').mockImplementation(() => this.session);
    jest.spyOn(this.instance, 'addEventListener').mockImplementation((handler) => {
      this.handlers.add(handler);
    });
    jest.spyOn(this.instance, 'removeEventListener').mockImplementation((handler) => {
      this.handlers.delete(handler);
    });
  }

  emit(event: DebateEvent) {
    this.handlers.forEach(handler => handler(event));
  }
}

describe('useDebateVoting', () => {
  const baseState: RootStateOverrides = {};

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates voting state from orchestrator events and records votes', async () => {
    const orchestrator = new MockOrchestrator();
    const { result, store } = renderHookWithProviders(() => useDebateVoting(orchestrator.instance, []), {
      preloadedState: baseState,
    });

    store.dispatch(startDebate({ debateId: 'debate-1', topic: 'AI', participants: ['claude', 'gpt4'] }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(orchestrator.votingService.calculateScores).toHaveBeenCalledTimes(1);
    expect(result.current.scores).toEqual(orchestrator.votingService.scores);
    expect(result.current.voteRecords).toEqual(orchestrator.votingService.voteRecords);

    expect(result.current.getVotingPrompt()).toBe('Who had the stronger opening?');
    expect(orchestrator.votingService.getVotingPrompt).toHaveBeenCalledWith(0, false, false);
    expect(result.current.getVoteCriterion()).toBe('Opening: choose who framed the motion more clearly.');
    expect(orchestrator.votingService.getVoteCriterion).toHaveBeenCalledWith(0, false);

    act(() => {
      orchestrator.emit({ type: 'voting_started', data: { round: 1, isFinalRound: false, isOverallVote: false }, timestamp: Date.now() });
    });
    expect(result.current.isVoting).toBe(true);
    expect(result.current.votingRound).toBe(1);

    orchestrator.votingService.voted.add(1);
    expect(result.current.hasVotedForRound(1)).toBe(true);

    act(() => {
      orchestrator.emit({
        type: 'voting_completed',
        data: {
          scores: orchestrator.votingService.scores,
          voteRecord: {
            round: 1,
            winnerId: 'claude',
            winnerName: 'Claude',
            votingLabel: 'Opening',
            criterion: 'Opening: choose who framed the motion more clearly.',
            timestamp: 200,
          },
        },
        timestamp: Date.now(),
      });
    });
    expect(result.current.scores).toEqual(orchestrator.votingService.scores);
    expect(result.current.voteRecords[0]?.timestamp).toBe(200);

    await act(async () => {
      await result.current.recordVote('claude');
    });

    expect(orchestrator.recordVote).toHaveBeenCalledWith(1, 'claude', false);
    expect(store.getState().debateStats.currentDebate?.roundWinners[1]).toBe('claude');
    expect(store.getState().debateStats.currentDebate?.voteResults?.[0]).toMatchObject({
      votingLabel: 'Opening',
      criterion: 'Opening: choose who framed the motion more clearly.',
    });

    orchestrator.votingService.prompt = 'Choose the overall winner';
    expect(result.current.getVotingPrompt()).toBe('Choose the overall winner');

    act(() => {
      orchestrator.emit({ type: 'voting_started', data: { round: 3, isFinalRound: true, isOverallVote: true }, timestamp: Date.now() });
    });

    await act(async () => {
      await result.current.recordVote('gpt4');
    });

    expect(orchestrator.recordVote).toHaveBeenLastCalledWith(3, 'gpt4', true);
    expect(result.current.getVotingPrompt()).toBe('Choose the overall winner');
    expect(orchestrator.votingService.getVotingPrompt).toHaveBeenLastCalledWith(3, true, true);
    expect(result.current.getVoteCriterion()).toBe('Opening: choose who framed the motion more clearly.');
    expect(orchestrator.votingService.getVoteCriterion).toHaveBeenLastCalledWith(3, true);

    // History is populated when debate_ended event is emitted (not during recordVote)
    act(() => {
      orchestrator.emit({ type: 'debate_ended', data: { overallWinner: 'gpt4' }, timestamp: Date.now() });
    });

    expect(store.getState().debateStats.history).toHaveLength(1);
    expect(store.getState().debateStats.history[0]?.overallWinner).toBe('gpt4');
    expect(result.current.isVoting).toBe(false);
  });

  it('handles Oxford audience stance voting without recording round winners', async () => {
    const orchestrator = new MockOrchestrator();
    const { result, store } = renderHookWithProviders(() => useDebateVoting(orchestrator.instance, []), {
      preloadedState: baseState,
    });

    store.dispatch(startDebate({ debateId: 'debate-1', topic: 'AI', participants: ['claude', 'gpt4'] }));

    act(() => {
      orchestrator.emit({
        type: 'voting_started',
        data: {
          round: 0,
          voteKind: 'audience_stance',
          audienceVoteStage: 'initial',
          isFinalRound: false,
          isOverallVote: false,
        },
        timestamp: Date.now(),
      });
    });

    expect(result.current.voteKind).toBe('audience_stance');
    expect(result.current.audienceVoteStage).toBe('initial');
    expect(result.current.getVotingPrompt()).toBe('initial audience prompt');
    expect(result.current.getVoteCriterion()).toBe('initial audience criterion');

    await act(async () => {
      await result.current.recordVote('undecided');
    });

    expect(orchestrator.recordVote).toHaveBeenCalledWith(0, 'undecided', false);
    expect(store.getState().debateStats.currentDebate?.roundWinners).toEqual({});

    act(() => {
      orchestrator.emit({
        type: 'debate_ended',
        data: {
          overallWinner: 'claude',
          overallWinnerIds: ['claude'],
          audienceResult: {
            initialStance: 'undecided',
            finalStance: 'for',
            winningSide: 'aff',
            winningSideLabel: 'Affirmative',
            resultVerb: 'persuaded',
            summary: 'Affirmative persuaded the audience.',
            winningParticipantIds: ['claude'],
          },
        },
        timestamp: Date.now(),
      });
    });

    expect(result.current.audienceResult?.winningSideLabel).toBe('Affirmative');
    expect(store.getState().debateStats.history[0]?.overallWinners).toEqual(['claude']);
  });

  it('handles missing orchestrator, vote failures, and helper fallbacks', async () => {
    const participants: AI[] = [];
    const initialProps: { orchestrator: DebateOrchestrator | null } = { orchestrator: null };

    const { result, rerender } = renderHookWithProviders(
      ({ orchestrator }) => useDebateVoting(orchestrator, participants),
      { initialProps, preloadedState: baseState },
    );

    expect(result.current.getVotingPrompt()).toBe('');
    expect(result.current.getVoteCriterion()).toBe('');
    expect(result.current.hasVotedForRound(5)).toBe(false);

    await act(async () => {
      await result.current.recordVote('claude');
    });

    expect(result.current.error).toBe('No active orchestrator');

    const orchestrator = new MockOrchestrator();
    orchestrator.recordVote.mockRejectedValueOnce(new Error('vote-failed'));
    await act(async () => {
      rerender({ orchestrator: orchestrator.instance });
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
