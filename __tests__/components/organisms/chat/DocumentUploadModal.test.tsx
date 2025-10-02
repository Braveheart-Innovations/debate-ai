import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { DocumentUploadModal } from '../../../../src/components/organisms/chat/DocumentUploadModal';
import { useTheme } from '../../../../src/theme';
import * as DocumentPicker from 'expo-document-picker';
import { MessageAttachment } from '../../../../src/types';

// Mock dependencies
jest.mock('../../../../src/theme', () => ({
  useTheme: jest.fn(),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock('expo-blur', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    BlurView: ({ children, style }: any) => React.createElement(View, { style }, children),
  };
});

jest.mock('../../../../src/components/molecules', () => {
  const React = require('react');
  const { Text, View, TouchableOpacity } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
    SheetHeader: ({ title, onClose }: { title: string; onClose: () => void }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        React.createElement(TouchableOpacity, { onPress: onClose, testID: 'close-button' }, React.createElement(Text, null, 'Close'))
      ),
  };
});

jest.mock('../../../../src/components/atoms', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Box: ({ children, style }: any) => React.createElement(View, { style }, children),
  };
});

jest.mock('../../../../src/utils/documentProcessing', () => ({
  processDocumentForClaude: jest.fn(),
  isSupportedDocumentType: jest.fn(),
  validateDocumentSize: jest.fn(),
  getFileExtensionFromMimeType: jest.fn(),
}));

jest.mock('../../../../src/utils/imageProcessing', () => ({
  getReadableFileSize: jest.fn((size: number) => `${(size / 1024).toFixed(2)} KB`),
}));

jest.spyOn(Alert, 'alert');

const mockUseTheme = useTheme as jest.MockedFunction<typeof useTheme>;
const mockGetDocumentAsync = DocumentPicker.getDocumentAsync as jest.MockedFunction<typeof DocumentPicker.getDocumentAsync>;

const mockDocumentProcessing = require('../../../../src/utils/documentProcessing');

