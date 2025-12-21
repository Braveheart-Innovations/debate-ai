import { spacing, SpacingKey } from './spacing';
import { typography, FontSize } from './typography';

/**
 * Breakpoints for responsive design
 */
export const breakpoints = {
  phone: 0,
  tablet: 768,
  tabletLarge: 1024,
} as const;

export type Breakpoint = keyof typeof breakpoints;

/**
 * Tablet spacing scale (1.25x of phone spacing)
 */
export const tabletSpacing: Record<SpacingKey, number> = {
  xs: 5,
  sm: 10,
  md: 20,
  lg: 30,
  xl: 40,
  '2xl': 60,
  '3xl': 80,
};

/**
 * Tablet typography sizes (1.15x of phone sizes for better readability)
 */
export const tabletTypographySizes: Record<FontSize, number> = {
  xs: 14,    // 12 * 1.15 ≈ 14
  sm: 16,    // 14 * 1.15 ≈ 16
  md: 17,    // 15 * 1.15 ≈ 17
  base: 18,  // 16 * 1.15 ≈ 18
  lg: 21,    // 18 * 1.15 ≈ 21
  xl: 23,    // 20 * 1.15 ≈ 23
  '2xl': 28, // 24 * 1.15 ≈ 28
  '3xl': 35, // 30 * 1.15 ≈ 35
  '4xl': 41, // 36 * 1.15 ≈ 41
  '5xl': 55, // 48 * 1.15 ≈ 55
};

/**
 * Get spacing value based on device type
 */
export const getResponsiveSpacing = (key: SpacingKey, isTablet: boolean): number => {
  return isTablet ? tabletSpacing[key] : spacing[key];
};

/**
 * Get font size based on device type
 */
export const getResponsiveFontSize = (key: FontSize, isTablet: boolean): number => {
  return isTablet ? tabletTypographySizes[key] : typography.sizes[key];
};

/**
 * Max widths for content containers on larger screens
 */
export const containerMaxWidths = {
  sm: 540,
  md: 720,
  lg: 960,
  xl: 1140,
} as const;

export type ContainerMaxWidth = keyof typeof containerMaxWidths;
