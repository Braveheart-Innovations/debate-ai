import { useWindowDimensions } from 'react-native';
import { useMemo } from 'react';

export type DeviceType = 'phone' | 'tablet';
export type Orientation = 'portrait' | 'landscape';

export interface DeviceInfo {
  deviceType: DeviceType;
  orientation: Orientation;
  isTablet: boolean;
  isPhone: boolean;
  isLandscape: boolean;
  isPortrait: boolean;
  width: number;
  height: number;
}

// iPad threshold: 768px (standard iPad portrait width)
const TABLET_BREAKPOINT = 768;

/**
 * Hook to detect device type and orientation.
 * Uses window dimensions for reactive updates on orientation change.
 */
export function useDeviceType(): DeviceInfo {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    // Use the larger dimension to determine if tablet (handles orientation)
    const maxDimension = Math.max(width, height);
    const isTablet = maxDimension >= TABLET_BREAKPOINT;
    const isLandscape = width > height;

    return {
      deviceType: isTablet ? 'tablet' : 'phone',
      orientation: isLandscape ? 'landscape' : 'portrait',
      isTablet,
      isPhone: !isTablet,
      isLandscape,
      isPortrait: !isLandscape,
      width,
      height,
    };
  }, [width, height]);
}
