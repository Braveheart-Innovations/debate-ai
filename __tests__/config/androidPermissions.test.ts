/**
 * Google Play blocks review of builds that declare READ_MEDIA_IMAGES /
 * READ_MEDIA_VIDEO when the system photo picker covers the use case. Ours
 * does: expo-image-picker uses the Android Photo Picker, and saving to the
 * library needs no read access on Android 13+. app.json `blockedPermissions`
 * emits these `tools:node="remove"` entries, which also strip the copies that
 * library manifests (expo-media-library) merge in. EAS builds from this
 * committed manifest.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const manifest = readFileSync(join(process.cwd(), 'android/app/src/main/AndroidManifest.xml'), 'utf8');
const usesPermissionTags = manifest.match(/<uses-permission\b[^>]*>/g) ?? [];

const BROAD_MEDIA_PERMISSIONS = [
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
];

describe('Android manifest permissions', () => {
  it.each(BROAD_MEDIA_PERMISSIONS)('removes %s instead of requesting it', (permission) => {
    const tags = usesPermissionTags.filter((tag) => tag.includes(`android:name="${permission}"`));
    expect(tags).toEqual([`<uses-permission android:name="${permission}" tools:node="remove"/>`]);
  });
});
