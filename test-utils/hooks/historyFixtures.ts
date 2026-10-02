import type { ChatSession } from '@/types';
import { createMockAIConfig, createMockChatSession, createMockMessage } from '../fixtures';

// History-hook fixtures, built on the shared typed builders in test-utils/fixtures.
export { createMockAIConfig, createMockMessage };

export const createMockSession = (overrides: Partial<ChatSession> = {}): ChatSession =>
  createMockChatSession({
    messages: [createMockMessage()],
    isActive: false,
    createdAt: 1700000000000,
    lastMessageAt: 1700000001000,
    ...overrides,
  });

export const buildSessionList = (
  count: number,
  builder: (index: number) => Partial<ChatSession> = () => ({})
): ChatSession[] =>
  Array.from({ length: count }, (_, index) =>
    createMockSession({
      id: `session-${index + 1}`,
      createdAt: 1700000000000 + index * 1000,
      lastMessageAt: 1700000001000 + index * 1000,
      ...builder(index),
    })
  );
