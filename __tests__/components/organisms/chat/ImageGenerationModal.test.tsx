import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ImageGenerationModal } from '../../../../src/components/organisms/chat/ImageGenerationModal';
import { useTheme } from '../../../../src/theme';

// Mock molecules
jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, TouchableOpacity, View } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    SheetHeader: ({ title, onClose }: { title: string; onClose: () => void }) => (
      React.createElement(View, null,
        React.createElement(Text, null, title),
        React.createElement(TouchableOpacity, { onPress: onClose }, React.createElement(Text, null, 'Close'))
      )
    ),
  };
});

// Mock theme
jest.mock('../../../../src/theme', () => ({
  useTheme: jest.fn(),
}));

// Mock BlurView
jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock SafeAreaView
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('ImageGenerationModal', () => {
  const mockTheme = {
    colors: {
      primary: {
        50: '#f0f9ff',
        500: '#0ea5e9',
        600: '#0284c7',
      },
      background: '#ffffff',
      surface: '#f8f9fa',
      border: '#e0e0e0',
      text: {
        primary: '#000000',
        secondary: '#666666',
      },
    },
  };

  const mockOnClose = jest.fn();
  const mockOnGenerate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useTheme as jest.Mock).mockReturnValue({ theme: mockTheme });
  });

  describe('Rendering', () => {
    it('should render modal when visible is true', () => {
      render(
        <ImageGenerationModal
          visible={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      expect(screen.getByText('Generate Image')).toBeTruthy();
      expect(screen.getByPlaceholderText('Describe the image you want')).toBeTruthy();
    });

    it('should not render content when visible is false', () => {
      render(
        <ImageGenerationModal
          visible={false}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      // Modal should still render but content won't be visible
      expect(screen.queryByText('Generate Image')).toBeFalsy();
    });

    it('should render all size options', () => {
      render(
        <ImageGenerationModal
          visible={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      expect(screen.getByText('Auto')).toBeTruthy();
      expect(screen.getByText('Square')).toBeTruthy();
      expect(screen.getByText('Portrait')).toBeTruthy();
      expect(screen.getByText('Landscape')).toBeTruthy();
    });

    it('should render all style options', () => {
      render(
        <ImageGenerationModal
          visible={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      expect(screen.getByText('Photo Realistic')).toBeTruthy();
      expect(screen.getByText('Anime')).toBeTruthy();
      expect(screen.getByText('Watercolor')).toBeTruthy();
      expect(screen.getByText('Sketch')).toBeTruthy();
      expect(screen.getByText('Cinematic')).toBeTruthy();
      expect(screen.getByText('3D Render')).toBeTruthy();
    });

    it('should render size and style labels', () => {
      render(
        <ImageGenerationModal
          visible={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      expect(screen.getByText('Size / Aspect')).toBeTruthy();
      expect(screen.getByText('Style')).toBeTruthy();
    });

    it('should render help text about OpenAI support', () => {
      render(
        <ImageGenerationModal
          visible={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      expect(screen.getByText(/OpenAI supports:/)).toBeTruthy();
    });

    it('should render action buttons', () => {
      render(
        <ImageGenerationModal
          visible={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      expect(screen.getByText('Cancel')).toBeTruthy();
      expect(screen.getByText('Generate')).toBeTruthy();
    });
  });

  describe('Initial Prompt', () => {
    it('should populate prompt input with initialPrompt', () => {
      const initialPrompt = 'A beautiful sunset over mountains';
      render(
        <ImageGenerationModal
          visible={true}
          initialPrompt={initialPrompt}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      const input = screen.getByPlaceholderText('Describe the image you want');
      expect(input.props.value).toBe(initialPrompt);
    });

    it('should update prompt when initialPrompt changes', () => {
      const { rerender } = render(
        <ImageGenerationModal
          visible={true}
          initialPrompt="First prompt"
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      let input = screen.getByPlaceholderText('Describe the image you want');
      expect(input.props.value).toBe('First prompt');

      rerender(
        <ImageGenerationModal
          visible={true}
          initialPrompt="Second prompt"
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      input = screen.getByPlaceholderText('Describe the image you want');
      expect(input.props.value).toBe('Second prompt');
    });

    it('should use empty string when initialPrompt is not provided', () => {
      render(
        <ImageGenerationModal
          visible={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      const input = screen.getByPlaceholderText('Describe the image you want');
      expect(input.props.value).toBe('');
    });
  });

  describe('Prompt Input', () => {
    it('should update prompt value when user types', () => {
      render(
        <ImageGenerationModal
          visible={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      const input = screen.getByPlaceholderText('Describe the image you want');
      fireEvent.changeText(input, 'A majestic lion');

      expect(input.props.value).toBe('A majestic lion');
    });

    it('should support multiline input', () => {
      render(
        <ImageGenerationModal
          visible={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      const input = screen.getByPlaceholderText('Describe the image you want');
      expect(input.props.multiline).toBe(true);
    });
  });

  describe('Size Selection', () => {
    it('should render all size chips and allow selection', () => {
      render(
        <ImageGenerationModal
          visible={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      // All size chips should be rendered
      expect(screen.getByText('Square')).toBeTruthy();
      expect(screen.getByText('Auto')).toBeTruthy();
      expect(screen.getByText('Portrait')).toBeTruthy();
      expect(screen.getByText('Landscape')).toBeTruthy();

      // Should be able to press all chips
      fireEvent.press(screen.getByText('Auto'));
      fireEvent.press(screen.getByText('Portrait'));
      fireEvent.press(screen.getByText('Landscape'));
      fireEvent.press(screen.getByText('Square'));
    });
  });

  describe('Style Selection', () => {
    it('should render all style chips and allow selection', () => {
      render(
        <ImageGenerationModal
          visible={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      // All style chips should be rendered
      expect(screen.getByText('Photo Realistic')).toBeTruthy();
      expect(screen.getByText('Anime')).toBeTruthy();
      expect(screen.getByText('Watercolor')).toBeTruthy();
      expect(screen.getByText('Sketch')).toBeTruthy();
      expect(screen.getByText('Cinematic')).toBeTruthy();
      expect(screen.getByText('3D Render')).toBeTruthy();

      // Should be able to press all chips
      fireEvent.press(screen.getByText('Anime'));
      fireEvent.press(screen.getByText('Watercolor'));
      fireEvent.press(screen.getByText('Sketch'));
      fireEvent.press(screen.getByText('Cinematic'));
      fireEvent.press(screen.getByText('3D Render'));
      fireEvent.press(screen.getByText('Photo Realistic'));
    });
  });

  describe('Generate Button', () => {
    it('should render generate button', () => {
      render(
        <ImageGenerationModal
          visible={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      expect(screen.getByText('Generate')).toBeTruthy();
    });

    it('should call onGenerate with prompt and default size when pressed', () => {
      render(
        <ImageGenerationModal
          visible={true}
          initialPrompt="A beautiful landscape"
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      const generateButton = screen.getByText('Generate');
      fireEvent.press(generateButton);

      expect(mockOnGenerate).toHaveBeenCalledWith({
        prompt: 'A beautiful landscape\n\nStyle: photo',
        size: 'square',
      });
    });

    it('should call onGenerate with selected size and style', () => {
      render(
        <ImageGenerationModal
          visible={true}
          initialPrompt="A mountain scene"
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      // Select landscape size
      fireEvent.press(screen.getByText('Landscape'));

      // Select cinematic style
      fireEvent.press(screen.getByText('Cinematic'));

      // Generate
      fireEvent.press(screen.getByText('Generate'));

      expect(mockOnGenerate).toHaveBeenCalledWith({
        prompt: 'A mountain scene\n\nStyle: cinematic',
        size: 'landscape',
      });
    });

    it('should append style to prompt', () => {
      render(
        <ImageGenerationModal
          visible={true}
          initialPrompt="Test prompt"
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      // Select anime style
      fireEvent.press(screen.getByText('Anime'));

      // Generate
      fireEvent.press(screen.getByText('Generate'));

      expect(mockOnGenerate).toHaveBeenCalledWith({
        prompt: 'Test prompt\n\nStyle: anime',
        size: 'square',
      });
    });

    it('should trim whitespace from prompt before generating', () => {
      render(
        <ImageGenerationModal
          visible={true}
          initialPrompt="  Prompt with spaces  "
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      fireEvent.press(screen.getByText('Generate'));

      expect(mockOnGenerate).toHaveBeenCalledWith({
        prompt: 'Prompt with spaces\n\nStyle: photo',
        size: 'square',
      });
    });
  });

  describe('Cancel Button', () => {
    it('should call onClose when cancel button is pressed', () => {
      render(
        <ImageGenerationModal
          visible={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      const cancelButton = screen.getByText('Cancel');
      fireEvent.press(cancelButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Modal Dismiss', () => {
    it('should call onClose when backdrop is pressed', () => {
      const { UNSAFE_getByType } = render(
        <ImageGenerationModal
          visible={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      const modal = UNSAFE_getByType(require('react-native').Modal);
      modal.props.onRequestClose();

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Theme Integration', () => {
    it('should use theme for styling', () => {
      render(
        <ImageGenerationModal
          visible={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      // Verify theme is being used
      expect(useTheme).toHaveBeenCalled();

      // Verify input is rendered with theme
      const input = screen.getByPlaceholderText('Describe the image you want');
      expect(input).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid style changes', () => {
      render(
        <ImageGenerationModal
          visible={true}
          initialPrompt="Test"
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      fireEvent.press(screen.getByText('Anime'));
      fireEvent.press(screen.getByText('Watercolor'));
      fireEvent.press(screen.getByText('Sketch'));
      fireEvent.press(screen.getByText('Cinematic'));

      fireEvent.press(screen.getByText('Generate'));

      expect(mockOnGenerate).toHaveBeenCalledWith({
        prompt: 'Test\n\nStyle: cinematic',
        size: 'square',
      });
    });

    it('should handle rapid size changes', () => {
      render(
        <ImageGenerationModal
          visible={true}
          initialPrompt="Test"
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      fireEvent.press(screen.getByText('Auto'));
      fireEvent.press(screen.getByText('Portrait'));
      fireEvent.press(screen.getByText('Landscape'));

      fireEvent.press(screen.getByText('Generate'));

      expect(mockOnGenerate).toHaveBeenCalledWith({
        prompt: 'Test\n\nStyle: photo',
        size: 'landscape',
      });
    });

    it('should preserve user input when changing size and style', () => {
      render(
        <ImageGenerationModal
          visible={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      const input = screen.getByPlaceholderText('Describe the image you want');
      fireEvent.changeText(input, 'My custom prompt');

      fireEvent.press(screen.getByText('Portrait'));
      fireEvent.press(screen.getByText('Anime'));

      expect(input.props.value).toBe('My custom prompt');
    });
  });
});
