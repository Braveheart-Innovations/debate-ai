jest.mock('expo-file-system', () => ({
  cacheDirectory: '/cache/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
}));

import * as FileSystem from 'expo-file-system';
import { saveBase64Image } from '@/services/images/fileCache';

const mockGetInfoAsync = FileSystem.getInfoAsync as jest.Mock;
const mockMakeDirectoryAsync = FileSystem.makeDirectoryAsync as jest.Mock;
const mockWriteAsStringAsync = FileSystem.writeAsStringAsync as jest.Mock;

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
