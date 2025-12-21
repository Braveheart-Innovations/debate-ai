import {
  breakpoints,
  tabletSpacing,
  tabletTypographySizes,
  getResponsiveSpacing,
  getResponsiveFontSize,
  containerMaxWidths,
} from '@/theme/breakpoints';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';

describe('breakpoints', () => {
  describe('breakpoint values', () => {
    it('defines phone breakpoint at 0', () => {
      expect(breakpoints.phone).toBe(0);
    });

    it('defines tablet breakpoint at 768', () => {
      expect(breakpoints.tablet).toBe(768);
    });

    it('defines tabletLarge breakpoint at 1024', () => {
      expect(breakpoints.tabletLarge).toBe(1024);
    });
  });

  describe('tabletSpacing', () => {
    it('has all spacing keys', () => {
      expect(tabletSpacing).toHaveProperty('xs');
      expect(tabletSpacing).toHaveProperty('sm');
      expect(tabletSpacing).toHaveProperty('md');
      expect(tabletSpacing).toHaveProperty('lg');
      expect(tabletSpacing).toHaveProperty('xl');
      expect(tabletSpacing).toHaveProperty('2xl');
      expect(tabletSpacing).toHaveProperty('3xl');
    });

    it('has values approximately 1.25x phone spacing', () => {
      expect(tabletSpacing.xs).toBe(5);   // 4 * 1.25 = 5
      expect(tabletSpacing.sm).toBe(10);  // 8 * 1.25 = 10
      expect(tabletSpacing.md).toBe(20);  // 16 * 1.25 = 20
      expect(tabletSpacing.lg).toBe(30);  // 24 * 1.25 = 30
      expect(tabletSpacing.xl).toBe(40);  // 32 * 1.25 = 40
      expect(tabletSpacing['2xl']).toBe(60); // 48 * 1.25 = 60
      expect(tabletSpacing['3xl']).toBe(80); // 64 * 1.25 = 80
    });

    it('has larger values than phone spacing for all keys', () => {
      expect(tabletSpacing.xs).toBeGreaterThan(spacing.xs);
      expect(tabletSpacing.sm).toBeGreaterThan(spacing.sm);
      expect(tabletSpacing.md).toBeGreaterThan(spacing.md);
      expect(tabletSpacing.lg).toBeGreaterThan(spacing.lg);
      expect(tabletSpacing.xl).toBeGreaterThan(spacing.xl);
      expect(tabletSpacing['2xl']).toBeGreaterThan(spacing['2xl']);
      expect(tabletSpacing['3xl']).toBeGreaterThan(spacing['3xl']);
    });
  });

  describe('tabletTypographySizes', () => {
    it('has all font size keys', () => {
      expect(tabletTypographySizes).toHaveProperty('xs');
      expect(tabletTypographySizes).toHaveProperty('sm');
      expect(tabletTypographySizes).toHaveProperty('md');
      expect(tabletTypographySizes).toHaveProperty('base');
      expect(tabletTypographySizes).toHaveProperty('lg');
      expect(tabletTypographySizes).toHaveProperty('xl');
      expect(tabletTypographySizes).toHaveProperty('2xl');
      expect(tabletTypographySizes).toHaveProperty('3xl');
      expect(tabletTypographySizes).toHaveProperty('4xl');
      expect(tabletTypographySizes).toHaveProperty('5xl');
    });

    it('has values approximately 1.15x phone sizes', () => {
      expect(tabletTypographySizes.xs).toBe(14);   // 12 * 1.15 ≈ 14
      expect(tabletTypographySizes.sm).toBe(16);   // 14 * 1.15 ≈ 16
      expect(tabletTypographySizes.base).toBe(18); // 16 * 1.15 ≈ 18
      expect(tabletTypographySizes.lg).toBe(21);   // 18 * 1.15 ≈ 21
      expect(tabletTypographySizes.xl).toBe(23);   // 20 * 1.15 ≈ 23
      expect(tabletTypographySizes['2xl']).toBe(28); // 24 * 1.15 ≈ 28
    });

    it('has larger values than phone sizes for all keys', () => {
      expect(tabletTypographySizes.xs).toBeGreaterThan(typography.sizes.xs);
      expect(tabletTypographySizes.sm).toBeGreaterThan(typography.sizes.sm);
      expect(tabletTypographySizes.base).toBeGreaterThan(typography.sizes.base);
      expect(tabletTypographySizes.lg).toBeGreaterThan(typography.sizes.lg);
      expect(tabletTypographySizes.xl).toBeGreaterThan(typography.sizes.xl);
      expect(tabletTypographySizes['2xl']).toBeGreaterThan(typography.sizes['2xl']);
    });
  });

  describe('getResponsiveSpacing', () => {
    it('returns phone spacing when isTablet is false', () => {
      expect(getResponsiveSpacing('xs', false)).toBe(spacing.xs);
      expect(getResponsiveSpacing('md', false)).toBe(spacing.md);
      expect(getResponsiveSpacing('xl', false)).toBe(spacing.xl);
    });

    it('returns tablet spacing when isTablet is true', () => {
      expect(getResponsiveSpacing('xs', true)).toBe(tabletSpacing.xs);
      expect(getResponsiveSpacing('md', true)).toBe(tabletSpacing.md);
      expect(getResponsiveSpacing('xl', true)).toBe(tabletSpacing.xl);
    });

    it('handles all spacing keys', () => {
      const keys: Array<'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'> =
        ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'];

      keys.forEach(key => {
        expect(getResponsiveSpacing(key, false)).toBe(spacing[key]);
        expect(getResponsiveSpacing(key, true)).toBe(tabletSpacing[key]);
      });
    });
  });

  describe('getResponsiveFontSize', () => {
    it('returns phone font size when isTablet is false', () => {
      expect(getResponsiveFontSize('xs', false)).toBe(typography.sizes.xs);
      expect(getResponsiveFontSize('base', false)).toBe(typography.sizes.base);
      expect(getResponsiveFontSize('2xl', false)).toBe(typography.sizes['2xl']);
    });

    it('returns tablet font size when isTablet is true', () => {
      expect(getResponsiveFontSize('xs', true)).toBe(tabletTypographySizes.xs);
      expect(getResponsiveFontSize('base', true)).toBe(tabletTypographySizes.base);
      expect(getResponsiveFontSize('2xl', true)).toBe(tabletTypographySizes['2xl']);
    });

    it('handles all font size keys', () => {
      const keys: Array<'xs' | 'sm' | 'md' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl'> =
        ['xs', 'sm', 'md', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'];

      keys.forEach(key => {
        expect(getResponsiveFontSize(key, false)).toBe(typography.sizes[key]);
        expect(getResponsiveFontSize(key, true)).toBe(tabletTypographySizes[key]);
      });
    });
  });

  describe('containerMaxWidths', () => {
    it('defines all container width sizes', () => {
      expect(containerMaxWidths).toHaveProperty('sm');
      expect(containerMaxWidths).toHaveProperty('md');
      expect(containerMaxWidths).toHaveProperty('lg');
      expect(containerMaxWidths).toHaveProperty('xl');
    });

    it('has progressive width values', () => {
      expect(containerMaxWidths.sm).toBe(540);
      expect(containerMaxWidths.md).toBe(720);
      expect(containerMaxWidths.lg).toBe(960);
      expect(containerMaxWidths.xl).toBe(1140);
    });

    it('has ascending order of widths', () => {
      expect(containerMaxWidths.sm).toBeLessThan(containerMaxWidths.md);
      expect(containerMaxWidths.md).toBeLessThan(containerMaxWidths.lg);
      expect(containerMaxWidths.lg).toBeLessThan(containerMaxWidths.xl);
    });
  });
});
