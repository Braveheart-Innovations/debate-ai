import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ResponsiveContainer } from '@/components/atoms/layout/ResponsiveContainer';
import useWindowDimensions from 'react-native/Libraries/Utilities/useWindowDimensions';

const mockUseWindowDimensions = useWindowDimensions as jest.Mock;

// Helper to extract styles from the component tree
const getContainerStyles = (tree: any) => {
  // The container is the root View
  const styles = tree.props?.style;
  if (Array.isArray(styles)) {
    return Object.assign({}, ...styles.filter(Boolean));
  }
  return styles || {};
};

describe('ResponsiveContainer', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('phone behavior', () => {
    beforeEach(() => {
      // Use dimensions where max < 768 for phone classification
      mockUseWindowDimensions.mockReturnValue({ width: 375, height: 667 });
    });

    it('renders children correctly', () => {
      const { getByText } = render(
        <ResponsiveContainer>
          <Text>Test Child</Text>
        </ResponsiveContainer>
      );
      expect(getByText('Test Child')).toBeTruthy();
    });

    it('has full width on phone', () => {
      const { toJSON } = render(
        <ResponsiveContainer>
          <Text>Content</Text>
        </ResponsiveContainer>
      );

      const tree = toJSON();
      const styles = getContainerStyles(tree);
      expect(styles.width).toBe('100%');
    });

    it('does not apply maxWidth on phone', () => {
      const { toJSON } = render(
        <ResponsiveContainer maxWidth="lg">
          <Text>Content</Text>
        </ResponsiveContainer>
      );

      const tree = toJSON();
      const styles = getContainerStyles(tree);
      expect(styles.maxWidth).toBeUndefined();
    });
  });

  describe('tablet behavior', () => {
    beforeEach(() => {
      mockUseWindowDimensions.mockReturnValue({ width: 768, height: 1024 });
    });

    it('applies maxWidth on tablet with default lg size', () => {
      const { toJSON } = render(
        <ResponsiveContainer>
          <Text>Content</Text>
        </ResponsiveContainer>
      );

      const tree = toJSON();
      const styles = getContainerStyles(tree);
      expect(styles.maxWidth).toBe(960); // lg = 960
    });

    it('applies sm maxWidth (540px)', () => {
      const { toJSON } = render(
        <ResponsiveContainer maxWidth="sm">
          <Text>Content</Text>
        </ResponsiveContainer>
      );

      const tree = toJSON();
      const styles = getContainerStyles(tree);
      expect(styles.maxWidth).toBe(540);
    });

    it('applies md maxWidth (720px)', () => {
      const { toJSON } = render(
        <ResponsiveContainer maxWidth="md">
          <Text>Content</Text>
        </ResponsiveContainer>
      );

      const tree = toJSON();
      const styles = getContainerStyles(tree);
      expect(styles.maxWidth).toBe(720);
    });

    it('applies lg maxWidth (960px)', () => {
      const { toJSON } = render(
        <ResponsiveContainer maxWidth="lg">
          <Text>Content</Text>
        </ResponsiveContainer>
      );

      const tree = toJSON();
      const styles = getContainerStyles(tree);
      expect(styles.maxWidth).toBe(960);
    });

    it('applies xl maxWidth (1140px)', () => {
      const { toJSON } = render(
        <ResponsiveContainer maxWidth="xl">
          <Text>Content</Text>
        </ResponsiveContainer>
      );

      const tree = toJSON();
      const styles = getContainerStyles(tree);
      expect(styles.maxWidth).toBe(1140);
    });

    it('does not apply maxWidth when set to none', () => {
      const { toJSON } = render(
        <ResponsiveContainer maxWidth="none">
          <Text>Content</Text>
        </ResponsiveContainer>
      );

      const tree = toJSON();
      const styles = getContainerStyles(tree);
      expect(styles.maxWidth).toBeUndefined();
    });

    it('centers container by default', () => {
      const { toJSON } = render(
        <ResponsiveContainer>
          <Text>Content</Text>
        </ResponsiveContainer>
      );

      const tree = toJSON();
      const styles = getContainerStyles(tree);
      expect(styles.alignSelf).toBe('center');
    });

    it('aligns to flex-start when center is false', () => {
      const { toJSON } = render(
        <ResponsiveContainer center={false}>
          <Text>Content</Text>
        </ResponsiveContainer>
      );

      const tree = toJSON();
      const styles = getContainerStyles(tree);
      expect(styles.alignSelf).toBe('flex-start');
    });
  });

  describe('custom styles', () => {
    it('merges custom style prop', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 768, height: 1024 });

      const { toJSON } = render(
        <ResponsiveContainer style={{ backgroundColor: 'red', padding: 20 }}>
          <Text>Content</Text>
        </ResponsiveContainer>
      );

      const tree = toJSON();
      const styles = getContainerStyles(tree);
      expect(styles.backgroundColor).toBe('red');
      expect(styles.padding).toBe(20);
    });

    it('custom styles merge with maxWidth on tablet', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 768, height: 1024 });

      const { toJSON } = render(
        <ResponsiveContainer maxWidth="md" style={{ padding: 20 }}>
          <Text>Content</Text>
        </ResponsiveContainer>
      );

      const tree = toJSON();
      const styles = getContainerStyles(tree);
      expect(styles.maxWidth).toBe(720);
      expect(styles.padding).toBe(20);
    });
  });

  describe('iPad Pro scenarios', () => {
    it('applies maxWidth on iPad Pro 11" portrait', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 834, height: 1194 });

      const { toJSON } = render(
        <ResponsiveContainer maxWidth="lg">
          <Text>Content</Text>
        </ResponsiveContainer>
      );

      const tree = toJSON();
      const styles = getContainerStyles(tree);
      expect(styles.maxWidth).toBe(960);
    });

    it('applies maxWidth on iPad Pro 12.9" landscape', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 1366, height: 1024 });

      const { toJSON } = render(
        <ResponsiveContainer maxWidth="xl">
          <Text>Content</Text>
        </ResponsiveContainer>
      );

      const tree = toJSON();
      const styles = getContainerStyles(tree);
      expect(styles.maxWidth).toBe(1140);
    });
  });
});
