import React from 'react';
import { Image } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { AIAvatar } from '@/components/organisms/common/AIAvatar';

jest.mock('@/components/molecules', () => {
  const { Text, View, TouchableOpacity } = require('react-native');
  return {
    // Ensure molecules index isn't pulled in while rendering tests for shared atoms
  };
});

describe('AIAvatar', () => {
  it('renders a letter avatar with custom color and size', () => {
    const { getByText } = renderWithProviders(
      <AIAvatar icon="A" iconType="letter" color="#3366FF" size="small" />
    );

    const letter = getByText('A');
    const style = Array.isArray(letter.props.style)
      ? Object.assign({}, ...letter.props.style)
      : letter.props.style;

    expect(style.color).toBe('#3366FF');
    expect(style.fontSize).toBeGreaterThan(0);
  });

  it('renders an image avatar with white tinting applied', () => {
    const { UNSAFE_getByType } = renderWithProviders(
      <AIAvatar iconType="image" icon="https://example.com/logo.png" color="#000000" size="medium" />
    );

    const image = UNSAFE_getByType(Image);
    const style = Array.isArray(image.props.style)
      ? Object.assign({}, ...image.props.style)
      : image.props.style;

    expect(style.tintColor).toBe('#FFFFFF');
    expect(image.props.source).toEqual({ uri: 'https://example.com/logo.png' });
  });

  it('falls back to the first character when icon is text but not explicitly a letter avatar', () => {
    const { getByText } = renderWithProviders(
      <AIAvatar icon="Claude" />
    );

    expect(getByText('Claude')).toBeTruthy();
  });
});
