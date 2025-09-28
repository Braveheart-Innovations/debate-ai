import { MessageService } from '@/services/chat/MessageService';
import type { Message } from '@/types';

describe('MessageService', () => {
  const baseMessage: Message = {
    id: 'msg-1',
    sender: 'Claude',
    senderType: 'ai',
    content: 'The debate begins now.',
    timestamp: 1,
  };

  it('formats messages with timestamp and metadata options', () => {
    const formatted = MessageService.formatMessage(baseMessage, { includeTimestamp: true, includeMetadata: true });
    expect(formatted).toContain('Claude:');
    expect(formatted).toContain('The debate begins now.');
  });

  it('parses mentions and normalizes case', () => {
    const parsed = MessageService.parseMentions('Hello @Claude and @claude!');
    expect(parsed.mentions).toEqual(['claude']);
    expect(parsed.hasMentions).toBe(true);
  });

  it('validates and sanitizes message content', () => {
    const valid = MessageService.validateMessageContent('  Ready to go ');
    expect(valid.isValid).toBe(true);
    expect(valid.sanitized).toBe('Ready to go');

    const invalid = MessageService.validateMessageContent('');
    expect(invalid.isValid).toBe(false);
    expect(invalid.warnings).toContain('Invalid content type');
  });

  it('enriches messages with derived metadata', () => {
    const enriched = MessageService.enrichMessage(baseMessage, { sessionId: 'session-1' });
    expect(enriched.metadata?.wordCount).toBeGreaterThan(0);
    expect(enriched.metadata?.sessionId).toBe('session-1');
  });

  it('extracts conversation statistics', () => {
    const info = MessageService.extractMessageInfo('Check https://example.com for details.');
    expect(info.hasLinks).toBe(true);
    expect(info.wordCount).toBeGreaterThan(0);
    expect(info.hasDebateMode).toBe(false);
  });
});
