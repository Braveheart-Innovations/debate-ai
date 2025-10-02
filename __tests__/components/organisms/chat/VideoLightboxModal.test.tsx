import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { Alert, TouchableOpacity } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { VideoLightboxModal } from '@/components/organisms/chat/VideoLightboxModal';

jest.mock('expo-video', () => ({
  VideoView: () => null,
  useVideoPlayer: jest.fn(() => ({})),
}));

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

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
  Ionicons: () => null,
};
});

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

jest.spyOn(Alert, 'alert');

describe('VideoLightboxModal', () => {
  const mockOnClose = jest.fn();
  const mockUri = 'https://example.com/video.mp4';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders when visible is true', () => {
    const { getByText } = renderWithProviders(
      <VideoLightboxModal visible={true} uri={mockUri} onClose={mockOnClose} />
    );

    expect(getByText('Video')).toBeTruthy();
  });

  it('renders Share, Save, and Close buttons', () => {
    const { getByText } = renderWithProviders(
      <VideoLightboxModal visible={true} uri={mockUri} onClose={mockOnClose} />
    );

    expect(getByText('Share')).toBeTruthy();
    expect(getByText('Save')).toBeTruthy();
    expect(getByText('Close')).toBeTruthy();
  });

  it('calls onClose when Close button is pressed', () => {
    const { getByText } = renderWithProviders(
      <VideoLightboxModal visible={true} uri={mockUri} onClose={mockOnClose} />
    );

    fireEvent.press(getByText('Close'));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('calls sharing API when Share button is pressed', async () => {
    const Sharing = require('expo-sharing');
    const { getByText } = renderWithProviders(
      <VideoLightboxModal visible={true} uri={mockUri} onClose={mockOnClose} />
    );

    fireEvent.press(getByText('Share'));

    await waitFor(() => {
      expect(Sharing.shareAsync).toHaveBeenCalledWith(mockUri);
    });
  });

  it('calls MediaSaveService and shows alert when Save button is pressed', async () => {
    const MediaSaveService = require('@/services/media/MediaSaveService').default;
    const { getByText } = renderWithProviders(
      <VideoLightboxModal visible={true} uri={mockUri} onClose={mockOnClose} />
    );

    fireEvent.press(getByText('Save'));

    await waitFor(() => {
      expect(MediaSaveService.saveFileUri).toHaveBeenCalledWith(mockUri, { album: 'Symposium AI' });
      expect(Alert.alert).toHaveBeenCalledWith('Saved', 'Video saved to Photos');
    });
  });

  it('shows error alert when save fails', async () => {
    const MediaSaveService = require('@/services/media/MediaSaveService').default;
    MediaSaveService.saveFileUri.mockRejectedValueOnce(new Error('Permission denied'));

    const { getByText } = renderWithProviders(
      <VideoLightboxModal visible={true} uri={mockUri} onClose={mockOnClose} />
    );

    fireEvent.press(getByText('Save'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Save Failed', 'Permission denied');
    });
  });

  it('initializes video player with correct URI', () => {
    const { useVideoPlayer } = require('expo-video');

    renderWithProviders(
      <VideoLightboxModal visible={true} uri={mockUri} onClose={mockOnClose} />
    );

    expect(useVideoPlayer).toHaveBeenCalledWith(mockUri);
  });

  it('calls onClose when backdrop is pressed', () => {
    const { UNSAFE_getAllByType } = renderWithProviders(
      <VideoLightboxModal visible={true} uri={mockUri} onClose={mockOnClose} />
    );

    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    // First touchable is the backdrop
    fireEvent.press(touchables[0]);

    expect(mockOnClose).toHaveBeenCalled();
  });
});