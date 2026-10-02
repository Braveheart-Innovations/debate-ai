import { BaseAdapter } from '@/services/ai/base/BaseAdapter';
import type { AdapterCapabilities, FormattedMessage, ResumptionContext } from '@/services/ai/types/adapter.types';
import type { Message, PersonalityConfig, RuntimePersonalityConfig } from '@/types';
import type { PersonalityOption } from '@/config/personalities';

/** The text of a formatted message; history entries here are always plain strings. */
const textOf = (message: FormattedMessage): string => {
  if (typeof message.content !== 'string') throw new Error('Expected plain-text message content');
  return message.content;
};

class TestAdapter extends BaseAdapter {
  sendMessage = jest.fn();

  getCapabilities(): AdapterCapabilities {
    return {
      streaming: false,
      attachments: false,
      functionCalling: false,
      systemPrompt: true,
      maxTokens: 0,
      contextWindow: 0,
    };
  }

  format(history: Message[], resumption?: ResumptionContext): FormattedMessage[] {
    // Access the protected helper for assertions

    return this.formatHistory(history, resumption);
  }

  // Expose getSystemPrompt for testing
  getSystemPromptPublic(): string {

    return this.getSystemPrompt();
  }
}

describe('BaseAdapter.formatHistory', () => {
  const baseMessages: Message[] = [
    {
      id: '1',
      sender: 'User',
      senderType: 'user',
      content: 'Hello there',
      timestamp: 1,
    },
    {
      id: '2',
      sender: 'Claude',
      senderType: 'ai',
      content: 'Greetings!',
      timestamp: 2,
      metadata: { providerId: 'claude' },
    },
  ];

  it('returns plain conversation history when not in debate mode', () => {
    const adapter = new TestAdapter({ provider: 'claude', apiKey: 'key', model: 'opus' });
    const formatted = adapter.format(baseMessages);

    expect(formatted).toEqual([
      { role: 'user', content: 'Hello there' },
      { role: 'assistant', content: 'Greetings!' },
    ]);
  });

  it('injects resumption context as first user entry', () => {
    const adapter = new TestAdapter({ provider: 'claude', apiKey: 'key', model: 'opus' });
    const formatted = adapter.format(baseMessages, {
      isResuming: true,
      originalPrompt: {
        id: 'original',
        sender: 'You',
        senderType: 'user',
        content: 'A very long prompt that should be truncated beyond one hundred characters to avoid overly verbose notes.',
        timestamp: 0,
      },
    });

    expect(formatted[0]).toEqual({
      role: 'user',
      content: expect.stringContaining('[Continuation note] Previously started with'),
    });
    expect(textOf(formatted[0]).length).toBeLessThan(200);
  });

  it('remaps opponent messages to user role in debate mode and merges consecutive roles', () => {
    const adapter = new TestAdapter({ provider: 'claude', apiKey: 'key', model: 'opus', isDebateMode: true });
    const history: Message[] = [
      {
        id: '1',
        sender: 'Moderator',
        senderType: 'user',
        content: 'Opening statement',
        timestamp: 1,
      },
      {
        id: '2',
        sender: 'Claude',
        senderType: 'ai',
        content: 'Our stance is affirmative.',
        timestamp: 2,
        metadata: { providerId: 'claude' },
      },
      {
        id: '3',
        sender: 'GPT-4',
        senderType: 'ai',
        content: 'We disagree.',
        timestamp: 3,
        metadata: { providerId: 'openai' },
      },
      {
        id: '4',
        sender: 'Host',
        senderType: 'user',
        content: 'Continue.',
        timestamp: 4,
      },
    ];

    const formatted = adapter.format(history);

    expect(formatted).toEqual([
      { role: 'user', content: 'Opening statement' },
      { role: 'assistant', content: 'Our stance is affirmative.' },
      { role: 'user', content: '[GPT-4] We disagree.\n\nContinue.' },
    ]);
  });

  it('uses logical aiId before providerId when mapping same-provider debate roles', () => {
    const adapter = new TestAdapter({
      provider: 'openai',
      identityId: 'openai-slot-2',
      apiKey: 'key',
      model: 'gpt-5',
      isDebateMode: true,
    });
    const history: Message[] = [
      {
        id: '1',
        sender: 'Moderator',
        senderType: 'user',
        content: 'Opening statement',
        timestamp: 1,
      },
      {
        id: '2',
        sender: 'ChatGPT 1',
        senderType: 'ai',
        content: 'First slot argument.',
        timestamp: 2,
        metadata: { aiId: 'openai-slot-1', providerId: 'openai' },
      },
      {
        id: '3',
        sender: 'ChatGPT 2',
        senderType: 'ai',
        content: 'Second slot answer.',
        timestamp: 3,
        metadata: { aiId: 'openai-slot-2', providerId: 'openai' },
      },
      {
        id: '4',
        sender: 'Claude',
        senderType: 'ai',
        content: 'Different provider response.',
        timestamp: 4,
        metadata: { aiId: 'claude-slot-1', providerId: 'claude' },
      },
    ];

    const formatted = adapter.format(history);

    expect(formatted).toEqual([
      { role: 'user', content: 'Opening statement\n\n[ChatGPT 1] First slot argument.' },
      { role: 'assistant', content: 'Second slot answer.' },
      { role: 'user', content: '[Claude] Different provider response.' },
    ]);
  });

  it('falls back to providerId for legacy debate history without aiId', () => {
    const adapter = new TestAdapter({
      provider: 'openai',
      identityId: 'openai-slot-2',
      apiKey: 'key',
      model: 'gpt-5',
      isDebateMode: true,
    });
    const history: Message[] = [
      {
        id: '1',
        sender: 'Legacy ChatGPT',
        senderType: 'ai',
        content: 'Legacy own message.',
        timestamp: 1,
        metadata: { providerId: 'openai' },
      },
    ];

    expect(adapter.format(history)).toEqual([
      { role: 'assistant', content: 'Legacy own message.' },
    ]);
  });

  it('limits history to the most recent entries', () => {
    const adapter = new TestAdapter({ provider: 'claude', apiKey: 'key', model: 'opus', isDebateMode: true });
    const longHistory: Message[] = Array.from({ length: 12 }, (_, index) => ({
      id: `${index}`,
      sender: index % 2 === 0 ? 'User' : 'Claude',
      senderType: index % 2 === 0 ? 'user' : 'ai',
      content: `message-${index}`,
      timestamp: index,
      metadata: { providerId: index % 2 === 0 ? 'openai' : 'claude' },
    }));

    const formatted = adapter.format(longHistory);
    expect(formatted.length).toBeLessThanOrEqual(11);
    expect(textOf(formatted[0])).toContain('message-2');
  });
});

