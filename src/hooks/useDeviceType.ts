import { useWindowDimensions } from 'react-native';
import { useMemo } from 'react';

export type DeviceType = 'phone' | 'tablet';
export type Orientation = 'portrait' | 'landscape';
export type TabletSize = 'small' | 'medium' | 'large';

export interface DeviceInfo {
  deviceType: DeviceType;
  orientation: Orientation;
  isTablet: boolean;
  isPhone: boolean;
  isLandscape: boolean;
  isPortrait: boolean;
  width: number;
  height: number;
  /** Tablet size classification: small (iPad Air), medium (iPad Pro 11"), large (iPad Pro 12.9") */
  tabletSize: TabletSize | null;
  /** Screen scale factor based on height (useful for proportional sizing) */
  screenScale: number;
}

// Tablet threshold: 700px (includes iPad mini at 744px minimum dimension)
const TABLET_BREAKPOINT = 700;

// Tablet size breakpoints (based on portrait height)
// iPad Air: 1180px, iPad Pro 11": 1194px, iPad Pro 12.9": 1366px
const TABLET_SIZE_MEDIUM = 1200;
const TABLET_SIZE_LARGE = 1300;

// Reference height for screen scale (iPhone 14 Pro)
const REFERENCE_HEIGHT = 844;

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
    const maxDimension = Math.max(width, height);
    const isTablet = minDimension >= TABLET_BREAKPOINT;
    const isLandscape = width > height;

    // Calculate tablet size based on the longer dimension (portrait height)
    let tabletSize: TabletSize | null = null;
    if (isTablet) {
      if (maxDimension >= TABLET_SIZE_LARGE) {
        tabletSize = 'large';      // iPad Pro 12.9"
      } else if (maxDimension >= TABLET_SIZE_MEDIUM) {
        tabletSize = 'medium';     // iPad Pro 11"
      } else {
        tabletSize = 'small';      // iPad Air, iPad mini
      }
    }

    // Screen scale relative to reference phone (useful for proportional sizing)
    const screenScale = height / REFERENCE_HEIGHT;

    return {
      deviceType: isTablet ? 'tablet' : 'phone',
      orientation: isLandscape ? 'landscape' : 'portrait',
      isTablet,
      isPhone: !isTablet,
      isLandscape,
      isPortrait: !isLandscape,
      width,
      height,
      tabletSize,
      screenScale,
    };
  }, [width, height]);
}
