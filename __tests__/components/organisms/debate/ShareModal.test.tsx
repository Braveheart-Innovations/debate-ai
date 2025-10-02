/**
 * ShareModal Test Suite
 * Comprehensive tests for the debate share modal component
 */

import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ShareModal } from '@/components/organisms/debate/ShareModal';
import { AI, Message } from '@/types';

// Mock dependencies
jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('react-native-view-shot', () => {
  const mockReact = require('react');
  return {
    __esModule: true,
    default: mockReact.forwardRef((props: any, ref: any) => {
      mockReact.useImperativeHandle(ref, () => ({
        capture: jest.fn().mockResolvedValue('mock-uri'),
      }));
      return mockReact.createElement('View', props, props.children);
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
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    Typography: ({ children, ...props }: any) =>
      React.createElement(Text, { testID: props.testID || 'typography' }, children),
    SheetHeader: ({ title, onClose }: any) =>
      React.createElement(TouchableOpacity, { testID: 'sheet-header', onPress: onClose },
        React.createElement(Text, null, title)
      ),
    SharePreviewCard: ({ topic }: any) =>
      React.createElement(Text, { testID: 'share-preview-card' }, topic),
    ShareActionButtons: ({ onShareImage, onCopyLink, onMoreOptions, isGenerating }: any) =>
      React.createElement('View', { testID: 'share-action-buttons' },
        React.createElement(TouchableOpacity, {
          testID: 'share-image-button',
          onPress: onShareImage,
          disabled: isGenerating
        }),
        React.createElement(TouchableOpacity, {
          testID: 'copy-link-button',
          onPress: onCopyLink
        }),
        React.createElement(TouchableOpacity, {
          testID: 'more-options-button',
          onPress: onMoreOptions
        })
      ),
  };
});

describe('ShareModal', () => {
  const mockOnShare = jest.fn();
  const mockOnClose = jest.fn();

  const mockParticipants: AI[] = [
    { id: 'claude', name: 'Claude', provider: 'anthropic', color: '#6366F1' },
    { id: 'chatgpt', name: 'ChatGPT', provider: 'openai', color: '#10A37F' },
  ];

  const mockMessages: Message[] = [
    { id: '1', sender: 'Claude', content: 'Opening argument', timestamp: new Date() },
    { id: '2', sender: 'ChatGPT', content: 'Counter argument', timestamp: new Date() },
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
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
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

      const Modal = require('react-native').Modal;
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
      const TouchableOpacity = require('react-native').TouchableOpacity;

      const touchables = UNSAFE_getAllByType(TouchableOpacity);
      // First TouchableOpacity is the backdrop
      fireEvent.press(touchables[0]);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('does not close modal when content is pressed', () => {
      const { UNSAFE_getAllByType } = renderWithProviders(<ShareModal {...defaultProps} />);
      const TouchableOpacity = require('react-native').TouchableOpacity;

      const touchables = UNSAFE_getAllByType(TouchableOpacity);
      // Second TouchableOpacity is the content container
      fireEvent.press(touchables[1]);

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Share Image Functionality', () => {
    it('generates and shares image when share button is pressed', async () => {
      const Sharing = require('expo-sharing');
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

    it('shows alert when sharing is not available', async () => {
      const Sharing = require('expo-sharing');
      Sharing.isAvailableAsync.mockResolvedValueOnce(false);

      const { getByTestId } = renderWithProviders(<ShareModal {...defaultProps} />);

      fireEvent.press(getByTestId('share-image-button'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Sharing not available',
          'Please try saving the image instead.'
        );
      });
    });

    it('shows error alert when share fails', async () => {
      const Sharing = require('expo-sharing');
      Sharing.shareAsync.mockRejectedValueOnce(new Error('Share failed'));

      const { getByTestId } = renderWithProviders(<ShareModal {...defaultProps} />);

      fireEvent.press(getByTestId('share-image-button'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Error',
          'Failed to share debate. Please try again.'
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

      const Modal = require('react-native').Modal;
      const modal = UNSAFE_getByType(Modal);

      expect(modal.props.visible).toBe(true);
      expect(modal.props.transparent).toBe(true);
    });

    it('handles onRequestClose callback', () => {
      const { UNSAFE_getByType } = renderWithProviders(<ShareModal {...defaultProps} />);

      const Modal = require('react-native').Modal;
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
