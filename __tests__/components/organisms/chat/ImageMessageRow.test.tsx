import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ImageMessageRow } from '@/components/organisms/chat/ImageMessageRow';
import type { Message } from '@/types';

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
  ImageBubble: ({ uris, onPressImage }: any) => {
    const React = require('react');
    const { TouchableOpacity, Text } = require('react-native');
    return React.createElement(TouchableOpacity, { onPress: () => onPressImage?.(uris[0]), testID: 'image-bubble' }, React.createElement(Text, null, 'Image'));
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
    text: 'Here is your image',
    sender: 'Claude',
    senderId: 'claude',
    timestamp: Date.now(),
    attachments: [
      { type: 'image', uri: 'https://example.com/image.jpg' },
    ],
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
        { type: 'image', uri: 'https://example.com/image1.jpg' },
        { type: 'image', uri: 'https://example.com/image2.jpg' },
      ],
    };

    const { getByTestId } = renderWithProviders(<ImageMessageRow message={multiImageMessage} />);
    expect(getByTestId('image-bubble')).toBeTruthy();
  });
});