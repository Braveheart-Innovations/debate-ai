import { createAppStore } from '@/store';
import {
  createMockAIConfig,
  createMockAIMessage,
  createMockAttachment,
  createMockAuthState,
  createMockChatSession,
  createMockDebateSpeech,
  createMockMessage,
  createMockScoreBoard,
  createMockUser,
  createMockUserProfile,
} from '@test-utils/fixtures';

describe('fixture builders', () => {
  it('apply overrides on top of complete defaults', () => {
    expect(createMockAIConfig({ id: 'gpt', provider: 'openai', name: 'ChatGPT' })).toMatchObject({
      id: 'gpt',
      provider: 'openai',
      name: 'ChatGPT',
      model: expect.any(String),
    });
    expect(createMockMessage({ content: 'Changed' })).toMatchObject({
      senderType: 'user',
      content: 'Changed',
    });
    expect(createMockAttachment({ type: 'document', mimeType: 'application/pdf' })).toMatchObject({
      type: 'document',
      mimeType: 'application/pdf',
      uri: expect.any(String),
    });
    expect(createMockDebateSpeech({ speaker: 'neg', phase: 'rebuttal' })).toMatchObject({
      formatId: 'oxford',
      speaker: 'neg',
      phase: 'rebuttal',
    });
    expect(createMockUser({ subscription: 'pro' }).subscription).toBe('pro');
  });

  it('attributes AI messages to the given AI like real replies', () => {
    const gpt = createMockAIConfig({ id: 'openai-1', provider: 'openai', name: 'ChatGPT', model: 'gpt-x' });
    const message = createMockAIMessage({ content: 'Answer' }, gpt);

    expect(message).toMatchObject({
      sender: 'ChatGPT',
      senderType: 'ai',
      content: 'Answer',
      metadata: { aiId: 'openai-1', providerId: 'openai', modelUsed: 'gpt-x' },
    });
  });

  it('builds sessions with a default AI and no messages', () => {
    const session = createMockChatSession({ messages: [createMockMessage()] });
    expect(session.selectedAIs).toHaveLength(1);
    expect(session.messages).toHaveLength(1);
    expect(session.sessionType).toBe('chat');
  });

  it('fills every scoreboard row from defaults', () => {
    const board = createMockScoreBoard({ a: { name: 'A', roundWins: 2, isOverallWinner: true }, b: {} });
    expect(board.a).toEqual({ name: 'A', roundWins: 2, roundsWon: [], isOverallWinner: true });
    expect(board.b).toEqual({ name: 'b', roundWins: 0, roundsWon: [], isOverallWinner: false });
  });

  it('produces auth state the real store accepts', () => {
    const auth = createMockAuthState({
      isAuthenticated: true,
      isPremium: true,
      userProfile: createMockUserProfile({ membershipStatus: 'premium' }),
    });
    const store = createAppStore({ auth });

    expect(store.getState().auth.isPremium).toBe(true);
    expect(store.getState().auth.userProfile?.membershipStatus).toBe('premium');
  });
});
