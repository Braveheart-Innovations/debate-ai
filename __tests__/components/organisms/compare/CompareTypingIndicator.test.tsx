import { StyleSheet } from 'react-native';
import type { ReactTestRendererJSON, ReactTestRendererNode } from 'react-test-renderer';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { CompareTypingIndicator } from '@/components/organisms/compare/CompareTypingIndicator';

/** Narrows a rendered node to an element (fails the test on text or a missing node). */
const asElement = (node: ReactTestRendererNode | undefined): ReactTestRendererJSON => {
  if (node === undefined || typeof node === 'string') {
    throw new Error('Expected a rendered element');
  }
  return node;
};

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
    const root = asElement(Array.isArray(tree) ? tree[0] : (tree ?? undefined));
    const dotsWrapper = asElement(root.children?.[0]);
    expect(dotsWrapper.children?.length).toBe(3);
    dotsWrapper.children?.forEach((child) => {
      const colorStyle = StyleSheet.flatten(asElement(child).props.style);
      expect(colorStyle?.backgroundColor).toBe('#ff00ff');
    });
  });
});
