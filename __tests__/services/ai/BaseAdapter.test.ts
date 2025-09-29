import { BaseAdapter } from '@/services/ai/base/BaseAdapter';
import type { AdapterCapabilities, FormattedMessage, ResumptionContext } from '@/services/ai/types/adapter.types';
import type { Message } from '@/types';

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
