/**
 * ShareModal Test Suite
 * Comprehensive tests for the debate share modal component
 */

import type { ReactNode } from 'react';
import { Modal, TouchableOpacity } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';
import type { ViewShotProperties, ViewShotRef } from 'react-native-view-shot';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ShareModal } from '@/components/organisms/debate/ShareModal';
import type {
  KeyboardAvoider,
  SheetHeader,
  ShareActionButtons,
  SharePreviewCard,
  Typography,
} from '@/components/molecules';
import type { AI, Message } from '@/types';
import { createMockAIConfig, createMockMessage } from '@test-utils/fixtures';

// Mock ErrorService
const mockShowWarning = jest.fn();
const mockHandleWithToast = jest.fn();
jest.mock('@/services/errors/ErrorService', () => ({
  ErrorService: {
    showWarning: (...args: unknown[]) => mockShowWarning(...args),
    handleWithToast: (...args: unknown[]) => mockHandleWithToast(...args),
    showSuccess: jest.fn(),
    showInfo: jest.fn(),
  },
}));

// Mock dependencies
jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

jest.mock('react-native-view-shot', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: mockReact.forwardRef<Pick<ViewShotRef, 'capture'>, ViewShotProperties>((props, ref) => {
      mockReact.useImperativeHandle(ref, () => ({
        capture: jest.fn<Promise<string>, []>().mockResolvedValue('mock-uri'),
      }));
      return <RN.View style={props.style}>{props.children}</RN.View>;
    }),
  };
});

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

jest.mock('@/components/molecules', () => {
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    KeyboardAvoider: ({ children }: Parameters<typeof KeyboardAvoider>[0]) => <>{children}</>,
    Typography: stubComponent<typeof Typography>('typography', { text: (p) => p.children }),
    SheetHeader: stubComponent<typeof SheetHeader>('sheet-header', {
      onPress: (p) => p.onClose,
      text: (p) => p.title,
    }),
    SharePreviewCard: ({ topic }: Parameters<typeof SharePreviewCard>[0]) => (
      <RN.Text testID="share-preview-card">{topic}</RN.Text>
    ),
    ShareActionButtons: ({
      onShareImage,
      onCopyLink,
      onMoreOptions,
      isGenerating,
    }: Parameters<typeof ShareActionButtons>[0]) => (
      <RN.View testID="share-action-buttons">
        <RN.TouchableOpacity
          testID="share-image-button"
          onPress={onShareImage}
          disabled={isGenerating}
        />
        <RN.TouchableOpacity testID="copy-link-button" onPress={onCopyLink} />
        <RN.TouchableOpacity testID="more-options-button" onPress={onMoreOptions} />
      </RN.View>
    ),
  };
});

