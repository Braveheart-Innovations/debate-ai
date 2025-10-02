import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { SelectionSummary } from '@/components/organisms/home/SelectionSummary';
import type { AIConfig } from '@/types';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

describe('SelectionSummary', () => {
  const selectedAIs: AIConfig[] = [
    { id: 'ai-1', name: 'Claude', provider: 'claude', model: 'haiku', color: '#f60', avatar: 'C' },
    { id: 'ai-2', name: 'GPT-4', provider: 'openai', model: 'gpt-4', color: '#06f', avatar: 'G' },
  ];

  it('returns null when no AIs selected', () => {
    const { toJSON } = renderWithProviders(
      <SelectionSummary selectedAIs={[]} maxAIs={3} onRemoveAI={jest.fn()} />
    );

    expect(toJSON()).toBeNull();
  });

  it('renders chips and handles removal', () => {
    const onRemove = jest.fn();

    const { getByLabelText } = renderWithProviders(
      <SelectionSummary selectedAIs={selectedAIs} maxAIs={3} onRemoveAI={onRemove} />
    );

    fireEvent.press(getByLabelText('Remove Claude'));
    expect(onRemove).toHaveBeenCalledWith(selectedAIs[0]);
  });
});
