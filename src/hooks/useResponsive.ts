import { useMemo } from 'react';
import { useDeviceType, DeviceInfo } from './useDeviceType';
import { SpacingKey } from '../theme/spacing';
import { FontSize } from '../theme/typography';
import {
  getResponsiveSpacing,
  getResponsiveFontSize,
} from '../theme/breakpoints';

export interface ResponsiveHelpers extends DeviceInfo {
  /**
   * Get responsive spacing value based on device type
   * @param key - Spacing key (xs, sm, md, lg, xl, 2xl, 3xl)
   * @returns Spacing value scaled for current device
   */
  rs: (key: SpacingKey) => number;

  /**
   * Get responsive font size based on device type
   * @param key - Font size key (xs, sm, md, base, lg, xl, 2xl, 3xl, 4xl, 5xl)
   * @returns Font size scaled for current device
   */
  fontSize: (key: FontSize) => number;

  /**
   * Get responsive value based on device type and orientation
   * @param phone - Value for phone devices
   * @param tablet - Value for tablet devices (portrait)
   * @param tabletLandscape - Optional value for tablet landscape (defaults to tablet value)
   * @returns The appropriate value for current device
   */
  responsive: <T>(phone: T, tablet: T, tabletLandscape?: T) => T;

  /**
   * Get responsive grid column count
   * @param phone - Column count for phone
   * @param tablet - Column count for tablet portrait
   * @param tabletLandscape - Optional column count for tablet landscape
   * @returns Column count for current device
   */
  gridColumns: (phone: number, tablet: number, tabletLandscape?: number) => number;
}

/**
 * Main hook for responsive design throughout the app.
 * Provides device info and helper functions for responsive values.
 *
 * @example
 * const { isTablet, responsive, rs, fontSize } = useResponsive();
 *
 * // Responsive value
 * const padding = responsive(16, 24, 32);
 *
 * // Responsive spacing from theme
 * const margin = rs('md'); // 16 on phone, 20 on tablet
 *
 * // Responsive font size
 * const size = fontSize('lg'); // 18 on phone, 21 on tablet
 *
 * // Grid columns
 * const cols = gridColumns(2, 3, 4); // 2 on phone, 3 on tablet, 4 on tablet landscape
 */
export function useResponsive(): ResponsiveHelpers {
  const device = useDeviceType();

  return useMemo(() => {
    const rs = (key: SpacingKey): number => {
      return getResponsiveSpacing(key, device.isTablet);
    };

    const fontSize = (key: FontSize): number => {
      return getResponsiveFontSize(key, device.isTablet);
    };

    const responsive = <T>(phone: T, tablet: T, tabletLandscape?: T): T => {
      if (device.isTablet) {
        if (device.isLandscape && tabletLandscape !== undefined) {
          return tabletLandscape;
        }
        return tablet;
      }
      return phone;
    };

    const gridColumns = (
      phone: number,
      tablet: number,
      tabletLandscape?: number
    ): number => {
      return responsive(phone, tablet, tabletLandscape);
    };

    return {
      ...device,
      rs,
      fontSize,
      responsive,
      gridColumns,
    };
  }, [device]);
}
