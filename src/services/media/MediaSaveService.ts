import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';

export interface SaveResult {
  assetId: string;
  uri: string;
  albumCreated?: boolean;
}

export class MediaSaveService {
  static async ensurePermission(): Promise<boolean> {
    const { status, granted, canAskAgain } = await MediaLibrary.getPermissionsAsync();
    if (granted) return true;
    if (status !== 'granted' && canAskAgain) {
      const req = await MediaLibrary.requestPermissionsAsync();
      return req.granted;
    }
    return false;
  }

  static async saveImageBase64(base64: string, opts?: { ext?: 'png' | 'jpg' | 'jpeg'; filename?: string; album?: string }): Promise<SaveResult> {
    const ok = await this.ensurePermission();
    if (!ok) throw new Error('Photos permission not granted');

    const ext = opts?.ext || 'png';
    const filename = opts?.filename || `image_${Date.now()}.${ext}`;
    const fileUri = FileSystem.cacheDirectory + filename;

    await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
    const asset = await MediaLibrary.createAssetAsync(fileUri);

    let albumCreated = false;
    if (opts?.album) {
      try {
        const album = await MediaLibrary.getAlbumAsync(opts.album);
        if (album) {
          await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
        } else {
          await MediaLibrary.createAlbumAsync(opts.album, asset, false);
          albumCreated = true;
        }
      } catch {
        // Non-fatal if album ops fail
      }
    }

    return { assetId: asset.id, uri: asset.uri || fileUri, albumCreated };
  }

  static async saveFileUri(fileUri: string, opts?: { album?: string }): Promise<SaveResult> {
    const ok = await this.ensurePermission();
    if (!ok) throw new Error('Photos permission not granted');

    const asset = await MediaLibrary.createAssetAsync(fileUri);
    let albumCreated = false;
    if (opts?.album) {
      try {
        const album = await MediaLibrary.getAlbumAsync(opts.album);
        if (album) {
          await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
        } else {
          await MediaLibrary.createAlbumAsync(opts.album, asset, false);
          albumCreated = true;
        }
      } catch {}
    }
    return { assetId: asset.id, uri: asset.uri || fileUri, albumCreated };
  }

  static async saveRemoteUrl(url: string, opts?: { filename?: string; album?: string }): Promise<SaveResult> {
    const ok = await this.ensurePermission();
    if (!ok) throw new Error('Photos permission not granted');

    const filename = opts?.filename || `${Date.now()}_${url.split('/').pop() || 'file'}`;
    const target = FileSystem.cacheDirectory + filename;
    const { uri } = await FileSystem.downloadAsync(url, target);
    return this.saveFileUri(uri, { album: opts?.album });
  }
}

export default MediaSaveService;

