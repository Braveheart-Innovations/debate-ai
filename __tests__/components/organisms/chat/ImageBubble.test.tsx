import React from 'react';
import { Image, TouchableOpacity } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ImageBubble } from '@/components/organisms/chat/ImageBubble';

describe('ImageBubble', () => {
  const mockOnPressImage = jest.fn();
  const mockUris = [
    'https://example.com/image1.jpg',
    'https://example.com/image2.jpg',
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders null when uris array is empty', () => {
    const { toJSON } = renderWithProviders(<ImageBubble uris={[]} />);
    expect(toJSON()).toBeNull();
  });

  it('renders null when uris is undefined', () => {
    const { toJSON } = renderWithProviders(<ImageBubble uris={undefined as any} />);
    expect(toJSON()).toBeNull();
  });

  it('renders image for each URI', () => {
    const { UNSAFE_getAllByType } = renderWithProviders(
      <ImageBubble uris={mockUris} onPressImage={mockOnPressImage} />
    );

    const images = UNSAFE_getAllByType(Image);
    expect(images).toHaveLength(2);
  });

  it('calls onPressImage with correct URI when image is pressed', () => {
    const { UNSAFE_getAllByType } = renderWithProviders(
      <ImageBubble uris={mockUris} onPressImage={mockOnPressImage} />
    );

    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    fireEvent.press(touchables[0]);

    expect(mockOnPressImage).toHaveBeenCalledWith(mockUris[0]);
  });

  it('handles image press for second image', () => {
    const { UNSAFE_getAllByType } = renderWithProviders(
      <ImageBubble uris={mockUris} onPressImage={mockOnPressImage} />
    );

    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    fireEvent.press(touchables[1]);

    expect(mockOnPressImage).toHaveBeenCalledWith(mockUris[1]);
  });

  it('works without onPressImage callback', () => {
    const { UNSAFE_getAllByType } = renderWithProviders(
      <ImageBubble uris={mockUris} />
    );

    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    expect(() => fireEvent.press(touchables[0])).not.toThrow();
  });

  it('renders single image correctly', () => {
    const singleUri = ['https://example.com/single.jpg'];
    const { UNSAFE_getAllByType } = renderWithProviders(
      <ImageBubble uris={singleUri} onPressImage={mockOnPressImage} />
    );

    const images = UNSAFE_getAllByType(Image);
    expect(images).toHaveLength(1);
  });

  it('displays error message when image fails to load', () => {
    const { UNSAFE_getAllByType, getByText } = renderWithProviders(
      <ImageBubble uris={[mockUris[0]]} />
    );

    const images = UNSAFE_getAllByType(Image);
    fireEvent(images[0], 'error');

    expect(getByText('Failed to load image')).toBeTruthy();
  });

  it('handles onLoad event for images', () => {
    const { UNSAFE_getAllByType } = renderWithProviders(
      <ImageBubble uris={[mockUris[0]]} />
    );

    const images = UNSAFE_getAllByType(Image);
    expect(() => {
      fireEvent(images[0], 'load', {
        nativeEvent: { source: { width: 1024, height: 1024 } },
      });
    }).not.toThrow();
  });
});