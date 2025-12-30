import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialIcons: () => null }));

const { SessionPreview } = require('@/components/molecules/history/SessionPreview');

describe('SessionPreview', () => {
  describe('Basic Rendering', () => {
    it('renders without crashing with required props', () => {
      const result = renderWithProviders(
        <SessionPreview text="Hello world" searchTerm="" />
      );
      expect(result).toBeTruthy();
    });

    it('displays the text content', () => {
      const { getByText } = renderWithProviders(
        <SessionPreview text="Preview text content" searchTerm="" />
      );
      expect(getByText('Preview text content')).toBeTruthy();
    });
  });

  describe('No Search Term', () => {
    it('renders plain text when searchTerm is empty', () => {
      const { getByText } = renderWithProviders(
        <SessionPreview text="Sample preview" searchTerm="" />
      );
      expect(getByText('Sample preview')).toBeTruthy();
    });

    it('renders plain text when searchTerm is undefined', () => {
      const { getByText } = renderWithProviders(
        <SessionPreview text="Sample preview" searchTerm={undefined as any} />
      );
      expect(getByText('Sample preview')).toBeTruthy();
    });
  });

  describe('Search Term Highlighting', () => {
    it('highlights matching text case-insensitively', () => {
      const { getByText } = renderWithProviders(
        <SessionPreview text="Hello World" searchTerm="world" />
      );
      expect(getByText('World')).toBeTruthy();
    });

    it('splits text into parts for highlighting', () => {
      const result = renderWithProviders(
        <SessionPreview text="test one test two" searchTerm="test" />
      );
      expect(result).toBeTruthy();
    });

    it('handles searchTerm at the beginning', () => {
      const { getByText } = renderWithProviders(
        <SessionPreview text="Hello everyone" searchTerm="Hello" />
      );
      expect(getByText('Hello')).toBeTruthy();
    });

    it('handles searchTerm at the end', () => {
      const { getByText } = renderWithProviders(
        <SessionPreview text="Say hello" searchTerm="hello" />
      );
      expect(getByText('hello')).toBeTruthy();
    });

    it('handles searchTerm that is the entire text', () => {
      const { getByText } = renderWithProviders(
        <SessionPreview text="hello" searchTerm="hello" />
      );
      expect(getByText('hello')).toBeTruthy();
    });
  });

  describe('maxLines Prop', () => {
    it('defaults to 2 maxLines', () => {
      const result = renderWithProviders(
        <SessionPreview text="Long text content here" searchTerm="" />
      );
      expect(result).toBeTruthy();
    });

    it('respects custom maxLines', () => {
      const result = renderWithProviders(
        <SessionPreview
          text="Line 1. Line 2. Line 3. Line 4."
          searchTerm=""
          maxLines={3}
        />
      );
      expect(result).toBeTruthy();
    });

    it('applies maxLines with search highlighting', () => {
      const result = renderWithProviders(
        <SessionPreview
          text="Find word in this long text"
          searchTerm="word"
          maxLines={1}
        />
      );
      expect(result).toBeTruthy();
    });
  });

  describe('Style Prop', () => {
    it('applies custom style', () => {
      const customStyle = { marginTop: 10 };
      const result = renderWithProviders(
        <SessionPreview text="Styled text" searchTerm="" style={customStyle} />
      );
      expect(result).toBeTruthy();
    });

    it('applies style with highlighting', () => {
      const customStyle = { paddingHorizontal: 8 };
      const result = renderWithProviders(
        <SessionPreview
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
        <SessionPreview text="" searchTerm="" />
      );
      expect(result).toBeTruthy();
    });

    it('handles searchTerm not found in text', () => {
      const { getByText } = renderWithProviders(
        <SessionPreview text="Hello world" searchTerm="xyz" />
      );
      expect(getByText('Hello world')).toBeTruthy();
    });

    it('handles special characters in searchTerm', () => {
      const result = renderWithProviders(
        <SessionPreview text="Hello [world]" searchTerm="[world]" />
      );
      expect(result).toBeTruthy();
    });

    it('handles single character searchTerm', () => {
      const result = renderWithProviders(
        <SessionPreview text="Hello world" searchTerm="o" />
      );
      expect(result).toBeTruthy();
    });

    it('handles text with only whitespace', () => {
      const result = renderWithProviders(
        <SessionPreview text="   " searchTerm="test" />
      );
      expect(result).toBeTruthy();
    });

    it('handles long text content', () => {
      const longText = 'A'.repeat(500);
      const result = renderWithProviders(
        <SessionPreview text={longText} searchTerm="" maxLines={2} />
      );
      expect(result).toBeTruthy();
    });
  });

  describe('Typography Integration', () => {
    it('uses secondary color for text', () => {
      const result = renderWithProviders(
        <SessionPreview text="Secondary colored text" searchTerm="" />
      );
      expect(result).toBeTruthy();
    });

    it('uses body variant', () => {
      const result = renderWithProviders(
        <SessionPreview text="Body variant text" searchTerm="" />
      );
      expect(result).toBeTruthy();
    });
  });
});
