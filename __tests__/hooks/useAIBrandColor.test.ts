import { renderHook } from '@testing-library/react-native';
import { useAIBrandColor } from '@/hooks/useAIBrandColor';

// Mock theme
jest.mock('@/theme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        surface: '#0A0A0A',
      },
    },
    isDark: false,
  }),
}));

// Mock AI brand colors
jest.mock('@/constants/aiColors', () => ({
  AI_BRAND_COLORS: {
    claude: { 50: '#FFF5F0', 500: '#FF7F00', 600: '#E06600' },
    openai: { 50: '#E6F9FF', 500: '#00D9FF', 600: '#00B8D9' },
    gemini: { 50: '#F3E8FF', 500: '#8A2BE2', 600: '#7B1FA2' },
    perplexity: { 50: '#E0F2F1', 500: '#20808D', 600: '#1A6B77' },
    mistral: { 50: '#FFF3E0', 500: '#FA520F', 600: '#E64A00' },
    cohere: { 50: '#FFF0ED', 500: '#FF7759', 600: '#E6604A' },
    together: { 50: '#E8F1FF', 500: '#0F6FFF', 600: '#0052CC' },
    deepseek: { 50: '#EEF0FF', 500: '#4D6BFE', 600: '#3B5BDB' },
    grok: { 50: '#F5F5F5', 500: '#404040', 600: '#333333' },
    nomi: { 50: '#FFF8E6', 500: '#FFA500', 600: '#CC8400' },
    replika: { 50: '#FFE6F0', 500: '#FF4081', 600: '#E0306D' },
    characterai: { 50: '#F3E8FF', 500: '#8B40FF', 600: '#7030E0' },
  },
}));

describe('useAIBrandColor', () => {
  describe('recognized AI providers', () => {
    it('returns Claude brand colors', () => {
      const { result } = renderHook(() => useAIBrandColor('Claude'));

      expect(result.current).not.toBeNull();
      expect(result.current?.light).toBe('#FFF5F0');
      expect(result.current?.border).toBe('#FF7F00');
      expect(result.current?.text).toBe('#E06600');
    });

    it('returns ChatGPT brand colors (maps to openai)', () => {
      const { result } = renderHook(() => useAIBrandColor('ChatGPT'));

      expect(result.current).not.toBeNull();
      expect(result.current?.light).toBe('#E6F9FF');
      expect(result.current?.border).toBe('#00D9FF');
    });

    it('returns OpenAI brand colors', () => {
      const { result } = renderHook(() => useAIBrandColor('OpenAI'));

      expect(result.current).not.toBeNull();
      expect(result.current?.border).toBe('#00D9FF');
    });

    it('returns Gemini brand colors', () => {
      const { result } = renderHook(() => useAIBrandColor('Gemini'));

      expect(result.current).not.toBeNull();
      expect(result.current?.border).toBe('#8A2BE2');
    });

    it('returns Perplexity brand colors', () => {
      const { result } = renderHook(() => useAIBrandColor('Perplexity'));

      expect(result.current).not.toBeNull();
      expect(result.current?.border).toBe('#20808D');
    });

    it('returns Mistral brand colors', () => {
      const { result } = renderHook(() => useAIBrandColor('Mistral'));

      expect(result.current).not.toBeNull();
      expect(result.current?.border).toBe('#FA520F');
    });

    it('returns Grok brand colors', () => {
      const { result } = renderHook(() => useAIBrandColor('Grok'));

      expect(result.current).not.toBeNull();
      expect(result.current?.border).toBe('#404040');
    });
  });

  describe('case insensitivity', () => {
    it('handles lowercase sender names', () => {
      const { result } = renderHook(() => useAIBrandColor('claude'));

      expect(result.current).not.toBeNull();
      expect(result.current?.border).toBe('#FF7F00');
    });

    it('handles uppercase sender names', () => {
      const { result } = renderHook(() => useAIBrandColor('GEMINI'));

      expect(result.current).not.toBeNull();
      expect(result.current?.border).toBe('#8A2BE2');
    });

    it('handles mixed case sender names', () => {
      const { result } = renderHook(() => useAIBrandColor('ChatGPT'));

      expect(result.current).not.toBeNull();
    });
  });

  describe('personality suffix handling', () => {
    it('extracts AI name from sender with personality', () => {
      const { result } = renderHook(() => useAIBrandColor('Claude (Philosopher)'));

      expect(result.current).not.toBeNull();
      expect(result.current?.border).toBe('#FF7F00');
    });

    it('handles complex personality names', () => {
      const { result } = renderHook(() => useAIBrandColor('Gemini (Creative Writer)'));

      expect(result.current).not.toBeNull();
      expect(result.current?.border).toBe('#8A2BE2');
    });
  });

  describe('character.ai special handling', () => {
    it('recognizes character.ai by partial match', () => {
      const { result } = renderHook(() => useAIBrandColor('Character.AI'));

      expect(result.current).not.toBeNull();
      expect(result.current?.border).toBe('#8B40FF');
    });

    it('recognizes CharacterAI without dot', () => {
      const { result } = renderHook(() => useAIBrandColor('CharacterAI'));

      expect(result.current).not.toBeNull();
      expect(result.current?.border).toBe('#8B40FF');
    });
  });

  describe('unrecognized providers', () => {
    it('returns null for unknown AI provider', () => {
      const { result } = renderHook(() => useAIBrandColor('UnknownAI'));

      expect(result.current).toBeNull();
    });

    it('returns null for user sender', () => {
      const { result } = renderHook(() => useAIBrandColor('User'));

      expect(result.current).toBeNull();
    });

    it('returns null for empty string', () => {
      const { result } = renderHook(() => useAIBrandColor(''));

      expect(result.current).toBeNull();
    });
  });

  describe('return value structure', () => {
    it('includes all required color properties', () => {
      const { result } = renderHook(() => useAIBrandColor('Claude'));

      expect(result.current).toHaveProperty('light');
      expect(result.current).toHaveProperty('dark');
      expect(result.current).toHaveProperty('border');
      expect(result.current).toHaveProperty('text');
    });

    it('uses theme surface color for dark mode background', () => {
      const { result } = renderHook(() => useAIBrandColor('Claude'));

      expect(result.current?.dark).toBe('#0A0A0A');
    });
  });

  describe('memoization', () => {
    it('returns same reference for same sender name', () => {
      const { result, rerender } = renderHook(
        ({ sender }) => useAIBrandColor(sender),
        { initialProps: { sender: 'Claude' } }
      );

      const firstResult = result.current;
      rerender({ sender: 'Claude' });

      expect(result.current).toBe(firstResult);
    });

    it('returns different reference for different sender name', () => {
      const { result, rerender } = renderHook(
        ({ sender }) => useAIBrandColor(sender),
        { initialProps: { sender: 'Claude' } }
      );

      const firstResult = result.current;
      rerender({ sender: 'Gemini' });

      expect(result.current).not.toBe(firstResult);
    });
  });
});
