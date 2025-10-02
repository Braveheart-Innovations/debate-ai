import { ChatService } from '@/services/chat/ChatService';
import type { AI, Message } from '@/types';

describe('ChatService', () => {
  const baseAI: AI = {
    id: 'claude',
    provider: 'claude',
    name: 'Claude',
    model: 'claude-3',
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates user messages with trimmed content and mentions', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    const message = ChatService.createUserMessage('  Hello world  ', ['@claude']);

    expect(message).toEqual({
      id: 'msg_1700000000000',
      sender: 'You',
      senderType: 'user',
      content: 'Hello world',
      timestamp: 1_700_000_000_000,
      mentions: ['@claude'],
    });
  });

  it('creates AI messages with metadata and optional fields', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_100);

    const message = ChatService.createAIMessage(baseAI, 'response', {
      modelUsed: 'claude-latest',
      responseTime: 1234,
      citations: [{ index: 0, url: 'https://example.com' }],
      providerMetadata: { latency: 100 },
    });

    expect(message.id).toBe('msg_1700000000100_claude');
    expect(message.senderType).toBe('ai');
    expect(message.metadata).toMatchObject({
      providerId: 'claude',
      modelUsed: 'claude-latest',
      responseTime: 1234,
      citations: [{ index: 0, url: 'https://example.com' }],
      providerMetadata: { latency: 100 },
    });
  });

  it('creates friendly error messages for configuration issues', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_200);

    const configError = ChatService.createErrorMessage(baseAI, 'not configured');
    const runtimeError = ChatService.createErrorMessage(baseAI, new Error('Boom'));

    expect(configError.content).toContain('Please add my API key');
    expect(runtimeError.content).toContain('Sorry, I encountered an error');
  });

  it('builds conversation context with debate mode detection', () => {
    const messages: Message[] = [
      { id: '1', sender: 'You', senderType: 'user', content: 'Hello', timestamp: 1 },
      { id: '2', sender: 'Claude', senderType: 'ai', content: '[DEBATE MODE] Opening statement', timestamp: 2 },
    ];
    const userMessage: Message = { id: '3', sender: 'You', senderType: 'user', content: 'reply', timestamp: 3 };

    const context = ChatService.buildConversationContext(messages, userMessage);

    expect(context.isDebateMode).toBe(true);
    expect(context.lastSpeaker).toBe('Claude');
    expect(context.lastMessage).toBe('[DEBATE MODE] Opening statement');
    expect(context.messages).toHaveLength(3);
  });

  it('builds round robin context and determines first AI in round', () => {
    const history: Message[] = [
      { id: '1', sender: 'You', senderType: 'user', content: 'Hello', timestamp: 1 },
    ];
    const responses: Message[] = [
      { id: '2', sender: 'Claude', senderType: 'ai', content: 'Hi there', timestamp: 2 },
    ];

    const context = ChatService.buildRoundRobinContext(history, responses);
    expect(context.lastSpeaker).toBe('Claude');
    expect(context.isDebateMode).toBe(false);
    expect(ChatService.isFirstAIInRound({ messages: history.concat(responses), isDebateMode: false })).toBe(false);
  });

  it('validates message content and typing delay', () => {
    expect(ChatService.validateMessageContent('')).toEqual({ isValid: false, error: 'Content must be a string' });
    expect(ChatService.validateMessageContent('   ')).toEqual({ isValid: false, error: 'Content cannot be empty' });
    expect(ChatService.validateMessageContent('a'.repeat(10001)).isValid).toBe(false);
    expect(ChatService.validateMessageContent('Valid message').isValid).toBe(true);

    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(ChatService.calculateTypingDelay()).toBe(1500 + 0.5 * 1000);
  });

  it('examines message history helpers', () => {
    const messages: Message[] = [
      { id: '1', sender: 'Claude', senderType: 'ai', content: 'Hi', timestamp: 1 },
      { id: '2', sender: 'You', senderType: 'user', content: 'Question', timestamp: 2 },
      { id: '3', sender: 'Claude', senderType: 'ai', content: 'Answer', timestamp: 3 },
      { id: '4', sender: 'Claude', senderType: 'ai', content: '[DEBATE MODE] Follow up', timestamp: 4 },
    ];

    expect(ChatService.hasMessages(messages)).toBe(true);
    expect(ChatService.getLastUserMessage(messages)?.id).toBe('2');
    expect(ChatService.getMessagesSinceLastUser(messages)).toHaveLength(2);
    expect(ChatService.isDebateModeActive(messages)).toBe(true);
  });
});
