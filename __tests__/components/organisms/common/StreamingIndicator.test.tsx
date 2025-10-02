import React from 'react';
import Animated from 'react-native-reanimated';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { StreamingIndicator } from '@/components/organisms/common/StreamingIndicator';

jest.mock('expo-haptics', () => ({}));

describe('StreamingIndicator', () => {
  it('returns null when not visible', () => {
    const { toJSON } = renderWithProviders(
      <StreamingIndicator visible={false} />
    );
    expect(toJSON()).toBeNull();
  });

  it('renders cursor variant with provided size and theme color', () => {
    const { getByText } = renderWithProviders(
      <StreamingIndicator visible size={20} />
    );

    const cursor = getByText('▊');
    const style = Array.isArray(cursor.props.style) ? Object.assign({}, ...cursor.props.style) : cursor.props.style;
    expect(style.fontSize).toBe(20);
  });

  it('renders dots variant with three animated dots', () => {
    const { UNSAFE_queryAllByType } = renderWithProviders(
      <StreamingIndicator visible variant="dots" size={12} color="#FF0000" />
    );

    const animatedViews = UNSAFE_queryAllByType(Animated.View);
    const dots = animatedViews.filter(node => {
      const style = Array.isArray(node.props.style) ? Object.assign({}, ...node.props.style) : node.props.style;
      return style && style.backgroundColor === '#FF0000';
    });

    expect(dots).toHaveLength(3);
  });
});
