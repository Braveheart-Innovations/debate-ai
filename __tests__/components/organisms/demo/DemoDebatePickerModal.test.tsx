import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { DemoDebatePickerModal } from '@/components/organisms/demo/DemoDebatePickerModal';

// Mock expo modules
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
  MaterialIcons: () => null,
  MaterialCommunityIcons: () => null,
  Ionicons: () => null,
};
});

// Mock molecules
jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, TouchableOpacity, View } = require('react-native');
  return {
    Typography: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
      React.createElement(Text, { testID }, children),
    Button: ({ title, onPress, testID }: { title: string; onPress: () => void; testID?: string }) =>
      React.createElement(TouchableOpacity, { onPress, testID: testID || 'button' }, React.createElement(Text, null, title)),
    SheetHeader: ({ title, onClose, testID }: any) =>
      React.createElement(
        View,
        { testID: testID || 'sheet-header' },
        React.createElement(Text, null, title),
        React.createElement(TouchableOpacity, { onPress: onClose, testID: 'sheet-header-close' }, React.createElement(Text, null, 'Close'))
      ),
  };
});

describe('DemoDebatePickerModal', () => {
  const mockOnSelect = jest.fn();
  const mockOnClose = jest.fn();

  const sampleDebates = [
    { id: '1', title: 'Climate Change Solutions', topic: 'Should we prioritize nuclear energy?' },
    { id: '2', title: 'AI Ethics', topic: 'Is AI consciousness possible?' },
    { id: '3', title: 'Economic Policy', topic: 'Universal Basic Income pros and cons' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders without crashing when visible', () => {
      const result = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={sampleDebates} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(result).toBeTruthy();
    });

    it('does not render when not visible', () => {
      const { queryByText } = renderWithProviders(
        <DemoDebatePickerModal visible={false} samples={sampleDebates} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(queryByText('Choose a Demo Debate')).toBeNull();
    });

    it('renders the sheet header with correct title', () => {
      const { getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={sampleDebates} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(getByText('Choose a Demo Debate')).toBeTruthy();
    });

    it('renders all sample debates', () => {
      const { getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={sampleDebates} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(getByText('Climate Change Solutions')).toBeTruthy();
      expect(getByText('AI Ethics')).toBeTruthy();
      expect(getByText('Economic Policy')).toBeTruthy();
    });

    it('renders debate topics with Motion prefix', () => {
      const { getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={sampleDebates} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(getByText('Motion: Should we prioritize nuclear energy?')).toBeTruthy();
      expect(getByText('Motion: Is AI consciousness possible?')).toBeTruthy();
      expect(getByText('Motion: Universal Basic Income pros and cons')).toBeTruthy();
    });

    it('renders Cancel button when samples are available', () => {
      const { getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={sampleDebates} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(getByText('Cancel')).toBeTruthy();
    });
  });

  describe('Loading State', () => {
    it('displays loading indicator when loading is true', () => {
      const { getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} loading={true} samples={[]} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(getByText('Loading demo debates…')).toBeTruthy();
    });

    it('does not display samples when loading', () => {
      const { queryByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} loading={true} samples={sampleDebates} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(queryByText('Climate Change Solutions')).toBeNull();
    });

    it('does not display empty state when loading', () => {
      const { queryByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} loading={true} samples={[]} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(queryByText('No demo debates available')).toBeNull();
    });

    it('does not display Cancel button when loading', () => {
      const { queryByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} loading={true} samples={[]} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(queryByText('Cancel')).toBeNull();
    });
  });

  describe('Empty State', () => {
    it('displays empty state when no samples and not loading', () => {
      const { getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={[]} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(getByText(/No demo debates available/i)).toBeTruthy();
    });

    it('displays empty state subtitle', () => {
      const { getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={[]} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(getByText(/Try another combination of AIs/i)).toBeTruthy();
    });

    it('does not display Cancel button when empty', () => {
      const { queryByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={[]} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(queryByText('Cancel')).toBeNull();
    });
  });

  describe('User Interactions', () => {
    it('calls onSelect when a sample is pressed', () => {
      const { getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={sampleDebates} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      fireEvent.press(getByText('Climate Change Solutions'));
      expect(mockOnSelect).toHaveBeenCalledTimes(1);
      expect(mockOnSelect).toHaveBeenCalledWith(sampleDebates[0]);
    });

    it('calls onSelect with correct sample data', () => {
      const { getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={sampleDebates} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      fireEvent.press(getByText('AI Ethics'));
      expect(mockOnSelect).toHaveBeenCalledWith(sampleDebates[1]);
    });

    it('calls onClose when Cancel button is pressed', () => {
      const { getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={sampleDebates} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      fireEvent.press(getByText('Cancel'));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when sheet header close is pressed', () => {
      const { getByTestId } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={sampleDebates} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      fireEvent.press(getByTestId('sheet-header-close'));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose when sample is pressed', () => {
      const { getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={sampleDebates} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      fireEvent.press(getByText('Climate Change Solutions'));
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('does not call onSelect when Cancel is pressed', () => {
      const { getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={sampleDebates} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      fireEvent.press(getByText('Cancel'));
      expect(mockOnSelect).not.toHaveBeenCalled();
    });
  });

  describe('Multiple Samples', () => {
    it('renders single sample correctly', () => {
      const singleSample = [sampleDebates[0]];
      const { getByText, queryByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={singleSample} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(getByText('Climate Change Solutions')).toBeTruthy();
      expect(queryByText('AI Ethics')).toBeNull();
    });

    it('handles many samples', () => {
      const manySamples = Array.from({ length: 20 }, (_, i) => ({
        id: `${i + 1}`,
        title: `Debate ${i + 1}`,
        topic: `Topic ${i + 1}`,
      }));
      const { getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={manySamples} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(getByText('Debate 1')).toBeTruthy();
      expect(getByText('Debate 20')).toBeTruthy();
    });

    it('allows pressing multiple different samples', () => {
      const { getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={sampleDebates} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      fireEvent.press(getByText('Climate Change Solutions'));
      fireEvent.press(getByText('AI Ethics'));
      fireEvent.press(getByText('Economic Policy'));
      expect(mockOnSelect).toHaveBeenCalledTimes(3);
    });
  });

  describe('Sample Data Variations', () => {
    it('renders sample with only topic when title is missing', () => {
      const samplesWithoutTitle = [
        { id: '1', title: '', topic: 'Should we prioritize nuclear energy?' },
      ];
      const { getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={samplesWithoutTitle} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(getByText('Should we prioritize nuclear energy?')).toBeTruthy();
    });

    it('handles sample with very long title', () => {
      const longTitleSample = [
        {
          id: '1',
          title: 'This is a very long debate title that might wrap across multiple lines in the UI component',
          topic: 'Short topic',
        },
      ];
      const { getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={longTitleSample} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(getByText(/This is a very long debate title/)).toBeTruthy();
    });

    it('handles sample with very long topic', () => {
      const longTopicSample = [
        {
          id: '1',
          title: 'Short title',
          topic: 'This is a very long topic that discusses multiple complex philosophical and ethical considerations regarding AI development',
        },
      ];
      const { getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={longTopicSample} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(getByText(/Motion: This is a very long topic/)).toBeTruthy();
    });

    it('handles sample with special characters in title', () => {
      const specialCharSample = [
        { id: '1', title: 'AI & Ethics: "The Future" (Part 1)', topic: 'Test topic' },
      ];
      const { getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={specialCharSample} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(getByText('AI & Ethics: "The Future" (Part 1)')).toBeTruthy();
    });
  });

  describe('Props Handling', () => {
    it('works with different onSelect callback', () => {
      const alternateOnSelect = jest.fn();
      const { getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={sampleDebates} onSelect={alternateOnSelect} onClose={mockOnClose} />
      );
      fireEvent.press(getByText('Climate Change Solutions'));
      expect(alternateOnSelect).toHaveBeenCalledTimes(1);
    });

    it('works with different onClose callback', () => {
      const alternateOnClose = jest.fn();
      const { getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={sampleDebates} onSelect={mockOnSelect} onClose={alternateOnClose} />
      );
      fireEvent.press(getByText('Cancel'));
      expect(alternateOnClose).toHaveBeenCalledTimes(1);
    });

    it('handles loading prop defaulting to false', () => {
      const { queryByText, getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={sampleDebates} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(queryByText('Loading demo debates…')).toBeNull();
      expect(getByText('Climate Change Solutions')).toBeTruthy();
    });
  });

  describe('State Transitions', () => {
    it('transitions from loading to loaded state', () => {
      const { rerender, queryByText, getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} loading={true} samples={[]} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(getByText('Loading demo debates…')).toBeTruthy();

      rerender(
        <DemoDebatePickerModal visible={true} loading={false} samples={sampleDebates} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(queryByText('Loading demo debates…')).toBeNull();
      expect(getByText('Climate Change Solutions')).toBeTruthy();
    });

    it('transitions from loaded to empty state', () => {
      const { rerender, queryByText, getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={sampleDebates} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(getByText('Climate Change Solutions')).toBeTruthy();

      rerender(<DemoDebatePickerModal visible={true} samples={[]} onSelect={mockOnSelect} onClose={mockOnClose} />);
      expect(queryByText('Climate Change Solutions')).toBeNull();
      expect(getByText(/No demo debates available/i)).toBeTruthy();
    });

    it('transitions from invisible to visible', () => {
      const { rerender, queryByText, getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={false} samples={sampleDebates} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(queryByText('Choose a Demo Debate')).toBeNull();

      rerender(<DemoDebatePickerModal visible={true} samples={sampleDebates} onSelect={mockOnSelect} onClose={mockOnClose} />);
      expect(getByText('Choose a Demo Debate')).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('handles rapid successive sample presses', () => {
      const { getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={sampleDebates} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      const sample = getByText('Climate Change Solutions');
      for (let i = 0; i < 5; i++) {
        fireEvent.press(sample);
      }
      expect(mockOnSelect).toHaveBeenCalledTimes(5);
    });

    it('renders with noop callbacks', () => {
      const noopOnSelect = () => {};
      const noopOnClose = () => {};
      const result = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={sampleDebates} onSelect={noopOnSelect} onClose={noopOnClose} />
      );
      expect(result).toBeTruthy();
    });

    it('maintains functionality after re-render', () => {
      const { getByText, rerender } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={sampleDebates} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      rerender(<DemoDebatePickerModal visible={true} samples={sampleDebates} onSelect={mockOnSelect} onClose={mockOnClose} />);

      fireEvent.press(getByText('Climate Change Solutions'));
      expect(mockOnSelect).toHaveBeenCalledTimes(1);
    });

    it('handles samples with duplicate IDs gracefully', () => {
      const duplicateIdSamples = [
        { id: '1', title: 'First Debate', topic: 'Topic A' },
        { id: '1', title: 'Second Debate', topic: 'Topic B' },
      ];
      const { getByText } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={duplicateIdSamples} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(getByText('First Debate')).toBeTruthy();
    });
  });

  describe('Snapshot Tests', () => {
    it('matches snapshot with samples', () => {
      const { toJSON } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={sampleDebates} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(toJSON()).toMatchSnapshot();
    });

    it('matches snapshot when loading', () => {
      const { toJSON } = renderWithProviders(
        <DemoDebatePickerModal visible={true} loading={true} samples={[]} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(toJSON()).toMatchSnapshot();
    });

    it('matches snapshot when empty', () => {
      const { toJSON } = renderWithProviders(
        <DemoDebatePickerModal visible={true} samples={[]} onSelect={mockOnSelect} onClose={mockOnClose} />
      );
      expect(toJSON()).toMatchSnapshot();
    });
  });
});
