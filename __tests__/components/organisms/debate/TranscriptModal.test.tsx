/**
 * TranscriptModal Test Suite
 * Comprehensive tests for the debate transcript modal component
 */

import type { ReactNode } from 'react';
import { Modal } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { TranscriptModal } from '@/components/organisms/debate/TranscriptModal';
import type { GradientButton, SheetHeader, Typography } from '@/components/molecules';
import type { Message } from '@/types';
import { createMockMessage } from '@test-utils/fixtures';
import { requireDefined } from '@test-utils/queries';

// Mock ErrorService
const mockShowSuccess = jest.fn();
const mockShowWarning = jest.fn();
const mockHandleWithToast = jest.fn();
jest.mock('@/services/errors/ErrorService', () => ({
  ErrorService: {
    showSuccess: (...args: unknown[]) => mockShowSuccess(...args),
    showWarning: (...args: unknown[]) => mockShowWarning(...args),
    handleWithToast: (...args: unknown[]) => mockHandleWithToast(...args),
    showInfo: jest.fn(),
  },
}));

// Mock dependencies
jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn().mockResolvedValue({ uri: 'mock-file-uri' }),
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/mock/documents/',
  moveAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/components/molecules', () => {
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  return {
    Typography: stubComponent<typeof Typography>('typography', { text: (p) => p.children }),
    SheetHeader: stubComponent<typeof SheetHeader>('sheet-header', {
      onPress: (p) => p.onClose,
      text: (p) => p.title,
    }),
    GradientButton: stubComponent<typeof GradientButton>('gradient-button', {
      testID: (p) => (p.title.includes('Save') ? 'save-button' : 'share-button'),
      onPress: (p) => (p.disabled ? undefined : p.onPress),
      text: (p) => p.title,
    }),
  };
});

/** HTML passed to the first printToFileAsync call. */
const printedHtml = (): string | undefined => {
  const [options] = requireDefined(
    jest.mocked(Print.printToFileAsync).mock.calls[0],
    'printToFileAsync call'
  );
  return requireDefined(options, 'printToFileAsync options').html;
};

