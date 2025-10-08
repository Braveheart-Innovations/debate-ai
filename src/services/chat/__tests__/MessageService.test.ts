import { MessageService } from '../MessageService';
import { Message } from '../../../types';

describe('MessageService', () => {
  const createMessage = (overrides: Partial<Message> = {}): Message => ({
    id: overrides.id || '1',
    sender: overrides.sender || 'You',
    senderType: overrides.senderType || 'user',
    content: overrides.content || 'Hello world',
    timestamp: overrides.timestamp ?? Date.now(),
    mentions: overrides.mentions,
    metadata: overrides.metadata,
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-04-10T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('formatMessage', () => {
    it('can include timestamp and metadata with truncation', () => {
      const msg = createMessage({
        sender: 'Alpha',
        senderType: 'ai',
        content: 'This is a long message',
        timestamp: Date.now(),
      });

      const timeSpy = jest.spyOn(MessageService, 'formatTime').mockReturnValue('12:00');
      const formatted = MessageService.formatMessage(msg, {
        includeTimestamp: true,
        includeMetadata: true,
        truncateLength: 10,
      });

      expect(formatted).toBe('Alpha: [12:00] This is a ...');
      timeSpy.mockRestore();
    });
  });

  it('formatRelativeTime returns human-friendly buckets', () => {
    const now = Date.now();
    expect(MessageService.formatRelativeTime(now - 30 * 1000)).toBe('Just now');
    expect(MessageService.formatRelativeTime(now - 5 * 60 * 1000)).toBe('5m ago');
    expect(MessageService.formatRelativeTime(now - 2 * 60 * 60 * 1000)).toBe('2h ago');
    expect(MessageService.formatRelativeTime(now - 3 * 24 * 60 * 60 * 1000)).toBe('3d ago');
  });

  it('parseMentions extracts unique mention tokens', () => {
    const result = MessageService.parseMentions('Hello @Alpha and @beta and @Alpha');
    expect(result).toEqual({
      mentions: ['alpha', 'beta'],
      cleanText: 'Hello @Alpha and @beta and @Alpha',
      hasMentions: true,
    });
  });

  describe('validateMessageContent', () => {
    it('validates and trims content', () => {
      expect(MessageService.validateMessageContent('')).toEqual({
        isValid: false,
        sanitized: '',
        warnings: ['Invalid content type'],
      });

      const long = 'x'.repeat(10050);
      const result = MessageService.validateMessageContent(long);
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toHaveLength(10000);
      expect(result.warnings).toContain('Message too long, truncating');
    });

    it('flags excessive line breaks', () => {
      const content = `Hello${'\n'.repeat(10)}World`;
      const result = MessageService.validateMessageContent(content);
      expect(result.warnings).toContain('Excessive line breaks');
    });
  });

  it('enrichMessage adds metadata with word count', () => {
    const message = createMessage({ content: 'Hello world from AI' });
    const enriched = MessageService.enrichMessage(message, { sessionId: 'abc', responseTime: 1200 });
    expect(enriched.metadata).toEqual({
      wordCount: 4,
      sessionId: 'abc',
      responseTime: 1200,
    });
  });

  it('extractMessageInfo computes stats and flags markers', () => {
    const info = MessageService.extractMessageInfo('Hi @Alpha check https://example.com [DEBATE MODE]');
    expect(info).toEqual({
      wordCount: 6,
      characterCount: expect.any(Number),
      lineCount: 1,
      hasMentions: true,
      hasLinks: true,
      hasDebateMode: true,
    });
  });

  it('prepareForAIContext supports truncation, metadata, and anonymization', () => {
    const message = createMessage({ sender: 'Alpha', senderType: 'ai', content: 'Detailed response for user' });
    const anonymized = MessageService.prepareForAIContext(message, {
      includeMetadata: true,
      truncateLength: 10,
      anonymize: true,
    });

    expect(anonymized).toBe('AI: Detailed r...');
  });

  it('filterMessages applies combined criteria', () => {
    const baseTime = Date.now();
    const messages = [
      createMessage({ id: '1', sender: 'You', senderType: 'user', content: 'Hi', timestamp: baseTime }),
      createMessage({ id: '2', sender: 'Alpha', senderType: 'ai', content: 'Hello @You', timestamp: baseTime + 1000 }),
    ];

    const filtered = MessageService.filterMessages(messages, {
      senderType: 'ai',
      hasMentions: true,
      timeRange: { start: baseTime, end: baseTime + 2000 },
    });

    expect(filtered.map(m => m.id)).toEqual(['2']);
  });

  it('getConversationStats aggregates counts and duration', () => {
    const baseTime = Date.now();
    const messages = [
      createMessage({ senderType: 'user', sender: 'You', content: 'Hello', timestamp: baseTime }),
      createMessage({ senderType: 'ai', sender: 'Alpha', content: 'Hi there', timestamp: baseTime + 2000 }),
    ];

    const stats = MessageService.getConversationStats(messages);
    expect(stats).toMatchObject({
      totalMessages: 2,
      userMessages: 1,
      aiMessages: 1,
      totalWords: 3,
      participants: expect.arrayContaining(['You', 'Alpha']),
      duration: 2000,
    });
    expect(stats.averageWordsPerMessage).toBe(1.5);
  });
});
