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

// Tablet threshold: 700px (includes iPad mini at 744px minimum dimension)
const TABLET_BREAKPOINT = 700;

/**
 * Hook to detect device type and orientation.
 * Uses window dimensions for reactive updates on orientation change.
 */
export function useDeviceType(): DeviceInfo {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    // Use the smaller dimension (short side) to determine if tablet
    // This correctly distinguishes phones (min ~375-430px) from tablets (min ~700+px)
    const minDimension = Math.min(width, height);
    const isTablet = minDimension >= TABLET_BREAKPOINT;
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
