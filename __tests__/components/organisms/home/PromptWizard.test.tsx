import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { PromptWizard } from '@/components/organisms/home/PromptWizard';
import type { QuickStartTopic } from '@/components/organisms/home/QuickStartsSection';
import type { RootState } from '@/store';

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
  getPersonality: jest.fn(() => ({
    name: 'Scholar',
    systemPrompt: 'Answer like a scholar.',
  })),
}));

const topic: QuickStartTopic = {
  id: 'brainstorm',
  emoji: '💡',
  title: 'Brainstorm ideas',
  subtitle: 'Generate possibilities',
};

describe('PromptWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds enriched prompt using selections and current personalities', () => {
    const onComplete = jest.fn();

    const preloadedState: Partial<RootState> = {
      chat: {
        currentSession: {
          id: 'session-1',
          selectedAIs: [
            { id: 'ai-1', name: 'Claude', provider: 'claude', model: 'haiku' },
          ],
          messages: [],
          isActive: true,
          createdAt: Date.now(),
        },
        sessions: [],
        typingAIs: [],
        isLoading: false,
        aiPersonalities: { 'ai-1': 'scholar' },
        selectedModels: {},
      },
    } as any;

    const { getByText, getByPlaceholderText } = renderWithProviders(
      <PromptWizard visible topic={topic} onClose={jest.fn()} onComplete={onComplete} />,
      { preloadedState: preloadedState as RootState }
    );

    fireEvent.press(getByText('Business Ideas'));
    fireEvent.press(getByText('🎨 Creative'));
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
});
