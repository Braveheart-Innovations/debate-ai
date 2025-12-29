import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ImageRefinementModal, RefinementProvider } from '@/components/organisms/chat/ImageRefinementModal';

jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View testID="blur-view">{children}</View>;
  },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => {
    const { Text } = require('react-native');
    return <Text testID={`icon-${name}`}>{name}</Text>;
  },
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, View, TouchableOpacity } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    SheetHeader: ({ title, onClose }: { title: string; onClose: () => void }) => (
      <View testID="sheet-header">
        <Text>{title}</Text>
        <TouchableOpacity onPress={onClose} testID="close-button">
          <Text>Close</Text>
        </TouchableOpacity>
      </View>
    ),
  };
});

describe('ImageRefinementModal', () => {
  const mockProviders: RefinementProvider[] = [
    { provider: 'openai', name: 'ChatGPT (DALL-E)', supportsImg2Img: true, hasApiKey: true },
    { provider: 'google', name: 'Gemini', supportsImg2Img: true, hasApiKey: true },
    { provider: 'grok', name: 'Grok', supportsImg2Img: false, hasApiKey: true },
    { provider: 'claude', name: 'Claude', supportsImg2Img: false, hasApiKey: false },
  ];

  const defaultProps = {
    visible: true,
    imageUri: 'https://example.com/image.jpg',
    originalPrompt: 'A beautiful sunset over the ocean',
    originalProvider: 'openai' as const,
    availableProviders: mockProviders,
    onClose: jest.fn(),
    onRefine: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders when visible is true', () => {
    const { getAllByText } = renderWithProviders(<ImageRefinementModal {...defaultProps} />);
    // Both header and button have "Refine Image" text
    expect(getAllByText('Refine Image').length).toBeGreaterThanOrEqual(1);
  });

  it('renders original prompt (truncated if long)', () => {
    const { getByText } = renderWithProviders(<ImageRefinementModal {...defaultProps} />);
    expect(getByText(/Original: "A beautiful sunset/)).toBeTruthy();
  });

  it('renders text input for instructions', () => {
    const { getByPlaceholderText } = renderWithProviders(<ImageRefinementModal {...defaultProps} />);
    expect(getByPlaceholderText('Describe the improvements you want...')).toBeTruthy();
  });

  it('renders quick suggestion chips', () => {
    const { getByText } = renderWithProviders(<ImageRefinementModal {...defaultProps} />);
    expect(getByText('More detail')).toBeTruthy();
    expect(getByText('Vibrant colors')).toBeTruthy();
    expect(getByText('Dramatic lighting')).toBeTruthy();
  });

  it('adds quick suggestion to instructions when chip pressed', () => {
    const { getByText, getByPlaceholderText } = renderWithProviders(<ImageRefinementModal {...defaultProps} />);

    fireEvent.press(getByText('More detail'));

    const input = getByPlaceholderText('Describe the improvements you want...');
    expect(input.props.value).toContain('Add more fine details');
  });

  it('appends multiple quick suggestions', () => {
    const { getByText, getByPlaceholderText } = renderWithProviders(<ImageRefinementModal {...defaultProps} />);

    fireEvent.press(getByText('More detail'));
    fireEvent.press(getByText('Vibrant colors'));

    const input = getByPlaceholderText('Describe the improvements you want...');
    expect(input.props.value).toContain('Add more fine details');
    expect(input.props.value).toContain('vibrant and saturated');
  });

  describe('Provider Selection', () => {
    it('renders all available providers', () => {
      const { getByText } = renderWithProviders(<ImageRefinementModal {...defaultProps} />);
      // Original provider (openai) has "(same)" appended, so use regex
      expect(getByText(/ChatGPT \(DALL-E\)/)).toBeTruthy();
      expect(getByText('Gemini')).toBeTruthy();
      expect(getByText('Grok')).toBeTruthy();
      expect(getByText('Claude')).toBeTruthy();
    });

    it('shows "(same)" indicator for original provider', () => {
      const { getByText } = renderWithProviders(<ImageRefinementModal {...defaultProps} />);
      expect(getByText(/ChatGPT \(DALL-E\).*\(same\)/)).toBeTruthy();
    });

    it('shows "No API key configured" for providers without keys', () => {
      const { getByText } = renderWithProviders(<ImageRefinementModal {...defaultProps} />);
      expect(getByText('No API key configured')).toBeTruthy();
    });

    it('shows "Does not support image editing" for non-img2img providers', () => {
      const { getAllByText } = renderWithProviders(<ImageRefinementModal {...defaultProps} />);
      const messages = getAllByText('Does not support image editing');
      expect(messages.length).toBeGreaterThan(0);
    });

    it('auto-selects first eligible provider if original is not eligible', () => {
      const props = {
        ...defaultProps,
        originalProvider: 'grok' as const,
      };
      const { onRefine } = props;

      const { getAllByText, getByPlaceholderText } = renderWithProviders(<ImageRefinementModal {...props} />);

      // Add instructions
      fireEvent.changeText(getByPlaceholderText('Describe the improvements you want...'), 'Make it better');

      // Press Refine (use the button, not the header)
      const refineTexts = getAllByText('Refine Image');
      fireEvent.press(refineTexts[refineTexts.length - 1]);

      // Should use openai (first eligible) instead of grok (original)
      expect(onRefine).toHaveBeenCalledWith({
        instructions: 'Make it better',
        provider: 'openai',
      });
    });
  });

  describe('Actions', () => {
    it('calls onClose when Cancel is pressed', () => {
      const { getByText } = renderWithProviders(<ImageRefinementModal {...defaultProps} />);
      fireEvent.press(getByText('Cancel'));
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('calls onClose when header close button is pressed', () => {
      const { getByTestId } = renderWithProviders(<ImageRefinementModal {...defaultProps} />);
      fireEvent.press(getByTestId('close-button'));
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('disables Refine button when instructions are empty', () => {
      const onRefine = jest.fn();
      const props = { ...defaultProps, onRefine };
      const { getAllByText } = renderWithProviders(<ImageRefinementModal {...props} />);

      // Find and press the button (not the header) - button is the second match
      const refineTexts = getAllByText('Refine Image');
      fireEvent.press(refineTexts[refineTexts.length - 1]);

      // Should not call onRefine when instructions are empty
      expect(onRefine).not.toHaveBeenCalled();
    });

    it('enables Refine button when instructions are provided', () => {
      const { getAllByText, getByPlaceholderText } = renderWithProviders(<ImageRefinementModal {...defaultProps} />);

      fireEvent.changeText(getByPlaceholderText('Describe the improvements you want...'), 'Make it sharper');

      const refineTexts = getAllByText('Refine Image');
      const refineButton = refineTexts[refineTexts.length - 1].parent;
      expect(refineButton?.props.accessibilityState?.disabled).toBeFalsy();
    });

    it('calls onRefine with instructions and provider when Refine is pressed', () => {
      const { getAllByText, getByPlaceholderText } = renderWithProviders(<ImageRefinementModal {...defaultProps} />);

      fireEvent.changeText(getByPlaceholderText('Describe the improvements you want...'), 'Add more detail');
      const refineTexts = getAllByText('Refine Image');
      fireEvent.press(refineTexts[refineTexts.length - 1]);

      expect(defaultProps.onRefine).toHaveBeenCalledWith({
        instructions: 'Add more detail',
        provider: 'openai',
      });
    });

    it('clears instructions after refinement', () => {
      const { getAllByText, getByPlaceholderText } = renderWithProviders(<ImageRefinementModal {...defaultProps} />);

      const input = getByPlaceholderText('Describe the improvements you want...');
      fireEvent.changeText(input, 'Add more detail');
      const refineTexts = getAllByText('Refine Image');
      fireEvent.press(refineTexts[refineTexts.length - 1]);

      // Instructions should be cleared
      expect(input.props.value).toBe('');
    });
  });

  describe('Empty State', () => {
    it('handles no eligible providers gracefully', () => {
      const noEligibleProviders: RefinementProvider[] = [
        { provider: 'grok', name: 'Grok', supportsImg2Img: false, hasApiKey: true },
        { provider: 'claude', name: 'Claude', supportsImg2Img: false, hasApiKey: false },
      ];

      const props = {
        ...defaultProps,
        availableProviders: noEligibleProviders,
      };

      const { getAllByText, getByPlaceholderText } = renderWithProviders(<ImageRefinementModal {...props} />);

      // Should still render
      expect(getAllByText('Refine Image').length).toBeGreaterThanOrEqual(1);

      // Refine button should be disabled even with instructions since no providers support img2img
      const onRefine = jest.fn();
      const propsWithRefine = { ...props, onRefine };
      const { getAllByText: getAllByText2, getByPlaceholderText: getByPlaceholderText2 } = renderWithProviders(<ImageRefinementModal {...propsWithRefine} />);

      fireEvent.changeText(getByPlaceholderText2('Describe the improvements you want...'), 'Make it better');
      const refineTexts2 = getAllByText2('Refine Image');
      fireEvent.press(refineTexts2[refineTexts2.length - 1]);

      // Should not call onRefine even with instructions since no eligible providers
      expect(onRefine).not.toHaveBeenCalled();
    });
  });
});
