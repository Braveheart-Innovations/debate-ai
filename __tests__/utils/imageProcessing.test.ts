jest.mock('expo-image-manipulator', () => ({
  __esModule: true,
  manipulateAsync: jest.fn(),
  SaveFormat: {
    PNG: 'png',
    JPEG: 'jpeg',
  },
}));

jest.mock('expo-file-system', () => ({
  __esModule: true,
  readAsStringAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  EncodingType: {
    Base64: 'base64',
  },
}));

import * as imageProcessing from '@/utils/imageProcessing';

const {
  isImageFormatSupported,
  fileUriToBase64,
  getFileInfo,
  resizeImageIfNeeded,
  validateImageSize,
  formatImagesForClaudeMessage,
  getReadableFileSize,
} = imageProcessing;

const ImageManipulator = jest.requireMock('expo-image-manipulator') as {
  manipulateAsync: jest.Mock;
  SaveFormat: { PNG: string; JPEG: string };
};

const FileSystem = jest.requireMock('expo-file-system') as {
  readAsStringAsync: jest.Mock;
  getInfoAsync: jest.Mock;
  EncodingType: { Base64: string };
};

describe('imageProcessing utilities', () => {
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy.mockClear();
  });

  afterAll(() => {
    errorSpy.mockRestore();
  });

  it('validates supported mime types case-insensitively', () => {
    expect(isImageFormatSupported('image/png')).toBe(true);
    expect(isImageFormatSupported('image/JPEG')).toBe(true);
    expect(isImageFormatSupported('image/svg+xml')).toBe(false);
  });

  it('converts file URIs to base64 strings', async () => {
    FileSystem.readAsStringAsync.mockResolvedValue('YmFzZTY0');

    const base64 = await fileUriToBase64('file://image.png');

    expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith('file://image.png', {
      encoding: FileSystem.EncodingType.Base64,
    });
    expect(base64).toBe('YmFzZTY0');
  });

  it('throws with readable error when base64 conversion fails', async () => {
    const failure = new Error('read fail');
    FileSystem.readAsStringAsync.mockRejectedValue(failure);

    await expect(fileUriToBase64('file://broken.png')).rejects.toThrow('Failed to convert image to base64');
    expect(errorSpy).toHaveBeenCalledWith('Error converting file to base64:', failure);
  });

  it('returns file info when file exists', async () => {
    const info = { exists: true, size: 2048, uri: 'file://photo.jpg' };
    FileSystem.getInfoAsync.mockResolvedValue(info);

    const result = await getFileInfo('file://photo.jpg');

    expect(FileSystem.getInfoAsync).toHaveBeenCalledWith('file://photo.jpg', { size: true });
    expect(result).toEqual(info);
  });

  it('propagates a friendly error when file info lookup fails', async () => {
    FileSystem.getInfoAsync.mockResolvedValue({ exists: false });

    await expect(getFileInfo('file://missing.jpg')).rejects.toThrow('Failed to get file information');
    expect(errorSpy).toHaveBeenCalledWith(
      'Error getting file info:',
      expect.objectContaining({ message: 'File does not exist' })
    );
  });

  it('resizes images exceeding max dimension', async () => {
    ImageManipulator.manipulateAsync
      .mockResolvedValueOnce({ width: 2000, height: 1000 })
      .mockResolvedValueOnce({ uri: 'file://resized.png' });

    const result = await resizeImageIfNeeded('file://large.png', 'image/png');

    expect(ImageManipulator.manipulateAsync).toHaveBeenNthCalledWith(
      1,
      'file://large.png',
      [],
      { base64: false }
    );
    expect(ImageManipulator.manipulateAsync).toHaveBeenNthCalledWith(
      2,
      'file://large.png',
      [{ resize: { width: 1568, height: 784 } }],
      {
        compress: 0.9,
        format: ImageManipulator.SaveFormat.PNG,
      }
    );
    expect(result).toEqual({ uri: 'file://resized.png', wasResized: true });
  });

  it('keeps image when within limits', async () => {
    ImageManipulator.manipulateAsync.mockResolvedValue({ width: 800, height: 600, uri: 'file://small.jpg' });

    const result = await resizeImageIfNeeded('file://small.jpg', 'image/jpeg');

    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ uri: 'file://small.jpg', wasResized: false });
  });

  it('returns original image when resize fails', async () => {
    const failure = new Error('manipulate fail');
    ImageManipulator.manipulateAsync.mockRejectedValue(failure);

    const result = await resizeImageIfNeeded('file://broken.jpg', 'image/jpeg');

    expect(result).toEqual({ uri: 'file://broken.jpg', wasResized: false });
    expect(errorSpy).toHaveBeenCalledWith('Error resizing image:', failure);
  });

  it('validates image sizes', async () => {
    const maxBytes = 3.75 * 1024 * 1024;
    FileSystem.getInfoAsync.mockResolvedValueOnce({ exists: true, size: maxBytes - 1, uri: 'file://ok.png' });

    await expect(validateImageSize('file://ok.png')).resolves.toBe(true);

    const failure = new Error('info fail');
    FileSystem.getInfoAsync.mockRejectedValueOnce(failure);
    await expect(validateImageSize('file://bad.png')).resolves.toBe(false);
    expect(errorSpy).toHaveBeenNthCalledWith(1, 'Error getting file info:', failure);
    expect(errorSpy).toHaveBeenNthCalledWith(
      2,
      'Error validating image size:',
      expect.objectContaining({ message: 'Failed to get file information' })
    );
  });

  it('processes images end-to-end when valid', async () => {
    ImageManipulator.manipulateAsync
      .mockResolvedValueOnce({ width: 2000, height: 1000 })
      .mockResolvedValueOnce({ uri: 'file://processed.jpg' });
    FileSystem.getInfoAsync.mockResolvedValue({
      exists: true,
      size: 1234,
      uri: 'file://processed.jpg',
    });
    FileSystem.readAsStringAsync.mockResolvedValue('ZGF0YQ==');

    const result = await imageProcessing.processImageForClaude('file://source.jpg', 'image/jpeg', 'source.jpg');

    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledTimes(2);
    expect(FileSystem.getInfoAsync).toHaveBeenCalledWith('file://processed.jpg', { size: true });
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith('file://processed.jpg', {
      encoding: FileSystem.EncodingType.Base64,
    });
    expect(result).toEqual({
      base64: 'ZGF0YQ==',
      mimeType: 'image/jpeg',
      fileSize: 1234,
      fileName: 'source.jpg',
      wasResized: true,
    });
  });

  it('rejects unsupported image formats', async () => {
    await expect(imageProcessing.processImageForClaude('file://source.bmp', 'image/bmp')).rejects.toThrow(
      'Unsupported image format: image/bmp'
    );
  });

  it('rejects images that remain too large after processing', async () => {
    ImageManipulator.manipulateAsync.mockResolvedValue({ width: 800, height: 600, uri: 'file://large.jpg' });
    FileSystem.getInfoAsync.mockResolvedValue({
      exists: true,
      size: 3.75 * 1024 * 1024 + 10,
      uri: 'file://large.jpg',
    });

    await expect(imageProcessing.processImageForClaude('file://large.jpg', 'image/jpeg')).rejects.toThrow(
      'Image file too large'
    );
    expect(FileSystem.readAsStringAsync).not.toHaveBeenCalled();
  });

  it('processes multiple images, ignoring non-image attachments', async () => {
    const attachments = [
      { type: 'image', uri: 'file://one.png', mimeType: 'image/png', fileName: 'one.png' },
      { type: 'document', uri: 'file://doc.pdf', mimeType: 'application/pdf' },
      { type: 'image', uri: 'file://two.jpg', mimeType: 'image/jpeg' },
    ] as any;

    ImageManipulator.manipulateAsync.mockImplementation(async (uri: string) => ({
      width: 800,
      height: 600,
      uri,
    }));
    FileSystem.getInfoAsync.mockImplementation(async (uri: string) => ({
      exists: true,
      size: uri.includes('one') ? 111 : 222,
      uri,
    }));
    FileSystem.readAsStringAsync.mockImplementation(async (uri: string) =>
      uri.includes('one') ? 'YQ==' : 'Qg=='
    );

    const processed = await imageProcessing.processMultipleImagesForClaude(attachments);

    expect(processed).toEqual([
      {
        base64: 'YQ==',
        mimeType: 'image/png',
        fileSize: 111,
        fileName: 'one.png',
        wasResized: false,
      },
      {
        base64: 'Qg==',
        mimeType: 'image/jpeg',
        fileSize: 222,
        fileName: undefined,
        wasResized: false,
      },
    ]);
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledTimes(2);
  });

  it('enforces maximum attachment limit', async () => {
    const attachments = Array.from({ length: 21 }, (_, index) => ({
      type: 'image',
      uri: `file://${index}.png`,
      mimeType: 'image/png',
    })) as any[];

    await expect(imageProcessing.processMultipleImagesForClaude(attachments)).rejects.toThrow(
      'Maximum 20 images allowed per message'
    );
  });

  it('formats payloads for Claude messages', () => {
    const content = formatImagesForClaudeMessage(
      [
        { base64: 'a', mimeType: 'image/png', fileSize: 1, wasResized: false },
        { base64: 'b', mimeType: 'image/jpeg', fileSize: 2, wasResized: true },
      ],
      'Hello world'
    );

    expect(content[0]).toMatchObject({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'a' },
    });
    expect(content[1]).toMatchObject({
      type: 'image',
      source: { media_type: 'image/jpeg', data: 'b' },
    });
    expect(content[2]).toEqual({ type: 'text', text: 'Hello world' });

    const withoutText = formatImagesForClaudeMessage([], '');
    expect(withoutText).toEqual([]);
  });

  it('returns readable file sizes', () => {
    expect(getReadableFileSize(512)).toBe('512 B');
    expect(getReadableFileSize(2048)).toBe('2.0 KB');
    expect(getReadableFileSize(3 * 1024 * 1024)).toBe('3.00 MB');
  });
});
