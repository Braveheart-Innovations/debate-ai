const mockChatHeaderRef = Symbol('ChatHeader');
const mockChatMessageListRef = Symbol('ChatMessageList');
const mockChatInputBarRef = Symbol('ChatInputBar');
const mockChatTypingIndicatorsRef = Symbol('ChatTypingIndicators');
const mockChatEmptyStateRef = Symbol('ChatEmptyState');
const mockChatMentionSuggestionsRef = Symbol('ChatMentionSuggestions');
const mockChatWarningsRef = Symbol('ChatWarnings');

jest.mock('@/components/organisms/chat/ChatHeader', () => ({ ChatHeader: mockChatHeaderRef }));
jest.mock('@/components/organisms/chat/ChatMessageList', () => ({ ChatMessageList: mockChatMessageListRef }));
jest.mock('@/components/organisms/chat/ChatInputBar', () => ({ ChatInputBar: mockChatInputBarRef }));
jest.mock('@/components/organisms/chat/ChatTypingIndicators', () => ({ ChatTypingIndicators: mockChatTypingIndicatorsRef }));
jest.mock('@/components/organisms/chat/ChatEmptyState', () => ({ ChatEmptyState: mockChatEmptyStateRef }));
jest.mock('@/components/organisms/chat/ChatMentionSuggestions', () => ({ ChatMentionSuggestions: mockChatMentionSuggestionsRef }));
jest.mock('@/components/organisms/chat/ChatWarnings', () => ({ ChatWarnings: mockChatWarningsRef }));

describe('chat organism index exports', () => {
  it('matches direct component exports', () => {
    jest.isolateModules(() => {
      const index = require('@/components/organisms/chat');
      const header = require('@/components/organisms/chat/ChatHeader');
      const list = require('@/components/organisms/chat/ChatMessageList');
      const input = require('@/components/organisms/chat/ChatInputBar');
      const typing = require('@/components/organisms/chat/ChatTypingIndicators');
      const empty = require('@/components/organisms/chat/ChatEmptyState');
      const mentions = require('@/components/organisms/chat/ChatMentionSuggestions');
      const warnings = require('@/components/organisms/chat/ChatWarnings');

      expect(index.ChatHeader).toBe(mockChatHeaderRef);
      expect(index.ChatHeader).toBe(header.ChatHeader);
      expect(index.ChatMessageList).toBe(mockChatMessageListRef);
      expect(index.ChatMessageList).toBe(list.ChatMessageList);
      expect(index.ChatInputBar).toBe(mockChatInputBarRef);
      expect(index.ChatInputBar).toBe(input.ChatInputBar);
      expect(index.ChatTypingIndicators).toBe(mockChatTypingIndicatorsRef);
      expect(index.ChatTypingIndicators).toBe(typing.ChatTypingIndicators);
      expect(index.ChatEmptyState).toBe(mockChatEmptyStateRef);
      expect(index.ChatEmptyState).toBe(empty.ChatEmptyState);
      expect(index.ChatMentionSuggestions).toBe(mockChatMentionSuggestionsRef);
      expect(index.ChatMentionSuggestions).toBe(mentions.ChatMentionSuggestions);
      expect(index.ChatWarnings).toBe(mockChatWarningsRef);
      expect(index.ChatWarnings).toBe(warnings.ChatWarnings);
    });
  });
});
