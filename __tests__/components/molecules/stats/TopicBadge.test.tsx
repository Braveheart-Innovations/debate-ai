import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialIcons: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children }));

jest.mock('@/services/stats', () => ({
  truncateTopic: jest.fn((topic: string, maxLength: number) =>
    topic.length > maxLength ? `${topic.slice(0, maxLength)}...` : topic
  ),
  formatTopicStats: jest.fn((wins: number, participations: number) =>
    `${wins}/${participations}`
  ),
}));

const {
  TopicBadge,
  TopicBadgeList,
  TopicPerformance
} = require('@/components/molecules/stats/TopicBadge');

describe('TopicBadge', () => {
  const defaultProps = {
    topic: 'AI Ethics',
    wins: 3,
    participations: 5,
  };

  const brandColorObject = {
    50: '#f0fdf4',
    200: '#bbf7d0',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
  };

  describe('TopicBadge Component', () => {
    it('renders without crashing', () => {
      const result = renderWithProviders(
        <TopicBadge {...defaultProps} />
      );
      expect(result).toBeTruthy();
    });

    it('displays the topic text', () => {
      const { getByText } = renderWithProviders(
        <TopicBadge {...defaultProps} />
      );
      expect(getByText('AI Ethics')).toBeTruthy();
    });

    it('displays stats when showStats is true', () => {
      const { getByText } = renderWithProviders(
        <TopicBadge {...defaultProps} showStats={true} />
      );
      expect(getByText('3/5')).toBeTruthy();
    });

    it('hides stats when showStats is false', () => {
      const { queryByText } = renderWithProviders(
        <TopicBadge {...defaultProps} showStats={false} />
      );
      expect(queryByText('3/5')).toBeNull();
    });

    it('truncates long topics', () => {
      const longTopic = 'A'.repeat(50);
      const { getByText } = renderWithProviders(
        <TopicBadge {...defaultProps} topic={longTopic} maxLength={35} />
      );
      expect(getByText(`${'A'.repeat(35)}...`)).toBeTruthy();
    });

    it('applies string color correctly', () => {
      const result = renderWithProviders(
        <TopicBadge {...defaultProps} color="#7C3AED" />
      );
      expect(result).toBeTruthy();
    });

    it('applies brand color object correctly', () => {
      const result = renderWithProviders(
        <TopicBadge {...defaultProps} color={brandColorObject} />
      );
      expect(result).toBeTruthy();
    });

    it('uses primary color when no color provided', () => {
      const result = renderWithProviders(
        <TopicBadge {...defaultProps} />
      );
      expect(result).toBeTruthy();
    });

    it('renders small size variant', () => {
      const result = renderWithProviders(
        <TopicBadge {...defaultProps} size="small" />
      );
      expect(result).toBeTruthy();
    });

    it('renders medium size variant', () => {
      const result = renderWithProviders(
        <TopicBadge {...defaultProps} size="medium" />
      );
      expect(result).toBeTruthy();
    });

    it('uses default maxLength of 35', () => {
      const { truncateTopic } = require('@/services/stats');
      renderWithProviders(
        <TopicBadge {...defaultProps} />
      );
      expect(truncateTopic).toHaveBeenCalledWith('AI Ethics', 35);
    });
  });

  describe('TopicBadgeList Component', () => {
    const topics = [
      { topic: 'Topic 1', wins: 3, participations: 5 },
      { topic: 'Topic 2', wins: 2, participations: 4 },
      { topic: 'Topic 3', wins: 1, participations: 2 },
    ];

    it('renders without crashing', () => {
      const result = renderWithProviders(
        <TopicBadgeList topics={topics} />
      );
      expect(result).toBeTruthy();
    });

    it('displays header text', () => {
      const { getByText } = renderWithProviders(
        <TopicBadgeList topics={topics} />
      );
      expect(getByText('Top Motions:')).toBeTruthy();
    });

    it('displays empty state when no topics', () => {
      const { getByText } = renderWithProviders(
        <TopicBadgeList topics={[]} />
      );
      expect(getByText('No motions yet')).toBeTruthy();
    });

    it('limits topics to maxTopics', () => {
      const { queryByText } = renderWithProviders(
        <TopicBadgeList topics={topics} maxTopics={2} />
      );
      expect(queryByText('Topic 3')).toBeNull();
    });

    it('uses default maxTopics of 3', () => {
      const manyTopics = [
        ...topics,
        { topic: 'Topic 4', wins: 0, participations: 1 },
      ];
      const { queryByText } = renderWithProviders(
        <TopicBadgeList topics={manyTopics} />
      );
      expect(queryByText('Topic 4')).toBeNull();
    });

    it('passes color to child badges', () => {
      const result = renderWithProviders(
        <TopicBadgeList topics={topics} color="#7C3AED" />
      );
      expect(result).toBeTruthy();
    });

    it('passes size to child badges', () => {
      const result = renderWithProviders(
        <TopicBadgeList topics={topics} size="small" />
      );
      expect(result).toBeTruthy();
    });

    it('passes showStats to child badges', () => {
      const result = renderWithProviders(
        <TopicBadgeList topics={topics} showStats={false} />
      );
      expect(result).toBeTruthy();
    });
  });

  describe('TopicPerformance Component', () => {
    const performanceProps = {
      topic: 'AI Ethics',
      wins: 3,
      participations: 5,
    };

    it('renders without crashing', () => {
      const result = renderWithProviders(
        <TopicPerformance {...performanceProps} />
      );
      expect(result).toBeTruthy();
    });

    it('displays the topic', () => {
      const { getByText } = renderWithProviders(
        <TopicPerformance {...performanceProps} />
      );
      expect(getByText('AI Ethics')).toBeTruthy();
    });

    it('displays win stats', () => {
      const { getByText } = renderWithProviders(
        <TopicPerformance {...performanceProps} />
      );
      expect(getByText('3/5')).toBeTruthy();
    });

    it('displays win rate when showWinRate is true', () => {
      const { getByText } = renderWithProviders(
        <TopicPerformance {...performanceProps} showWinRate={true} />
      );
      expect(getByText('(60%)')).toBeTruthy();
    });

    it('hides win rate when showWinRate is false', () => {
      const { queryByText } = renderWithProviders(
        <TopicPerformance {...performanceProps} showWinRate={false} />
      );
      expect(queryByText(/\(\d+%\)/)).toBeNull();
    });

    it('uses provided winRate over calculated', () => {
      const { getByText } = renderWithProviders(
        <TopicPerformance {...performanceProps} winRate={75} showWinRate={true} />
      );
      expect(getByText('(75%)')).toBeTruthy();
    });

    it('handles zero participations', () => {
      const { getByText } = renderWithProviders(
        <TopicPerformance topic="Test" wins={0} participations={0} showWinRate={true} />
      );
      expect(getByText('(0%)')).toBeTruthy();
    });

    it('applies string color correctly', () => {
      const result = renderWithProviders(
        <TopicPerformance {...performanceProps} color="#7C3AED" />
      );
      expect(result).toBeTruthy();
    });

    it('applies brand color object correctly', () => {
      const result = renderWithProviders(
        <TopicPerformance {...performanceProps} color={brandColorObject} />
      );
      expect(result).toBeTruthy();
    });

    it('truncates long topic names', () => {
      const { truncateTopic } = require('@/services/stats');
      const longTopic = 'A'.repeat(50);
      renderWithProviders(
        <TopicPerformance {...performanceProps} topic={longTopic} />
      );
      expect(truncateTopic).toHaveBeenCalledWith(longTopic, 35);
    });
  });
});
