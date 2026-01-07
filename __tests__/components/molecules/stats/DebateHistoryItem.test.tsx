import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialIcons: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children }));

jest.mock('react-native-reanimated', () => {
  const View = require('react-native').View;
  return {
    ...jest.requireActual('react-native-reanimated/mock'),
    default: {
      View,
      createAnimatedComponent: (component: unknown) => component,
    },
  };
});

jest.mock('@/services/stats', () => ({
  formatDateTime: jest.fn((timestamp: number) => new Date(timestamp).toLocaleDateString()),
  formatTimeElapsed: jest.fn(() => '2 hours ago'),
}));

const {
  DebateHistoryItem,
  CompactDebateHistoryItem,
  DebateHistoryList,
  DebateHistoryHeader
} = require('@/components/molecules/stats/DebateHistoryItem');

describe('DebateHistoryItem', () => {
  const defaultProps = {
    debateId: 'test-debate-1',
    topic: 'Should AI have rights?',
    timestamp: Date.now(),
    winner: null,
  };

  const winnerWithStringColor = {
    name: 'Claude',
    color: '#7C3AED',
  };

  const winnerWithBrandColor = {
    name: 'ChatGPT',
    color: { 50: '#f0fdf4', 600: '#16a34a', 700: '#15803d' },
  };

  describe('DebateHistoryItem Component', () => {
    it('renders without crashing', () => {
      const result = renderWithProviders(
        <DebateHistoryItem {...defaultProps} />
      );
      expect(result).toBeTruthy();
    });

    it('displays the topic', () => {
      const { getByText } = renderWithProviders(
        <DebateHistoryItem {...defaultProps} />
      );
      expect(getByText('"Should AI have rights?"')).toBeTruthy();
    });

    it('truncates long topics', () => {
      const longTopic = 'A'.repeat(100);
      const { getByText } = renderWithProviders(
        <DebateHistoryItem {...defaultProps} topic={longTopic} maxTopicLength={60} />
      );
      expect(getByText(`"${'A'.repeat(60)}..."`)).toBeTruthy();
    });

    it('displays winner with string color', () => {
      const { getByText } = renderWithProviders(
        <DebateHistoryItem {...defaultProps} winner={winnerWithStringColor} />
      );
      expect(getByText(/Winner: Claude/)).toBeTruthy();
    });

    it('displays winner with brand color object', () => {
      const { getByText } = renderWithProviders(
        <DebateHistoryItem {...defaultProps} winner={winnerWithBrandColor} />
      );
      expect(getByText(/Winner: ChatGPT/)).toBeTruthy();
    });

    it('does not display winner when null', () => {
      const { queryByText } = renderWithProviders(
        <DebateHistoryItem {...defaultProps} winner={null} />
      );
      expect(queryByText(/Winner:/)).toBeNull();
    });

    it('shows elapsed time when showElapsedTime is true', () => {
      const { getByText } = renderWithProviders(
        <DebateHistoryItem {...defaultProps} showElapsedTime={true} />
      );
      expect(getByText('2 hours ago')).toBeTruthy();
    });

    it('shows formatted date when showElapsedTime is false', () => {
      const { formatDateTime } = require('@/services/stats');
      renderWithProviders(
        <DebateHistoryItem {...defaultProps} showElapsedTime={false} />
      );
      expect(formatDateTime).toHaveBeenCalledWith(defaultProps.timestamp);
    });

    it('applies custom style', () => {
      const customStyle = { marginTop: 20 };
      const result = renderWithProviders(
        <DebateHistoryItem {...defaultProps} style={customStyle} />
      );
      expect(result).toBeTruthy();
    });

    it('applies entering animation when provided', () => {
      const mockAnimation = jest.fn();
      const result = renderWithProviders(
        <DebateHistoryItem {...defaultProps} entering={mockAnimation} />
      );
      expect(result).toBeTruthy();
    });
  });

  describe('CompactDebateHistoryItem Component', () => {
    it('renders without crashing', () => {
      const result = renderWithProviders(
        <CompactDebateHistoryItem topic="Test topic" winner={null} />
      );
      expect(result).toBeTruthy();
    });

    it('displays truncated topic', () => {
      const longTopic = 'A'.repeat(50);
      const { getByText } = renderWithProviders(
        <CompactDebateHistoryItem topic={longTopic} winner={null} />
      );
      expect(getByText(`${'A'.repeat(30)}...`)).toBeTruthy();
    });

    it('displays winner name', () => {
      const { getByText } = renderWithProviders(
        <CompactDebateHistoryItem topic="Test" winner={winnerWithStringColor} />
      );
      expect(getByText('Claude')).toBeTruthy();
    });

    it('displays winner with brand color', () => {
      const { getByText } = renderWithProviders(
        <CompactDebateHistoryItem topic="Test" winner={winnerWithBrandColor} />
      );
      expect(getByText('ChatGPT')).toBeTruthy();
    });

    it('hides topic when showWinnerOnly is true', () => {
      const { queryByText, getByText } = renderWithProviders(
        <CompactDebateHistoryItem
          topic="Hidden topic"
          winner={winnerWithStringColor}
          showWinnerOnly={true}
        />
      );
      expect(queryByText('Hidden topic')).toBeNull();
      expect(getByText('Claude')).toBeTruthy();
    });

    it('does not display winner when null', () => {
      const { queryByText } = renderWithProviders(
        <CompactDebateHistoryItem topic="Test" winner={null} />
      );
      expect(queryByText('Claude')).toBeNull();
    });
  });

  describe('DebateHistoryList Component', () => {
    const debates = [
      { debateId: '1', topic: 'Topic 1', timestamp: Date.now(), winner: winnerWithStringColor },
      { debateId: '2', topic: 'Topic 2', timestamp: Date.now() - 1000, winner: winnerWithBrandColor },
      { debateId: '3', topic: 'Topic 3', timestamp: Date.now() - 2000, winner: null },
    ];

    it('renders without crashing', () => {
      const result = renderWithProviders(
        <DebateHistoryList debates={debates} />
      );
      expect(result).toBeTruthy();
    });

    it('displays empty state when no debates', () => {
      const { getByText } = renderWithProviders(
        <DebateHistoryList debates={[]} />
      );
      expect(getByText('No debate history yet')).toBeTruthy();
    });

    it('limits items to maxItems', () => {
      const { queryByText } = renderWithProviders(
        <DebateHistoryList debates={debates} maxItems={2} />
      );
      expect(queryByText('"Topic 3"')).toBeNull();
    });

    it('renders compact items when compact is true', () => {
      const result = renderWithProviders(
        <DebateHistoryList debates={debates} compact={true} />
      );
      expect(result).toBeTruthy();
    });

    it('passes showElapsedTime to items', () => {
      const { getByText } = renderWithProviders(
        <DebateHistoryList debates={debates} showElapsedTime={true} maxItems={1} />
      );
      expect(getByText('2 hours ago')).toBeTruthy();
    });

    it('applies animation function when provided', () => {
      const mockGetAnimation = jest.fn().mockReturnValue(undefined);
      renderWithProviders(
        <DebateHistoryList debates={debates} getAnimation={mockGetAnimation} />
      );
      expect(mockGetAnimation).toHaveBeenCalled();
    });
  });

  describe('DebateHistoryHeader Component', () => {
    it('renders without crashing', () => {
      const result = renderWithProviders(
        <DebateHistoryHeader />
      );
      expect(result).toBeTruthy();
    });

    it('displays header text', () => {
      const { getByText } = renderWithProviders(
        <DebateHistoryHeader />
      );
      expect(getByText(/Recent Debates/)).toBeTruthy();
    });

    it('shows count when showCount is true and totalCount provided', () => {
      const { getByText } = renderWithProviders(
        <DebateHistoryHeader showCount={true} totalCount={42} />
      );
      expect(getByText('(42)')).toBeTruthy();
    });

    it('does not show count when showCount is false', () => {
      const { queryByText } = renderWithProviders(
        <DebateHistoryHeader showCount={false} totalCount={42} />
      );
      expect(queryByText('(42)')).toBeNull();
    });

    it('does not show count when totalCount is not provided', () => {
      const { queryByText } = renderWithProviders(
        <DebateHistoryHeader showCount={true} />
      );
      expect(queryByText(/\(\d+\)/)).toBeNull();
    });
  });
});
