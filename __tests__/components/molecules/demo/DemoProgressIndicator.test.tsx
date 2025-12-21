import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

// Mock expo-linear-gradient
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

const { DemoProgressIndicator } = require('@/components/molecules/demo/DemoProgressIndicator');

describe('DemoProgressIndicator', () => {
  const mockOnReplay = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('visibility', () => {
    it('returns null when totalTurns is 0', () => {
      const { queryByText } = renderWithProviders(
        <DemoProgressIndicator currentTurn={0} totalTurns={0} />
      );
      expect(queryByText(/Turn/)).toBeNull();
    });

    it('renders when totalTurns is greater than 0', () => {
      const { getByText } = renderWithProviders(
        <DemoProgressIndicator currentTurn={1} totalTurns={3} />
      );
      expect(getByText('Turn 1 of 3')).toBeTruthy();
    });
  });

  describe('progress display', () => {
    it('displays current turn correctly', () => {
      const { getByText } = renderWithProviders(
        <DemoProgressIndicator currentTurn={2} totalTurns={5} />
      );
      expect(getByText('Turn 2 of 5')).toBeTruthy();
    });

    it('displays first turn', () => {
      const { getByText } = renderWithProviders(
        <DemoProgressIndicator currentTurn={1} totalTurns={4} />
      );
      expect(getByText('Turn 1 of 4')).toBeTruthy();
    });

    it('displays last turn', () => {
      const { getByText } = renderWithProviders(
        <DemoProgressIndicator currentTurn={4} totalTurns={4} />
      );
      expect(getByText('Turn 4 of 4')).toBeTruthy();
    });
  });

  describe('complete state', () => {
    it('shows completion message when isComplete is true', () => {
      const { getByText, queryByText } = renderWithProviders(
        <DemoProgressIndicator
          currentTurn={3}
          totalTurns={3}
          isComplete={true}
        />
      );
      expect(getByText('Demo Complete')).toBeTruthy();
      expect(queryByText('Turn 3 of 3')).toBeNull();
    });

    it('shows turn counter when isComplete is false', () => {
      const { getByText, queryByText } = renderWithProviders(
        <DemoProgressIndicator
          currentTurn={3}
          totalTurns={3}
          isComplete={false}
        />
      );
      expect(getByText('Turn 3 of 3')).toBeTruthy();
      expect(queryByText('Demo Complete')).toBeNull();
    });

    it('uses false as default for isComplete', () => {
      const { getByText, queryByText } = renderWithProviders(
        <DemoProgressIndicator currentTurn={3} totalTurns={3} />
      );
      expect(getByText('Turn 3 of 3')).toBeTruthy();
      expect(queryByText('Demo Complete')).toBeNull();
    });
  });

  describe('replay functionality', () => {
    it('shows Replay button when isComplete and onReplay is provided', () => {
      const { getByText } = renderWithProviders(
        <DemoProgressIndicator
          currentTurn={3}
          totalTurns={3}
          isComplete={true}
          onReplay={mockOnReplay}
        />
      );
      expect(getByText('Replay')).toBeTruthy();
    });

    it('does not show Replay button when isComplete but onReplay not provided', () => {
      const { queryByText } = renderWithProviders(
        <DemoProgressIndicator
          currentTurn={3}
          totalTurns={3}
          isComplete={true}
        />
      );
      expect(queryByText('Replay')).toBeNull();
    });

    it('does not show Replay button when not complete', () => {
      const { queryByText } = renderWithProviders(
        <DemoProgressIndicator
          currentTurn={2}
          totalTurns={3}
          isComplete={false}
          onReplay={mockOnReplay}
        />
      );
      expect(queryByText('Replay')).toBeNull();
    });

    it('calls onReplay when Replay button is pressed', () => {
      const { getByText } = renderWithProviders(
        <DemoProgressIndicator
          currentTurn={3}
          totalTurns={3}
          isComplete={true}
          onReplay={mockOnReplay}
        />
      );
      fireEvent.press(getByText('Replay'));
      expect(mockOnReplay).toHaveBeenCalledTimes(1);
    });

    it('has correct accessibility label on Replay button', () => {
      const { getByLabelText } = renderWithProviders(
        <DemoProgressIndicator
          currentTurn={3}
          totalTurns={3}
          isComplete={true}
          onReplay={mockOnReplay}
        />
      );
      expect(getByLabelText('Replay demo')).toBeTruthy();
    });
  });

  describe('progress calculation', () => {
    it('renders at 0% progress for turn 0', () => {
      const { getByText } = renderWithProviders(
        <DemoProgressIndicator currentTurn={0} totalTurns={5} />
      );
      expect(getByText('Turn 0 of 5')).toBeTruthy();
    });

    it('renders at 50% progress for middle turn', () => {
      const { getByText } = renderWithProviders(
        <DemoProgressIndicator currentTurn={2} totalTurns={4} />
      );
      expect(getByText('Turn 2 of 4')).toBeTruthy();
    });

    it('renders at 100% progress for last turn', () => {
      const { getByText } = renderWithProviders(
        <DemoProgressIndicator currentTurn={5} totalTurns={5} />
      );
      expect(getByText('Turn 5 of 5')).toBeTruthy();
    });
  });
});