describe('BaseAdapter.getSystemPrompt', () => {
  it('returns default prompt when no personality is set', () => {
    const adapter = new TestAdapter({ provider: 'claude', apiKey: 'key', model: 'opus' });
    const prompt = adapter.getSystemPromptPublic();
    expect(prompt).toBe('You are a helpful AI assistant.');
  });

  it('uses personality systemPrompt when set', () => {
    const adapter = new TestAdapter({ provider: 'claude', apiKey: 'key', model: 'opus' });
    adapter.setTemporaryPersonality({
      id: 'test',
      name: 'Test Persona',
      description: 'A test persona',
      systemPrompt: 'You are a witty assistant.',
      traits: { formality: 0.5, humor: 0.5, technicality: 0.5, empathy: 0.5 },
      isPremium: false,
    });

    const prompt = adapter.getSystemPromptPublic();
    expect(prompt).toContain('You are a witty assistant.');
  });

  it('clears a previous temporary personality when default is selected', () => {
    const adapter = new TestAdapter({ provider: 'claude', apiKey: 'key', model: 'opus' });
    adapter.setTemporaryPersonality({
      id: 'test',
      name: 'Test Persona',
      description: 'A test persona',
      systemPrompt: 'You are a witty assistant.',
      traits: { formality: 0.5, humor: 0.5, technicality: 0.5, empathy: 0.5 },
      isPremium: false,
    });
    expect(adapter.getSystemPromptPublic()).toContain('witty assistant');

    adapter.setTemporaryPersonality({
      id: 'default',
      name: 'Default',
      emoji: 'bot',
      tagline: 'Default',
      description: 'Default',
      bio: 'Default',
      systemPrompt: 'Default assistant',
      signatureMoves: [],
    });

    expect(adapter.getSystemPromptPublic()).toBe('You are a helpful AI assistant.');
  });

  it('applies tone modifiers for non-neutral tone values', () => {
    const adapter = new TestAdapter({ provider: 'claude', apiKey: 'key', model: 'opus' });
    // Set a personality with extreme tone values
    adapter.setTemporaryPersonality({
      id: 'formal-technical',
      name: 'Formal Technical',
      description: 'Formal and technical',
      systemPrompt: 'You are an expert.',
      traits: { formality: 0.8, humor: 0.2, technicality: 0.8, empathy: 0.3 },
      isPremium: false,
    });

    const prompt = adapter.getSystemPromptPublic();
    expect(prompt).toContain('[Style:');
    expect(prompt).toContain('formal, professional tone');
    expect(prompt).toContain('use technical depth');
  });

  it('applies tone modifiers from PersonalityOption with tone field', () => {
    const adapter = new TestAdapter({ provider: 'claude', apiKey: 'key', model: 'opus' });
    // Simulate PersonalityOption with tone field
    const personalityOption: PersonalityOption = {
      id: 'casual',
      name: 'Casual',
      emoji: '😊',
      tagline: 'Relaxed conversation',
      description: 'Casual and friendly',
      bio: 'A casual persona',
      systemPrompt: 'You are friendly.',
      signatureMoves: [],
      tone: { formality: 0.2, humor: 0.8, energy: 0.7, empathy: 0.6, technicality: 0.3 },
    };

    adapter.setTemporaryPersonality(personalityOption);
    const prompt = adapter.getSystemPromptPublic();
    expect(prompt).toContain('[Style:');
    expect(prompt).toContain('casual, conversational language');
    expect(prompt).toContain('include wit and humor');
  });

  it('does not add style modifiers for neutral tone values', () => {
    const adapter = new TestAdapter({ provider: 'claude', apiKey: 'key', model: 'opus' });
    adapter.setTemporaryPersonality({
      id: 'neutral',
      name: 'Neutral',
      description: 'Neutral persona',
      systemPrompt: 'You are balanced.',
      traits: { formality: 0.5, humor: 0.5, technicality: 0.5, empathy: 0.5 },
      isPremium: false,
    });

    const prompt = adapter.getSystemPromptPublic();
    expect(prompt).toBe('You are balanced.');
    expect(prompt).not.toContain('[Style:');
  });

  it('includes debate base prompt in debate mode', () => {
    const adapter = new TestAdapter({ provider: 'claude', apiKey: 'key', model: 'opus', isDebateMode: true });
    const prompt = adapter.getSystemPromptPublic();
    expect(prompt).toContain('You are participating in a structured debate');
  });

  it('combines debate prompt with personality in debate mode', () => {
    const adapter = new TestAdapter({ provider: 'claude', apiKey: 'key', model: 'opus', isDebateMode: true });
    adapter.setTemporaryPersonality({
      id: 'debater',
      name: 'Debater',
      description: 'A skilled debater',
      systemPrompt: 'You argue with passion.',
      traits: { formality: 0.7, humor: 0.3, technicality: 0.6, empathy: 0.4 },
      isPremium: false,
    });

    const prompt = adapter.getSystemPromptPublic();
    expect(prompt).toContain('You are participating in a structured debate');
    expect(prompt).toContain('You argue with passion.');
  });

  it('applies debate profile guidance from the runtime config every debate turn uses', () => {
    const adapter = new TestAdapter({ provider: 'claude', apiKey: 'key', model: 'opus', isDebateMode: true });
    // The shape PersonalityRuntimeBuilder produces and DebateOrchestrator passes.
    const runtimeConfig: RuntimePersonalityConfig = {
      id: 'aggressive-debater',
      name: 'Aggressive Debater',
      description: 'Debates fiercely',
      systemPrompt: 'You debate fiercely.',
      traits: { formality: 0.6, humor: 0.2, technicality: 0.5, empathy: 0.3 },
      isPremium: false,
      tone: { formality: 0.6, humor: 0.2, energy: 0.8, empathy: 0.3, technicality: 0.5 },
      debateProfile: { argumentStyle: 'logical', aggression: 0.9, concession: 0.1 },
    };
    adapter.setTemporaryPersonality(runtimeConfig);

    const prompt = adapter.getSystemPromptPublic();
    expect(prompt).toContain('[Debate style:');
    expect(prompt).toContain('assertive, direct challenges');
    expect(prompt).toContain('stand firm on positions');
    // The full tone (incl. energy, which traits lack) is used, not just traits.
    expect(prompt).toContain('enthusiastic, energetic');
  });

  it('keeps tone energy and debate profile when converting a raw PersonalityOption', () => {
    const adapter = new TestAdapter({ provider: 'claude', apiKey: 'key', model: 'opus', isDebateMode: true });
    const option: PersonalityOption = {
      id: 'firebrand',
      name: 'Firebrand',
      emoji: '🔥',
      tagline: 'Fiery debater',
      description: 'Argues with heat',
      bio: 'A fiery persona',
      systemPrompt: 'You argue hotly.',
      signatureMoves: [],
      tone: { formality: 0.5, humor: 0.5, energy: 0.9, empathy: 0.5, technicality: 0.5 },
      debateProfile: { argumentStyle: 'emotional', aggression: 0.8, concession: 0.2 },
    };
    adapter.setTemporaryPersonality(option);

    const prompt = adapter.getSystemPromptPublic();
    expect(adapter.config.personality?.debateProfile).toEqual(option.debateProfile);
    expect(prompt).toContain('enthusiastic, energetic');
    expect(prompt).toContain('[Debate style:');
    expect(prompt).toContain('use emotional appeals and narrative');
  });
});

