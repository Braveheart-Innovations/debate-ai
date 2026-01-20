/**
 * Tests for AdvancedOptionsSection - Collapsible advanced options for Create mode
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
      View: (props: any) => React.createElement(View, props),
    },
    useSharedValue: (initial: number) => ({ value: initial }),
    useAnimatedStyle: () => ({}),
    useDerivedValue: (fn: () => number) => ({ value: fn() }),
    withTiming: (value: number) => value,
    interpolate: (value: number) => value,
    Extrapolate: { CLAMP: 'clamp' },
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: (props: any) => React.createElement(Text, { testID: `icon-${props.name}` }, props.name),
  };
});

jest.mock('@/components/molecules/common/Typography', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
      React.createElement(Text, { testID }, children),
  };
});

jest.mock('@/config/create/sizeOptions', () => ({
  SIZE_OPTIONS: [
    { id: 'auto', label: 'Auto', icon: 'resize-outline', preview: 'Auto' },
    { id: 'square', label: 'Square', icon: 'square-outline', preview: '1:1' },
    { id: 'portrait', label: 'Portrait', icon: 'phone-portrait-outline', preview: '2:3' },
    { id: 'landscape', label: 'Landscape', icon: 'phone-landscape-outline', preview: '3:2' },
  ],
}));

const { AdvancedOptionsSection } = require('@/components/molecules/create/AdvancedOptionsSection');

describe('AdvancedOptionsSection', () => {
  const defaultProps = {
    selectedSize: 'auto' as const,
    onSizeChange: jest.fn(),
    selectedQuality: 'standard' as const,
    onQualityChange: jest.fn(),
    canRefine: true,
    onUploadImage: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders collapsed by default', () => {
      const { getByText, queryByText } = renderWithProviders(
        <AdvancedOptionsSection {...defaultProps} />
      );

      expect(getByText('Advanced Options')).toBeTruthy();
      // Content should not be visible when collapsed
      expect(queryByText('Aspect Ratio')).toBeNull();
    });

    it('renders header with options icon', () => {
      const { getByTestId } = renderWithProviders(
        <AdvancedOptionsSection {...defaultProps} />
      );

      expect(getByTestId('icon-options-outline')).toBeTruthy();
    });

    it('renders chevron icon', () => {
      const { getByTestId } = renderWithProviders(
        <AdvancedOptionsSection {...defaultProps} />
      );

      expect(getByTestId('icon-chevron-down')).toBeTruthy();
    });
  });

  describe('expand/collapse', () => {
    it('expands when header is pressed', () => {
      const { getByText } = renderWithProviders(
        <AdvancedOptionsSection {...defaultProps} />
      );

      fireEvent.press(getByText('Advanced Options'));

      expect(getByText('Aspect Ratio')).toBeTruthy();
      expect(getByText('Quality')).toBeTruthy();
      expect(getByText('Refine Existing Image')).toBeTruthy();
    });

    it('collapses when header is pressed again', () => {
      const { getByText, queryByText } = renderWithProviders(
        <AdvancedOptionsSection {...defaultProps} />
      );

      // Expand
      fireEvent.press(getByText('Advanced Options'));
      expect(getByText('Aspect Ratio')).toBeTruthy();

      // Collapse
      fireEvent.press(getByText('Advanced Options'));
      expect(queryByText('Aspect Ratio')).toBeNull();
    });
  });

  describe('size selection', () => {
    it('displays all size options when expanded', () => {
      const { getByText } = renderWithProviders(
        <AdvancedOptionsSection {...defaultProps} />
      );

      fireEvent.press(getByText('Advanced Options'));

      expect(getByText('Auto')).toBeTruthy();
      expect(getByText('1:1')).toBeTruthy();
      expect(getByText('2:3')).toBeTruthy();
      expect(getByText('3:2')).toBeTruthy();
    });

    it('calls onSizeChange when size option is pressed', () => {
      const onSizeChange = jest.fn();
      const { getByText } = renderWithProviders(
        <AdvancedOptionsSection {...defaultProps} onSizeChange={onSizeChange} />
      );

      fireEvent.press(getByText('Advanced Options'));
      fireEvent.press(getByText('1:1'));

      expect(onSizeChange).toHaveBeenCalledWith('square');
    });
  });

  describe('quality selection', () => {
    it('displays quality options when expanded', () => {
      const { getByText } = renderWithProviders(
        <AdvancedOptionsSection {...defaultProps} />
      );

      fireEvent.press(getByText('Advanced Options'));

      expect(getByText('Standard')).toBeTruthy();
      expect(getByText('HD')).toBeTruthy();
    });

    it('calls onQualityChange when quality option is pressed', () => {
      const onQualityChange = jest.fn();
      const { getByText } = renderWithProviders(
        <AdvancedOptionsSection {...defaultProps} onQualityChange={onQualityChange} />
      );

      fireEvent.press(getByText('Advanced Options'));
      fireEvent.press(getByText('HD'));

      expect(onQualityChange).toHaveBeenCalledWith('hd');
    });
  });

  describe('image refinement', () => {
    it('shows upload button when expanded', () => {
      const { getByText } = renderWithProviders(
        <AdvancedOptionsSection {...defaultProps} />
      );

      fireEvent.press(getByText('Advanced Options'));

      expect(getByText('Upload Image')).toBeTruthy();
    });

    it('calls onUploadImage when upload button is pressed', () => {
      const onUploadImage = jest.fn();
      const { getByText } = renderWithProviders(
        <AdvancedOptionsSection {...defaultProps} onUploadImage={onUploadImage} />
      );

      fireEvent.press(getByText('Advanced Options'));
      fireEvent.press(getByText('Upload Image'));

      expect(onUploadImage).toHaveBeenCalled();
    });

    it('disables upload when canRefine is false', () => {
      const onUploadImage = jest.fn();
      const { getByText } = renderWithProviders(
        <AdvancedOptionsSection {...defaultProps} canRefine={false} onUploadImage={onUploadImage} />
      );

      fireEvent.press(getByText('Advanced Options'));
      fireEvent.press(getByText('Upload Image'));

      expect(onUploadImage).not.toHaveBeenCalled();
    });

    it('shows disabled message when canRefine is false', () => {
      const { getByText } = renderWithProviders(
        <AdvancedOptionsSection {...defaultProps} canRefine={false} />
      );

      fireEvent.press(getByText('Advanced Options'));

      expect(getByText('Requires OpenAI or Google API key')).toBeTruthy();
    });

    it('shows enabled message when canRefine is true', () => {
      const { getByText } = renderWithProviders(
        <AdvancedOptionsSection {...defaultProps} canRefine={true} />
      );

      fireEvent.press(getByText('Advanced Options'));

      expect(getByText('Modify an existing image with AI')).toBeTruthy();
    });
  });

  describe('accessibility', () => {
    it('has correct accessibility role on header', () => {
      const { getByRole } = renderWithProviders(
        <AdvancedOptionsSection {...defaultProps} />
      );

      expect(getByRole('button', { name: 'Advanced options' })).toBeTruthy();
    });

    it('has expanded state when open', () => {
      const { getByRole, getByText } = renderWithProviders(
        <AdvancedOptionsSection {...defaultProps} />
      );

      const header = getByRole('button', { name: 'Advanced options' });
      expect(header.props.accessibilityState.expanded).toBe(false);

      fireEvent.press(getByText('Advanced Options'));

      expect(header.props.accessibilityState.expanded).toBe(true);
    });
  });
});
