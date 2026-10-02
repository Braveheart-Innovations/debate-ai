import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import type { BlurView } from 'expo-blur';
import { DocumentUploadModal } from '../../../../src/components/organisms/chat/DocumentUploadModal';
import { useTheme } from '../../../../src/theme';
import { lightTheme } from '../../../../src/theme/types';
import * as DocumentPicker from 'expo-document-picker';
import type { DocumentPickerAsset } from 'expo-document-picker';
import {
  getFileExtensionFromMimeType,
  isSupportedDocumentType,
  processDocumentForClaude,
  validateDocumentSize,
} from '../../../../src/utils/documentProcessing';
import type { Box } from '../../../../src/components/atoms';
import type { KeyboardAvoider, SheetHeader, Typography } from '../../../../src/components/molecules';
import type { PropsOf } from '@test-utils/mockComponents';
import { createMockAttachment } from '@test-utils/fixtures';

// Mock ErrorService
const mockShowWarning = jest.fn();
jest.mock('@/services/errors/ErrorService', () => ({
  ErrorService: {
    showWarning: (...args: unknown[]) => mockShowWarning(...args),
    handleWithToast: jest.fn(),
    showSuccess: jest.fn(),
    showInfo: jest.fn(),
  },
}));

// Mock dependencies
jest.mock('../../../../src/theme', () => ({
  useTheme: jest.fn(),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock('expo-blur', () => {
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  return {
    BlurView: stubComponent<typeof BlurView>('blur-view', { render: (p) => p.children }),
  };
});

jest.mock('../../../../src/components/molecules', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text, View, TouchableOpacity } = jest.requireActual<typeof import('react-native')>('react-native');
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  return {
    KeyboardAvoider: stubComponent<typeof KeyboardAvoider>('keyboard-avoider', {
      render: (p) => p.children,
    }),
    Typography: stubComponent<typeof Typography>('typography', { text: (p) => p.children }),
    SheetHeader: ({ title, onClose }: PropsOf<typeof SheetHeader>) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        React.createElement(TouchableOpacity, { onPress: onClose, testID: 'close-button' }, React.createElement(Text, null, 'Close'))
      ),
  };
});

jest.mock('../../../../src/components/atoms', () => {
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  return {
    Box: stubComponent<typeof Box>('box', { render: (p) => p.children }),
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

const mockUseTheme = jest.mocked(useTheme);
const mockGetDocumentAsync = jest.mocked(DocumentPicker.getDocumentAsync);
const mockDocumentProcessing = {
  processDocumentForClaude: jest.mocked(processDocumentForClaude),
  isSupportedDocumentType: jest.mocked(isSupportedDocumentType),
  validateDocumentSize: jest.mocked(validateDocumentSize),
  getFileExtensionFromMimeType: jest.mocked(getFileExtensionFromMimeType),
};

/** A complete picker asset; `lastModified` is required by the picker type. */
const createPickerAsset = (
  overrides: Partial<DocumentPickerAsset> & Pick<DocumentPickerAsset, 'uri'>
): DocumentPickerAsset => ({
  name: 'test.pdf',
  size: 1024,
  mimeType: 'application/pdf',
  lastModified: 1_700_000_000_000,
  ...overrides,
});

describe('DocumentUploadModal', () => {
  const mockOnClose = jest.fn();
  const mockOnUpload = jest.fn();

  const mockTheme: ReturnType<typeof useTheme> = {
    theme: lightTheme,
    themeMode: 'light',
    setThemeMode: jest.fn(),
    isDark: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockShowWarning.mockClear();
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
      mockGetDocumentAsync.mockResolvedValue({ canceled: true, assets: null });

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
      const mockAsset = createPickerAsset({
        uri: 'file://test.pdf',
        name: 'test.pdf',
        size: 1024,
        mimeType: 'application/pdf',
      });

      const mockProcessed = createMockAttachment({
        type: 'document',
        uri: 'file://test.pdf',
        fileName: 'test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      });

      mockGetDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [mockAsset],
      });

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
      mockGetDocumentAsync.mockResolvedValue({ canceled: true, assets: null });

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
    it('shows warning for unsupported file types', async () => {
      const mockAsset = createPickerAsset({
        uri: 'file://test.exe',
        name: 'test.exe',
        size: 1024,
        mimeType: 'application/x-msdownload',
      });

      mockGetDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [mockAsset],
      });

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
        expect(mockShowWarning).toHaveBeenCalledWith(
          'Select PDF, TXT, MD, CSV, JSON, XML, HTML, DOCX, XLSX, or PPTX.',
          'chat'
        );
      });
    });

    it('shows warning for files that are too large', async () => {
      const mockAsset = createPickerAsset({
        uri: 'file://large.pdf',
        name: 'large.pdf',
        size: 100 * 1024 * 1024, // 100MB
        mimeType: 'application/pdf',
      });

      mockGetDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [mockAsset],
      });

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
        expect(mockShowWarning).toHaveBeenCalledWith(
          'File exceeds maximum size of 10MB',
          'chat'
        );
      });
    });
  });

  describe('Upload Behavior', () => {
    it('calls onUpload with attachment when Attach button is pressed', async () => {
      const mockAsset = createPickerAsset({
        uri: 'file://test.pdf',
        name: 'test.pdf',
        size: 1024,
        mimeType: 'application/pdf',
      });

      const mockProcessed = createMockAttachment({
        type: 'document',
        uri: 'file://test.pdf',
        fileName: 'test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      });

      mockGetDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [mockAsset],
      });

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

    it('shows warning when trying to attach without selecting document', () => {
      render(
        <DocumentUploadModal
          visible={true}
          onClose={mockOnClose}
          onUpload={mockOnUpload}
        />
      );

      const attachButton = screen.getByText('Attach');
      fireEvent.press(attachButton);

      expect(mockShowWarning).toHaveBeenCalledWith(
        'Please choose a document first.',
        'chat'
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
      // The picker types `name` as a string; an empty name takes the same fallback path.
      const mockAsset = createPickerAsset({
        uri: 'file://unknown',
        name: '',
        size: 1024,
        mimeType: 'application/pdf',
      });

      const mockProcessed = createMockAttachment({
        type: 'document',
        uri: 'file://unknown',
        fileName: 'file.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      });

      mockGetDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [mockAsset],
      });

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
      const mockAsset = createPickerAsset({
        uri: 'file://test',
        name: 'test',
        size: 1024,
        mimeType: undefined,
      });

      mockGetDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [mockAsset],
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
        expect(mockDocumentProcessing.processDocumentForClaude).toHaveBeenCalledWith(
          'file://test',
          'application/octet-stream',
          expect.any(String)
        );
      });
    });
  });
});