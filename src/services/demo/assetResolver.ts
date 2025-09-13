import { demoAssets } from './demoAssets';

/**
 * Resolve an asset reference from the demo pack.
 * - Supports values like 'asset:key' to look up in demoAssets mapping.
 * - Returns a require() module id for React Native <Image source>.
 */
export function resolveDemoAsset(ref?: string): number | undefined {
  if (!ref) return undefined;
  if (ref.startsWith('asset:')) {
    const key = ref.slice('asset:'.length);
    return demoAssets[key];
  }
  // For data URLs or remote URLs, leave resolution to the consumer
  return undefined;
}

