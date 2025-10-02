jest.mock('expo-media-library', () => ({
  __esModule: true,
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  createAssetAsync: jest.fn(),
  getAlbumAsync: jest.fn(),
  addAssetsToAlbumAsync: jest.fn(),
  createAlbumAsync: jest.fn(),
}));

jest.mock('expo-file-system', () => ({
  __esModule: true,
  cacheDirectory: '/cache/',
  writeAsStringAsync: jest.fn(),
  downloadAsync: jest.fn(),
  EncodingType: {
    Base64: 'base64',
  },
}));

import MediaSaveService from '@/services/media/MediaSaveService';

const MediaLibrary = jest.requireMock('expo-media-library') as {
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  createAssetAsync: jest.Mock;
  getAlbumAsync: jest.Mock;
  addAssetsToAlbumAsync: jest.Mock;
  createAlbumAsync: jest.Mock;
};

const FileSystem = jest.requireMock('expo-file-system') as {
  cacheDirectory: string;
  writeAsStringAsync: jest.Mock;
  downloadAsync: jest.Mock;
  EncodingType: { Base64: string };
};

describe('MediaSaveService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const grantPermission = () => {
    MediaLibrary.getPermissionsAsync.mockResolvedValue({ granted: true, status: 'granted', canAskAgain: false });
  };

  it('throws when media permissions are rejected', async () => {
    MediaLibrary.getPermissionsAsync.mockResolvedValue({ granted: false, status: 'denied', canAskAgain: false });

    await expect(MediaSaveService.saveFileUri('/cache/file.png')).rejects.toThrow('Photos permission not granted');
  });

  it('saves base64 image and adds to existing album', async () => {
    grantPermission();
    MediaLibrary.createAssetAsync.mockResolvedValue({ id: 'asset-1', uri: 'asset://1' });
    MediaLibrary.getAlbumAsync.mockResolvedValue({ id: 'album-1' });

    const result = await MediaSaveService.saveImageBase64('ZmFrZQ==', { album: 'Existing', filename: 'file.png', ext: 'png' });

    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith('/cache/file.png', 'ZmFrZQ==', {
      encoding: FileSystem.EncodingType.Base64,
    });
    expect(MediaLibrary.createAssetAsync).toHaveBeenCalledWith('/cache/file.png');
    expect(MediaLibrary.addAssetsToAlbumAsync).toHaveBeenCalledWith([{ id: 'asset-1', uri: 'asset://1' }], { id: 'album-1' }, false);
    expect(MediaLibrary.createAlbumAsync).not.toHaveBeenCalled();
    expect(result).toEqual({ assetId: 'asset-1', uri: 'asset://1', albumCreated: false });
  });

  it('creates album when missing and ignores album errors', async () => {
    grantPermission();
    MediaLibrary.createAssetAsync.mockResolvedValue({ id: 'asset-2', uri: undefined });
    MediaLibrary.getAlbumAsync.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'album-2' });
    MediaLibrary.createAlbumAsync.mockResolvedValue({ id: 'album-2' });

    const result = await MediaSaveService.saveFileUri('/cache/photo.jpg', { album: 'NewAlbum' });

    expect(MediaLibrary.createAlbumAsync).toHaveBeenCalledWith('NewAlbum', { id: 'asset-2', uri: undefined }, false);
    expect(result).toEqual({ assetId: 'asset-2', uri: '/cache/photo.jpg', albumCreated: true });

    MediaLibrary.getAlbumAsync.mockResolvedValue({ id: 'album-error' });
    MediaLibrary.addAssetsToAlbumAsync.mockRejectedValue(new Error('fail'));

    await expect(MediaSaveService.saveFileUri('/cache/photo2.jpg', { album: 'NewAlbum' })).resolves.toMatchObject({ assetId: 'asset-2' });
  });

  it('downloads remote url then delegates to saveFileUri', async () => {
    grantPermission();
    FileSystem.downloadAsync.mockResolvedValue({ uri: '/cache/downloaded.png' });
    const saveSpy = jest.spyOn(MediaSaveService, 'saveFileUri').mockResolvedValue({ assetId: 'asset-x', uri: 'asset://x' });

    const result = await MediaSaveService.saveRemoteUrl('https://example.com/image.png', { filename: 'custom.png', album: 'Album' });

    expect(FileSystem.downloadAsync).toHaveBeenCalledWith('https://example.com/image.png', '/cache/custom.png');
    expect(saveSpy).toHaveBeenCalledWith('/cache/downloaded.png', { album: 'Album' });
    expect(result).toEqual({ assetId: 'asset-x', uri: 'asset://x' });
    saveSpy.mockRestore();
  });

  it('requests permission when not initially granted', async () => {
    MediaLibrary.getPermissionsAsync.mockResolvedValue({ granted: false, status: 'denied', canAskAgain: true });
    MediaLibrary.requestPermissionsAsync.mockResolvedValue({ granted: true });
    MediaLibrary.createAssetAsync.mockResolvedValue({ id: 'asset-3', uri: 'asset://3' });

    const result = await MediaSaveService.saveFileUri('/cache/file.jpg');

    expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalled();
    expect(result.assetId).toBe('asset-3');
  });
});
