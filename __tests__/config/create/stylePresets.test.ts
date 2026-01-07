/**
 * Tests for stylePresets configuration
 */
import {
  STYLE_PRESETS,
  getStylePreset,
  getStylePromptSuffix,
  buildEnhancedPrompt,
  StylePresetConfig,
} from '@/config/create/stylePresets';
import type { StylePreset } from '@/store/createSlice';

describe('stylePresets', () => {
  describe('STYLE_PRESETS constant', () => {
    it('contains all expected style presets', () => {
      const expectedStyles: StylePreset[] = [
        'none',
        'photo',
        'cinematic',
        'anime',
        'digital-art',
        'oil-painting',
        'watercolor',
        'sketch',
        '3d-render',
      ];

      expectedStyles.forEach(styleId => {
        const preset = STYLE_PRESETS.find(s => s.id === styleId);
        expect(preset).toBeDefined();
      });

      expect(STYLE_PRESETS).toHaveLength(expectedStyles.length);
    });

    it('has required properties for each preset', () => {
      STYLE_PRESETS.forEach(preset => {
        expect(preset).toHaveProperty('id');
        expect(preset).toHaveProperty('label');
        expect(preset).toHaveProperty('description');
        expect(preset).toHaveProperty('promptSuffix');
        expect(preset).toHaveProperty('icon');

        expect(typeof preset.id).toBe('string');
        expect(typeof preset.label).toBe('string');
        expect(typeof preset.description).toBe('string');
        expect(typeof preset.promptSuffix).toBe('string');
        expect(typeof preset.icon).toBe('string');
      });
    });

    it('none preset has empty prompt suffix', () => {
      const nonePreset = STYLE_PRESETS.find(s => s.id === 'none');
      expect(nonePreset).toBeDefined();
      expect(nonePreset?.promptSuffix).toBe('');
    });

    it('all non-none presets have non-empty prompt suffixes', () => {
      const nonNonePresets = STYLE_PRESETS.filter(s => s.id !== 'none');
      nonNonePresets.forEach(preset => {
        expect(preset.promptSuffix.length).toBeGreaterThan(0);
      });
    });

    it('all presets have valid Ionicons icon names', () => {
      STYLE_PRESETS.forEach(preset => {
        // Icon names should follow Ionicons naming convention (contain -outline)
        expect(preset.icon).toMatch(/-outline$/);
      });
    });

    it('all presets have unique ids', () => {
      const ids = STYLE_PRESETS.map(s => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('all presets have unique labels', () => {
      const labels = STYLE_PRESETS.map(s => s.label);
      const uniqueLabels = new Set(labels);
      expect(uniqueLabels.size).toBe(labels.length);
    });
  });

  describe('getStylePreset', () => {
    it('returns correct preset for valid id', () => {
      const preset = getStylePreset('cinematic');
      expect(preset).toBeDefined();
      expect(preset?.id).toBe('cinematic');
      expect(preset?.label).toBe('Cinematic');
    });

    it('returns undefined for invalid id', () => {
      const preset = getStylePreset('invalid-style' as StylePreset);
      expect(preset).toBeUndefined();
    });

    it('returns preset for each valid style id', () => {
      const validStyles: StylePreset[] = [
        'none', 'photo', 'cinematic', 'anime', 'digital-art',
        'oil-painting', 'watercolor', 'sketch', '3d-render',
      ];

      validStyles.forEach(styleId => {
        const preset = getStylePreset(styleId);
        expect(preset).toBeDefined();
        expect(preset?.id).toBe(styleId);
      });
    });
  });

  describe('getStylePromptSuffix', () => {
    it('returns empty string for none style', () => {
      const suffix = getStylePromptSuffix('none');
      expect(suffix).toBe('');
    });

    it('returns non-empty string for other styles', () => {
      const styles: StylePreset[] = [
        'photo', 'cinematic', 'anime', 'digital-art',
        'oil-painting', 'watercolor', 'sketch', '3d-render',
      ];

      styles.forEach(styleId => {
        const suffix = getStylePromptSuffix(styleId);
        expect(suffix.length).toBeGreaterThan(0);
      });
    });

    it('returns empty string for invalid style', () => {
      const suffix = getStylePromptSuffix('invalid-style' as StylePreset);
      expect(suffix).toBe('');
    });

    it('returns correct suffix for photo style', () => {
      const suffix = getStylePromptSuffix('photo');
      expect(suffix).toContain('Photorealistic');
    });

    it('returns correct suffix for cinematic style', () => {
      const suffix = getStylePromptSuffix('cinematic');
      expect(suffix).toContain('Cinematic');
      expect(suffix).toContain('dramatic');
    });

    it('returns correct suffix for anime style', () => {
      const suffix = getStylePromptSuffix('anime');
      expect(suffix).toContain('Anime');
      expect(suffix).toContain('Japanese animation');
    });

    it('returns correct suffix for 3d-render style', () => {
      const suffix = getStylePromptSuffix('3d-render');
      expect(suffix).toContain('3D');
      expect(suffix).toContain('CGI');
    });
  });

  describe('buildEnhancedPrompt', () => {
    it('returns original prompt when style is none', () => {
      const prompt = 'A beautiful mountain landscape';
      const enhanced = buildEnhancedPrompt(prompt, 'none');
      expect(enhanced).toBe(prompt);
    });

    it('appends style suffix for non-none styles', () => {
      const prompt = 'A beautiful mountain landscape';
      const enhanced = buildEnhancedPrompt(prompt, 'cinematic');
      expect(enhanced).toContain(prompt);
      expect(enhanced).toContain('Cinematic');
      expect(enhanced.length).toBeGreaterThan(prompt.length);
    });

    it('joins prompt and suffix with period and space', () => {
      const prompt = 'A cat sitting on a windowsill';
      const enhanced = buildEnhancedPrompt(prompt, 'photo');
      expect(enhanced).toMatch(/^A cat sitting on a windowsill\. Photorealistic/);
    });

    it('handles empty prompt', () => {
      const enhanced = buildEnhancedPrompt('', 'cinematic');
      const suffix = getStylePromptSuffix('cinematic');
      expect(enhanced).toBe(`. ${suffix}`);
    });

    it('handles prompt with trailing period', () => {
      const prompt = 'A sunset over the ocean.';
      const enhanced = buildEnhancedPrompt(prompt, 'watercolor');
      // Should still work but might have double period
      expect(enhanced).toContain('Watercolor');
    });

    it('preserves original prompt in enhanced output', () => {
      const prompt = 'A dragon flying through clouds';
      const enhanced = buildEnhancedPrompt(prompt, 'digital-art');
      expect(enhanced.startsWith(prompt)).toBe(true);
    });

    it('returns correct enhanced prompt for each style', () => {
      const prompt = 'A forest scene';
      const styles: StylePreset[] = [
        'photo', 'cinematic', 'anime', 'digital-art',
        'oil-painting', 'watercolor', 'sketch', '3d-render',
      ];

      styles.forEach(styleId => {
        const enhanced = buildEnhancedPrompt(prompt, styleId);
        const suffix = getStylePromptSuffix(styleId);
        expect(enhanced).toBe(`${prompt}. ${suffix}`);
      });
    });
  });

  describe('preset content validation', () => {
    it('photo preset contains photography keywords', () => {
      const preset = getStylePreset('photo');
      expect(preset?.promptSuffix.toLowerCase()).toContain('photo');
      expect(preset?.promptSuffix.toLowerCase()).toMatch(/professional|high quality/);
    });

    it('cinematic preset contains film keywords', () => {
      const preset = getStylePreset('cinematic');
      expect(preset?.promptSuffix.toLowerCase()).toMatch(/film|movie|dramatic/);
    });

    it('anime preset contains animation keywords', () => {
      const preset = getStylePreset('anime');
      expect(preset?.promptSuffix.toLowerCase()).toMatch(/anime|japanese|animation/);
    });

    it('digital-art preset contains digital keywords', () => {
      const preset = getStylePreset('digital-art');
      expect(preset?.promptSuffix.toLowerCase()).toMatch(/digital|illustration/);
    });

    it('oil-painting preset contains painting keywords', () => {
      const preset = getStylePreset('oil-painting');
      expect(preset?.promptSuffix.toLowerCase()).toMatch(/oil|painting|brush/);
    });

    it('watercolor preset contains watercolor keywords', () => {
      const preset = getStylePreset('watercolor');
      expect(preset?.promptSuffix.toLowerCase()).toMatch(/watercolor|soft|wash/);
    });

    it('sketch preset contains sketch keywords', () => {
      const preset = getStylePreset('sketch');
      expect(preset?.promptSuffix.toLowerCase()).toMatch(/sketch|pencil|drawn/);
    });

    it('3d-render preset contains 3D keywords', () => {
      const preset = getStylePreset('3d-render');
      expect(preset?.promptSuffix.toLowerCase()).toMatch(/3d|render|cgi|ray/);
    });
  });
});