describe('DocumentUploadModal', () => {
  const mockOnClose = jest.fn();
  const mockOnUpload = jest.fn();

  const mockTheme = {
    theme: {
      colors: {
        background: '#FFFFFF',
        surface: '#F5F5F5',
        border: '#E0E0E0',
        primary: {
          50: '#F0F9FF',
          500: '#3B82F6',
          600: '#2563EB',
        },
        text: {
          primary: '#000000',
          secondary: '#666666',
        },
      },
    },
    isDark: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseTheme.mockReturnValue(mockTheme);
    mockDocumentProcessing.isSupportedDocumentType.mockReturnValue(true);
    mockDocumentProcessing.validateDocumentSize.mockReturnValue({ valid: true });
    mockDocumentProcessing.getFileExtensionFromMimeType.mockReturnValue('pdf');
  });

  describe('Rendering', () => {
    it('renders when visible', () => {
      render(
        <DocumentUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      expect(screen.getByText('Attach Document')).toBeTruthy();
      expect(screen.getByText('Browse Files')).toBeTruthy();
    });

    it('does not render when not visible', () => {
      const { queryByText } = render(
        <DocumentUploadModal
          visible={false}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      // Modal should not render content when visible={false}
      expect(queryByText('Attach Document')).toBeNull();
    });

    it('renders Cancel and Attach buttons', () => {
      render(
        <DocumentUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      expect(screen.getByText('Cancel')).toBeTruthy();
      expect(screen.getByText('Attach')).toBeTruthy();
    });
  });

  describe('Document Selection', () => {
    it('opens document picker when Browse Files is pressed', async () => {
      mockGetDocumentAsync.mockResolvedValue({ canceled: true, assets: null } as any);

      render(
        <DocumentUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      const browseButton = screen.getByText('Browse Files');
      fireEvent.press(browseButton);

      await waitFor(() => {
        expect(mockGetDocumentAsync).toHaveBeenCalledWith({
          type: '*/*',
          copyToCacheDirectory: true,
          multiple: false,
        });
      });
    });

    it('displays selected document information', async () => {
      const mockAsset = {
        uri: 'file://test.pdf',
        name: 'test.pdf',
        size: 1024,
        mimeType: 'application/pdf',
      };

      const mockProcessed: MessageAttachment = {
        type: 'document',
        url: 'file://test.pdf',
        fileName: 'test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      };

      mockGetDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [mockAsset],
      } as any);

      mockDocumentProcessing.processDocumentForClaude.mockResolvedValue(mockProcessed);

      render(
        <DocumentUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      const browseButton = screen.getByText('Browse Files');
      fireEvent.press(browseButton);

      await waitFor(() => {
        expect(screen.getByText('test.pdf')).toBeTruthy();
        expect(screen.getByText('1.00 KB • application/pdf')).toBeTruthy();
      });
    });

    it('handles cancelled document selection', async () => {
      mockGetDocumentAsync.mockResolvedValue({ canceled: true, assets: null } as any);

      render(
        <DocumentUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      const browseButton = screen.getByText('Browse Files');
      fireEvent.press(browseButton);

      await waitFor(() => {
        expect(mockDocumentProcessing.processDocumentForClaude).not.toHaveBeenCalled();
      });
    });
  });

  describe('File Validation', () => {
    it('shows alert for unsupported file types', async () => {
      const mockAsset = {
        uri: 'file://test.exe',
        name: 'test.exe',
        size: 1024,
        mimeType: 'application/x-msdownload',
      };

      mockGetDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [mockAsset],
      } as any);

      mockDocumentProcessing.isSupportedDocumentType.mockReturnValue(false);

      render(
        <DocumentUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      const browseButton = screen.getByText('Browse Files');
      fireEvent.press(browseButton);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Unsupported',
          'Select PDF, TXT, MD, CSV, JSON, XML, HTML, DOCX, XLSX, or PPTX.'
        );
      });
    });

    it('shows alert for files that are too large', async () => {
      const mockAsset = {
        uri: 'file://large.pdf',
        name: 'large.pdf',
        size: 100 * 1024 * 1024, // 100MB
        mimeType: 'application/pdf',
      };

      mockGetDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [mockAsset],
      } as any);

      mockDocumentProcessing.validateDocumentSize.mockReturnValue({
        valid: false,
        error: 'File exceeds maximum size of 10MB',
      });

      render(
        <DocumentUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      const browseButton = screen.getByText('Browse Files');
      fireEvent.press(browseButton);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'File Too Large',
          'File exceeds maximum size of 10MB'
        );
      });
    });
  });

  describe('Upload Behavior', () => {
    it('calls onUpload with attachment when Attach button is pressed', async () => {
      const mockAsset = {
        uri: 'file://test.pdf',
        name: 'test.pdf',
        size: 1024,
        mimeType: 'application/pdf',
      };

      const mockProcessed: MessageAttachment = {
        type: 'document',
        url: 'file://test.pdf',
        fileName: 'test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      };

      mockGetDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [mockAsset],
      } as any);

      mockDocumentProcessing.processDocumentForClaude.mockResolvedValue(mockProcessed);

      render(
        <DocumentUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      // Select document
      const browseButton = screen.getByText('Browse Files');
      fireEvent.press(browseButton);

      await waitFor(() => {
        expect(screen.getByText('test.pdf')).toBeTruthy();
      });

      // Press Attach
      const attachButton = screen.getByText('Attach');
      fireEvent.press(attachButton);

      expect(mockOnUpload).toHaveBeenCalledWith([mockProcessed]);
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('shows alert when trying to attach without selecting document', () => {
      render(
        <DocumentUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      const attachButton = screen.getByText('Attach');
      fireEvent.press(attachButton);

      expect(Alert.alert).toHaveBeenCalledWith(
        'No Document',
        'Please choose a document first.'
      );
      expect(mockOnUpload).not.toHaveBeenCalled();
    });
  });

  describe('Close Behavior', () => {
    it('calls onClose when Cancel button is pressed', () => {
      render(
        <DocumentUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      const cancelButton = screen.getByText('Cancel');
      fireEvent.press(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onClose when close button in header is pressed', () => {
      render(
        <DocumentUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      const closeButton = screen.getByTestId('close-button');
      fireEvent.press(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('handles document without name', async () => {
      const mockAsset = {
        uri: 'file://unknown',
        size: 1024,
        mimeType: 'application/pdf',
      };

      const mockProcessed: MessageAttachment = {
        type: 'document',
        url: 'file://unknown',
        fileName: 'file.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      };

      mockGetDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [mockAsset],
      } as any);

      mockDocumentProcessing.processDocumentForClaude.mockResolvedValue(mockProcessed);

      render(
        <DocumentUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      const browseButton = screen.getByText('Browse Files');
      fireEvent.press(browseButton);

      await waitFor(() => {
        expect(mockDocumentProcessing.processDocumentForClaude).toHaveBeenCalled();
      });
    });

    it('handles document without mime type', async () => {
      const mockAsset = {
        uri: 'file://test',
        name: 'test',
        size: 1024,
      };

      mockGetDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [mockAsset],
      } as any);

      render(
        <DocumentUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      const browseButton = screen.getByText('Browse Files');
      fireEvent.press(browseButton);

      await waitFor(() => {
        expect(mockDocumentProcessing.processDocumentForClaude).toHaveBeenCalledWith(
          'file://test',
          'application/octet-stream',
          expect.any(String)
        );
      });
    });
  });
});