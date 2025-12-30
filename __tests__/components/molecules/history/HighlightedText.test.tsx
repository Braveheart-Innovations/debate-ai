import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialIcons: () => null }));

const { HighlightedText } = require('@/components/molecules/history/HighlightedText');

describe('HighlightedText', () => {
  describe('Basic Rendering', () => {
    it('renders without crashing with required props', () => {
      const result = renderWithProviders(
        <HighlightedText text="Hello world" searchTerm="" />
      );
      expect(result).toBeTruthy();
    });

    it('displays the text content', () => {
      const { getByText } = renderWithProviders(
        <HighlightedText text="Hello world" searchTerm="" />
      );
      expect(getByText('Hello world')).toBeTruthy();
    });
  });

  describe('No Search Term', () => {
    it('renders plain text when searchTerm is empty', () => {
      const { getByText } = renderWithProviders(
        <HighlightedText text="Sample text content" searchTerm="" />
      );
      expect(getByText('Sample text content')).toBeTruthy();
    });

    it('renders plain text when searchTerm is undefined', () => {
      const { getByText } = renderWithProviders(
        <HighlightedText text="Sample text content" searchTerm={undefined as any} />
      );
      expect(getByText('Sample text content')).toBeTruthy();
    });
  });

  describe('Search Term Highlighting', () => {
    it('highlights matching text case-insensitively', () => {
      const { getByText } = renderWithProviders(
        <HighlightedText text="Hello World" searchTerm="world" />
      );
      expect(getByText('World')).toBeTruthy();
    });

    it('highlights multiple occurrences', () => {
      const result = renderWithProviders(
        <HighlightedText text="test one test two test three" searchTerm="test" />
      );
      expect(result).toBeTruthy();
    });

    it('handles searchTerm at the beginning of text', () => {
      const { getByText } = renderWithProviders(
        <HighlightedText text="Hello everyone" searchTerm="Hello" />
      );
      expect(getByText('Hello')).toBeTruthy();
    });

    it('handles searchTerm at the end of text', () => {
      const { getByText } = renderWithProviders(
        <HighlightedText text="Say hello" searchTerm="hello" />
      );
      expect(getByText('hello')).toBeTruthy();
    });

    it('handles searchTerm that is the entire text', () => {
      const { getByText } = renderWithProviders(
        <HighlightedText text="hello" searchTerm="hello" />
      );
      expect(getByText('hello')).toBeTruthy();
    });
  });

  describe('Special Characters', () => {
    it('handles regex special characters in searchTerm', () => {
      const result = renderWithProviders(
        <HighlightedText text="Hello [world]" searchTerm="[world]" />
      );
      expect(result).toBeTruthy();
    });

    it('handles dots in searchTerm', () => {
      const result = renderWithProviders(
        <HighlightedText text="file.txt is here" searchTerm="file.txt" />
      );
      expect(result).toBeTruthy();
    });

    it('handles parentheses in searchTerm', () => {
      const result = renderWithProviders(
        <HighlightedText text="function(arg)" searchTerm="function(arg)" />
      );
      expect(result).toBeTruthy();
    });

    it('handles asterisks in searchTerm', () => {
      const result = renderWithProviders(
        <HighlightedText text="bold *text* here" searchTerm="*text*" />
      );
      expect(result).toBeTruthy();
    });
  });

  describe('Optional Props', () => {
    it('applies custom style', () => {
      const customStyle = { fontSize: 18, color: 'red' };
      const result = renderWithProviders(
        <HighlightedText text="Styled text" searchTerm="" style={customStyle} />
      );
      expect(result).toBeTruthy();
    });

    it('respects numberOfLines prop', () => {
      const result = renderWithProviders(
        <HighlightedText
          text="Line one. Line two. Line three. Line four."
          searchTerm=""
          numberOfLines={2}
        />
      );
      expect(result).toBeTruthy();
    });

    it('applies style with search highlighting', () => {
      const customStyle = { fontSize: 18 };
      const result = renderWithProviders(
        <HighlightedText
          text="Hello world"
          searchTerm="world"
          style={customStyle}
        />
      );
      expect(result).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty text', () => {
      const result = renderWithProviders(
        <HighlightedText text="" searchTerm="test" />
      );
      expect(result).toBeTruthy();
    });

    it('handles searchTerm not found in text', () => {
      const { getByText } = renderWithProviders(
        <HighlightedText text="Hello world" searchTerm="xyz" />
      );
      expect(getByText('Hello world')).toBeTruthy();
    });

    it('handles single character searchTerm', () => {
      const result = renderWithProviders(
        <HighlightedText text="Hello world" searchTerm="o" />
      );
      expect(result).toBeTruthy();
    });

    it('handles long searchTerm', () => {
      const longSearch = 'Hello world this is a very long search term';
      const result = renderWithProviders(
        <HighlightedText text={longSearch} searchTerm={longSearch} />
      );
      expect(result).toBeTruthy();
    });

    it('handles text with only whitespace', () => {
      const result = renderWithProviders(
        <HighlightedText text="   " searchTerm="test" />
      );
      expect(result).toBeTruthy();
    });
  });
});
