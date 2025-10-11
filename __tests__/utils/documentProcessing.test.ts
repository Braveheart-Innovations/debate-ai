import {
  SUPPORTED_DOCUMENT_TYPES,
  MAX_DOCUMENT_SIZE,
  isSupportedDocumentType,
  isSupportedImageType,
  validateDocumentSize,
  processDocumentForClaude,
  getFileExtensionFromMimeType,
  formatAttachmentForDisplay,
  getDocumentIcon,
} from '@/utils/documentProcessing';

describe('documentProcessing', () => {
  const originalFetch = global.fetch;
  const originalFileReader = global.FileReader;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    // @ts-expect-error restore
    global.FileReader = originalFileReader;
  });

  it('detects supported document and image types', () => {
    SUPPORTED_DOCUMENT_TYPES.forEach(type => expect(isSupportedDocumentType(type)).toBe(true));
    expect(isSupportedDocumentType('application/zip')).toBe(false);
    expect(isSupportedImageType('image/png')).toBe(true);
    expect(isSupportedImageType('image/webp')).toBe(true);
    expect(isSupportedImageType('video/mp4')).toBe(false);
  });

  it('validates document size', () => {
    expect(validateDocumentSize(MAX_DOCUMENT_SIZE - 1)).toEqual({ valid: true });
    expect(validateDocumentSize(MAX_DOCUMENT_SIZE + 1)).toEqual({
      valid: false,
      error: expect.stringContaining(`${MAX_DOCUMENT_SIZE / (1024 * 1024)}MB`),
    });
  });

  it('processes document and returns attachment metadata', async () => {
    const mockBlob = { size: 1234 };
    const mockResponse = {
      blob: jest.fn().mockResolvedValue(mockBlob),
    };
    global.fetch = jest.fn().mockResolvedValue(mockResponse);

    class MockFileReader {
      public result: string | null = null;
      public onloadend: (() => void) | null = null;
      public onerror: ((err: unknown) => void) | null = null;
      readAsDataURL() {
        this.result = 'data:application/pdf;base64,Zm9vYmFy';
        this.onloadend?.();
      }
    }

    // @ts-expect-error override at runtime
    global.FileReader = MockFileReader;

    const attachment = await processDocumentForClaude('file://doc.pdf', 'application/pdf', 'doc.pdf');
    expect(attachment).toEqual(expect.objectContaining({
      type: 'document',
      mimeType: 'application/pdf',
      base64: 'Zm9vYmFy',
      fileSize: 1234,
    }));
  });

  it('throws when document processing fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
    await expect(processDocumentForClaude('uri', 'application/pdf')).rejects.toThrow('Failed to process document: network error');
  });

  it('maps file extensions and formats attachments for display', () => {
    expect(getFileExtensionFromMimeType('application/pdf')).toBe('pdf');
    expect(getFileExtensionFromMimeType('unknown/type')).toBe('file');
    expect(getDocumentIcon('pdf')).toBe('📄');
    expect(getDocumentIcon('unknown')).toBe('📎');

    const formatted = formatAttachmentForDisplay({
      type: 'document',
      mimeType: 'application/pdf',
      fileName: 'report.pdf',
    } as any);
    expect(formatted).toBe('📄 report.pdf');

    const fallback = formatAttachmentForDisplay({
      type: 'document',
      mimeType: 'application/json',
    } as any);
    expect(fallback).toBe('📋 JSON Document');

    const imageLabel = formatAttachmentForDisplay({ type: 'image', mimeType: 'image/png' } as any);
    expect(imageLabel).toBe('📷 Image');
  });
});
