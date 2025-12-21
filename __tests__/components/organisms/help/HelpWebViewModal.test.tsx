import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

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

const { HelpWebViewModal } = require('@/components/organisms/help/HelpWebViewModal');

describe('HelpWebViewModal', () => {
  const mockOnClose = jest.fn();
  const testUrl = 'https://example.com/help';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('visibility', () => {
    it('returns null when url is null', () => {
      const { queryByText } = renderWithProviders(
        <HelpWebViewModal visible={true} url={null} onClose={mockOnClose} />
      );
      expect(queryByText('Close')).toBeNull();
    });

    it('renders when visible and url is provided', () => {
      const { getByText } = renderWithProviders(
        <HelpWebViewModal
          visible={true}
          url={testUrl}
          onClose={mockOnClose}
        />
      );
      expect(getByText('Close')).toBeTruthy();
    });
  });

  describe('header', () => {
    it('displays Close button', () => {
      const { getByText } = renderWithProviders(
        <HelpWebViewModal
          visible={true}
          url={testUrl}
          onClose={mockOnClose}
        />
      );
      expect(getByText('Close')).toBeTruthy();
    });

    it('displays default title "Help"', () => {
      const { getByText } = renderWithProviders(
        <HelpWebViewModal
          visible={true}
          url={testUrl}
          onClose={mockOnClose}
        />
      );
      expect(getByText('Help')).toBeTruthy();
    });

    it('displays custom title when provided', () => {
      const { getByText } = renderWithProviders(
        <HelpWebViewModal
          visible={true}
          url={testUrl}
          title="Privacy Policy"
          onClose={mockOnClose}
        />
      );
      expect(getByText('Privacy Policy')).toBeTruthy();
    });

    it('displays Open in Browser button', () => {
      const { getByText } = renderWithProviders(
        <HelpWebViewModal
          visible={true}
          url={testUrl}
          onClose={mockOnClose}
        />
      );
      expect(getByText('Open in Browser')).toBeTruthy();
    });
  });

  describe('close functionality', () => {
    it('calls onClose when Close is pressed', () => {
      const { getByText } = renderWithProviders(
        <HelpWebViewModal
          visible={true}
          url={testUrl}
          onClose={mockOnClose}
        />
      );
      fireEvent.press(getByText('Close'));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Open in Browser functionality', () => {
    it('opens URL in browser when Open in Browser is pressed', async () => {
      const { getByText } = renderWithProviders(
        <HelpWebViewModal
          visible={true}
          url={testUrl}
          onClose={mockOnClose}
        />
      );
      fireEvent.press(getByText('Open in Browser'));
      await waitFor(() => {
        expect(Linking.openURL).toHaveBeenCalledWith(testUrl);
      });
    });
  });

  describe('different URLs', () => {
    it('works with privacy policy URL', () => {
      const { getByText } = renderWithProviders(
        <HelpWebViewModal
          visible={true}
          url="https://debateai.app/privacy"
          title="Privacy Policy"
          onClose={mockOnClose}
        />
      );
      expect(getByText('Privacy Policy')).toBeTruthy();
    });

    it('works with terms of service URL', () => {
      const { getByText } = renderWithProviders(
        <HelpWebViewModal
          visible={true}
          url="https://debateai.app/terms"
          title="Terms of Service"
          onClose={mockOnClose}
        />
      );
      expect(getByText('Terms of Service')).toBeTruthy();
    });
  });
});
