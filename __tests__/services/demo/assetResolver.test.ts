import { resolveDemoAsset } from '@/services/demo/assetResolver';

jest.mock('@/services/demo/demoAssets', () => ({
  demoAssets: {
    icon: 123,
    banner: 456,
  },
}));

describe('resolveDemoAsset', () => {
  it('returns undefined when ref is falsy or non-asset', () => {
    expect(resolveDemoAsset()).toBeUndefined();
    expect(resolveDemoAsset('https://example.com/image.png')).toBeUndefined();
    expect(resolveDemoAsset('data:image/png;base64,abc')).toBeUndefined();
  });

  it('looks up asset keys in demoAssets map', () => {
    expect(resolveDemoAsset('asset:icon')).toBe(123);
    expect(resolveDemoAsset('asset:banner')).toBe(456);
    expect(resolveDemoAsset('asset:missing')).toBeUndefined();
  });
});
