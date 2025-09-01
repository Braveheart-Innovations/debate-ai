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

