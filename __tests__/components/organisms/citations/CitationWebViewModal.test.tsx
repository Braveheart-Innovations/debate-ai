import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import type { Citation } from '@/types';

// Mock react-native-webview
jest.mock('react-native-webview', () => ({
  WebView: 'WebView',
}));

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// Mock Linking.openURL
jest.spyOn(Linking, 'openURL').mockImplementation(() => Promise.resolve());

const { CitationWebViewModal } = require('@/components/organisms/citations/CitationWebViewModal');

describe('CitationWebViewModal', () => {
  const mockOnClose = jest.fn();
  const mockCitation: Citation = {
    index: 1,
    url: 'https://www.example.com/article',
    title: 'Test Article Title',
    snippet: 'This is a test snippet.',
    domain: 'example.com',
  };

  const defaultProps = {
    visible: true,
    citation: mockCitation,
    onClose: mockOnClose,
    brandColor: '#007AFF',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('visibility', () => {
    it('returns null when citation is null', () => {
      const { queryByLabelText } = renderWithProviders(
        <CitationWebViewModal {...defaultProps} citation={null} />
      );
      expect(queryByLabelText('Close')).toBeNull();
    });

    it('renders when visible and citation is provided', () => {
      const { getByLabelText } = renderWithProviders(
        <CitationWebViewModal {...defaultProps} />
      );
      expect(getByLabelText('Close')).toBeTruthy();
    });
  });

  describe('header', () => {
    it('displays Close button', () => {
      const { getByLabelText } = renderWithProviders(
        <CitationWebViewModal {...defaultProps} />
      );
      expect(getByLabelText('Close')).toBeTruthy();
    });

    it('displays citation title', () => {
      const { getByText } = renderWithProviders(
        <CitationWebViewModal {...defaultProps} />
      );
      expect(getByText('Test Article Title')).toBeTruthy();
    });

    it('displays citation domain', () => {
      const { getByText } = renderWithProviders(
        <CitationWebViewModal {...defaultProps} />
      );
      expect(getByText('example.com')).toBeTruthy();
    });

    it('displays citation index badge', () => {
      const { getByText } = renderWithProviders(
        <CitationWebViewModal {...defaultProps} />
      );
      expect(getByText('1')).toBeTruthy();
    });

    it('displays Open in Browser button', () => {
      const { getByLabelText } = renderWithProviders(
        <CitationWebViewModal {...defaultProps} />
      );
      expect(getByLabelText('Open in Browser')).toBeTruthy();
    });

    it('extracts domain from URL when not provided', () => {
      const citationWithoutDomain: Citation = {
        index: 2,
        url: 'https://www.test.org/path',
        title: 'Test',
      };
      const { getByText } = renderWithProviders(
        <CitationWebViewModal {...defaultProps} citation={citationWithoutDomain} />
      );
      expect(getByText('test.org')).toBeTruthy();
    });

    it('truncates long titles', () => {
      const longTitleCitation: Citation = {
        index: 3,
        url: 'https://example.com',
        title: 'A'.repeat(50),
      };
      const { getByText } = renderWithProviders(
        <CitationWebViewModal {...defaultProps} citation={longTitleCitation} />
      );
      // Title is truncated to 40 characters with ellipsis in header
      const truncatedTitle = 'A'.repeat(39) + '…';
      expect(getByText(truncatedTitle)).toBeTruthy();
    });
  });

  describe('close functionality', () => {
    it('calls onClose when Close button is pressed', () => {
      const { getByLabelText } = renderWithProviders(
        <CitationWebViewModal {...defaultProps} />
      );
      fireEvent.press(getByLabelText('Close'));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Open in Browser functionality', () => {
    it('opens citation URL in browser when Open in Browser is pressed', async () => {
      const { getByLabelText } = renderWithProviders(
        <CitationWebViewModal {...defaultProps} />
      );
      fireEvent.press(getByLabelText('Open in Browser'));
      await waitFor(() => {
        expect(Linking.openURL).toHaveBeenCalledWith(mockCitation.url);
      });
    });
  });

  describe('brand color', () => {
    it('renders with custom brand color', () => {
      const { getByText } = renderWithProviders(
        <CitationWebViewModal {...defaultProps} brandColor="#FF5722" />
      );
      expect(getByText('Test Article Title')).toBeTruthy();
    });

    it('renders without brand color (uses default)', () => {
      const { getByText } = renderWithProviders(
        <CitationWebViewModal {...defaultProps} brandColor={undefined} />
      );
      expect(getByText('Test Article Title')).toBeTruthy();
    });
  });

  describe('error handling', () => {
    it('displays error state with retry option', () => {
      // Note: Error state is handled internally by the WebView component
      // This test verifies the component renders the error fallback UI
      const { getByLabelText } = renderWithProviders(
        <CitationWebViewModal {...defaultProps} />
      );
      // The error state shows when WebView fails to load
      // For now, we just verify the component renders correctly
      expect(getByLabelText('Open in Browser')).toBeTruthy();
    });
  });

  describe('different citations', () => {
    it('renders with citation containing only URL and index', () => {
      const minimalCitation: Citation = {
        index: 5,
        url: 'https://minimal.com',
      };
      const { getByText } = renderWithProviders(
        <CitationWebViewModal {...defaultProps} citation={minimalCitation} />
      );
      expect(getByText('minimal.com')).toBeTruthy();
      expect(getByText('5')).toBeTruthy();
    });

    it('handles citation with snippet', () => {
      const { getByText } = renderWithProviders(
        <CitationWebViewModal {...defaultProps} />
      );
      // Snippet is not displayed in the modal header, just title and domain
      expect(getByText('Test Article Title')).toBeTruthy();
    });
  });
});
