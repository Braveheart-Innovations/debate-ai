import { renderHook } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { useMarkdownConfig } from '@/hooks/useMarkdownConfig';

// Mock theme
jest.mock('@/theme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        text: { primary: '#000000', secondary: '#666666' },
        primary: { 400: '#3D9FFF', 500: '#007AFF', 600: '#0066D9' },
        gray: { 50: '#FAFAFA', 100: '#F5F5F5', 700: '#616161', 800: '#424242' },
        border: '#EEEEEE',
      },
    },
    isDark: false,
  }),
}));

// Mock createMarkdownStyles
jest.mock('@/components/molecules/common/LazyMarkdownRenderer', () => ({
  createMarkdownStyles: jest.fn((theme, isDark) => ({
    body: { fontSize: 16, color: theme.colors.text.primary },
    heading1: { fontSize: 20, fontWeight: 'bold' },
    code_block: {
      backgroundColor: isDark ? theme.colors.gray[800] : theme.colors.gray[100]
    },
    fence: {
      backgroundColor: isDark ? theme.colors.gray[800] : theme.colors.gray[100]
    },
    link: {
      color: isDark ? theme.colors.primary[400] : theme.colors.primary[600],
      textDecorationLine: 'underline',
    },
  })),
}));

// Mock selectable markdown rules
jest.mock('@/utils/markdownSelectable', () => ({
  selectableMarkdownRules: {
    text: jest.fn(),
    strong: jest.fn(),
    em: jest.fn(),
    link: jest.fn(),
    fence: jest.fn(),
  },
}));

// Mock Linking - use spyOn to avoid TurboModule issues
jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

describe('useMarkdownConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('return value structure', () => {
    it('returns styles object', () => {
      const { result } = renderHook(() => useMarkdownConfig());

      expect(result.current).toHaveProperty('styles');
      expect(typeof result.current.styles).toBe('object');
    });

    it('returns rules object', () => {
      const { result } = renderHook(() => useMarkdownConfig());

      expect(result.current).toHaveProperty('rules');
      expect(typeof result.current.rules).toBe('object');
    });

    it('returns onLinkPress function', () => {
      const { result } = renderHook(() => useMarkdownConfig());

      expect(result.current).toHaveProperty('onLinkPress');
      expect(typeof result.current.onLinkPress).toBe('function');
    });
  });

  describe('styles', () => {
    it('includes body styles', () => {
      const { result } = renderHook(() => useMarkdownConfig());

      expect(result.current.styles).toHaveProperty('body');
    });

    it('includes heading styles', () => {
      const { result } = renderHook(() => useMarkdownConfig());

      expect(result.current.styles).toHaveProperty('heading1');
    });

    it('includes code block styles', () => {
      const { result } = renderHook(() => useMarkdownConfig());

      expect(result.current.styles).toHaveProperty('code_block');
    });

    it('includes fence styles', () => {
      const { result } = renderHook(() => useMarkdownConfig());

      expect(result.current.styles).toHaveProperty('fence');
    });

    it('includes link styles', () => {
      const { result } = renderHook(() => useMarkdownConfig());

      expect(result.current.styles).toHaveProperty('link');
    });
  });

  describe('rules', () => {
    it('includes text rule', () => {
      const { result } = renderHook(() => useMarkdownConfig());

      expect(result.current.rules).toHaveProperty('text');
    });

    it('includes strong rule', () => {
      const { result } = renderHook(() => useMarkdownConfig());

      expect(result.current.rules).toHaveProperty('strong');
    });

    it('includes link rule', () => {
      const { result } = renderHook(() => useMarkdownConfig());

      expect(result.current.rules).toHaveProperty('link');
    });

    it('includes fence rule for code blocks', () => {
      const { result } = renderHook(() => useMarkdownConfig());

      expect(result.current.rules).toHaveProperty('fence');
    });
  });

  describe('onLinkPress', () => {
    it('opens URL with Linking.openURL', () => {
      const { result } = renderHook(() => useMarkdownConfig());

      result.current.onLinkPress('https://example.com');

      expect(Linking.openURL).toHaveBeenCalledWith('https://example.com');
    });

    it('returns false to prevent default handling', () => {
      const { result } = renderHook(() => useMarkdownConfig());

      const returnValue = result.current.onLinkPress('https://example.com');

      expect(returnValue).toBe(false);
    });

    it('handles URL open errors gracefully', async () => {
      (Linking.openURL as jest.Mock).mockRejectedValueOnce(new Error('Failed'));

      const { result } = renderHook(() => useMarkdownConfig());

      // Should not throw
      expect(() => {
        result.current.onLinkPress('https://invalid-url.com');
      }).not.toThrow();
    });
  });

  describe('memoization', () => {
    it('returns consistent styles structure on rerender', () => {
      const { result, rerender } = renderHook(() => useMarkdownConfig());

      const firstStyles = result.current.styles;
      rerender();

      // Check that styles have the same structure
      expect(result.current.styles).toStrictEqual(firstStyles);
    });

    it('returns same onLinkPress reference on rerender', () => {
      const { result, rerender } = renderHook(() => useMarkdownConfig());

      const firstOnLinkPress = result.current.onLinkPress;
      rerender();

      expect(result.current.onLinkPress).toBe(firstOnLinkPress);
    });
  });
});
