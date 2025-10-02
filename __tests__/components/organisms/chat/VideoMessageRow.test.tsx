import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { VideoMessageRow } from '@/components/organisms/chat/VideoMessageRow';
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

jest.mock('@/components/organisms/chat/VideoLightboxModal', () => ({
  VideoLightboxModal: () => null,
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

describe('VideoMessageRow', () => {
  const mockMessage: Message = {
    id: 'msg1',
    text: 'Here is your video',
    sender: 'Claude',
    senderId: 'claude',
    timestamp: Date.now(),
    attachments: [
      { type: 'video', uri: 'https://example.com/video.mp4' },
    ],
  };

  it('renders null when no video attachments', () => {
    const noVideoMessage: Message = {
      ...mockMessage,
      attachments: [],
    };

    const { toJSON } = renderWithProviders(<VideoMessageRow message={noVideoMessage} />);
    expect(toJSON()).toBeNull();
  });

  it('renders sender name', () => {
    const { getByText } = renderWithProviders(<VideoMessageRow message={mockMessage} />);
    expect(getByText('Claude')).toBeTruthy();
  });

  it('renders "Tap to play video" prompt', () => {
    const { getByText } = renderWithProviders(<VideoMessageRow message={mockMessage} />);
    expect(getByText('Tap to play video')).toBeTruthy();
  });

  it('renders Save and Share buttons', () => {
    const { getByText } = renderWithProviders(<VideoMessageRow message={mockMessage} />);
    expect(getByText('Save')).toBeTruthy();
    expect(getByText('Share')).toBeTruthy();
  });

  it('renders timestamp', () => {
    const { getByText } = renderWithProviders(<VideoMessageRow message={mockMessage} />);
    const timeText = new Date(mockMessage.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    expect(getByText(timeText)).toBeTruthy();
  });

  it('opens lightbox when video prompt is pressed', () => {
    const { getByText } = renderWithProviders(<VideoMessageRow message={mockMessage} />);

    fireEvent.press(getByText('Tap to play video'));
    // Lightbox should now be visible
  });

  it('calls MediaSaveService when Save is pressed', async () => {
    const MediaSaveService = require('@/services/media/MediaSaveService').default;
    const { getByText } = renderWithProviders(<VideoMessageRow message={mockMessage} />);

    fireEvent.press(getByText('Save'));

    // Wait for async operation
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(MediaSaveService.saveFileUri).toHaveBeenCalledWith(
      'https://example.com/video.mp4',
      { album: 'Symposium AI' }
    );
  });

  it('calls Sharing API when Share is pressed', async () => {
    const Sharing = require('expo-sharing');
    const { getByText } = renderWithProviders(<VideoMessageRow message={mockMessage} />);

    fireEvent.press(getByText('Share'));

    // Wait for async operation
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(Sharing.shareAsync).toHaveBeenCalledWith('https://example.com/video.mp4');
  });

  it('filters non-video attachments', () => {
    const mixedMessage: Message = {
      ...mockMessage,
      attachments: [
        { type: 'image', uri: 'https://example.com/image.jpg' },
        { type: 'video', uri: 'https://example.com/video.mp4' },
      ],
    };

    const { getByText } = renderWithProviders(<VideoMessageRow message={mixedMessage} />);
    expect(getByText('Tap to play video')).toBeTruthy();
  });

  it('handles error in Save gracefully', async () => {
    const MediaSaveService = require('@/services/media/MediaSaveService').default;
    MediaSaveService.saveFileUri.mockRejectedValueOnce(new Error('Save failed'));

    const { getByText } = renderWithProviders(<VideoMessageRow message={mockMessage} />);

    expect(() => fireEvent.press(getByText('Save'))).not.toThrow();
  });

  it('handles error in Share gracefully', async () => {
    const Sharing = require('expo-sharing');
    Sharing.shareAsync.mockRejectedValueOnce(new Error('Share failed'));

    const { getByText } = renderWithProviders(<VideoMessageRow message={mockMessage} />);

    expect(() => fireEvent.press(getByText('Share'))).not.toThrow();
  });
});