import { renderHook } from '@testing-library/react-native';
import { useDeviceType } from '@/hooks/useDeviceType';
import useWindowDimensions from 'react-native/Libraries/Utilities/useWindowDimensions';

const mockUseWindowDimensions = useWindowDimensions as jest.Mock;

describe('useDeviceType', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('device type detection', () => {
    it('returns phone when min dimension < 700', () => {
      // iPhone SE dimensions - min(375, 667) = 375 < 700
      mockUseWindowDimensions.mockReturnValue({ width: 375, height: 667 });

      const { result } = renderHook(() => useDeviceType());

      expect(result.current.deviceType).toBe('phone');
      expect(result.current.isPhone).toBe(true);
      expect(result.current.isTablet).toBe(false);
    });

    it('returns tablet for iPad portrait (768px width)', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 768, height: 1024 });

      const { result } = renderHook(() => useDeviceType());

      expect(result.current.deviceType).toBe('tablet');
      expect(result.current.isTablet).toBe(true);
      expect(result.current.isPhone).toBe(false);
    });

    it('returns tablet for iPad landscape (1024px width)', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 1024, height: 768 });

      const { result } = renderHook(() => useDeviceType());

      expect(result.current.deviceType).toBe('tablet');
      expect(result.current.isTablet).toBe(true);
      expect(result.current.isPhone).toBe(false);
    });

    it('returns tablet for iPad Pro 12.9" portrait', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 1024, height: 1366 });

      const { result } = renderHook(() => useDeviceType());

      expect(result.current.deviceType).toBe('tablet');
      expect(result.current.isTablet).toBe(true);
    });

    it('uses min dimension to determine tablet (handles rotated tablets)', () => {
      // iPad in landscape - min(1024, 768) = 768 >= 700, so tablet
      mockUseWindowDimensions.mockReturnValue({ width: 1024, height: 768 });

      const { result } = renderHook(() => useDeviceType());

      // min dimension 768 >= 700, so this should be considered a tablet
      expect(result.current.isTablet).toBe(true);
    });

    it('returns phone for devices with min dimension < 700', () => {
      // iPhone 15 Pro Max - min(430, 932) = 430 < 700
      mockUseWindowDimensions.mockReturnValue({ width: 430, height: 932 });

      const { result } = renderHook(() => useDeviceType());

      expect(result.current.isPhone).toBe(true);
      expect(result.current.isTablet).toBe(false);
    });
  });

  describe('orientation detection', () => {
    it('returns portrait when height > width', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 768, height: 1024 });

      const { result } = renderHook(() => useDeviceType());

      expect(result.current.orientation).toBe('portrait');
      expect(result.current.isPortrait).toBe(true);
      expect(result.current.isLandscape).toBe(false);
    });

    it('returns landscape when width > height', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 1024, height: 768 });

      const { result } = renderHook(() => useDeviceType());

      expect(result.current.orientation).toBe('landscape');
      expect(result.current.isLandscape).toBe(true);
      expect(result.current.isPortrait).toBe(false);
    });

    it('returns landscape when width equals height', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 800, height: 800 });

      const { result } = renderHook(() => useDeviceType());

      // width > height is false, so it should be portrait
      expect(result.current.isPortrait).toBe(true);
    });
  });

  describe('dimension values', () => {
    it('returns current width and height', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 414, height: 896 });

      const { result } = renderHook(() => useDeviceType());

      expect(result.current.width).toBe(414);
      expect(result.current.height).toBe(896);
    });
  });

  describe('combined scenarios', () => {
    it('correctly identifies iPhone SE (small phone)', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 320, height: 568 });

      const { result } = renderHook(() => useDeviceType());

      expect(result.current.isPhone).toBe(true);
      expect(result.current.isPortrait).toBe(true);
      expect(result.current.deviceType).toBe('phone');
    });

    it('correctly identifies iPhone 15 Pro Max (large phone)', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 430, height: 932 });

      const { result } = renderHook(() => useDeviceType());

      // Min dimension 430 < 700, so this is correctly identified as phone
      expect(result.current.isPhone).toBe(true);
      expect(result.current.isTablet).toBe(false);
    });

    it('correctly identifies iPad mini portrait', () => {
      // iPad mini 6th gen - min(744, 1133) = 744 >= 700
      mockUseWindowDimensions.mockReturnValue({ width: 744, height: 1133 });

      const { result } = renderHook(() => useDeviceType());

      expect(result.current.isTablet).toBe(true);
      expect(result.current.isPortrait).toBe(true);
    });

    it('correctly identifies iPad Pro 12.9" landscape', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 1366, height: 1024 });

      const { result } = renderHook(() => useDeviceType());

      expect(result.current.isTablet).toBe(true);
      expect(result.current.isLandscape).toBe(true);
    });
  });

  describe('tabletSize classification', () => {
    it('returns null for phones', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 390, height: 844 });

      const { result } = renderHook(() => useDeviceType());

      expect(result.current.tabletSize).toBeNull();
    });

    it('classifies iPad Air as small tablet (maxDimension < 1200)', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 820, height: 1180 });

      const { result } = renderHook(() => useDeviceType());

      expect(result.current.tabletSize).toBe('small');
    });

    it('classifies iPad mini as small tablet', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 744, height: 1133 });

      const { result } = renderHook(() => useDeviceType());

      expect(result.current.tabletSize).toBe('small');
    });

    it('classifies iPad Pro 11" as medium tablet (maxDimension >= 1200 && < 1300)', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 834, height: 1210 });

      const { result } = renderHook(() => useDeviceType());

      expect(result.current.tabletSize).toBe('medium');
    });

    it('classifies iPad Pro 12.9" as large tablet (maxDimension >= 1300)', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 1024, height: 1366 });

      const { result } = renderHook(() => useDeviceType());

      expect(result.current.tabletSize).toBe('large');
    });

    it('maintains correct tablet size in landscape orientation', () => {
      // iPad Pro 12.9" in landscape
      mockUseWindowDimensions.mockReturnValue({ width: 1366, height: 1024 });

      const { result } = renderHook(() => useDeviceType());

      expect(result.current.isTablet).toBe(true);
      expect(result.current.isLandscape).toBe(true);
      expect(result.current.tabletSize).toBe('large');
    });
  });

  describe('screenScale calculation', () => {
    it('returns 1.0 for reference phone height (844px)', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 390, height: 844 });

      const { result } = renderHook(() => useDeviceType());

      expect(result.current.screenScale).toBeCloseTo(1.0, 2);
    });

    it('returns less than 1.0 for smaller phones', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 375, height: 667 }); // iPhone SE

      const { result } = renderHook(() => useDeviceType());

      expect(result.current.screenScale).toBeLessThan(1.0);
      expect(result.current.screenScale).toBeCloseTo(0.79, 2);
    });

    it('returns greater than 1.0 for larger screens in portrait', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 820, height: 1180 }); // iPad Air

      const { result } = renderHook(() => useDeviceType());

      expect(result.current.screenScale).toBeGreaterThan(1.0);
      expect(result.current.screenScale).toBeCloseTo(1.40, 2);
    });

    it('adjusts scale based on current height (landscape has shorter height)', () => {
      // iPad Air in landscape - height is now 820
      mockUseWindowDimensions.mockReturnValue({ width: 1180, height: 820 });

      const { result } = renderHook(() => useDeviceType());

      expect(result.current.screenScale).toBeCloseTo(0.97, 2);
    });
  });

  describe('memoization', () => {
    it('returns same object reference when dimensions unchanged', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 768, height: 1024 });

      const { result, rerender } = renderHook(() => useDeviceType());
      const firstResult = result.current;

      rerender({});
      const secondResult = result.current;

      // With useMemo, the object should be the same reference
      expect(firstResult).toBe(secondResult);
    });

    it('returns new object when dimensions change', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 768, height: 1024 });

      const { result, rerender } = renderHook(() => useDeviceType());
      const firstResult = result.current;

      // Change dimensions
      mockUseWindowDimensions.mockReturnValue({ width: 1024, height: 768 });
      rerender({});
      const secondResult = result.current;

      expect(firstResult).not.toBe(secondResult);
      expect(secondResult.isLandscape).toBe(true);
    });
  });
});
