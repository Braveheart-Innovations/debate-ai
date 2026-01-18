import { BaseAdapter } from '@/services/ai/base/BaseAdapter';
import type { AdapterCapabilities, FormattedMessage, ResumptionContext } from '@/services/ai/types/adapter.types';
import type { Message, PersonalityConfig } from '@/types';
import type { PersonalityOption } from '@/config/personalities';

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this as any).formatHistory(history, resumption);
  }

  // Expose getSystemPrompt for testing
  getSystemPromptPublic(): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this as any).getSystemPrompt();
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
    expect((formatted[0].content as string).length).toBeLessThan(200);
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
    expect((formatted[0].content as string)).toContain('message-2');
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
    } as PersonalityConfig);

    const prompt = adapter.getSystemPromptPublic();
    expect(prompt).toContain('You are a witty assistant.');
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
    } as PersonalityConfig);

    const prompt = adapter.getSystemPromptPublic();
    expect(prompt).toContain('[Style:');
    expect(prompt).toContain('formal, professional tone');
    expect(prompt).toContain('use technical depth');
  });

  it('applies tone modifiers from PersonalityOption with tone field', () => {
    const adapter = new TestAdapter({ provider: 'claude', apiKey: 'key', model: 'opus' });
    // Simulate PersonalityOption with tone field
    const personalityOption = {
      id: 'casual',
      name: 'Casual',
      emoji: '😊',
      tagline: 'Relaxed conversation',
      description: 'Casual and friendly',
      bio: 'A casual persona',
      systemPrompt: 'You are friendly.',
      tone: { formality: 0.2, humor: 0.8, energy: 0.7, empathy: 0.6, technicality: 0.3 },
    } as PersonalityOption;

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
    } as PersonalityConfig);

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
    } as PersonalityConfig);

    const prompt = adapter.getSystemPromptPublic();
    expect(prompt).toContain('You are participating in a structured debate');
    expect(prompt).toContain('You argue with passion.');
  });

  it('applies debate profile guidance in debate mode when debateProfile is present', () => {
    const adapter = new TestAdapter({ provider: 'claude', apiKey: 'key', model: 'opus', isDebateMode: true });
    // Directly set personality with debateProfile (setTemporaryPersonality converts to PersonalityConfig)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter.config as any).personality = {
      id: 'aggressive-debater',
      name: 'Aggressive Debater',
      systemPrompt: 'You debate fiercely.',
      tone: { formality: 0.6, humor: 0.2, energy: 0.8, empathy: 0.3, technicality: 0.5 },
      debateProfile: { argumentStyle: 'logical' as const, aggression: 0.9, concession: 0.1 },
    };

    const prompt = adapter.getSystemPromptPublic();
    expect(prompt).toContain('[Debate style:');
    expect(prompt).toContain('assertive, direct challenges');
    expect(prompt).toContain('stand firm on positions');
  });
});
