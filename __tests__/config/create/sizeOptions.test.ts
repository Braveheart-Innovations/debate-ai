/**
 * Tests for sizeOptions configuration
 */
import {
  SIZE_OPTIONS,
  mapSizeToProvider,
  getSizeOption,
  SizeOptionConfig,
} from '@/config/create/sizeOptions';
import type { SizeOption } from '@/store/createSlice';
import type { AIProvider } from '@/types';

describe('sizeOptions', () => {
  describe('SIZE_OPTIONS constant', () => {
    it('contains all expected size options', () => {
      const expectedSizes: SizeOption[] = ['auto', 'square', 'portrait', 'landscape'];

      expectedSizes.forEach(sizeId => {
        const option = SIZE_OPTIONS.find(s => s.id === sizeId);
        expect(option).toBeDefined();
      });

      expect(SIZE_OPTIONS).toHaveLength(expectedSizes.length);
    });

    it('has required properties for each option', () => {
      SIZE_OPTIONS.forEach(option => {
        expect(option).toHaveProperty('id');
        expect(option).toHaveProperty('label');
        expect(option).toHaveProperty('description');
        expect(option).toHaveProperty('aspect');
        expect(option).toHaveProperty('preview');
        expect(option).toHaveProperty('icon');

        expect(typeof option.id).toBe('string');
        expect(typeof option.label).toBe('string');
        expect(typeof option.description).toBe('string');
        expect(typeof option.aspect).toBe('number');
        expect(typeof option.preview).toBe('string');
        expect(typeof option.icon).toBe('string');
      });
    });

    it('has valid aspect ratios', () => {
      SIZE_OPTIONS.forEach(option => {
        expect(option.aspect).toBeGreaterThan(0);
      });

      // Square and auto should have 1:1 aspect
      const square = SIZE_OPTIONS.find(s => s.id === 'square');
      const auto = SIZE_OPTIONS.find(s => s.id === 'auto');
      expect(square?.aspect).toBe(1);
      expect(auto?.aspect).toBe(1);

      // Portrait should have aspect < 1 (width/height)
      const portrait = SIZE_OPTIONS.find(s => s.id === 'portrait');
      expect(portrait?.aspect).toBeLessThan(1);

      // Landscape should have aspect > 1 (width/height)
      const landscape = SIZE_OPTIONS.find(s => s.id === 'landscape');
      expect(landscape?.aspect).toBeGreaterThan(1);
    });

    it('all options have valid Ionicons icon names', () => {
      SIZE_OPTIONS.forEach(option => {
        expect(option.icon).toMatch(/-outline$/);
      });
    });

    it('all options have unique ids', () => {
      const ids = SIZE_OPTIONS.map(s => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('all options have unique labels', () => {
      const labels = SIZE_OPTIONS.map(s => s.label);
      const uniqueLabels = new Set(labels);
      expect(uniqueLabels.size).toBe(labels.length);
    });

    it('preview strings are readable', () => {
      SIZE_OPTIONS.forEach(option => {
        expect(option.preview.length).toBeGreaterThan(0);
        // Should either be "Auto" or a ratio like "1:1", "2:3", "3:2"
        expect(option.preview).toMatch(/^(Auto|\d+:\d+)$/);
      });
    });
  });

  describe('getSizeOption', () => {
    it('returns correct option for valid id', () => {
      const option = getSizeOption('square');
      expect(option).toBeDefined();
      expect(option?.id).toBe('square');
      expect(option?.label).toBe('Square');
    });

    it('returns undefined for invalid id', () => {
      const option = getSizeOption('invalid-size' as SizeOption);
      expect(option).toBeUndefined();
    });

    it('returns option for each valid size id', () => {
      const validSizes: SizeOption[] = ['auto', 'square', 'portrait', 'landscape'];

      validSizes.forEach(sizeId => {
        const option = getSizeOption(sizeId);
        expect(option).toBeDefined();
        expect(option?.id).toBe(sizeId);
      });
    });
  });

  describe('mapSizeToProvider', () => {
    describe('OpenAI provider', () => {
      it('returns 1024x1024 for auto', () => {
        expect(mapSizeToProvider('auto', 'openai')).toBe('1024x1024');
      });

      it('returns 1024x1024 for square', () => {
        expect(mapSizeToProvider('square', 'openai')).toBe('1024x1024');
      });

      it('returns 1024x1536 for portrait', () => {
        expect(mapSizeToProvider('portrait', 'openai')).toBe('1024x1536');
      });

      it('returns 1536x1024 for landscape', () => {
        expect(mapSizeToProvider('landscape', 'openai')).toBe('1536x1024');
      });

      it('returns 1024x1024 for unknown size', () => {
        expect(mapSizeToProvider('unknown' as SizeOption, 'openai')).toBe('1024x1024');
      });
    });

    describe('Google provider', () => {
      it('returns 1:1 for auto', () => {
        expect(mapSizeToProvider('auto', 'google')).toBe('1:1');
      });

      it('returns 1:1 for square', () => {
        expect(mapSizeToProvider('square', 'google')).toBe('1:1');
      });

      it('returns 9:16 for portrait', () => {
        expect(mapSizeToProvider('portrait', 'google')).toBe('9:16');
      });

      it('returns 16:9 for landscape', () => {
        expect(mapSizeToProvider('landscape', 'google')).toBe('16:9');
      });

      it('returns 1:1 for unknown size', () => {
        expect(mapSizeToProvider('unknown' as SizeOption, 'google')).toBe('1:1');
      });
    });

    describe('Grok provider', () => {
      it('returns empty string for auto (no size support)', () => {
        expect(mapSizeToProvider('auto', 'grok')).toBe('');
      });

      it('returns empty string for square', () => {
        expect(mapSizeToProvider('square', 'grok')).toBe('');
      });

      it('returns empty string for portrait', () => {
        expect(mapSizeToProvider('portrait', 'grok')).toBe('');
      });

      it('returns empty string for landscape', () => {
        expect(mapSizeToProvider('landscape', 'grok')).toBe('');
      });
    });

    describe('unknown provider', () => {
      it('returns 1024x1024 as default for unknown providers', () => {
        expect(mapSizeToProvider('auto', 'claude' as AIProvider)).toBe('1024x1024');
        expect(mapSizeToProvider('square', 'unknown-provider' as AIProvider)).toBe('1024x1024');
      });
    });

    describe('all valid combinations', () => {
      const sizes: SizeOption[] = ['auto', 'square', 'portrait', 'landscape'];
      const providers: AIProvider[] = ['openai', 'google', 'grok'];

      it('returns string for all valid size/provider combinations', () => {
        sizes.forEach(size => {
          providers.forEach(provider => {
            const result = mapSizeToProvider(size, provider);
            expect(typeof result).toBe('string');
          });
        });
      });

      it('OpenAI sizes follow pixel format', () => {
        sizes.forEach(size => {
          const result = mapSizeToProvider(size, 'openai');
          expect(result).toMatch(/^\d+x\d+$/);
        });
      });

      it('Google sizes follow aspect ratio format (except empty)', () => {
        sizes.forEach(size => {
          const result = mapSizeToProvider(size, 'google');
          expect(result).toMatch(/^\d+:\d+$/);
        });
      });
    });
  });

  describe('size option content validation', () => {
    it('auto option indicates provider default', () => {
      const auto = getSizeOption('auto');
      expect(auto?.description.toLowerCase()).toContain('default');
    });

    it('square option indicates 1:1 aspect', () => {
      const square = getSizeOption('square');
      expect(square?.preview).toBe('1:1');
      expect(square?.aspect).toBe(1);
    });

    it('portrait option indicates vertical orientation', () => {
      const portrait = getSizeOption('portrait');
      expect(portrait?.description.toLowerCase()).toContain('vertical');
    });

    it('landscape option indicates horizontal orientation', () => {
      const landscape = getSizeOption('landscape');
      expect(landscape?.description.toLowerCase()).toContain('horizontal');
    });
  });

  describe('aspect ratio calculations', () => {
    it('portrait aspect is approximately 2:3', () => {
      const portrait = getSizeOption('portrait');
      expect(portrait?.aspect).toBeCloseTo(2 / 3, 5);
    });

    it('landscape aspect is approximately 3:2', () => {
      const landscape = getSizeOption('landscape');
      expect(landscape?.aspect).toBeCloseTo(3 / 2, 5);
    });

    it('portrait and landscape aspects are reciprocals', () => {
      const portrait = getSizeOption('portrait');
      const landscape = getSizeOption('landscape');
      if (portrait && landscape) {
        expect(portrait.aspect * landscape.aspect).toBeCloseTo(1, 5);
      }
    });
  });
});
