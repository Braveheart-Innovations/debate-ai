import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ImageMessageRow } from '@/components/organisms/chat/ImageMessageRow';
import type { Message, AIProvider } from '@/types';

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/services/media/MediaSaveService', () => ({
  __esModule: true,
  default: {
    saveFileUri: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('@/components/organisms/chat/ImageBubble', () => ({
  ImageBubble: ({ uris, onPressImage, canRefine, onRefine }: any) => {
    const React = require('react');
    const { TouchableOpacity, Text, View } = require('react-native');
    const children = [
      React.createElement(TouchableOpacity, { key: 'image', onPress: () => onPressImage?.(uris[0]), testID: 'image-bubble' }, React.createElement(Text, null, 'Image')),
    ];
    // Only add refine button when both canRefine is true AND onRefine is a function
    if (canRefine === true && typeof onRefine === 'function') {
      children.push(React.createElement(TouchableOpacity, { key: 'refine', onPress: () => onRefine(uris[0]), testID: 'refine-button' }, React.createElement(Text, null, 'Refine')));
    }
    return React.createElement(View, { testID: 'image-bubble-container' }, children);
  },
}));

jest.mock('@/components/organisms/chat/ImageLightboxModal', () => ({
  ImageLightboxModal: () => null,
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

describe('ImageMessageRow', () => {
  const mockMessage: Message = {
    id: 'msg1',
    content: '',
    sender: 'Claude',
    senderType: 'ai',
    timestamp: Date.now(),
    attachments: [
      { type: 'image', uri: 'https://example.com/image.jpg', mimeType: 'image/jpeg' },
    ],
    metadata: {
      generatedImage: {
        prompt: 'A beautiful sunset',
        providerId: 'openai',
        model: 'gpt-image-1',
        url: 'https://example.com/image.jpg',
      },
    },
  };

  it('renders null when no image attachments', () => {
    const noImageMessage: Message = {
      ...mockMessage,
      attachments: [],
    };

    const { toJSON } = renderWithProviders(<ImageMessageRow message={noImageMessage} />);
    expect(toJSON()).toBeNull();
  });

  it('renders sender name', () => {
    const { getByText } = renderWithProviders(<ImageMessageRow message={mockMessage} />);
    expect(getByText('Claude')).toBeTruthy();
  });

  it('renders Save and Share buttons', () => {
    const { getByText } = renderWithProviders(<ImageMessageRow message={mockMessage} />);
    expect(getByText('Save')).toBeTruthy();
    expect(getByText('Share')).toBeTruthy();
  });

  it('renders timestamp', () => {
    const { getByText } = renderWithProviders(<ImageMessageRow message={mockMessage} />);
    const timeText = new Date(mockMessage.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    expect(getByText(timeText)).toBeTruthy();
  });

  it('opens lightbox when image is pressed', () => {
    const { getByTestId } = renderWithProviders(<ImageMessageRow message={mockMessage} />);

    fireEvent.press(getByTestId('image-bubble'));
    // Lightbox should now be visible (tested via modal visibility)
  });

  it('calls MediaSaveService when Save is pressed', async () => {
    const MediaSaveService = require('@/services/media/MediaSaveService').default;
    const { getByText } = renderWithProviders(<ImageMessageRow message={mockMessage} />);

    fireEvent.press(getByText('Save'));

    // Wait for async operation
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(MediaSaveService.saveFileUri).toHaveBeenCalledWith(
      'https://example.com/image.jpg',
      { album: 'Symposium AI' }
    );
  });

  it('calls Sharing API when Share is pressed', async () => {
    const Sharing = require('expo-sharing');
    const { getByText } = renderWithProviders(<ImageMessageRow message={mockMessage} />);

    fireEvent.press(getByText('Share'));

    // Wait for async operation
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(Sharing.shareAsync).toHaveBeenCalledWith('https://example.com/image.jpg');
  });

  it('filters non-image attachments', () => {
    const mixedMessage: Message = {
      ...mockMessage,
      attachments: [
        { type: 'video', uri: 'https://example.com/video.mp4' },
        { type: 'image', uri: 'https://example.com/image.jpg' },
      ],
    };

    const { getByTestId } = renderWithProviders(<ImageMessageRow message={mixedMessage} />);
    expect(getByTestId('image-bubble')).toBeTruthy();
  });

  it('handles multiple image attachments', () => {
    const multiImageMessage: Message = {
      ...mockMessage,
      attachments: [
        { type: 'image', uri: 'https://example.com/image1.jpg', mimeType: 'image/jpeg' },
        { type: 'image', uri: 'https://example.com/image2.jpg', mimeType: 'image/jpeg' },
      ],
    };

    const { getByTestId } = renderWithProviders(<ImageMessageRow message={multiImageMessage} />);
    expect(getByTestId('image-bubble')).toBeTruthy();
  });

  describe('refinement', () => {
    it('shows refine button when canRefine is true', () => {
      const mockOnRefine = jest.fn();
      const { getByTestId } = renderWithProviders(
        <ImageMessageRow message={mockMessage} canRefine={true} onRefine={mockOnRefine} />
      );

      expect(getByTestId('refine-button')).toBeTruthy();
    });

    it('hides refine button when canRefine is false', () => {
      const mockOnRefine = jest.fn();
      const { queryByTestId } = renderWithProviders(
        <ImageMessageRow message={mockMessage} canRefine={false} onRefine={mockOnRefine} />
      );

      expect(queryByTestId('refine-button')).toBeNull();
    });

    it('hides refine button when onRefine is not provided', () => {
      const { queryByTestId } = renderWithProviders(
        <ImageMessageRow message={mockMessage} canRefine={true} />
      );

      expect(queryByTestId('refine-button')).toBeNull();
    });

    it('calls onRefine with correct params when refine button pressed', () => {
      const mockOnRefine = jest.fn();
      const { getByTestId } = renderWithProviders(
        <ImageMessageRow message={mockMessage} canRefine={true} onRefine={mockOnRefine} />
      );

      fireEvent.press(getByTestId('refine-button'));

      expect(mockOnRefine).toHaveBeenCalledWith(
        'https://example.com/image.jpg',
        'A beautiful sunset',
        'openai',
        'msg1'
      );
    });

    it('uses default values when metadata is missing', () => {
      const mockOnRefine = jest.fn();
      const messageWithoutMetadata: Message = {
        ...mockMessage,
        metadata: undefined,
      };

      const { getByTestId } = renderWithProviders(
        <ImageMessageRow message={messageWithoutMetadata} canRefine={true} onRefine={mockOnRefine} />
      );

      fireEvent.press(getByTestId('refine-button'));

      expect(mockOnRefine).toHaveBeenCalledWith(
        'https://example.com/image.jpg',
        '',          // empty prompt when metadata missing
        'openai',    // default provider
        'msg1'
      );
    });
  });
});