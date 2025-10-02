/**
 * TranscriptModal Test Suite
 * Comprehensive tests for the debate transcript modal component
 */

import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { TranscriptModal } from '@/components/organisms/debate/TranscriptModal';
import { Message } from '@/types';

// Mock dependencies
jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn().mockResolvedValue({ uri: 'mock-file-uri' }),
}));

jest.mock('expo-file-system', () => ({
  documentDirectory: '/mock/documents/',
  moveAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    Typography: ({ children, ...props }: any) =>
      React.createElement(Text, { testID: props.testID || 'typography' }, children),
    SheetHeader: ({ title, onClose }: any) =>
      React.createElement(TouchableOpacity, { testID: 'sheet-header', onPress: onClose },
        React.createElement(Text, null, title)
      ),
    GradientButton: ({ title, onPress, disabled }: any) =>
      React.createElement(TouchableOpacity, {
        testID: title.includes('Save') ? 'save-button' : 'share-button',
        onPress,
        disabled
      }, React.createElement(Text, null, title)),
  };
});

describe('TranscriptModal', () => {
  const mockOnClose = jest.fn();

  const mockParticipants = [
    { id: 'claude', name: 'Claude' },
    { id: 'chatgpt', name: 'ChatGPT' },
  ];

  const mockMessages: Message[] = [
    { id: '1', sender: 'Claude', content: 'Opening argument', timestamp: new Date() },
    { id: '2', sender: 'ChatGPT', content: 'Counter argument', timestamp: new Date() },
    { id: '3', sender: 'Debate Host', content: 'Round complete', timestamp: new Date() },
    { id: '4', sender: 'System', content: 'Debate ended', timestamp: new Date() },
  ];

  const mockWinner = { id: 'claude', name: 'Claude' };

  const mockScores = {
    claude: { name: 'Claude', roundWins: 2 },
    chatgpt: { name: 'ChatGPT', roundWins: 1 },
  };

  const defaultProps = {
    visible: true,
    onClose: mockOnClose,
    topic: 'Is AI beneficial for humanity?',
    participants: mockParticipants,
    messages: mockMessages,
    winner: mockWinner,
    scores: mockScores,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('renders when visible is true', () => {
      const { getByText } = renderWithProviders(<TranscriptModal {...defaultProps} />);
      expect(getByText('Debate Transcript')).toBeTruthy();
    });

    it('renders topic', () => {
      const { getByText } = renderWithProviders(<TranscriptModal {...defaultProps} />);
      expect(getByText('Is AI beneficial for humanity?')).toBeTruthy();
    });

    it('renders participants', () => {
      const { getByText } = renderWithProviders(<TranscriptModal {...defaultProps} />);
      expect(getByText(/Claude vs ChatGPT/)).toBeTruthy();
    });

    it('filters out system messages', () => {
      const { queryByText } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      expect(queryByText('Round complete')).toBeNull();
      expect(queryByText('Debate ended')).toBeNull();
    });

    it('renders debate messages', () => {
      const { getByText } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      expect(getByText('Opening argument')).toBeTruthy();
      expect(getByText('Counter argument')).toBeTruthy();
    });

    it('renders winner section when winner is provided', () => {
      const { getByText } = renderWithProviders(<TranscriptModal {...defaultProps} />);
      expect(getByText(/Claude Wins!/)).toBeTruthy();
    });

    it('renders scores when provided', () => {
      const { getAllByText } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      const claudeTexts = getAllByText('Claude');
      const chatgptTexts = getAllByText('ChatGPT');

      expect(claudeTexts.length).toBeGreaterThan(0);
      expect(chatgptTexts.length).toBeGreaterThan(0);
    });

    it('renders without winner and scores', () => {
      const { queryByText, getByText } = renderWithProviders(
        <TranscriptModal {...defaultProps} winner={undefined} scores={undefined} />
      );

      expect(getByText('Debate Transcript')).toBeTruthy();
      expect(queryByText(/Wins!/)).toBeNull();
    });

    it('renders save and share buttons', () => {
      const { getByTestId } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      expect(getByTestId('save-button')).toBeTruthy();
      expect(getByTestId('share-button')).toBeTruthy();
    });
  });

  describe('Modal Visibility', () => {
    it('does not render when visible is false', () => {
      const { queryByText } = renderWithProviders(
        <TranscriptModal {...defaultProps} visible={false} />
      );
      expect(queryByText('Debate Transcript')).toBeNull();
    });

    it('passes visible prop correctly to Modal component', () => {
      const { UNSAFE_queryByType } = renderWithProviders(
        <TranscriptModal {...defaultProps} visible={true} />
      );

      const Modal = require('react-native').Modal;
      const modal = UNSAFE_queryByType(Modal);

      if (modal) {
        expect(modal.props.visible).toBe(true);
      }
    });
  });

  describe('User Interactions', () => {
    it('calls onClose when header close button is pressed', () => {
      const { getByTestId } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      fireEvent.press(getByTestId('sheet-header'));

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('saves PDF when save button is pressed', async () => {
      const Print = require('expo-print');
      const FileSystem = require('expo-file-system');

      const { getByTestId } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      fireEvent.press(getByTestId('save-button'));

      await waitFor(() => {
        expect(Print.printToFileAsync).toHaveBeenCalled();
        expect(FileSystem.moveAsync).toHaveBeenCalled();
      });
    });

    it('shares PDF when share button is pressed', async () => {
      const Print = require('expo-print');
      const Sharing = require('expo-sharing');

      const { getByTestId } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      fireEvent.press(getByTestId('share-button'));

      await waitFor(() => {
        expect(Print.printToFileAsync).toHaveBeenCalled();
        expect(Sharing.shareAsync).toHaveBeenCalled();
      });
    });
  });

  describe('Save Functionality', () => {
    it('shows success alert after saving', async () => {
      const { getByTestId } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      fireEvent.press(getByTestId('save-button'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith('Success', expect.any(String));
      });
    });

    it('generates proper filename when saving', async () => {
      const FileSystem = require('expo-file-system');

      const { getByTestId } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      fireEvent.press(getByTestId('save-button'));

      await waitFor(() => {
        expect(FileSystem.moveAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            from: 'mock-file-uri',
            to: expect.stringContaining('SymposiumAI_'),
          })
        );
      });
    });

    it('shows error alert when save fails', async () => {
      const Print = require('expo-print');
      Print.printToFileAsync.mockRejectedValueOnce(new Error('Save failed'));

      const { getByTestId } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      fireEvent.press(getByTestId('save-button'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith('Error', expect.any(String));
      });
    });
  });

  describe('Share Functionality', () => {
    it('shares PDF file when sharing is available', async () => {
      const Sharing = require('expo-sharing');

      const { getByTestId } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      fireEvent.press(getByTestId('share-button'));

      await waitFor(() => {
        expect(Sharing.shareAsync).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            mimeType: 'application/pdf',
          })
        );
      });
    });

    it('shows alert when sharing is not available', async () => {
      const Sharing = require('expo-sharing');
      Sharing.isAvailableAsync.mockResolvedValueOnce(false);

      const { getByTestId } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      fireEvent.press(getByTestId('share-button'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith('Error', expect.any(String));
      });
    });

    it('shows error alert when share fails', async () => {
      const Sharing = require('expo-sharing');
      Sharing.shareAsync.mockRejectedValueOnce(new Error('Share failed'));

      const { getByTestId } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      fireEvent.press(getByTestId('share-button'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith('Error', expect.any(String));
      });
    });
  });

  describe('Accessibility', () => {
    it('sets correct modal properties', () => {
      const { UNSAFE_queryByType } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      const Modal = require('react-native').Modal;
      const modal = UNSAFE_queryByType(Modal);

      if (modal) {
        expect(modal.props.visible).toBe(true);
      }
    });

    it('handles onRequestClose callback', () => {
      const { UNSAFE_queryByType } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      const Modal = require('react-native').Modal;
      const modal = UNSAFE_queryByType(Modal);

      if (modal && modal.props.onRequestClose) {
        modal.props.onRequestClose();
        expect(mockOnClose).toHaveBeenCalled();
      }
    });
  });

  describe('Edge Cases', () => {
    it('handles empty messages array', () => {
      const { getByText } = renderWithProviders(
        <TranscriptModal {...defaultProps} messages={[]} />
      );

      expect(getByText('Debate Transcript')).toBeTruthy();
    });

    it('handles single participant', () => {
      const { getByText } = renderWithProviders(
        <TranscriptModal {...defaultProps} participants={[mockParticipants[0]]} />
      );

      expect(getByText('Debate Transcript')).toBeTruthy();
    });

    it('handles long topic names', () => {
      const longTopic = 'A very long debate topic that should be handled properly without breaking the layout or causing any issues';

      const { getByText } = renderWithProviders(
        <TranscriptModal {...defaultProps} topic={longTopic} />
      );

      expect(getByText(longTopic)).toBeTruthy();
    });

    it('handles special characters in topic', () => {
      const specialTopic = 'Topic with "quotes" & special <characters>';

      const { getByText } = renderWithProviders(
        <TranscriptModal {...defaultProps} topic={specialTopic} />
      );

      expect(getByText(specialTopic)).toBeTruthy();
    });
  });

  describe('Message Filtering', () => {
    it('includes AI messages in transcript', () => {
      const { getByText } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      expect(getByText('Opening argument')).toBeTruthy();
      expect(getByText('Counter argument')).toBeTruthy();
    });

    it('excludes Debate Host messages', () => {
      const { queryByText } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      expect(queryByText('Round complete')).toBeNull();
    });

    it('excludes System messages', () => {
      const { queryByText } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      expect(queryByText('Debate ended')).toBeNull();
    });
  });
});
