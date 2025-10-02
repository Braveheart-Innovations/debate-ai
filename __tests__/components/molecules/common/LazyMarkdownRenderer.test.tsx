import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('react-native-markdown-display', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children: string }) =>
      React.createElement(Text, null, children),
  };
});

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

jest.mock('@/utils/markdown', () => ({
  splitForLazyRender: (content: string, chunkSize: number) => {
    // Simple mock implementation for testing
    const chunks = [];
    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.slice(i, i + chunkSize));
    }
    return chunks.length > 0 ? chunks : [content];
  },
}));

const { LazyMarkdownRenderer, createMarkdownStyles } = require('@/components/molecules/common/LazyMarkdownRenderer');

describe('LazyMarkdownRenderer', () => {
  const mockStyles = {
    body: { fontSize: 16 },
    heading1: { fontSize: 24 },
  };

  it('renders short content in single chunk', () => {
    const { getByText } = renderWithProviders(
      <LazyMarkdownRenderer
        content="Short content"
        style={mockStyles}
      />
    );

    expect(getByText('Short content')).toBeTruthy();
  });

  it('shows load more button for long content', () => {
    const longContent = 'a'.repeat(15000); // Larger than default chunkSize
    const { getByText } = renderWithProviders(
      <LazyMarkdownRenderer
        content={longContent}
        style={mockStyles}
        chunkSize={10000}
      />
    );

    expect(getByText(/Load more/)).toBeTruthy();
  });

  it('loads more chunks when load more pressed', () => {
    const longContent = 'a'.repeat(15000);
    const { getByText } = renderWithProviders(
      <LazyMarkdownRenderer
        content={longContent}
        style={mockStyles}
        chunkSize={5000}
      />
    );

    const loadMoreButton = getByText(/Load more/);
    fireEvent.press(loadMoreButton);

    // Should show remaining chunks count
    expect(getByText(/chunks remaining/)).toBeTruthy();
  });

  it('uses custom loadMoreText', () => {
    const longContent = 'a'.repeat(15000);
    const { getByText } = renderWithProviders(
      <LazyMarkdownRenderer
        content={longContent}
        style={mockStyles}
        chunkSize={10000}
        loadMoreText="Show more"
      />
    );

    expect(getByText(/Show more/)).toBeTruthy();
  });

  it('hides load more button when all chunks loaded', () => {
    const shortContent = 'Short text';
    const { queryByText } = renderWithProviders(
      <LazyMarkdownRenderer
        content={shortContent}
        style={mockStyles}
        chunkSize={10000}
      />
    );

    expect(queryByText(/Load more/)).toBeNull();
  });

  it('handles custom link press handler', () => {
    const onLinkPress = jest.fn(() => true);
    const { getByText } = renderWithProviders(
      <LazyMarkdownRenderer
        content="Test content"
        style={mockStyles}
        onLinkPress={onLinkPress}
      />
    );

    expect(getByText('Test content')).toBeTruthy();
  });
});

describe('createMarkdownStyles', () => {
  const mockTheme = {
    colors: {
      text: { primary: '#000000' },
      primary: { 500: '#0066CC', 600: '#0052A3', 700: '#003D7A' },
      gray: { 50: '#F7F7F7', 100: '#E1E1E1', 800: '#424242' },
      warning: { 50: '#FFF8E1' },
      success: { 500: '#4CAF50' },
    },
  };

  it('creates markdown styles for light theme', () => {
    const styles = createMarkdownStyles(mockTheme, false);

    expect(styles.body).toBeDefined();
    expect(styles.heading1).toBeDefined();
    expect(styles.link).toBeDefined();
  });

  it('creates markdown styles for dark theme', () => {
    const styles = createMarkdownStyles(mockTheme, true);

    expect(styles.body).toBeDefined();
    expect(styles.code_block).toBeDefined();
  });

  it('includes all required style properties', () => {
    const styles = createMarkdownStyles(mockTheme, false);

    expect(styles.body).toHaveProperty('fontSize');
    expect(styles.heading1).toHaveProperty('fontWeight');
    expect(styles.code_inline).toHaveProperty('fontFamily');
  });
});