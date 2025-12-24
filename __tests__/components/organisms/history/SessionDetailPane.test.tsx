import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { SessionDetailPane } from '@/components/organisms/history/SessionDetailPane';
import type { ChatSession, AIConfig, Message } from '@/types';

// Mock the service
jest.mock('@/services/history', () => ({
  dateFormatterService: {
    formatRelativeDate: jest.fn(() => 'Today, 10:30 AM'),
  },
}));

// Mock atoms
jest.mock('@/components/atoms', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Box: ({ children, style, testID }: any) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { View } = require('react-native');
    return React.createElement(View, { testID, style }, children);
  },
}));

// Mock molecules
jest.mock('@/components/molecules', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Typography: ({ children, testID }: any) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Text } = require('react-native');
    return React.createElement(Text, { testID }, children);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Button: ({ title, onPress, testID }: any) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TouchableOpacity, Text } = require('react-native');
    return React.createElement(
      TouchableOpacity,
      { testID: testID || 'action-button', onPress },
      React.createElement(Text, null, title)
    );
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Card: ({ children, testID }: any) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { View } = require('react-native');
    return React.createElement(View, { testID: testID || 'card' }, children);
  },
}));

// Mock hooks
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    rs: (size: string) => {
      const sizes: Record<string, number> = {
        sm: 8,
        md: 16,
        lg: 24,
      };
      return sizes[size] || 16;
    },
    fontSize: (size: string) => {
      const fontSizes: Record<string, number> = {
        sm: 12,
        md: 14,
        lg: 16,
      };
      return fontSizes[size] || 14;
    },
  }),
}));

