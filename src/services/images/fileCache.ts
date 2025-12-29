import * as FileSystem from 'expo-file-system';

export async function saveBase64Image(b64: string, mimeType: string): Promise<string> {
  const dir = FileSystem.cacheDirectory + 'images/';
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  } catch {
    // ignore
  }
  const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg'
    : mimeType.includes('webp') ? 'webp'
    : 'png';
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const path = dir + filename;
  await FileSystem.writeAsStringAsync(path, b64, { encoding: FileSystem.EncodingType.Base64 });
  return path;
}

/**
 * Load base64 data from a file URI (for img2img refinement)
 * @param fileUri - The file:// URI or cache path of the image
 * @returns Base64 string of the image, or null if loading fails
 */
export async function loadBase64FromFileUri(fileUri: string): Promise<string | null> {
  try {
    // Handle data URIs - extract base64 directly
    if (fileUri.startsWith('data:')) {
      const match = fileUri.match(/^data:[^;]+;base64,(.+)$/);
      return match ? match[1] : null;
    }

    // Check if file exists
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) {
      console.warn('[fileCache] File not found:', fileUri);
      return null;
    }

    // Read file as base64
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return base64;
  } catch (error) {
    console.warn('[fileCache] Failed to load base64 from file:', error);
    return null;
  }
}