describe('TranscriptModal', () => {
  const mockOnClose = jest.fn();

  const mockParticipants = [
    { id: 'claude', name: 'Claude' },
    { id: 'chatgpt', name: 'ChatGPT' },
  ];

  const mockMessages: Message[] = [
    createMockMessage({ id: '1', sender: 'Claude', senderType: 'ai', content: 'Opening argument', timestamp: Date.now() }),
    createMockMessage({ id: '2', sender: 'ChatGPT', senderType: 'ai', content: 'Counter argument', timestamp: Date.now() }),
    createMockMessage({ id: '3', sender: 'Debate Host', senderType: 'ai', content: 'Round complete', timestamp: Date.now() }),
    createMockMessage({ id: '4', sender: 'System', senderType: 'ai', content: 'Debate ended', timestamp: Date.now() }),
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
    mockShowSuccess.mockClear();
    mockShowWarning.mockClear();
    mockHandleWithToast.mockClear();
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

    it('renders vote criteria from vote metadata even when host messages are hidden', () => {
      const messagesWithVote: Message[] = [
        ...mockMessages,
        {
          id: 'vote-1',
          sender: 'Debate Host',
          senderType: 'user',
          content: 'Value constructives: Claude',
          timestamp: Date.now(),
          metadata: {
            debateVote: {
              round: 1,
              winnerId: 'claude',
              winnerName: 'Claude',
              votingLabel: 'Value constructives',
              criterion: 'Value constructives: choose who better established and defended their value, criterion, definitions, and contentions.',
              timestamp: 100,
            },
          },
        },
      ];

      const { getByText, queryByText } = renderWithProviders(
        <TranscriptModal {...defaultProps} messages={messagesWithVote} />
      );

      expect(queryByText('Value constructives: Claude')).toBeNull();
      expect(getByText('Judge Decisions')).toBeTruthy();
      expect(getByText('Value constructives')).toBeTruthy();
      expect(getByText('Value constructives: choose who better established and defended their value, criterion, definitions, and contentions.')).toBeTruthy();
    });

    it('renders debate messages', () => {
      const { getByText } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      expect(getByText('Opening argument')).toBeTruthy();
      expect(getByText('Counter argument')).toBeTruthy();
    });

    it('renders formal speech labels from debate speech metadata', () => {
      const speechMessages: Message[] = [
        {
          ...mockMessages[0],
          metadata: {
            debateSpeech: {
              formatId: 'policy',
              presetId: 'standard',
              messageIndex: 0,
              totalMessages: 12,
              phase: 'constructive',
              speaker: 'aff',
              label: '1AC',
            },
          },
        },
        {
          ...mockMessages[1],
          metadata: {
            debateSpeech: {
              formatId: 'policy',
              presetId: 'standard',
              messageIndex: 1,
              totalMessages: 12,
              phase: 'cross_examination',
              speaker: 'neg',
              cxRole: 'questioner',
              label: 'CX after 1AC',
            },
          },
        },
      ];

      const { getByText } = renderWithProviders(
        <TranscriptModal {...defaultProps} messages={speechMessages} />
      );

      expect(getByText('1AC')).toBeTruthy();
      expect(getByText('CX after 1AC · Negative asks')).toBeTruthy();
    });

    it('renders citations for cited debate messages', () => {
      const citedMessages: Message[] = [
        {
          ...mockMessages[0],
          content: 'Opening argument with evidence [1]',
          metadata: {
            citations: [
              {
                index: 1,
                url: 'https://example.com/source',
                title: 'Example Source',
                snippet: 'Evidence summary',
              },
            ],
          },
        },
      ];

      const { getByTestId, getByText } = renderWithProviders(
        <TranscriptModal {...defaultProps} messages={citedMessages} />
      );

      expect(getByText('Opening argument with evidence [1]')).toBeTruthy();
      expect(getByText('Sources (1)')).toBeTruthy();
      expect(getByText('Example Source')).toBeTruthy();
      expect(getByTestId('citation-sources')).toBeTruthy();
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

      const { getByTestId } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      fireEvent.press(getByTestId('save-button'));

      await waitFor(() => {
        expect(Print.printToFileAsync).toHaveBeenCalled();
        expect(FileSystem.moveAsync).toHaveBeenCalled();
      });
    });

    it('shares PDF when share button is pressed', async () => {

      const { getByTestId } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      fireEvent.press(getByTestId('share-button'));

      await waitFor(() => {
        expect(Print.printToFileAsync).toHaveBeenCalled();
        expect(Sharing.shareAsync).toHaveBeenCalled();
      });
    });
  });

  describe('Save Functionality', () => {
    it('shows success toast after saving', async () => {
      const { getByTestId } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      fireEvent.press(getByTestId('save-button'));

      await waitFor(() => {
        expect(mockShowSuccess).toHaveBeenCalledWith(
          expect.stringContaining('Transcript saved as'),
          'debate'
        );
      });
    });

    it('generates proper filename when saving', async () => {

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

    it('includes citations in generated PDF HTML', async () => {
      const citedMessages: Message[] = [
        {
          ...mockMessages[0],
          content: 'Opening argument with evidence [1]',
          metadata: {
            citations: [
              {
                index: 1,
                url: 'https://example.com/source',
                title: 'Example Source',
                snippet: 'Evidence summary',
              },
            ],
          },
        },
      ];

      const { getByTestId } = renderWithProviders(
        <TranscriptModal {...defaultProps} messages={citedMessages} />
      );

      fireEvent.press(getByTestId('save-button'));

      await waitFor(() => {
        expect(Print.printToFileAsync).toHaveBeenCalled();
      });

      const html = printedHtml();
      expect(html).toContain('Sources (1)');
      expect(html).toContain('Example Source');
      expect(html).toContain('https://example.com/source');
      expect(html).toContain('Evidence summary');
    });

    it('includes speech labels in generated PDF HTML', async () => {
      const speechMessages: Message[] = [
        {
          ...mockMessages[0],
          metadata: {
            debateSpeech: {
              formatId: 'lincoln_douglas',
              presetId: 'standard',
              messageIndex: 6,
              totalMessages: 8,
              phase: 'rebuttal',
              speaker: 'aff',
              label: 'Affirmative Rebuttal (AR)',
            },
          },
        },
      ];

      const { getByTestId } = renderWithProviders(
        <TranscriptModal {...defaultProps} messages={speechMessages} />
      );

      fireEvent.press(getByTestId('save-button'));

      await waitFor(() => {
        expect(Print.printToFileAsync).toHaveBeenCalled();
      });

      const html = printedHtml();
      expect(html).toContain('Affirmative Rebuttal (AR)');
    });

    it('shows error toast when save fails', async () => {
      jest.mocked(Print.printToFileAsync).mockRejectedValueOnce(new Error('Save failed'));

      const { getByTestId } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      fireEvent.press(getByTestId('save-button'));

      await waitFor(() => {
        expect(mockHandleWithToast).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({ feature: 'debate' })
        );
      });
    });
  });

  describe('Share Functionality', () => {
    it('shares PDF file when sharing is available', async () => {

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

    it('shows warning when sharing is not available', async () => {
      jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);

      const { getByTestId } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      fireEvent.press(getByTestId('share-button'));

      await waitFor(() => {
        expect(mockShowWarning).toHaveBeenCalledWith(
          'Sharing is not available on this device.',
          'debate'
        );
      });
    });

    it('shows error toast when share fails', async () => {
      jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error('Share failed'));

      const { getByTestId } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      fireEvent.press(getByTestId('share-button'));

      await waitFor(() => {
        expect(mockHandleWithToast).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({ feature: 'debate' })
        );
      });
    });
  });

  describe('Accessibility', () => {
    it('sets correct modal properties', () => {
      const { UNSAFE_queryByType } = renderWithProviders(<TranscriptModal {...defaultProps} />);

      const modal = UNSAFE_queryByType(Modal);

      if (modal) {
        expect(modal.props.visible).toBe(true);
      }
    });

    it('handles onRequestClose callback', () => {
      const { UNSAFE_queryByType } = renderWithProviders(<TranscriptModal {...defaultProps} />);

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
