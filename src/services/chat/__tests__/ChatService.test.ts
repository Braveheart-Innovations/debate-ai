import { ChatService, ConversationContext } from '../ChatService';
import { AI, Message } from '../../../types';

describe('ChatService', () => {
  const ai: AI = {
    id: 'ai-1',
    name: 'Alpha',
    provider: 'openai',
    model: 'gpt-4',
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    jest.spyOn(global.Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    jest.useRealTimers();
    (Math.random as jest.MockedFunction<typeof Math.random>).mockRestore();
  });

  it('createUserMessage builds message with trimmed content and mentions', () => {
    const message = ChatService.createUserMessage('  Hello  ', ['ai-1']);
    expect(message).toMatchObject({
      sender: 'You',
      senderType: 'user',
      content: 'Hello',
      mentions: ['ai-1'],
    });
    expect(message.id).toContain('msg_');
  });

  it('createAIMessage stores metadata and provider info', () => {
    const message = ChatService.createAIMessage(ai, 'Hi there', {
      modelUsed: 'gpt-4',
      responseTime: 1500,
      citations: [{ index: 0, url: 'https://example.com' }],
      providerMetadata: { latency: 1200 },
    });

    expect(message).toMatchObject({
      sender: 'Alpha',
      senderType: 'ai',
      metadata: expect.objectContaining({
        providerId: 'openai',
        modelUsed: 'gpt-4',
        responseTime: 1500,
      }),
    });
  });

  it('createErrorMessage selects friendly copy based on error content', () => {
    const genericError = ChatService.createErrorMessage(ai, new Error('boom'));
    expect(genericError.content).toContain('Sorry, I encountered an error');

    const notConfigured = ChatService.createErrorMessage(ai, 'not configured');
    expect(notConfigured.content).toContain("I'm not configured yet");
  });

  describe('conversation context builders', () => {
    const history: Message[] = [
      {
        id: '1',
        sender: 'Alpha',
        senderType: 'ai',
        content: 'Hello',
        timestamp: Date.now() - 1000,
      },
    ];

    it('buildConversationContext derives last speaker and debate flag', () => {
      const userMessage: Message = {
        id: '2',
        sender: 'You',
        senderType: 'user',
        content: '[DEBATE MODE] Let us start',
        timestamp: Date.now(),
      };

      const context = ChatService.buildConversationContext(history, userMessage);
      expect(context.messages).toHaveLength(2);
      expect(context.isDebateMode).toBe(true);
      expect(context.lastSpeaker).toBe('Alpha');
      expect(context.lastMessage).toBe('Hello');
    });

    it('buildRoundRobinContext uses merged responses', () => {
      const newResponses: Message[] = [
        {
          id: '3',
          sender: 'Beta',
          senderType: 'ai',
          content: 'Reply',
          timestamp: Date.now(),
        },
      ];

      const context = ChatService.buildRoundRobinContext(history, newResponses);
      expect(context.messages).toHaveLength(2);
      expect(context.lastSpeaker).toBe('Beta');
      expect(context.isDebateMode).toBe(false);
    });
  });

  it('isFirstAIInRound checks last message sender', () => {
    const context: ConversationContext = {
      messages: [
        { id: '1', sender: 'You', senderType: 'user', content: 'Hi', timestamp: Date.now() },
      ],
      isDebateMode: false,
    };
    expect(ChatService.isFirstAIInRound(context)).toBe(true);
  });

  describe('validateMessageContent', () => {
    it('rejects empty or non-string content', () => {
      expect(ChatService.validateMessageContent('')).toEqual({ isValid: false, error: 'Content must be a string' });
      expect(ChatService.validateMessageContent('   ')).toEqual({ isValid: false, error: 'Content cannot be empty' });
      expect(ChatService.validateMessageContent('x'.repeat(10001))).toEqual({
        isValid: false,
        error: 'Content too long (max 10000 characters)',
      });
      expect(ChatService.validateMessageContent('Hello').isValid).toBe(true);
    });
  });

  it('calculateTypingDelay produces deterministic range', () => {
    expect(ChatService.calculateTypingDelay()).toBeCloseTo(2000); // 1500 + 0.5 * 1000
  });

  it('hasMessages returns boolean based on message array', () => {
    const singleMessage: Message = { id: '1', sender: 'You', senderType: 'user', content: 'Hi', timestamp: 1 };
    expect(ChatService.hasMessages([singleMessage])).toBe(true);
    expect(ChatService.hasMessages([])).toBe(false);
  });

  it('getLastUserMessage returns most recent user message', () => {
    const messages: Message[] = [
      { id: '1', sender: 'Alpha', senderType: 'ai', content: 'Hi', timestamp: 1 },
      { id: '2', sender: 'You', senderType: 'user', content: 'Hello', timestamp: 2 },
      { id: '3', sender: 'Alpha', senderType: 'ai', content: 'Again', timestamp: 3 },
    ];

    expect(ChatService.getLastUserMessage(messages)?.id).toBe('2');
  });

  it('getMessagesSinceLastUser slices after last user', () => {
    const messages: Message[] = [
      { id: '1', sender: 'You', senderType: 'user', content: 'Hello', timestamp: 1 },
      { id: '2', sender: 'Alpha', senderType: 'ai', content: 'Response', timestamp: 2 },
      { id: '3', sender: 'Beta', senderType: 'ai', content: 'Another', timestamp: 3 },
    ];

    const since = ChatService.getMessagesSinceLastUser(messages);
    expect(since.map(m => m.id)).toEqual(['2', '3']);
  });

  it('isDebateModeActive checks for debate marker', () => {
    const messages: Message[] = [
      { id: '1', sender: 'Alpha', senderType: 'ai', content: 'Regular chat', timestamp: 1 },
      { id: '2', sender: 'You', senderType: 'user', content: '[DEBATE MODE] Start', timestamp: 2 },
    ];

    expect(ChatService.isDebateModeActive(messages)).toBe(true);
  });
});