describe('BaseAdapter multi-AI chat attribution', () => {
  const groupChat = { selfName: 'Claude', participants: ['Gemini', 'ChatGPT', 'Claude'] };

  // Round 1 of a Gemini → ChatGPT → Claude chat, then the user's follow-up.
  const round: Message[] = [
    { id: 'u1', sender: 'You', senderType: 'user', content: 'Is coffee bad for you?', timestamp: 1 },
    {
      id: 'g1', sender: 'Gemini', senderType: 'ai', content: 'Coffee dehydrates you.', timestamp: 2,
      metadata: { aiId: 'gemini', providerId: 'google' },
    },
    {
      id: 'c1', sender: 'ChatGPT', senderType: 'ai', content: "Gemini overreached: coffee isn't meaningfully dehydrating.", timestamp: 3,
      metadata: { aiId: 'chatgpt', providerId: 'openai' },
    },
    {
      id: 'a1', sender: 'Claude', senderType: 'ai', content: 'Agreed with ChatGPT.', timestamp: 4,
      metadata: { aiId: 'claude', providerId: 'claude' },
    },
  ];

  const makeAdapter = (overrides: Partial<ConstructorParameters<typeof TestAdapter>[0]> = {}) =>
    new TestAdapter({ provider: 'claude', identityId: 'claude', apiKey: 'key', model: 'opus', ...overrides });

  it("never presents another AI's words as the adapter's own, even outside debate", () => {
    const formatted = makeAdapter().format(round);

    expect(formatted).toEqual([
      {
        role: 'user',
        content: "Is coffee bad for you?\n\n[Gemini] Coffee dehydrates you.\n\n[ChatGPT] Gemini overreached: coffee isn't meaningfully dehydrating.",
      },
      { role: 'assistant', content: 'Agreed with ChatGPT.' },
    ]);
  });

  it('labels the human as [User] in group chat so merged blocks stay unambiguous', () => {
    const formatted = makeAdapter({ groupChat }).format(round);

    expect(formatted[0]).toEqual({
      role: 'user',
      content: "[User] Is coffee bad for you?\n\n[Gemini] Coffee dehydrates you.\n\n[ChatGPT] Gemini overreached: coffee isn't meaningfully dehydrating.",
    });
    expect(formatted[1]).toEqual({ role: 'assistant', content: 'Agreed with ChatGPT.' });
  });

  it('distinguishes two instances of the same provider by identity', () => {
    const history: Message[] = [
      { id: 'u', sender: 'You', senderType: 'user', content: 'Hi', timestamp: 1 },
      { id: 'x', sender: 'Claude 2', senderType: 'ai', content: 'From the other Claude', timestamp: 2, metadata: { aiId: 'claude-2', providerId: 'claude' } },
    ];
    expect(makeAdapter().format(history)).toEqual([
      { role: 'user', content: 'Hi\n\n[Claude 2] From the other Claude' },
    ]);
  });

  it('drops failed and interrupted turns from context', () => {
    const history: Message[] = [
      round[0],
      {
        id: 'e', sender: 'Gemini', senderType: 'ai', content: 'Sorry, I encountered an error: boom', timestamp: 2,
        metadata: { aiId: 'gemini', providerId: 'google', lifecycle: { status: 'failed', retryable: false } },
      },
      {
        id: 'p', sender: 'ChatGPT', senderType: 'ai', content: 'Half an answ', timestamp: 3,
        metadata: { aiId: 'chatgpt', providerId: 'openai', lifecycle: { status: 'interrupted', partial: true } },
      },
    ];
    expect(makeAdapter().format(history)).toEqual([
      { role: 'user', content: 'Is coffee bad for you?' },
    ]);
  });

  it('keeps debate mapping unlabeled for the user even if groupChat is stale', () => {
    const formatted = makeAdapter({ groupChat, isDebateMode: true }).format(round);
    expect(formatted[0].content).toMatch(/^Is coffee bad for you\?/);
  });

  describe('getSystemPrompt group-chat contract', () => {
    it('appends identity, roster, and norms when groupChat is set', () => {
      const prompt = makeAdapter({ groupChat }).getSystemPromptPublic();
      expect(prompt.startsWith('You are a helpful AI assistant.')).toBe(true);
      expect(prompt).toContain('You appear in this group chat as Claude');
      expect(prompt).toContain('Participants: Gemini, ChatGPT, Claude (you).');
      expect(prompt).toContain('a critique aimed at another AI is not aimed at you');
      expect(prompt).toContain('Accuracy over agreement');
    });

    it('omits the contract for single-AI chat and for debate', () => {
      expect(makeAdapter().getSystemPromptPublic()).toBe('You are a helpful AI assistant.');
      expect(makeAdapter({ groupChat, isDebateMode: true }).getSystemPromptPublic()).not.toContain('group chat');
    });

    it('composes after a persona prompt', () => {
      const personality: PersonalityConfig = {
        id: 'devlin', name: 'Devlin', description: 'd', systemPrompt: 'You are Devlin.',
        traits: { formality: 0.5, humor: 0.5, technicality: 0.5, empathy: 0.5 }, isPremium: false,
      };
      const prompt = makeAdapter({ groupChat, personality }).getSystemPromptPublic();
      expect(prompt.indexOf('You are Devlin.')).toBe(0);
      expect(prompt.indexOf('You appear in this group chat as Claude')).toBeGreaterThan(0);
    });
  });
});
