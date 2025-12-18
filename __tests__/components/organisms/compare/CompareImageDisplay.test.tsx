import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { CompareImageDisplay } from '@/components/organisms/compare/CompareImageDisplay';
import { AIConfig } from '@/types';

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

const mockAI: AIConfig = {
  id: 'test-ai',
  name: 'Test AI',
  provider: 'openai',
  model: 'gpt-4',
  color: '#00ff00',
};

describe('CompareImageDisplay', () => {
  const mockOnOpenLightbox = jest.fn();
  const testUri = 'https://example.com/test-image.png';
  const testTimestamp = Date.now();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with AI name', () => {
    const { getByText } = renderWithProviders(
      <CompareImageDisplay
        ai={mockAI}
        side="left"
        uri={testUri}
        timestamp={testTimestamp}
        onOpenLightbox={mockOnOpenLightbox}
      />
    );

    expect(getByText('Test AI')).toBeTruthy();
  });

  it('renders image with correct URI', () => {
    const { UNSAFE_getByType } = renderWithProviders(
      <CompareImageDisplay
        ai={mockAI}
        side="left"
        uri={testUri}
        timestamp={testTimestamp}
        onOpenLightbox={mockOnOpenLightbox}
      />
    );

    const Image = require('react-native').Image;
    const image = UNSAFE_getByType(Image);
    expect(image.props.source.uri).toBe(testUri);
  });

  it('renders Save button', () => {
    const { getByText } = renderWithProviders(
      <CompareImageDisplay
        ai={mockAI}
        side="left"
        uri={testUri}
        timestamp={testTimestamp}
        onOpenLightbox={mockOnOpenLightbox}
      />
    );

    expect(getByText('Save')).toBeTruthy();
  });

  it('renders Share button', () => {
    const { getByText } = renderWithProviders(
      <CompareImageDisplay
        ai={mockAI}
        side="left"
        uri={testUri}
        timestamp={testTimestamp}
        onOpenLightbox={mockOnOpenLightbox}
      />
    );

    expect(getByText('Share')).toBeTruthy();
  });

  it('renders timestamp', () => {
    const { getByText } = renderWithProviders(
      <CompareImageDisplay
        ai={mockAI}
        side="left"
        uri={testUri}
        timestamp={testTimestamp}
        onOpenLightbox={mockOnOpenLightbox}
      />
    );

    // Should render time in some format
    const timeText = new Date(testTimestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    expect(getByText(timeText)).toBeTruthy();
  });

  it('calls onOpenLightbox when image is pressed', () => {
    const { UNSAFE_getAllByType } = renderWithProviders(
      <CompareImageDisplay
        ai={mockAI}
        side="left"
        uri={testUri}
        timestamp={testTimestamp}
        onOpenLightbox={mockOnOpenLightbox}
      />
    );

    const TouchableOpacity = require('react-native').TouchableOpacity;
    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    // First touchable is the image wrapper
    fireEvent.press(touchables[0]);

    expect(mockOnOpenLightbox).toHaveBeenCalledWith(testUri);
  });

  it('calls save service when Save is pressed', async () => {
    const MediaSaveService = require('@/services/media/MediaSaveService').default;
    const { getByText } = renderWithProviders(
      <CompareImageDisplay
        ai={mockAI}
        side="left"
        uri={testUri}
        timestamp={testTimestamp}
        onOpenLightbox={mockOnOpenLightbox}
      />
    );

    fireEvent.press(getByText('Save'));

    // Allow async operation to complete
    await Promise.resolve();

    expect(MediaSaveService.saveFileUri).toHaveBeenCalledWith(
      testUri,
      { album: 'Symposium AI' }
    );
  });

  it('returns null when uri is empty', () => {
    const { toJSON } = renderWithProviders(
      <CompareImageDisplay
        ai={mockAI}
        side="left"
        uri=""
        timestamp={testTimestamp}
        onOpenLightbox={mockOnOpenLightbox}
      />
    );

    expect(toJSON()).toBeNull();
  });

  it('renders for both left and right sides', () => {
    const sides: Array<'left' | 'right'> = ['left', 'right'];

    sides.forEach((side) => {
      const { toJSON } = renderWithProviders(
        <CompareImageDisplay
          ai={mockAI}
          side={side}
          uri={testUri}
          timestamp={testTimestamp}
          onOpenLightbox={mockOnOpenLightbox}
        />
      );

      expect(toJSON()).not.toBeNull();
    });
  });
});
