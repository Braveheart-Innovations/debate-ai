import type { DemoPackV1 } from '@/types/demo';

let cachedPack: DemoPackV1 | null = null;

export class DemoContentService {
  static async getPack(): Promise<DemoPackV1> {
    if (cachedPack) return cachedPack;
    // Local static import so bundlers include the asset
    const pack = (await import('@/assets/demo/demo-pack.v1.json')).default as DemoPackV1;
    cachedPack = pack;
    return pack;
  }

  static clearCache(): void {
    cachedPack = null;
  }
}

export default DemoContentService;

