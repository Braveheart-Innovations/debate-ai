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

jest.mock('@/components/molecules', () => {
  const { Text, TouchableOpacity, View } = require('react-native');
  return {
    KeyboardAvoider: ({ children }: { children?: import('react').ReactNode }) => require('react').createElement(require('react').Fragment, null, children),
    Typography: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    GradientButton: ({
      title,
      onPress,
      disabled,
      testID,
    }: {
      title: string;
      onPress: () => void;
      disabled?: boolean;
      testID?: string;
    }) => (
      <TouchableOpacity onPress={onPress} disabled={disabled} testID={testID} accessibilityState={{ disabled: Boolean(disabled) }}>
        <Text>{title}</Text>
      </TouchableOpacity>
    ),
    SheetHeader: ({
      title,
      onClose,
      testID,
    }: {
      title: string;
      onClose: () => void;
      testID?: string;
    }) => (
      <View>
        <Text>{title}</Text>
        <TouchableOpacity onPress={onClose} testID={testID ? `${testID}-close` : 'close-button'}>
          <Text>Close</Text>
        </TouchableOpacity>
      </View>
    ),
  };
});

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => <Text>{name}</Text>,
  };
});

describe('ImageRefinementModal', () => {
  const mockProviders: RefinementProvider[] = [
    { provider: 'openai', name: 'ChatGPT', supportsImg2Img: true, hasApiKey: true },
    { provider: 'google', name: 'Gemini', supportsImg2Img: true, hasApiKey: true },
    { provider: 'grok', name: 'Grok', supportsImg2Img: true, hasApiKey: true },
    { provider: 'claude', name: 'Claude', supportsImg2Img: false, hasApiKey: false },
  ];

  const defaultProps = {
    visible: true,
    imageUri: 'https://example.com/image.jpg',
    originalProvider: 'openai' as const,
    originalModelId: 'gpt-image-2',
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
    it('renders only eligible providers as chips', () => {
      const { getAllByText, queryByText } = renderWithProviders(<ImageRefinementModal {...defaultProps} />);
      // Only providers with supportsImg2Img=true and hasApiKey=true should appear
      expect(getAllByText('ChatGPT').length).toBeGreaterThan(0);
      expect(getAllByText('Gemini').length).toBeGreaterThan(0);
      expect(queryByText('Claude')).toBeNull();
    });

    it('hides provider selection when only one eligible provider', () => {
      const singleProviderList: RefinementProvider[] = [
        { provider: 'openai', name: 'ChatGPT', supportsImg2Img: true, hasApiKey: true },
        { provider: 'grok', name: 'Grok', supportsImg2Img: false, hasApiKey: true },
      ];
      const props = { ...defaultProps, availableProviders: singleProviderList };
      const { queryByTestId } = renderWithProviders(<ImageRefinementModal {...props} />);
      expect(queryByTestId('provider-option-openai')).toBeNull();
    });

    it('auto-selects first eligible provider if original is not eligible', () => {
      const props = {
        ...defaultProps,
        originalProvider: 'claude' as const,
        originalModelId: undefined,
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
        modelId: 'gpt-image-2.5-flare',
      });
    });

    it('lets the user switch both provider and model', () => {
      const { getByPlaceholderText, getByTestId } = renderWithProviders(<ImageRefinementModal {...defaultProps} />);

      fireEvent.press(getByTestId('provider-option-google'));
      fireEvent.press(getByTestId('model-option-gemini-3-pro-image'));
      fireEvent.changeText(getByPlaceholderText('Describe the improvements you want...'), 'Push the image toward a premium edit');
      fireEvent.press(getByTestId('refine-submit'));

      expect(defaultProps.onRefine).toHaveBeenCalledWith({
        instructions: 'Push the image toward a premium edit',
        provider: 'google',
        modelId: 'gemini-3-pro-image',
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
      fireEvent.press(getByTestId('refinement-header-close'));
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('disables Refine button when instructions are empty', () => {
      const onRefine = jest.fn();
      const props = { ...defaultProps, onRefine };
      const { getByTestId } = renderWithProviders(<ImageRefinementModal {...props} />);

      fireEvent.press(getByTestId('refine-submit'));

      // Should not call onRefine when instructions are empty
      expect(onRefine).not.toHaveBeenCalled();
    });

    it('enables Refine button when instructions are provided', () => {
      const { getByPlaceholderText, getByTestId } = renderWithProviders(<ImageRefinementModal {...defaultProps} />);

      fireEvent.changeText(getByPlaceholderText('Describe the improvements you want...'), 'Make it sharper');

      expect(getByTestId('refine-submit').props.accessibilityState?.disabled).toBeFalsy();
    });

    it('calls onRefine with instructions and provider when Refine is pressed', () => {
      const { getByPlaceholderText, getByTestId } = renderWithProviders(<ImageRefinementModal {...defaultProps} />);

      fireEvent.changeText(getByPlaceholderText('Describe the improvements you want...'), 'Add more detail');
      fireEvent.press(getByTestId('refine-submit'));

      expect(defaultProps.onRefine).toHaveBeenCalledWith({
        instructions: 'Add more detail',
        provider: 'openai',
        modelId: 'gpt-image-2',
      });
    });

    it('clears instructions after refinement', () => {
      const { getByPlaceholderText, getByTestId } = renderWithProviders(<ImageRefinementModal {...defaultProps} />);

      const input = getByPlaceholderText('Describe the improvements you want...');
      fireEvent.changeText(input, 'Add more detail');
      fireEvent.press(getByTestId('refine-submit'));

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

      const { getAllByText } = renderWithProviders(<ImageRefinementModal {...props} />);

      // Should still render
      expect(getAllByText('Refine Image').length).toBeGreaterThanOrEqual(1);

      // Refine button should be disabled even with instructions since no providers support img2img
      const onRefine = jest.fn();
      const propsWithRefine = { ...props, onRefine };
      const { getByPlaceholderText: getByPlaceholderText2, getByTestId: getByTestId2 } = renderWithProviders(<ImageRefinementModal {...propsWithRefine} />);

      fireEvent.changeText(getByPlaceholderText2('Describe the improvements you want...'), 'Make it better');
      fireEvent.press(getByTestId2('refine-submit'));

      // Should not call onRefine even with instructions since no eligible providers
      expect(onRefine).not.toHaveBeenCalled();
    });
  });
});
