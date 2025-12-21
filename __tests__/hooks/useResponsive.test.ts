import { renderHook } from '@testing-library/react-native';
import { useResponsive } from '@/hooks/useResponsive';
import useWindowDimensions from 'react-native/Libraries/Utilities/useWindowDimensions';

const mockUseWindowDimensions = useWindowDimensions as jest.Mock;

describe('useResponsive', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('device info passthrough', () => {
    it('includes all properties from useDeviceType', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 768, height: 1024 });

      const { result } = renderHook(() => useResponsive());

      expect(result.current).toHaveProperty('deviceType');
      expect(result.current).toHaveProperty('orientation');
      expect(result.current).toHaveProperty('isTablet');
      expect(result.current).toHaveProperty('isPhone');
      expect(result.current).toHaveProperty('isLandscape');
      expect(result.current).toHaveProperty('isPortrait');
      expect(result.current).toHaveProperty('width');
      expect(result.current).toHaveProperty('height');
    });
  });

  describe('responsive() helper', () => {
    it('returns phone value on phone devices', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 375, height: 667 });

      const { result } = renderHook(() => useResponsive());
      const value = result.current.responsive(10, 20, 30);

      expect(value).toBe(10);
    });

    it('returns tablet value on tablet in portrait', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 768, height: 1024 });

      const { result } = renderHook(() => useResponsive());
      const value = result.current.responsive(10, 20, 30);

      expect(value).toBe(20);
    });

    it('returns tabletLandscape value on tablet in landscape', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 1024, height: 768 });

      const { result } = renderHook(() => useResponsive());
      const value = result.current.responsive(10, 20, 30);

      expect(value).toBe(30);
    });

    it('falls back to tablet value when tabletLandscape not provided', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 1024, height: 768 });

      const { result } = renderHook(() => useResponsive());
      const value = result.current.responsive(10, 20);

      expect(value).toBe(20);
    });

    it('works with string values', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 768, height: 1024 });

      const { result } = renderHook(() => useResponsive());
      const value = result.current.responsive('small', 'medium', 'large');

      expect(value).toBe('medium');
    });

    it('works with object values', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 1024, height: 768 });

      const { result } = renderHook(() => useResponsive());
      const value = result.current.responsive(
        { padding: 10 },
        { padding: 20 },
        { padding: 30 }
      );

      expect(value).toEqual({ padding: 30 });
    });
  });

  describe('rs() responsive spacing', () => {
    it('returns phone spacing values on phone', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 375, height: 667 });

      const { result } = renderHook(() => useResponsive());

      expect(result.current.rs('xs')).toBe(4);
      expect(result.current.rs('sm')).toBe(8);
      expect(result.current.rs('md')).toBe(16);
      expect(result.current.rs('lg')).toBe(24);
      expect(result.current.rs('xl')).toBe(32);
      expect(result.current.rs('2xl')).toBe(48);
      expect(result.current.rs('3xl')).toBe(64);
    });

    it('returns tablet spacing values (1.25x) on tablet', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 768, height: 1024 });

      const { result } = renderHook(() => useResponsive());

      expect(result.current.rs('xs')).toBe(5);
      expect(result.current.rs('sm')).toBe(10);
      expect(result.current.rs('md')).toBe(20);
      expect(result.current.rs('lg')).toBe(30);
      expect(result.current.rs('xl')).toBe(40);
      expect(result.current.rs('2xl')).toBe(60);
      expect(result.current.rs('3xl')).toBe(80);
    });
  });

  describe('fontSize() responsive typography', () => {
    it('returns phone font sizes on phone', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 375, height: 667 });

      const { result } = renderHook(() => useResponsive());

      expect(result.current.fontSize('xs')).toBe(12);
      expect(result.current.fontSize('sm')).toBe(14);
      expect(result.current.fontSize('base')).toBe(16);
      expect(result.current.fontSize('lg')).toBe(18);
      expect(result.current.fontSize('xl')).toBe(20);
      expect(result.current.fontSize('2xl')).toBe(24);
    });

    it('returns tablet font sizes (1.15x) on tablet', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 768, height: 1024 });

      const { result } = renderHook(() => useResponsive());

      expect(result.current.fontSize('xs')).toBe(14);
      expect(result.current.fontSize('sm')).toBe(16);
      expect(result.current.fontSize('base')).toBe(18);
      expect(result.current.fontSize('lg')).toBe(21);
      expect(result.current.fontSize('xl')).toBe(23);
      expect(result.current.fontSize('2xl')).toBe(28);
    });
  });

  describe('gridColumns() helper', () => {
    it('returns phone columns on phone', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 375, height: 667 });

      const { result } = renderHook(() => useResponsive());
      const cols = result.current.gridColumns(2, 3, 4);

      expect(cols).toBe(2);
    });

    it('returns tablet columns on tablet portrait', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 768, height: 1024 });

      const { result } = renderHook(() => useResponsive());
      const cols = result.current.gridColumns(2, 3, 4);

      expect(cols).toBe(3);
    });

    it('returns tabletLandscape columns on tablet landscape', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 1024, height: 768 });

      const { result } = renderHook(() => useResponsive());
      const cols = result.current.gridColumns(2, 3, 4);

      expect(cols).toBe(4);
    });

    it('falls back to tablet columns when landscape not specified', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 1024, height: 768 });

      const { result } = renderHook(() => useResponsive());
      const cols = result.current.gridColumns(2, 3);

      expect(cols).toBe(3);
    });
  });

  describe('combined usage scenarios', () => {
    it('provides correct values for phone layout', () => {
      // Use dimensions where max < 768 for true phone classification
      mockUseWindowDimensions.mockReturnValue({ width: 375, height: 667 });

      const { result } = renderHook(() => useResponsive());

      // Typography
      const headingSize = result.current.fontSize('2xl');
      expect(headingSize).toBe(24);

      // Spacing
      const padding = result.current.rs('md');
      expect(padding).toBe(16);

      // Grid
      const columns = result.current.gridColumns(2, 3, 4);
      expect(columns).toBe(2);

      // Responsive value
      const buttonHeight = result.current.responsive(44, 52, 56);
      expect(buttonHeight).toBe(44);
    });

    it('provides correct values for iPad portrait', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 810, height: 1080 });

      const { result } = renderHook(() => useResponsive());

      // Typography
      const headingSize = result.current.fontSize('2xl');
      expect(headingSize).toBe(28);

      // Spacing
      const padding = result.current.rs('md');
      expect(padding).toBe(20);

      // Grid
      const columns = result.current.gridColumns(2, 3, 4);
      expect(columns).toBe(3);

      // Responsive value
      const buttonHeight = result.current.responsive(44, 52, 56);
      expect(buttonHeight).toBe(52);
    });

    it('provides correct values for iPad landscape', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 1080, height: 810 });

      const { result } = renderHook(() => useResponsive());

      // Typography (same as portrait)
      const headingSize = result.current.fontSize('2xl');
      expect(headingSize).toBe(28);

      // Spacing (same as portrait)
      const padding = result.current.rs('md');
      expect(padding).toBe(20);

      // Grid - uses landscape column count
      const columns = result.current.gridColumns(2, 3, 4);
      expect(columns).toBe(4);

      // Responsive value - uses landscape value
      const buttonHeight = result.current.responsive(44, 52, 56);
      expect(buttonHeight).toBe(56);
    });
  });

  describe('memoization', () => {
    it('returns stable functions when dimensions unchanged', () => {
      mockUseWindowDimensions.mockReturnValue({ width: 768, height: 1024 });

      const { result, rerender } = renderHook(() => useResponsive());
      const firstRs = result.current.rs;
      const firstFontSize = result.current.fontSize;
      const firstResponsive = result.current.responsive;
      const firstGridColumns = result.current.gridColumns;

      rerender({});

      // Functions should be stable due to useMemo
      expect(result.current.rs).toBe(firstRs);
      expect(result.current.fontSize).toBe(firstFontSize);
      expect(result.current.responsive).toBe(firstResponsive);
      expect(result.current.gridColumns).toBe(firstGridColumns);
    });
  });
});
