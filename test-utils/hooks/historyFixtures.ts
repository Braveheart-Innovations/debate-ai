import type { ChatSession, AIConfig, Message } from '@/types';

export const createMockAIConfig = (overrides: Partial<AIConfig> = {}): AIConfig => ({
  id: 'ai-1',
  name: 'Test AI',
  provider: 'anthropic',
  model: 'claude-3-haiku',
  ...overrides,
});

export const createMockMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'message-1',
  role: 'user',
  content: 'Hello world',
  createdAt: Date.now(),
  metadata: {
    tokens: 10,
  },
  ...overrides,
});

export const createMockSession = (overrides: Partial<ChatSession> = {}): ChatSession => ({
  id: 'session-1',
  selectedAIs: [createMockAIConfig()],
  messages: [createMockMessage()],
  isActive: false,
  createdAt: 1700000000000,
  lastMessageAt: 1700000001000,
  sessionType: 'chat',
  ...overrides,
});

export const buildSessionList = (
  count: number,
  builder: (index: number) => Partial<ChatSession> = () => ({})
): ChatSession[] => {
  return Array.from({ length: count }, (_, index) =>
    createMockSession({
      id: `session-${index + 1}`,
      createdAt: 1700000000000 + index * 1000,
      lastMessageAt: 1700000001000 + index * 1000,
      ...builder(index),
    })
  );
};