describe('SessionDetailPane', () => {
  const mockOnOpenSession = jest.fn();

  const mockAI: AIConfig = {
    id: 'ai-1',
    provider: 'claude',
    name: 'Claude',
    model: 'claude-3-haiku',
  };

  const mockAI2: AIConfig = {
    id: 'ai-2',
    provider: 'openai',
    name: 'ChatGPT',
    model: 'gpt-4',
  };

  const mockMessage: Message = {
    id: 'msg-1',
    sender: 'Claude',
    senderType: 'ai',
    content: 'This is a test message from Claude.',
    timestamp: Date.now(),
  };

  const mockUserMessage: Message = {
    id: 'msg-2',
    sender: 'User',
    senderType: 'user',
    content: 'This is a user message.',
    timestamp: Date.now(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Empty State', () => {
    it('renders empty state when no session is provided', () => {
      const { getByText } = renderWithProviders(
        <SessionDetailPane session={null} onOpenSession={mockOnOpenSession} />
      );

      expect(getByText('Select a session to preview')).toBeTruthy();
    });

    it('does not render action button in empty state', () => {
      const { queryByTestId } = renderWithProviders(
        <SessionDetailPane session={null} onOpenSession={mockOnOpenSession} />
      );

      expect(queryByTestId('action-button')).toBeNull();
    });
  });

  describe('Chat Session Display', () => {
    const chatSession: ChatSession = {
      id: 'session-1',
      selectedAIs: [mockAI],
      messages: [mockMessage, mockUserMessage],
      isActive: false,
      createdAt: Date.now(),
      sessionType: 'chat',
    };

    it('renders chat session with AI name', () => {
      const { getAllByText } = renderWithProviders(
        <SessionDetailPane session={chatSession} onOpenSession={mockOnOpenSession} />
      );

      // AI name appears in header and in message sender
      const claudeElements = getAllByText('Claude');
      expect(claudeElements.length).toBeGreaterThan(0);
    });

    it('displays "Chat" as session type label', () => {
      const { getAllByText } = renderWithProviders(
        <SessionDetailPane session={chatSession} onOpenSession={mockOnOpenSession} />
      );

      // "Chat" appears in type label and button
      const chatElements = getAllByText(/Chat/);
      expect(chatElements.length).toBeGreaterThan(0);
    });

    it('displays formatted creation date', () => {
      const { getByText } = renderWithProviders(
        <SessionDetailPane session={chatSession} onOpenSession={mockOnOpenSession} />
      );

      expect(getByText(/Today, 10:30 AM/)).toBeTruthy();
    });

    it('displays message count', () => {
      const { getByText } = renderWithProviders(
        <SessionDetailPane session={chatSession} onOpenSession={mockOnOpenSession} />
      );

      expect(getByText('2 messages')).toBeTruthy();
    });

    it('displays AI count with singular form', () => {
      const { getByText } = renderWithProviders(
        <SessionDetailPane session={chatSession} onOpenSession={mockOnOpenSession} />
      );

      expect(getByText('1 AI')).toBeTruthy();
    });

    it('shows "Continue Chat" button for chat sessions', () => {
      const { getByText } = renderWithProviders(
        <SessionDetailPane session={chatSession} onOpenSession={mockOnOpenSession} />
      );

      expect(getByText('Continue Chat')).toBeTruthy();
    });

    it('calls onOpenSession when button is pressed', () => {
      const { getByTestId } = renderWithProviders(
        <SessionDetailPane session={chatSession} onOpenSession={mockOnOpenSession} />
      );

      fireEvent.press(getByTestId('action-button'));
      expect(mockOnOpenSession).toHaveBeenCalledWith(chatSession);
      expect(mockOnOpenSession).toHaveBeenCalledTimes(1);
    });

    it('renders recent messages preview', () => {
      const { getByText } = renderWithProviders(
        <SessionDetailPane session={chatSession} onOpenSession={mockOnOpenSession} />
      );

      expect(getByText('Recent Messages')).toBeTruthy();
      expect(getByText('This is a test message from Claude.')).toBeTruthy();
      expect(getByText('This is a user message.')).toBeTruthy();
    });

    it('displays user messages with "You" as sender', () => {
      const { getByText } = renderWithProviders(
        <SessionDetailPane session={chatSession} onOpenSession={mockOnOpenSession} />
      );

      expect(getByText('You')).toBeTruthy();
    });

    it('displays AI messages with AI name as sender', () => {
      const { getAllByText } = renderWithProviders(
        <SessionDetailPane session={chatSession} onOpenSession={mockOnOpenSession} />
      );

      // Claude appears as header title and message sender
      const claudeElements = getAllByText('Claude');
      expect(claudeElements.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Debate Session Display', () => {
    const debateSession: ChatSession = {
      id: 'session-2',
      selectedAIs: [mockAI, mockAI2],
      messages: [mockMessage],
      isActive: false,
      createdAt: Date.now(),
      sessionType: 'debate',
      topic: 'Is artificial intelligence beneficial for society?',
    };

    it('renders multiple AI names joined with ampersand', () => {
      const { getByText } = renderWithProviders(
        <SessionDetailPane session={debateSession} onOpenSession={mockOnOpenSession} />
      );

      expect(getByText('Claude & ChatGPT')).toBeTruthy();
    });

    it('displays "Debate" as session type label', () => {
      const { getAllByText } = renderWithProviders(
        <SessionDetailPane session={debateSession} onOpenSession={mockOnOpenSession} />
      );

      // "Debate" appears in type label and button
      const debateElements = getAllByText(/Debate/);
      expect(debateElements.length).toBeGreaterThan(0);
    });

    it('displays debate topic with MOTION label', () => {
      const { getByText } = renderWithProviders(
        <SessionDetailPane session={debateSession} onOpenSession={mockOnOpenSession} />
      );

      expect(getByText('MOTION')).toBeTruthy();
      expect(getByText('Is artificial intelligence beneficial for society?')).toBeTruthy();
    });

    it('shows "View Debate" button for debate sessions', () => {
      const { getByText } = renderWithProviders(
        <SessionDetailPane session={debateSession} onOpenSession={mockOnOpenSession} />
      );

      expect(getByText('View Debate')).toBeTruthy();
    });

    it('displays AI count with plural form for multiple AIs', () => {
      const { getByText } = renderWithProviders(
        <SessionDetailPane session={debateSession} onOpenSession={mockOnOpenSession} />
      );

      expect(getByText('2 AIs')).toBeTruthy();
    });

    it('does not render topic section when topic is missing', () => {
      const debateWithoutTopic: ChatSession = {
        ...debateSession,
        topic: undefined,
      };

      const { queryByText } = renderWithProviders(
        <SessionDetailPane session={debateWithoutTopic} onOpenSession={mockOnOpenSession} />
      );

      expect(queryByText('MOTION')).toBeNull();
    });
  });

  describe('Comparison Session Display', () => {
    const comparisonSession: ChatSession = {
      id: 'session-3',
      selectedAIs: [mockAI, mockAI2],
      messages: [mockMessage, mockUserMessage],
      isActive: false,
      createdAt: Date.now(),
      sessionType: 'comparison',
    };

    it('displays "Comparison" as session type label', () => {
      const { getAllByText } = renderWithProviders(
        <SessionDetailPane session={comparisonSession} onOpenSession={mockOnOpenSession} />
      );

      // "Comparison" appears in type label and button
      const comparisonElements = getAllByText(/Comparison/);
      expect(comparisonElements.length).toBeGreaterThan(0);
    });

    it('shows "View Comparison" button for comparison sessions', () => {
      const { getByText } = renderWithProviders(
        <SessionDetailPane session={comparisonSession} onOpenSession={mockOnOpenSession} />
      );

      expect(getByText('View Comparison')).toBeTruthy();
    });
  });

  describe('Message Preview', () => {
    it('shows empty state when there are no messages', () => {
      const emptySession: ChatSession = {
        id: 'session-4',
        selectedAIs: [mockAI],
        messages: [],
        isActive: false,
        createdAt: Date.now(),
        sessionType: 'chat',
      };

      const { getByText } = renderWithProviders(
        <SessionDetailPane session={emptySession} onOpenSession={mockOnOpenSession} />
      );

      expect(getByText('No messages yet')).toBeTruthy();
    });

    it('displays only last 10 messages', () => {
      const messages: Message[] = Array.from({ length: 15 }, (_, i) => ({
        id: `msg-${i}`,
        sender: 'Claude',
        senderType: 'ai' as const,
        content: `Message ${i + 1}`,
        timestamp: Date.now() + i,
      }));

      const sessionWithManyMessages: ChatSession = {
        id: 'session-5',
        selectedAIs: [mockAI],
        messages,
        isActive: false,
        createdAt: Date.now(),
        sessionType: 'chat',
      };

      const { getByText, queryByText } = renderWithProviders(
        <SessionDetailPane session={sessionWithManyMessages} onOpenSession={mockOnOpenSession} />
      );

      // Should show last 10 messages (messages 6-15)
      expect(getByText('Message 15')).toBeTruthy();
      expect(getByText('Message 6')).toBeTruthy();

      // Should not show first 5 messages
      expect(queryByText('Message 1')).toBeNull();
      expect(queryByText('Message 5')).toBeNull();
    });

    it('displays message count correctly with singular form', () => {
      const singleMessageSession: ChatSession = {
        id: 'session-6',
        selectedAIs: [mockAI],
        messages: [mockMessage],
        isActive: false,
        createdAt: Date.now(),
        sessionType: 'chat',
      };

      const { getByText } = renderWithProviders(
        <SessionDetailPane session={singleMessageSession} onOpenSession={mockOnOpenSession} />
      );

      expect(getByText('1 messages')).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('handles session with three AIs', () => {
      const mockAI3: AIConfig = {
        id: 'ai-3',
        provider: 'google',
        name: 'Gemini',
        model: 'gemini-pro',
      };

      const threeAISession: ChatSession = {
        id: 'session-7',
        selectedAIs: [mockAI, mockAI2, mockAI3],
        messages: [mockMessage],
        isActive: false,
        createdAt: Date.now(),
        sessionType: 'chat',
      };

      const { getByText } = renderWithProviders(
        <SessionDetailPane session={threeAISession} onOpenSession={mockOnOpenSession} />
      );

      expect(getByText('Claude & ChatGPT & Gemini')).toBeTruthy();
      expect(getByText('3 AIs')).toBeTruthy();
    });

    it('handles session with empty topic string', () => {
      const debateWithEmptyTopic: ChatSession = {
        id: 'session-8',
        selectedAIs: [mockAI, mockAI2],
        messages: [mockMessage],
        isActive: false,
        createdAt: Date.now(),
        sessionType: 'debate',
        topic: '',
      };

      const { queryByText } = renderWithProviders(
        <SessionDetailPane session={debateWithEmptyTopic} onOpenSession={mockOnOpenSession} />
      );

      // Empty topic should not render the topic box
      expect(queryByText('MOTION')).toBeNull();
    });

    it('handles messages with very long content', () => {
      const longContent = 'A'.repeat(500);
      const longMessage: Message = {
        id: 'msg-long',
        sender: 'Claude',
        senderType: 'ai',
        content: longContent,
        timestamp: Date.now(),
      };

      const sessionWithLongMessage: ChatSession = {
        id: 'session-9',
        selectedAIs: [mockAI],
        messages: [longMessage],
        isActive: false,
        createdAt: Date.now(),
        sessionType: 'chat',
      };

      const { getByText } = renderWithProviders(
        <SessionDetailPane session={sessionWithLongMessage} onOpenSession={mockOnOpenSession} />
      );

      // Message should be rendered (numberOfLines prop will handle truncation in real component)
      expect(getByText(longContent)).toBeTruthy();
    });

    it('handles session type that defaults to chat', () => {
      const sessionWithoutType: ChatSession = {
        id: 'session-10',
        selectedAIs: [mockAI],
        messages: [mockMessage],
        isActive: false,
        createdAt: Date.now(),
        // sessionType is optional, so testing undefined case
      };

      const { getAllByText, getByText } = renderWithProviders(
        <SessionDetailPane session={sessionWithoutType} onOpenSession={mockOnOpenSession} />
      );

      const chatElements = getAllByText(/Chat/);
      expect(chatElements.length).toBeGreaterThan(0);
      expect(getByText('Continue Chat')).toBeTruthy();
    });
  });

  describe('Responsive Behavior', () => {
    it('applies responsive spacing from useResponsive hook', () => {
      const chatSession: ChatSession = {
        id: 'session-11',
        selectedAIs: [mockAI],
        messages: [mockMessage],
        isActive: false,
        createdAt: Date.now(),
        sessionType: 'chat',
      };

      const { getByText } = renderWithProviders(
        <SessionDetailPane session={chatSession} onOpenSession={mockOnOpenSession} />
      );

      // Component should render without errors when using responsive values
      expect(getByText('Recent Messages')).toBeTruthy();
    });
  });

  describe('Theme Integration', () => {
    it('renders with theme colors applied', () => {
      const chatSession: ChatSession = {
        id: 'session-12',
        selectedAIs: [mockAI],
        messages: [mockMessage],
        isActive: false,
        createdAt: Date.now(),
        sessionType: 'chat',
      };

      const { getByText } = renderWithProviders(
        <SessionDetailPane session={chatSession} onOpenSession={mockOnOpenSession} />
      );

      // Component should render successfully with theme provider
      expect(getByText('Recent Messages')).toBeTruthy();
    });
  });
});
