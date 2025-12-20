import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { HelpTopicCard } from '@/components/molecules/help/HelpTopicCard';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import type { HelpTopic } from '@/config/help/types';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

describe('HelpTopicCard', () => {
  const baseTopic: HelpTopic = {
    id: 'getting-started',
    title: 'Getting Started',
    shortDescription: 'Learn the basics of using the app',
    content: 'This is the full content explaining how to get started.',
    icon: 'rocket-outline',
    category: 'basics',
  };

  const topicWithUrl: HelpTopic = {
    ...baseTopic,
    webUrl: 'https://example.com/help',
  };

  const defaultProps = {
    topic: baseTopic,
    isExpanded: false,
    onPress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders collapsed state correctly', () => {
    const { getByText, queryByText } = renderWithProviders(<HelpTopicCard {...defaultProps} />);

    expect(getByText('Getting Started')).toBeTruthy();
    expect(getByText('Learn the basics of using the app')).toBeTruthy();
    // Content should not be visible when collapsed
    expect(queryByText('This is the full content explaining how to get started.')).toBeNull();
  });

  it('renders expanded state with content visible', () => {
    const { getByText } = renderWithProviders(<HelpTopicCard {...defaultProps} isExpanded={true} />);

    expect(getByText('Getting Started')).toBeTruthy();
    expect(getByText('This is the full content explaining how to get started.')).toBeTruthy();
  });

  it('calls onPress when header is pressed', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(<HelpTopicCard {...defaultProps} onPress={onPress} />);

    fireEvent.press(getByText('Getting Started'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows Learn More button when expanded with webUrl and onLearnMore', () => {
    const onLearnMore = jest.fn();
    const { getByText } = renderWithProviders(
      <HelpTopicCard
        topic={topicWithUrl}
        isExpanded={true}
        onPress={jest.fn()}
        onLearnMore={onLearnMore}
      />
    );

    const learnMoreButton = getByText('Learn More');
    expect(learnMoreButton).toBeTruthy();

    fireEvent.press(learnMoreButton);
    expect(onLearnMore).toHaveBeenCalledTimes(1);
  });

  it('does not show Learn More button when topic has no webUrl', () => {
    const { queryByText } = renderWithProviders(
      <HelpTopicCard
        topic={baseTopic}
        isExpanded={true}
        onPress={jest.fn()}
        onLearnMore={jest.fn()}
      />
    );

    expect(queryByText('Learn More')).toBeNull();
  });

  it('does not show Learn More button when onLearnMore is not provided', () => {
    const { queryByText } = renderWithProviders(
      <HelpTopicCard
        topic={topicWithUrl}
        isExpanded={true}
        onPress={jest.fn()}
      />
    );

    expect(queryByText('Learn More')).toBeNull();
  });

  it('renders with custom testID', () => {
    const { getByTestId } = renderWithProviders(<HelpTopicCard {...defaultProps} testID="help-card" />);

    expect(getByTestId('help-card')).toBeTruthy();
  });
});
