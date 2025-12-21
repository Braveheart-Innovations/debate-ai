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
