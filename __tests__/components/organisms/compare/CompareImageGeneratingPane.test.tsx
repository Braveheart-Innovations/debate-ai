import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { CompareImageGeneratingPane } from '@/components/organisms/compare/CompareImageGeneratingPane';
import { AIConfig } from '@/types';

jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

const mockAI: AIConfig = {
  id: 'test-ai',
  name: 'Test AI',
  provider: 'openai',
  model: 'gpt-4',
  color: '#00ff00',
};

describe('CompareImageGeneratingPane', () => {
  const mockOnCancel = jest.fn();
  const mockOnRetry = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders with AI name', () => {
    const { getByText } = renderWithProviders(
      <CompareImageGeneratingPane
        ai={mockAI}
        side="left"
        startTime={Date.now()}
        phase="sending"
        aspectRatio="square"
        onCancel={mockOnCancel}
      />
    );

    expect(getByText('Test AI')).toBeTruthy();
  });

  it('renders sending phase text', () => {
    const startTime = Date.now();
    const { getByText } = renderWithProviders(
      <CompareImageGeneratingPane
        ai={mockAI}
        side="left"
        startTime={startTime}
        phase="sending"
        aspectRatio="square"
        onCancel={mockOnCancel}
      />
    );

    // Should show "Sending" initially
    expect(getByText(/Sending/)).toBeTruthy();
  });

  it('renders cancel button when not in error state', () => {
    const { getByText } = renderWithProviders(
      <CompareImageGeneratingPane
        ai={mockAI}
        side="left"
        startTime={Date.now()}
        phase="rendering"
        aspectRatio="square"
        onCancel={mockOnCancel}
      />
    );

    expect(getByText('Cancel')).toBeTruthy();
  });

  it('renders retry button on error state', () => {
    const { getByText } = renderWithProviders(
      <CompareImageGeneratingPane
        ai={mockAI}
        side="left"
        startTime={Date.now()}
        phase="error"
        aspectRatio="square"
        onCancel={mockOnCancel}
        onRetry={mockOnRetry}
      />
    );

    expect(getByText('Retry')).toBeTruthy();
  });

  it('shows error message when phase is error', () => {
    const { getByText } = renderWithProviders(
      <CompareImageGeneratingPane
        ai={mockAI}
        side="left"
        startTime={Date.now()}
        phase="error"
        aspectRatio="square"
        onCancel={mockOnCancel}
      />
    );

    expect(getByText('Generation failed')).toBeTruthy();
  });

  it('shows cancelled message when phase is cancelled', () => {
    const { getByText } = renderWithProviders(
      <CompareImageGeneratingPane
        ai={mockAI}
        side="left"
        startTime={Date.now()}
        phase="cancelled"
        aspectRatio="square"
        onCancel={mockOnCancel}
      />
    );

    expect(getByText('Generation cancelled')).toBeTruthy();
  });

  it('applies different aspect ratios', () => {
    const aspects: Array<'square' | 'portrait' | 'landscape' | 'auto'> = ['square', 'portrait', 'landscape', 'auto'];

    aspects.forEach((aspectRatio) => {
      const { toJSON } = renderWithProviders(
        <CompareImageGeneratingPane
          ai={mockAI}
          side="left"
          startTime={Date.now()}
          phase="rendering"
          aspectRatio={aspectRatio}
          onCancel={mockOnCancel}
        />
      );

      expect(toJSON()).not.toBeNull();
    });
  });

  it('renders for both left and right sides', () => {
    const sides: Array<'left' | 'right'> = ['left', 'right'];

    sides.forEach((side) => {
      const { toJSON } = renderWithProviders(
        <CompareImageGeneratingPane
          ai={mockAI}
          side={side}
          startTime={Date.now()}
          phase="rendering"
          aspectRatio="square"
          onCancel={mockOnCancel}
        />
      );

      expect(toJSON()).not.toBeNull();
    });
  });
});
