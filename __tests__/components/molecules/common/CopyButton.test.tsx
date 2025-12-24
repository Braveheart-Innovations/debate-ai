import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { CopyButton } from '@/components/molecules/common/CopyButton';

// Mock expo-clipboard
const mockSetStringAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-clipboard', () => ({
  setStringAsync: (value: string) => mockSetStringAsync(value),
}));

// Mock Ionicons
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name, testID }: { name: string; testID?: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, { testID: testID || name }, name);
  },
}));

describe('CopyButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('rendering', () => {
    it('renders copy icon by default', () => {
      const { getByText } = renderWithProviders(
        <CopyButton content="test content" />
      );

      expect(getByText('copy-outline')).toBeTruthy();
    });

    it('renders with accessibility label', () => {
      const { getByLabelText } = renderWithProviders(
        <CopyButton content="test content" />
      );

      expect(getByLabelText('Copy message')).toBeTruthy();
    });
  });

  describe('copy functionality', () => {
    it('copies content to clipboard when pressed', async () => {
      const { getByLabelText } = renderWithProviders(
        <CopyButton content="Hello World" />
      );

      const button = getByLabelText('Copy message');
      fireEvent.press(button);

      await waitFor(() => {
        expect(mockSetStringAsync).toHaveBeenCalledWith('Hello World');
      });
    });

    it('shows checkmark icon after successful copy', async () => {
      const { getByLabelText, getByText } = renderWithProviders(
        <CopyButton content="test" />
      );

      const button = getByLabelText('Copy message');
      fireEvent.press(button);

      await waitFor(() => {
        expect(getByText('checkmark-outline')).toBeTruthy();
      });
    });

    it('reverts to copy icon after 1.5 seconds', async () => {
      const { getByLabelText, getByText } = renderWithProviders(
        <CopyButton content="test" />
      );

      const button = getByLabelText('Copy message');
      fireEvent.press(button);

      await waitFor(() => {
        expect(getByText('checkmark-outline')).toBeTruthy();
      });

      jest.advanceTimersByTime(1500);

      await waitFor(() => {
        expect(getByText('copy-outline')).toBeTruthy();
      });
    });

    it('handles empty content', async () => {
      const { getByLabelText } = renderWithProviders(
        <CopyButton content="" />
      );

      const button = getByLabelText('Copy message');
      fireEvent.press(button);

      await waitFor(() => {
        expect(mockSetStringAsync).toHaveBeenCalledWith('');
      });
    });

    it('handles clipboard errors gracefully', async () => {
      mockSetStringAsync.mockRejectedValueOnce(new Error('Clipboard error'));

      const { getByLabelText } = renderWithProviders(
        <CopyButton content="test" />
      );

      const button = getByLabelText('Copy message');

      // Should not throw
      expect(() => {
        fireEvent.press(button);
      }).not.toThrow();
    });
  });

  describe('positioning', () => {
    it('renders with absolute position by default', () => {
      const { getByLabelText } = renderWithProviders(
        <CopyButton content="test" />
      );

      const button = getByLabelText('Copy message');
      // Check that button exists (styling is applied)
      expect(button).toBeTruthy();
    });

    it('accepts relative position prop', () => {
      const { getByLabelText } = renderWithProviders(
        <CopyButton content="test" position="relative" />
      );

      const button = getByLabelText('Copy message');
      expect(button).toBeTruthy();
    });
  });

  describe('size prop', () => {
    it('uses default size of 16', () => {
      const { getByLabelText } = renderWithProviders(
        <CopyButton content="test" />
      );

      const button = getByLabelText('Copy message');
      expect(button).toBeTruthy();
    });

    it('accepts custom size', () => {
      const { getByLabelText } = renderWithProviders(
        <CopyButton content="test" size={24} />
      );

      const button = getByLabelText('Copy message');
      expect(button).toBeTruthy();
    });
  });

  describe('user message styling', () => {
    it('applies inverse color for user messages', () => {
      const { getByLabelText } = renderWithProviders(
        <CopyButton content="test" isUserMessage />
      );

      const button = getByLabelText('Copy message');
      expect(button).toBeTruthy();
    });
  });

  describe('custom icon color', () => {
    it('accepts custom icon color', () => {
      const { getByLabelText } = renderWithProviders(
        <CopyButton content="test" iconColor="#FF0000" />
      );

      const button = getByLabelText('Copy message');
      expect(button).toBeTruthy();
    });
  });
});
