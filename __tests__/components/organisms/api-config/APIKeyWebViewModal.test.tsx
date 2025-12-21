import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

// Mock react-native-webview
jest.mock('react-native-webview', () => ({
  WebView: 'WebView',
}));

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: {
    Success: 'success',
  },
}));

// Mock Alert.alert
jest.spyOn(Alert, 'alert');

// Mock Linking.openURL
jest.spyOn(Linking, 'openURL').mockImplementation(() => Promise.resolve());

const { APIKeyWebViewModal } = require('@/components/organisms/api-config/APIKeyWebViewModal');

const mockProvider = {
  id: 'openai',
  name: 'OpenAI',
  description: 'Access GPT models',
  gradient: ['#10A37F', '#1A7F64'],
  getKeyUrl: 'https://platform.openai.com/api-keys',
  guidance: {
    estimatedTime: '2-3 min',
    difficulty: 'easy' as const,
    steps: [
      {
        title: 'Sign in',
        instruction: 'Log in to your account',
        urlPattern: 'auth',
      },
    ],
    tips: [],
  },
};

describe('APIKeyWebViewModal', () => {
  const mockOnKeyObtained = jest.fn();
  const mockOnClose = jest.fn();
  const mockOnFallbackToBrowser = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('visibility', () => {
    it('returns null when provider is null', () => {
      const { queryByText } = renderWithProviders(
        <APIKeyWebViewModal
          visible={true}
          provider={null}
          onKeyObtained={mockOnKeyObtained}
          onClose={mockOnClose}
          onFallbackToBrowser={mockOnFallbackToBrowser}
        />
      );
      expect(queryByText('Close')).toBeNull();
    });

    it('renders when visible and provider is provided', () => {
      const { getByText } = renderWithProviders(
        <APIKeyWebViewModal
          visible={true}
          provider={mockProvider}
          onKeyObtained={mockOnKeyObtained}
          onClose={mockOnClose}
          onFallbackToBrowser={mockOnFallbackToBrowser}
        />
      );
      expect(getByText('Close')).toBeTruthy();
    });
  });

  describe('header', () => {
    it('displays Close button', () => {
      const { getByText } = renderWithProviders(
        <APIKeyWebViewModal
          visible={true}
          provider={mockProvider}
          onKeyObtained={mockOnKeyObtained}
          onClose={mockOnClose}
          onFallbackToBrowser={mockOnFallbackToBrowser}
        />
      );
      expect(getByText('Close')).toBeTruthy();
    });

    it('displays provider name', () => {
      const { getByText } = renderWithProviders(
        <APIKeyWebViewModal
          visible={true}
          provider={mockProvider}
          onKeyObtained={mockOnKeyObtained}
          onClose={mockOnClose}
          onFallbackToBrowser={mockOnFallbackToBrowser}
        />
      );
      expect(getByText('OpenAI')).toBeTruthy();
    });

    it('displays Open in Browser button', () => {
      const { getByText } = renderWithProviders(
        <APIKeyWebViewModal
          visible={true}
          provider={mockProvider}
          onKeyObtained={mockOnKeyObtained}
          onClose={mockOnClose}
          onFallbackToBrowser={mockOnFallbackToBrowser}
        />
      );
      expect(getByText('Open in Browser')).toBeTruthy();
    });
  });

  describe('close functionality', () => {
    it('shows confirmation alert when Close is pressed', () => {
      const { getByText } = renderWithProviders(
        <APIKeyWebViewModal
          visible={true}
          provider={mockProvider}
          onKeyObtained={mockOnKeyObtained}
          onClose={mockOnClose}
          onFallbackToBrowser={mockOnFallbackToBrowser}
        />
      );
      fireEvent.press(getByText('Close'));
      expect(Alert.alert).toHaveBeenCalledWith(
        'Leave?',
        'Are you sure you want to close? You can always come back later.',
        expect.any(Array)
      );
    });
  });

  describe('Open in Browser functionality', () => {
    it('opens URL in browser when Open in Browser is pressed', async () => {
      const { getByText } = renderWithProviders(
        <APIKeyWebViewModal
          visible={true}
          provider={mockProvider}
          onKeyObtained={mockOnKeyObtained}
          onClose={mockOnClose}
          onFallbackToBrowser={mockOnFallbackToBrowser}
        />
      );
      fireEvent.press(getByText('Open in Browser'));
      await waitFor(() => {
        expect(Linking.openURL).toHaveBeenCalledWith(
          'https://platform.openai.com/api-keys'
        );
      });
    });

    it('calls onFallbackToBrowser after opening URL', async () => {
      const { getByText } = renderWithProviders(
        <APIKeyWebViewModal
          visible={true}
          provider={mockProvider}
          onKeyObtained={mockOnKeyObtained}
          onClose={mockOnClose}
          onFallbackToBrowser={mockOnFallbackToBrowser}
        />
      );
      fireEvent.press(getByText('Open in Browser'));
      await waitFor(() => {
        expect(mockOnFallbackToBrowser).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('bottom action bar', () => {
    it('displays I\'ve Copied My Key button', () => {
      const { getByText } = renderWithProviders(
        <APIKeyWebViewModal
          visible={true}
          provider={mockProvider}
          onKeyObtained={mockOnKeyObtained}
          onClose={mockOnClose}
          onFallbackToBrowser={mockOnFallbackToBrowser}
        />
      );
      expect(getByText("I've Copied My Key")).toBeTruthy();
    });

    it('calls onKeyObtained when I\'ve Copied My Key is pressed', () => {
      const Haptics = require('expo-haptics');
      const { getByText } = renderWithProviders(
        <APIKeyWebViewModal
          visible={true}
          provider={mockProvider}
          onKeyObtained={mockOnKeyObtained}
          onClose={mockOnClose}
          onFallbackToBrowser={mockOnFallbackToBrowser}
        />
      );
      fireEvent.press(getByText("I've Copied My Key"));
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Success
      );
      expect(mockOnKeyObtained).toHaveBeenCalledTimes(1);
    });
  });
});
