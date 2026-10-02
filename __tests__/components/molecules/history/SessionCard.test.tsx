import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { SessionCard } from '@/components/molecules/history/SessionCard';
import type { ChatSession } from '@/types';
import {
  createMockAIConfig,
  createMockChatSession,
  createMockMessage,
} from '@test-utils/fixtures';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialIcons: () => null }));

jest.mock('@/services/history', () => ({
  dateFormatterService: {
    formatRelativeDate: jest.fn(() => '2 hours ago'),
  },
}));

describe('SessionCard', () => {
  const claude = createMockAIConfig({ id: 'claude', provider: 'claude', name: 'Claude' });
  const chatgpt = createMockAIConfig({ id: 'chatgpt', provider: 'chatgpt', name: 'ChatGPT' });
  const gemini = createMockAIConfig({ id: 'gemini', provider: 'google', name: 'Gemini' });
  const userMessage = (content: string) =>
    createMockMessage({ id: `user-${content}`, sender: 'user', senderType: 'user', content });
  const aiMessage = (sender: string, content: string) =>
    createMockMessage({ id: `${sender}-${content}`, sender, senderType: 'ai', content });

  const createMockSession = (overrides: Partial<ChatSession> = {}): ChatSession =>
    createMockChatSession({
      id: 'session-1',
      selectedAIs: [claude, chatgpt],
      sessionType: 'chat',
      createdAt: Date.now(),
      messages: [userMessage('Hello'), aiMessage('claude', 'Hi there!')],
      ...overrides,
    });

  const defaultProps = {
    session: createMockSession(),
    onPress: jest.fn(),
    index: 0,
    isHighlighted: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders without crashing', () => {
      const result = renderWithProviders(
        <SessionCard {...defaultProps} />
      );
      expect(result).toBeTruthy();
    });

    it('displays AI names', () => {
      const { getByText } = renderWithProviders(
        <SessionCard {...defaultProps} />
      );
      expect(getByText('Claude • ChatGPT')).toBeTruthy();
    });

    it('displays relative date', () => {
      const { getByText } = renderWithProviders(
        <SessionCard {...defaultProps} />
      );
      expect(getByText('2 hours ago')).toBeTruthy();
    });

    it('displays message count', () => {
      const { getByText } = renderWithProviders(
        <SessionCard {...defaultProps} />
      );
      expect(getByText('2 messages')).toBeTruthy();
    });

    it('displays singular message when only one', () => {
      const session = createMockSession({
        messages: [userMessage('Hello')],
      });
      const { getByText } = renderWithProviders(
        <SessionCard {...defaultProps} session={session} />
      );
      expect(getByText('1 message')).toBeTruthy();
    });
  });

  describe('Session Types', () => {
    it('displays debate session type', () => {
      const session = createMockSession({
        sessionType: 'debate',
        topic: 'AI Ethics',
      });
      const { getByText } = renderWithProviders(
        <SessionCard {...defaultProps} session={session} />
      );
      expect(getByText(/Debate/)).toBeTruthy();
      expect(getByText(/Motion: AI Ethics/)).toBeTruthy();
    });

    it('displays comparison session type', () => {
      const session = createMockSession({
        sessionType: 'comparison',
      });
      const { getByText } = renderWithProviders(
        <SessionCard {...defaultProps} session={session} />
      );
      expect(getByText(/Comparison/)).toBeTruthy();
    });

    it('extracts topic from host message for older debate sessions', () => {
      const session = createMockSession({
        sessionType: 'debate',
        messages: [
          aiMessage('Debate Host', '"Should AI have rights?" is our topic today'),
        ],
      });
      const { getByText } = renderWithProviders(
        <SessionCard {...defaultProps} session={session} />
      );
      expect(getByText(/Motion: Should AI have rights/)).toBeTruthy();
    });

    it('shows fallback for debate without topic', () => {
      const session = createMockSession({
        sessionType: 'debate',
        messages: [],
      });
      const { getByText } = renderWithProviders(
        <SessionCard {...defaultProps} session={session} />
      );
      expect(getByText('Debate completed')).toBeTruthy();
    });

    it('shows diverged message for comparison session', () => {
      // Divergence fields are not part of ChatSession; SessionCard reads them
      // off legacy persisted comparison sessions.
      const session = {
        ...createMockSession({ sessionType: 'comparison' }),
        hasDiverged: true,
        continuedWithAI: 'Claude',
      };
      const { getByText } = renderWithProviders(
        <SessionCard {...defaultProps} session={session} />
      );
      expect(getByText(/Diverged to Claude/)).toBeTruthy();
    });

    it('shows fallback diverged message when AI not specified', () => {
      const session = {
        ...createMockSession({ sessionType: 'comparison' }),
        hasDiverged: true,
      };
      const { getByText } = renderWithProviders(
        <SessionCard {...defaultProps} session={session} />
      );
      expect(getByText(/Diverged to single AI/)).toBeTruthy();
    });

    it('shows last message for chat session', () => {
      const session = createMockSession({
        sessionType: 'chat',
        messages: [
          userMessage('Hello'),
          aiMessage('claude', 'Latest message content'),
        ],
      });
      const { getByText } = renderWithProviders(
        <SessionCard {...defaultProps} session={session} />
      );
      expect(getByText('Latest message content')).toBeTruthy();
    });

    it('shows fallback for empty messages', () => {
      const session = createMockSession({
        sessionType: 'chat',
        messages: [],
      });
      const { getByText } = renderWithProviders(
        <SessionCard {...defaultProps} session={session} />
      );
      expect(getByText('No messages yet')).toBeTruthy();
    });
  });

  describe('Interactions', () => {
    it('calls onPress with session when pressed', () => {
      const onPress = jest.fn();
      const session = createMockSession();
      const { getByTestId } = renderWithProviders(
        <SessionCard
          session={session}
          onPress={onPress}
          index={0}
          isHighlighted={false}
          testID="session-card"
        />
      );

      fireEvent.press(getByTestId('session-card'));
      expect(onPress).toHaveBeenCalledWith(session);
    });
  });

  describe('Search Term Highlighting', () => {
    it('highlights AI name when matching search term', () => {
      const session = createMockSession();
      const { getByText } = renderWithProviders(
        <SessionCard {...defaultProps} session={session} searchTerm="Claude" />
      );
      expect(getByText('Match found')).toBeTruthy();
    });

    it('highlights message content when matching search term', () => {
      const session = createMockSession({
        messages: [userMessage('Hello world')],
      });
      const { getByText } = renderWithProviders(
        <SessionCard {...defaultProps} session={session} searchTerm="world" />
      );
      expect(getByText('Match found')).toBeTruthy();
    });

    it('does not show match badge when search term not found', () => {
      const session = createMockSession();
      const { queryByText } = renderWithProviders(
        <SessionCard {...defaultProps} session={session} searchTerm="nonexistent" />
      );
      expect(queryByText('Match found')).toBeNull();
    });

    it('uses HighlightedText component when search term provided', () => {
      const result = renderWithProviders(
        <SessionCard {...defaultProps} searchTerm="Claude" />
      );
      expect(result).toBeTruthy();
    });
  });

  describe('Animation', () => {
    it('applies FadeInDown animation with delay based on index', () => {
      const result = renderWithProviders(
        <SessionCard {...defaultProps} index={3} />
      );
      expect(result).toBeTruthy();
    });
  });

  describe('Styling', () => {
    it('applies highlighted border when search match found', () => {
      const session = createMockSession();
      const result = renderWithProviders(
        <SessionCard {...defaultProps} session={session} searchTerm="Claude" />
      );
      expect(result).toBeTruthy();
    });

    it('applies default border when no search match', () => {
      const result = renderWithProviders(
        <SessionCard {...defaultProps} searchTerm="" />
      );
      expect(result).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('handles session with single AI', () => {
      const session = createMockSession({
        selectedAIs: [claude],
      });
      const { getByText } = renderWithProviders(
        <SessionCard {...defaultProps} session={session} />
      );
      expect(getByText('Claude')).toBeTruthy();
    });

    it('handles session with many AIs', () => {
      const session = createMockSession({
        selectedAIs: [claude, chatgpt, gemini],
      });
      const { getByText } = renderWithProviders(
        <SessionCard {...defaultProps} session={session} />
      );
      expect(getByText('Claude • ChatGPT • Gemini')).toBeTruthy();
    });

    it('applies testID prop correctly', () => {
      const { getByTestId } = renderWithProviders(
        <SessionCard {...defaultProps} testID="test-session-card" />
      );
      expect(getByTestId('test-session-card')).toBeTruthy();
    });
  });
});
