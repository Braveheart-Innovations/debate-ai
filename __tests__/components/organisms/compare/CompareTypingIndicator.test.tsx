import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { CompareTypingIndicator } from '@/components/organisms/compare/CompareTypingIndicator';

jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

describe('CompareTypingIndicator', () => {
  it('returns null when not visible', () => {
    const { toJSON } = renderWithProviders(
      <CompareTypingIndicator isVisible={false} />
    );

    expect(toJSON()).toBeNull();
  });

  it('renders three dots with provided accent color', () => {
    const { toJSON } = renderWithProviders(
      <CompareTypingIndicator isVisible accentColor="#ff00ff" />
    );

    const tree = toJSON();
    expect(tree).not.toBeNull();
    const dotsWrapper = tree && tree.children && tree.children[0];
    expect(dotsWrapper?.children?.length).toBe(3);
    dotsWrapper?.children?.forEach((child: any) => {
      const styles = Array.isArray(child.props.style) ? child.props.style : [child.props.style];
      const colorStyle = styles.find((style) => style?.backgroundColor);
      expect(colorStyle?.backgroundColor).toBe('#ff00ff');
    });
  });
});
