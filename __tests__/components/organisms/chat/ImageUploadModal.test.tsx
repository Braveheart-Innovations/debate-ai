import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { ImageUploadModal } from '../../../../src/components/organisms/chat/ImageUploadModal';
import { useTheme } from '../../../../src/theme';
import * as ImagePicker from 'expo-image-picker';
import * as imageProcessing from '../../../../src/utils/imageProcessing';

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

// Mock ImagePicker
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' },
}));

// Mock image processing utilities
jest.mock('../../../../src/utils/imageProcessing', () => ({
  processImageForClaude: jest.fn(),
  getReadableFileSize: jest.fn(),
}));

// Mock Alert
jest.spyOn(Alert, 'alert');

describe('ImageUploadModal', () => {
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
  const mockOnUpload = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useTheme as jest.Mock).mockReturnValue({ theme: mockTheme });
    (imageProcessing.getReadableFileSize as jest.Mock).mockReturnValue('2.5 MB');
    (imageProcessing.processImageForClaude as jest.Mock).mockResolvedValue({
      base64: 'base64data',
      mimeType: 'image/jpeg',
      fileName: 'photo.jpg',
      fileSize: 2500000,
    });
  });

  describe('Rendering', () => {
    it('should render modal when visible is true', () => {
      render(
        <ImageUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      expect(screen.getByText('Attach Image')).toBeTruthy();
      expect(screen.getByText('Photo Library')).toBeTruthy();
      expect(screen.getByText('Camera')).toBeTruthy();
    });

    it('should not render content when visible is false', () => {
      render(
        <ImageUploadModal
          visible={false}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      expect(screen.queryByText('Attach Image')).toBeFalsy();
    });

    it('should render action buttons', () => {
      render(
        <ImageUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      expect(screen.getByText('Cancel')).toBeTruthy();
      expect(screen.getByText('Attach')).toBeTruthy();
    });

    it('should render source selection buttons', () => {
      render(
        <ImageUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      expect(screen.getByText('Photo Library')).toBeTruthy();
      expect(screen.getByText('Camera')).toBeTruthy();
    });
  });

  describe('Photo Library Selection', () => {
    it('should request permissions when Photo Library is pressed', async () => {
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: false,
      });

      render(
        <ImageUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      fireEvent.press(screen.getByText('Photo Library'));

      await waitFor(() => {
        expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled();
      });
    });

    it('should show alert when photo library permission is denied', async () => {
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: false,
      });

      render(
        <ImageUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      fireEvent.press(screen.getByText('Photo Library'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Permission Required',
          'Please allow photo library access.'
        );
      });
    });

    it('should launch image library when permission is granted', async () => {
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: true,
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{
          uri: 'file:///photo.jpg',
          mimeType: 'image/jpeg',
          fileName: 'photo.jpg',
        }],
      });

      render(
        <ImageUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      fireEvent.press(screen.getByText('Photo Library'));

      await waitFor(() => {
        expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({
          mediaTypes: 'Images',
          quality: 0.9,
          base64: true,
        });
      });
    });

    it('should not process image if user cancels selection', async () => {
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: true,
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: true,
      });

      render(
        <ImageUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      fireEvent.press(screen.getByText('Photo Library'));

      await waitFor(() => {
        expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
      });

      expect(imageProcessing.processImageForClaude).not.toHaveBeenCalled();
    });

    it('should process and display selected image', async () => {
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: true,
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{
          uri: 'file:///photo.jpg',
          mimeType: 'image/jpeg',
          fileName: 'photo.jpg',
        }],
      });

      render(
        <ImageUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      fireEvent.press(screen.getByText('Photo Library'));

      await waitFor(() => {
        expect(imageProcessing.processImageForClaude).toHaveBeenCalledWith(
          'file:///photo.jpg',
          'image/jpeg',
          'photo.jpg'
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Preview')).toBeTruthy();
      });
    });
  });

  describe('Camera Selection', () => {
    it('should request camera permissions when Camera is pressed', async () => {
      (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: false,
      });

      render(
        <ImageUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      fireEvent.press(screen.getByText('Camera'));

      await waitFor(() => {
        expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalled();
      });
    });

    it('should show alert when camera permission is denied', async () => {
      (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: false,
      });

      render(
        <ImageUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      fireEvent.press(screen.getByText('Camera'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Permission Required',
          'Please allow camera access.'
        );
      });
    });

    it('should launch camera when permission is granted', async () => {
      (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: true,
      });
      (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{
          uri: 'file:///camera.jpg',
          mimeType: 'image/jpeg',
          fileName: 'camera.jpg',
        }],
      });

      render(
        <ImageUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      fireEvent.press(screen.getByText('Camera'));

      await waitFor(() => {
        expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith({
          quality: 0.9,
          base64: true,
        });
      });
    });

    it('should not process image if user cancels camera', async () => {
      (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: true,
      });
      (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
        canceled: true,
      });

      render(
        <ImageUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      fireEvent.press(screen.getByText('Camera'));

      await waitFor(() => {
        expect(ImagePicker.launchCameraAsync).toHaveBeenCalled();
      });

      expect(imageProcessing.processImageForClaude).not.toHaveBeenCalled();
    });

    it('should process and display captured photo', async () => {
      (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: true,
      });
      (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{
          uri: 'file:///camera.jpg',
          mimeType: 'image/jpeg',
          fileName: 'camera.jpg',
        }],
      });

      render(
        <ImageUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      fireEvent.press(screen.getByText('Camera'));

      await waitFor(() => {
        expect(imageProcessing.processImageForClaude).toHaveBeenCalledWith(
          'file:///camera.jpg',
          'image/jpeg',
          'camera.jpg'
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Preview')).toBeTruthy();
      });
    });
  });

  describe('Image Preview', () => {
    it('should not show preview when no image is selected', () => {
      render(
        <ImageUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      expect(screen.queryByText('Preview')).toBeFalsy();
    });

    it('should display file size and mime type in preview', async () => {
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: true,
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{
          uri: 'file:///photo.jpg',
          mimeType: 'image/jpeg',
          fileName: 'photo.jpg',
        }],
      });

      render(
        <ImageUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      fireEvent.press(screen.getByText('Photo Library'));

      await waitFor(() => {
        expect(screen.getByText(/2.5 MB/)).toBeTruthy();
        expect(screen.getByText(/image\/jpeg/)).toBeTruthy();
      });
    });
  });

  describe('Attach Button', () => {
    it('should show alert when trying to attach without selecting image', () => {
      render(
        <ImageUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      fireEvent.press(screen.getByText('Attach'));

      expect(Alert.alert).toHaveBeenCalledWith(
        'No Image Selected',
        'Please choose an image first.'
      );
    });

    it('should call onUpload with attachments when image is selected', async () => {
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: true,
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{
          uri: 'file:///photo.jpg',
          mimeType: 'image/jpeg',
          fileName: 'photo.jpg',
        }],
      });

      render(
        <ImageUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      fireEvent.press(screen.getByText('Photo Library'));

      await waitFor(() => {
        expect(screen.getByText('Preview')).toBeTruthy();
      });

      fireEvent.press(screen.getByText('Attach'));

      expect(mockOnUpload).toHaveBeenCalledWith([
        {
          type: 'image',
          uri: 'file:///photo.jpg',
          mimeType: 'image/jpeg',
          base64: 'base64data',
          fileName: 'photo.jpg',
          fileSize: 2500000,
        },
      ]);
    });

    it('should close modal after successful attachment', async () => {
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: true,
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{
          uri: 'file:///photo.jpg',
          mimeType: 'image/jpeg',
          fileName: 'photo.jpg',
        }],
      });

      render(
        <ImageUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      fireEvent.press(screen.getByText('Photo Library'));

      await waitFor(() => {
        expect(screen.getByText('Preview')).toBeTruthy();
      });

      fireEvent.press(screen.getByText('Attach'));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cancel Button', () => {
    it('should call onClose when cancel button is pressed', () => {
      render(
        <ImageUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      fireEvent.press(screen.getByText('Cancel'));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Modal Dismiss', () => {
    it('should call onClose when backdrop is pressed', () => {
      const { UNSAFE_getByType } = render(
        <ImageUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
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
        <ImageUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      expect(useTheme).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing mimeType in asset', async () => {
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: true,
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{
          uri: 'file:///photo.jpg',
          fileName: 'photo.jpg',
        }],
      });

      render(
        <ImageUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      fireEvent.press(screen.getByText('Photo Library'));

      await waitFor(() => {
        expect(imageProcessing.processImageForClaude).toHaveBeenCalledWith(
          'file:///photo.jpg',
          'image/jpeg',
          'photo.jpg'
        );
      });
    });

    it('should handle missing fileName in asset', async () => {
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: true,
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{
          uri: 'file:///photo.jpg',
          mimeType: 'image/jpeg',
        }],
      });

      render(
        <ImageUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      fireEvent.press(screen.getByText('Photo Library'));

      await waitFor(() => {
        expect(imageProcessing.processImageForClaude).toHaveBeenCalledWith(
          'file:///photo.jpg',
          'image/jpeg',
          undefined
        );
      });
    });

    it('should replace previous attachment when selecting new image', async () => {
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: true,
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock)
        .mockResolvedValueOnce({
          canceled: false,
          assets: [{
            uri: 'file:///photo1.jpg',
            mimeType: 'image/jpeg',
            fileName: 'photo1.jpg',
          }],
        })
        .mockResolvedValueOnce({
          canceled: false,
          assets: [{
            uri: 'file:///photo2.jpg',
            mimeType: 'image/jpeg',
            fileName: 'photo2.jpg',
          }],
        });

      render(
        <ImageUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      // Select first image
      fireEvent.press(screen.getByText('Photo Library'));

      await waitFor(() => {
        expect(screen.getByText('Preview')).toBeTruthy();
      });

      // Select second image
      fireEvent.press(screen.getByText('Photo Library'));

      await waitFor(() => {
        expect(imageProcessing.processImageForClaude).toHaveBeenCalledTimes(2);
      });

      // Attach should only upload the second image
      fireEvent.press(screen.getByText('Attach'));

      expect(mockOnUpload).toHaveBeenCalledWith([
        expect.objectContaining({
          uri: 'file:///photo2.jpg',
        }),
      ]);
    });
  });
});