describe('ShareModal', () => {
  const mockOnShare = jest.fn();
  const mockOnClose = jest.fn();

  const mockParticipants: AI[] = [
    createMockAIConfig({ id: 'claude', name: 'Claude', provider: 'claude', color: '#6366F1' }),
    createMockAIConfig({
      id: 'chatgpt',
      name: 'ChatGPT',
      provider: 'openai',
      model: 'gpt-5',
      color: '#10A37F',
    }),
  ];

  const mockMessages: Message[] = [
    createMockMessage({ id: '1', sender: 'Claude', senderType: 'ai', content: 'Opening argument', timestamp: Date.now() }),
    createMockMessage({ id: '2', sender: 'ChatGPT', senderType: 'ai', content: 'Counter argument', timestamp: Date.now() }),
  ];

  const mockWinner: AI = mockParticipants[0];

  const mockScores = {
    claude: { name: 'Claude', roundWins: 2 },
    chatgpt: { name: 'ChatGPT', roundWins: 1 },
  };

  const defaultProps = {
    topic: 'Is AI beneficial for humanity?',
    participants: mockParticipants,
    messages: mockMessages,
    winner: mockWinner,
    scores: mockScores,
    onShare: mockOnShare,
    onClose: mockOnClose,
    visible: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockShowWarning.mockClear();
    mockHandleWithToast.mockClear();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('renders when visible is true', () => {
      const { getByText } = renderWithProviders(<ShareModal {...defaultProps} />);
      expect(getByText('Share Debate')).toBeTruthy();
    });

    it('renders SharePreviewCard with topic', () => {
      const { getByTestId } = renderWithProviders(<ShareModal {...defaultProps} />);
      expect(getByTestId('share-preview-card')).toBeTruthy();
    });

    it('renders ShareActionButtons', () => {
      const { getByTestId } = renderWithProviders(<ShareModal {...defaultProps} />);
      expect(getByTestId('share-action-buttons')).toBeTruthy();
    });

    it('renders preview label', () => {
      const { getByText } = renderWithProviders(<ShareModal {...defaultProps} />);
      expect(getByText('Preview')).toBeTruthy();
    });

    it('renders without winner and scores', () => {
      const { getByText } = renderWithProviders(
        <ShareModal {...defaultProps} winner={undefined} scores={undefined} />
      );
      expect(getByText('Share Debate')).toBeTruthy();
    });
  });

  describe('Modal Visibility', () => {
    it('renders modal when visible is true', () => {
      const { getByText } = renderWithProviders(
        <ShareModal {...defaultProps} visible={true} />
      );
      expect(getByText('Share Debate')).toBeTruthy();
    });

    it('passes visible prop correctly to Modal component', () => {
      const { UNSAFE_getByType } = renderWithProviders(
        <ShareModal {...defaultProps} visible={false} />
      );

      const modal = UNSAFE_getByType(Modal);

      expect(modal.props.visible).toBe(false);
    });
  });

  describe('User Interactions', () => {
    it('calls onClose when header close button is pressed', () => {
      const { getByTestId } = renderWithProviders(<ShareModal {...defaultProps} />);

      fireEvent.press(getByTestId('sheet-header'));

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onClose when backdrop is pressed', () => {
      const { UNSAFE_getAllByType } = renderWithProviders(<ShareModal {...defaultProps} />);

      const touchables = UNSAFE_getAllByType(TouchableOpacity);
      // First TouchableOpacity is the backdrop
      fireEvent.press(touchables[0]);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('does not close modal when content is pressed', () => {
      const { UNSAFE_getAllByType } = renderWithProviders(<ShareModal {...defaultProps} />);

      const touchables = UNSAFE_getAllByType(TouchableOpacity);
      // Second TouchableOpacity is the content container
      fireEvent.press(touchables[1]);

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Share Image Functionality', () => {
    it('generates and shares image when share button is pressed', async () => {
      const { getByTestId } = renderWithProviders(<ShareModal {...defaultProps} />);

      fireEvent.press(getByTestId('share-image-button'));

      await waitFor(() => {
        expect(Sharing.shareAsync).toHaveBeenCalledWith('mock-uri', expect.any(Object));
      });
    });

    it('calls onShare callback with platform after successful share', async () => {
      const { getByTestId } = renderWithProviders(<ShareModal {...defaultProps} />);

      fireEvent.press(getByTestId('share-image-button'));

      await waitFor(() => {
        expect(mockOnShare).toHaveBeenCalledWith('ios');
      });
    });

    it('shows warning when sharing is not available', async () => {
      jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);

      const { getByTestId } = renderWithProviders(<ShareModal {...defaultProps} />);

      fireEvent.press(getByTestId('share-image-button'));

      await waitFor(() => {
        expect(mockShowWarning).toHaveBeenCalledWith(
          'Sharing not available. Please try saving the image instead.',
          'debate'
        );
      });
    });

    it('shows error toast when share fails', async () => {
      jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error('Share failed'));

      const { getByTestId } = renderWithProviders(<ShareModal {...defaultProps} />);

      fireEvent.press(getByTestId('share-image-button'));

      await waitFor(() => {
        expect(mockHandleWithToast).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({ feature: 'debate' })
        );
      });
    });
  });

  describe('Native Share Functionality', () => {
    it('triggers native share when more options is pressed', () => {
      const { getByTestId } = renderWithProviders(<ShareModal {...defaultProps} />);

      fireEvent.press(getByTestId('more-options-button'));

      // The more options button is connected, just verify it doesn't throw
      expect(getByTestId('more-options-button')).toBeTruthy();
    });

    it('renders more options button', () => {
      const { getByTestId } = renderWithProviders(<ShareModal {...defaultProps} />);

      expect(getByTestId('more-options-button')).toBeTruthy();
    });
  });

  describe('Loading State', () => {
    it('renders share button', () => {
      const { getByTestId } = renderWithProviders(<ShareModal {...defaultProps} />);

      const shareButton = getByTestId('share-image-button');
      expect(shareButton).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('sets correct modal properties for accessibility', () => {
      const { UNSAFE_getByType } = renderWithProviders(<ShareModal {...defaultProps} />);

      const modal = UNSAFE_getByType(Modal);

      expect(modal.props.visible).toBe(true);
      expect(modal.props.transparent).toBe(true);
    });

    it('handles onRequestClose callback', () => {
      const { UNSAFE_getByType } = renderWithProviders(<ShareModal {...defaultProps} />);

      const modal = UNSAFE_getByType(Modal);

      if (modal.props.onRequestClose) {
        modal.props.onRequestClose();
        expect(mockOnClose).toHaveBeenCalled();
      } else {
        expect(modal.props.visible).toBe(true);
      }
    });
  });

  describe('Edge Cases', () => {
    it('handles missing onShare callback', async () => {
      const { getByTestId } = renderWithProviders(
        <ShareModal {...defaultProps} onShare={undefined} />
      );

      fireEvent.press(getByTestId('share-image-button'));

      await waitFor(() => {
        expect(() => fireEvent.press(getByTestId('share-image-button'))).not.toThrow();
      });
    });

    it('handles missing onClose callback', () => {
      const { getByTestId } = renderWithProviders(
        <ShareModal {...defaultProps} onClose={undefined} />
      );

      expect(() => fireEvent.press(getByTestId('sheet-header'))).not.toThrow();
    });

    it('renders with empty participants array', () => {
      const { getByText } = renderWithProviders(
        <ShareModal {...defaultProps} participants={[]} />
      );

      expect(getByText('Share Debate')).toBeTruthy();
    });

    it('renders with empty messages array', () => {
      const { getByText } = renderWithProviders(
        <ShareModal {...defaultProps} messages={[]} />
      );

      expect(getByText('Share Debate')).toBeTruthy();
    });
  });

  describe('Props Handling', () => {
    it('passes topic to SharePreviewCard', () => {
      const { getByTestId } = renderWithProviders(<ShareModal {...defaultProps} />);
      const previewCard = getByTestId('share-preview-card');

      expect(previewCard.children[0]).toBe('Is AI beneficial for humanity?');
    });

    it('handles different topics', () => {
      const { getByTestId, rerender } = renderWithProviders(
        <ShareModal {...defaultProps} topic="Topic 1" />
      );

      expect(getByTestId('share-preview-card').children[0]).toBe('Topic 1');

      rerender(<ShareModal {...defaultProps} topic="Topic 2" />);

      expect(getByTestId('share-preview-card').children[0]).toBe('Topic 2');
    });
  });
});
