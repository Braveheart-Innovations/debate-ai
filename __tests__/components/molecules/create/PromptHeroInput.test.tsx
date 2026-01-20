/**
 * Tests for PromptHeroInput - Hero prompt input for Create mode
 */
import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      View: View,
    },
    useSharedValue: (initial: number) => ({ value: initial }),
    useAnimatedStyle: () => ({}),
    withTiming: (value: number) => value,
  };
});

jest.mock('@/components/molecules/common/Typography', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children, testID, style }: { children: React.ReactNode; testID?: string; style?: any }) =>
      React.createElement(Text, { testID, style }, children),
  };
});

const { PromptHeroInput } = require('@/components/molecules/create/PromptHeroInput');

describe('PromptHeroInput', () => {
  const defaultProps = {
    value: '',
    onChangeText: jest.fn(),
    maxLength: 4000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders with default placeholder', () => {
      const { getByPlaceholderText } = renderWithProviders(
        <PromptHeroInput {...defaultProps} />
      );

      expect(getByPlaceholderText('Describe what you want to create...')).toBeTruthy();
    });

    it('renders with custom placeholder', () => {
      const { getByPlaceholderText } = renderWithProviders(
        <PromptHeroInput {...defaultProps} placeholder="Custom placeholder" />
      );

      expect(getByPlaceholderText('Custom placeholder')).toBeTruthy();
    });

    it('displays character count', () => {
      const { getByText } = renderWithProviders(
        <PromptHeroInput {...defaultProps} value="Hello" />
      );

      expect(getByText('5/4,000')).toBeTruthy();
    });

    it('displays current value', () => {
      const { getByDisplayValue } = renderWithProviders(
        <PromptHeroInput {...defaultProps} value="Test prompt" />
      );

      expect(getByDisplayValue('Test prompt')).toBeTruthy();
    });
  });

  describe('interaction', () => {
    it('calls onChangeText when text changes', () => {
      const onChangeText = jest.fn();
      const { getByPlaceholderText } = renderWithProviders(
        <PromptHeroInput {...defaultProps} onChangeText={onChangeText} />
      );

      const input = getByPlaceholderText('Describe what you want to create...');
      fireEvent.changeText(input, 'A beautiful landscape');

      expect(onChangeText).toHaveBeenCalledWith('A beautiful landscape');
    });

    it('respects maxLength prop', () => {
      const { getByPlaceholderText } = renderWithProviders(
        <PromptHeroInput {...defaultProps} maxLength={100} />
      );

      const input = getByPlaceholderText('Describe what you want to create...');
      expect(input.props.maxLength).toBe(100);
    });
  });

  describe('character count formatting', () => {
    it('formats character count with locale separators', () => {
      const { getByText } = renderWithProviders(
        <PromptHeroInput {...defaultProps} value={'a'.repeat(1234)} maxLength={4000} />
      );

      expect(getByText('1,234/4,000')).toBeTruthy();
    });

    it('shows zero count for empty input', () => {
      const { getByText } = renderWithProviders(
        <PromptHeroInput {...defaultProps} value="" maxLength={4000} />
      );

      expect(getByText('0/4,000')).toBeTruthy();
    });
  });

  describe('accessibility', () => {
    it('has correct accessibility label', () => {
      const { getByLabelText } = renderWithProviders(
        <PromptHeroInput {...defaultProps} />
      );

      expect(getByLabelText('Image prompt input')).toBeTruthy();
    });
  });
});
