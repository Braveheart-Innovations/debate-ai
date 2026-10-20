import type { Message } from '../../contract/types';

jest.mock('../../../cloudPayloadStorage', () => ({ PAYLOAD_SENTINEL: '__PAYLOAD_OFFLOADED__' }));
jest.mock('../sessionStore', () => ({ hydratePayloadRefs: jest.fn() }));

import { FieldValue } from 'firebase-admin/firestore';
import { normalizePreview, summarizeMessages, turnStartSummary } from '../sessionSummary';

function message(senderType: Message['senderType'], content: string, timestamp: number): Pick<Message, 'senderType' | 'content' | 'timestamp'> {
  return { senderType, content, timestamp };
}

describe('the session summary', () => {
  it('counts every message, takes the newest one\'s time, and previews the newest user or AI text', () => {
    expect(summarizeMessages([
      message('user', 'Forecast retail sales', 1),
      message('ai', 'Here is the  forecast.\n\nIt rises.', 2),
      message('tool', 'declined', 3),
      message('ai', '   ', 4),
    ])).toEqual({ lastMessageAt: 4, messageCount: 4, lastMessagePreview: 'Here is the forecast. It rises.' });
  });

  it('has no preview when no message has text, and nothing for a session with no messages', () => {
    expect(summarizeMessages([message('tool', 'result', 7)])).toEqual({ lastMessageAt: 7, messageCount: 1 });
    expect(summarizeMessages([])).toBeNull();
  });

  it('cuts a preview to 200 characters, as the web does', () => {
    expect(normalizePreview(`${'a'.repeat(150)}\n${'b'.repeat(100)}`)).toBe(`${'a'.repeat(150)} ${'b'.repeat(49)}`);
  });

  it('starts a turn with the user\'s message as the newest, one more, and its preview', () => {
    expect(turnStartSummary(message('user', 'Update   the report', 9))).toEqual({
      lastMessageAt: 9,
      messageCount: FieldValue.increment(1),
      lastMessagePreview: 'Update the report',
    });
    expect(turnStartSummary(message('user', '', 9))).not.toHaveProperty('lastMessagePreview');
  });
});
