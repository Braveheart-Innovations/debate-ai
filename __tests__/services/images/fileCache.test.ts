jest.mock('expo-file-system', () => ({
  cacheDirectory: '/cache/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
}));

import * as FileSystem from 'expo-file-system';
import { saveBase64Image, loadBase64FromFileUri } from '@/services/images/fileCache';

const mockGetInfoAsync = FileSystem.getInfoAsync as jest.Mock;
const mockMakeDirectoryAsync = FileSystem.makeDirectoryAsync as jest.Mock;
const mockWriteAsStringAsync = FileSystem.writeAsStringAsync as jest.Mock;
const mockReadAsStringAsync = FileSystem.readAsStringAsync as jest.Mock;

describe('fileCache.saveBase64Image', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    jest.spyOn(Math, 'random').mockReturnValue(0.123456789);
    mockGetInfoAsync.mockResolvedValue({ exists: true });
    mockMakeDirectoryAsync.mockResolvedValue(undefined);
    mockWriteAsStringAsync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates directory when missing and returns png path by default', async () => {
    mockGetInfoAsync.mockResolvedValueOnce({ exists: false });

    const path = await saveBase64Image('YmFzZTY0', 'image/png');

    expect(mockGetInfoAsync).toHaveBeenCalledWith('/cache/images/');
    expect(mockMakeDirectoryAsync).toHaveBeenCalledWith('/cache/images/', { intermediates: true });
    expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
      '/cache/images/1700000000000_4fzzzxjylrx.png',
      'YmFzZTY0',
      { encoding: FileSystem.EncodingType.Base64 }
    );
    expect(path).toBe('/cache/images/1700000000000_4fzzzxjylrx.png');
  });

  it('uses jpg extension when mime suggests jpeg', async () => {
    const path = await saveBase64Image('YmFzZTY0', 'image/jpeg');
    expect(path.endsWith('.jpg')).toBe(true);
  });

  it('uses webp extension when mime suggests webp', async () => {
    const path = await saveBase64Image('YmFzZTY0', 'image/webp');
    expect(path.endsWith('.webp')).toBe(true);
  });

  it('ignores directory errors but still writes file', async () => {
    mockGetInfoAsync.mockRejectedValueOnce(new Error('fs error'));

    const path = await saveBase64Image('YmFzZTY0', 'image/png');

    expect(mockWriteAsStringAsync).toHaveBeenCalled();
    expect(path).toContain('/cache/images/');
  });
});

describe('fileCache.loadBase64FromFileUri', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInfoAsync.mockResolvedValue({ exists: true });
    mockReadAsStringAsync.mockResolvedValue('aGVsbG8gd29ybGQ=');
  });

  it('extracts base64 from data URI directly', async () => {
    const dataUri = 'data:image/png;base64,aGVsbG8gd29ybGQ=';

    const result = await loadBase64FromFileUri(dataUri);

    expect(result).toBe('aGVsbG8gd29ybGQ=');
    expect(mockGetInfoAsync).not.toHaveBeenCalled();
    expect(mockReadAsStringAsync).not.toHaveBeenCalled();
  });

  it('returns null for malformed data URI', async () => {
    const badDataUri = 'data:image/png,notbase64';

    const result = await loadBase64FromFileUri(badDataUri);

    expect(result).toBeNull();
  });

  it('reads file and returns base64 for file URI', async () => {
    const fileUri = '/cache/images/test.png';
    mockGetInfoAsync.mockResolvedValueOnce({ exists: true });
    mockReadAsStringAsync.mockResolvedValueOnce('YmFzZTY0ZGF0YQ==');

    const result = await loadBase64FromFileUri(fileUri);

    expect(mockGetInfoAsync).toHaveBeenCalledWith(fileUri);
    expect(mockReadAsStringAsync).toHaveBeenCalledWith(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    expect(result).toBe('YmFzZTY0ZGF0YQ==');
  });

  it('returns null when file does not exist', async () => {
    const fileUri = '/cache/images/nonexistent.png';
    mockGetInfoAsync.mockResolvedValueOnce({ exists: false });

    const result = await loadBase64FromFileUri(fileUri);

    expect(result).toBeNull();
    expect(mockReadAsStringAsync).not.toHaveBeenCalled();
  });

  it('returns null and logs warning when read fails', async () => {
    const fileUri = '/cache/images/test.png';
    mockGetInfoAsync.mockResolvedValueOnce({ exists: true });
    mockReadAsStringAsync.mockRejectedValueOnce(new Error('Read error'));

    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const result = await loadBase64FromFileUri(fileUri);

    expect(result).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[fileCache] Failed to load base64 from file:',
      expect.any(Error)
    );

    consoleWarnSpy.mockRestore();
  });

  it('returns null and logs warning when getInfoAsync fails', async () => {
    const fileUri = '/cache/images/test.png';
    mockGetInfoAsync.mockRejectedValueOnce(new Error('Info error'));

    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const result = await loadBase64FromFileUri(fileUri);

    expect(result).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });
});
