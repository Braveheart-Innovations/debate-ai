import React from 'react';
import { Image, TouchableOpacity, View } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ImageBubble } from '@/components/organisms/chat/ImageBubble';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => {
    const { Text } = require('react-native');
    return <Text testID={`icon-${name}`}>{name}</Text>;
  },
}));

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

  describe('Expand Icon', () => {
    it('renders expand icon overlay on each image', () => {
      const { getByTestId } = renderWithProviders(
        <ImageBubble uris={[mockUris[0]]} onPressImage={mockOnPressImage} />
      );

      // The expand icon should be present
      expect(getByTestId('icon-expand-outline')).toBeTruthy();
    });

    it('renders expand icon for each image in multi-image bubble', () => {
      const { getAllByTestId } = renderWithProviders(
        <ImageBubble uris={mockUris} onPressImage={mockOnPressImage} />
      );

      const expandIcons = getAllByTestId('icon-expand-outline');
      expect(expandIcons).toHaveLength(2);
    });

    it('positions expand icon in top-right corner', () => {
      const { UNSAFE_getAllByType } = renderWithProviders(
        <ImageBubble uris={[mockUris[0]]} onPressImage={mockOnPressImage} />
      );

      // Find the View containing the expand icon
      const views = UNSAFE_getAllByType(View);
      const expandContainer = views.find(v =>
        v.props.style?.position === 'absolute' &&
        v.props.style?.top === 8 &&
        v.props.style?.right === 8
      );

      expect(expandContainer).toBeTruthy();
    });
  });

  describe('Refine Button', () => {
    const mockOnRefine = jest.fn();

    beforeEach(() => {
      mockOnRefine.mockClear();
    });

    it('renders refine button when canRefine is true and onRefine is provided', () => {
      const { getByTestId } = renderWithProviders(
        <ImageBubble uris={[mockUris[0]]} canRefine={true} onRefine={mockOnRefine} />
      );

      expect(getByTestId('icon-color-wand-outline')).toBeTruthy();
    });

    it('does not render refine button when canRefine is false', () => {
      const { queryByTestId } = renderWithProviders(
        <ImageBubble uris={[mockUris[0]]} canRefine={false} onRefine={mockOnRefine} />
      );

      expect(queryByTestId('icon-color-wand-outline')).toBeNull();
    });

    it('does not render refine button when onRefine is not provided', () => {
      const { queryByTestId } = renderWithProviders(
        <ImageBubble uris={[mockUris[0]]} canRefine={true} />
      );

      expect(queryByTestId('icon-color-wand-outline')).toBeNull();
    });

    it('calls onRefine with URI when refine button is pressed', () => {
      const { UNSAFE_getAllByType } = renderWithProviders(
        <ImageBubble uris={[mockUris[0]]} canRefine={true} onRefine={mockOnRefine} />
      );

      // Find all TouchableOpacity elements - the refine button is the nested one
      const touchables = UNSAFE_getAllByType(TouchableOpacity);
      // The refine button should be the one inside the image container (second touchable)
      // First is the main image touchable, second is the refine button
      const refineButton = touchables.find(t => {
        // The refine button has a specific background style from theme.colors.primary[500]
        const style = t.props.style;
        return Array.isArray(style) && style.some((s: any) => s?.position === 'absolute' && s?.bottom === 8);
      });

      if (refineButton) {
        fireEvent.press(refineButton);
        expect(mockOnRefine).toHaveBeenCalledWith(mockUris[0]);
      }
    });

    it('positions refine button in bottom-right corner', () => {
      const { UNSAFE_getAllByType } = renderWithProviders(
        <ImageBubble uris={[mockUris[0]]} canRefine={true} onRefine={mockOnRefine} />
      );

      const touchables = UNSAFE_getAllByType(TouchableOpacity);
      const refineButton = touchables.find(t => {
        const style = t.props.style;
        if (Array.isArray(style)) {
          return style.some((s: any) => s?.position === 'absolute' && s?.bottom === 8 && s?.right === 8);
        }
        return false;
      });

      expect(refineButton).toBeTruthy();
    });

    it('renders refine button for each image when canRefine is true', () => {
      const { getAllByTestId } = renderWithProviders(
        <ImageBubble uris={mockUris} canRefine={true} onRefine={mockOnRefine} />
      );

      const refineIcons = getAllByTestId('icon-color-wand-outline');
      expect(refineIcons).toHaveLength(2);
    });
  });
});