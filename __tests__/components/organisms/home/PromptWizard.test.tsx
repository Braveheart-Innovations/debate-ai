import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { PromptWizard } from '@/components/organisms/home/PromptWizard';
import type { QuickStartTopic } from '@/components/organisms/home/QuickStartsSection';
import type { AIConfig } from '@/types';

jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

jest.mock('@/config/personalities', () => ({
  getPersonality: jest.fn((personalityId: string) => {
    if (personalityId === 'scholar') {
      return {
        name: 'Scholar',
        systemPrompt: 'Answer like a scholar.',
      };
    }
    return null;
  }),
}));

const topic: QuickStartTopic = {
  id: 'brainstorm',
  emoji: '💡',
  title: 'Brainstorm ideas',
  subtitle: 'Generate possibilities',
};

const mockSelectedAIs: AIConfig[] = [
  { id: 'ai-1', name: 'Claude', provider: 'claude', model: 'haiku' },
];

describe('PromptWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds enriched prompt using selections and provided personalities', () => {
    const onComplete = jest.fn();

    const { getByText, getByPlaceholderText } = renderWithProviders(
      <PromptWizard
        visible
        topic={topic}
        onClose={jest.fn()}
        onComplete={onComplete}
        selectedAIs={mockSelectedAIs}
        aiPersonalities={{ 'ai-1': 'scholar' }}
      />
    );

    fireEvent.press(getByText('Business Ideas'));
    fireEvent.changeText(getByPlaceholderText('Any specific details or questions...'), 'mobile app for planners');

    const startButton = getByText('Start Chat 💬');
    fireEvent.press(startButton);

    expect(onComplete).toHaveBeenCalled();
    const [userPrompt, enrichedPrompt] = onComplete.mock.calls[0];
    expect(userPrompt).toContain('I need help brainstorming.');
    expect(userPrompt).toContain('mobile app for planners');
    expect(enrichedPrompt).toContain('[PERSONALITY: Scholar]');
    expect(enrichedPrompt).toContain('Answer like a scholar.');
    expect(require('expo-haptics').impactAsync).toHaveBeenCalled();
  });

  it('uses selectedAIs and aiPersonalities props correctly', () => {
    const onComplete = jest.fn();

    const { getByText } = renderWithProviders(
      <PromptWizard
        visible
        topic={topic}
        onClose={jest.fn()}
        onComplete={onComplete}
        selectedAIs={mockSelectedAIs}
        aiPersonalities={{ 'ai-1': 'scholar' }}
      />
    );

    // Select a context to enable the Start button
    fireEvent.press(getByText('Business Ideas'));
    fireEvent.press(getByText('Start Chat 💬'));

    expect(onComplete).toHaveBeenCalled();
    const [, enrichedPrompt] = onComplete.mock.calls[0];
    expect(enrichedPrompt).toContain('[PERSONALITY: Scholar]');
  });

  it('does not include personality when using default', () => {
    const onComplete = jest.fn();

    const { getByText } = renderWithProviders(
      <PromptWizard
        visible
        topic={topic}
        onClose={jest.fn()}
        onComplete={onComplete}
        selectedAIs={mockSelectedAIs}
        aiPersonalities={{ 'ai-1': 'default' }}
      />
    );

    fireEvent.press(getByText('Business Ideas'));
    fireEvent.press(getByText('Start Chat 💬'));

    expect(onComplete).toHaveBeenCalled();
    const [userPrompt, enrichedPrompt] = onComplete.mock.calls[0];
    // When personality is 'default', enrichedPrompt should equal userPrompt
    expect(enrichedPrompt).not.toContain('[PERSONALITY:');
    expect(enrichedPrompt).toBe(userPrompt);
  });

  it('handles empty selectedAIs gracefully', () => {
    const onComplete = jest.fn();

    const { getByText } = renderWithProviders(
      <PromptWizard
        visible
        topic={topic}
        onClose={jest.fn()}
        onComplete={onComplete}
        selectedAIs={[]}
        aiPersonalities={{}}
      />
    );

    fireEvent.press(getByText('Business Ideas'));
    fireEvent.press(getByText('Start Chat 💬'));

    expect(onComplete).toHaveBeenCalled();
    const [userPrompt, enrichedPrompt] = onComplete.mock.calls[0];
    // With no AIs, enrichedPrompt should equal userPrompt
    expect(enrichedPrompt).toBe(userPrompt);
  });

  it('does not render tone selector (feature removed)', () => {
    const { queryByText } = renderWithProviders(
      <PromptWizard
        visible
        topic={topic}
        onClose={jest.fn()}
        onComplete={jest.fn()}
        selectedAIs={mockSelectedAIs}
        aiPersonalities={{}}
      />
    );

    // Tone-related UI should not exist
    expect(queryByText('How should the AI respond?')).toBeNull();
    expect(queryByText('Casual')).toBeNull();
    expect(queryByText('Professional')).toBeNull();
    expect(queryByText('Analytical')).toBeNull();
  });

  it('triggers haptic feedback on context selection', () => {
    const { getByText } = renderWithProviders(
      <PromptWizard
        visible
        topic={topic}
        onClose={jest.fn()}
        onComplete={jest.fn()}
        selectedAIs={mockSelectedAIs}
        aiPersonalities={{}}
      />
    );

    fireEvent.press(getByText('Business Ideas'));
    expect(require('expo-haptics').impactAsync).toHaveBeenCalledWith('light');
  });

  it('does not render when topic is null', () => {
    const { toJSON } = renderWithProviders(
      <PromptWizard
        visible
        topic={null}
        onClose={jest.fn()}
        onComplete={jest.fn()}
        selectedAIs={mockSelectedAIs}
        aiPersonalities={{}}
      />
    );

    expect(toJSON()).toBeNull();
  });
});
