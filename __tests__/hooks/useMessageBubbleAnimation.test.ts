import { renderHook } from '@testing-library/react-native';
import { useMessageBubbleAnimation } from '@/hooks/useMessageBubbleAnimation';

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return {
    ...Reanimated,
    useSharedValue: (value: number) => ({ value }),
    useAnimatedStyle: (fn: () => object) => fn(),
    withSpring: (value: number) => value,
    withTiming: (value: number) => value,
    Easing: {
      out: jest.fn(() => jest.fn()),
      ease: jest.fn(),
    },
  };
});

describe('useMessageBubbleAnimation', () => {
  describe('initialization', () => {
    it('returns animatedStyle object', () => {
      const { result } = renderHook(() => useMessageBubbleAnimation());

      expect(result.current).toHaveProperty('animatedStyle');
      expect(result.current.animatedStyle).toHaveProperty('opacity');
      expect(result.current.animatedStyle).toHaveProperty('transform');
    });

    it('initializes with opacity 1 when not new', () => {
      const { result } = renderHook(() =>
        useMessageBubbleAnimation({ isNew: false })
      );

      expect(result.current.animatedStyle.opacity).toBe(1);
    });

    it('initializes with opacity 0 when new and type is fade-in', () => {
      const { result } = renderHook(() =>
        useMessageBubbleAnimation({ isNew: true, type: 'fade-in' })
      );

      expect(result.current.animatedStyle.opacity).toBe(0);
    });

    it('initializes with reduced scale when new and type is spring-scale', () => {
      const { result } = renderHook(() =>
        useMessageBubbleAnimation({ isNew: true, type: 'spring-scale' })
      );

      expect(result.current.animatedStyle.transform).toContainEqual({ scale: 0.85 });
    });

    it('initializes with full opacity and scale when type is none', () => {
      const { result } = renderHook(() =>
        useMessageBubbleAnimation({ isNew: true, type: 'none' })
      );

      expect(result.current.animatedStyle.opacity).toBe(1);
      expect(result.current.animatedStyle.transform).toContainEqual({ scale: 1 });
    });
  });

  describe('default values', () => {
    it('uses fade-in as default type', () => {
      const { result } = renderHook(() =>
        useMessageBubbleAnimation({ isNew: true })
      );

      // fade-in starts with opacity 0, scale 1
      expect(result.current.animatedStyle.opacity).toBe(0);
      expect(result.current.animatedStyle.transform).toContainEqual({ scale: 1 });
    });

    it('uses isNew: false as default', () => {
      const { result } = renderHook(() => useMessageBubbleAnimation());

      expect(result.current.animatedStyle.opacity).toBe(1);
    });

    it('uses delay: 0 as default', () => {
      const { result } = renderHook(() =>
        useMessageBubbleAnimation({ isNew: true })
      );

      expect(result.current.animatedStyle).toBeDefined();
    });
  });

  describe('animation types', () => {
    it('supports spring-scale type', () => {
      const { result } = renderHook(() =>
        useMessageBubbleAnimation({ type: 'spring-scale', isNew: true })
      );

      expect(result.current.animatedStyle).toBeDefined();
    });

    it('supports fade-in type', () => {
      const { result } = renderHook(() =>
        useMessageBubbleAnimation({ type: 'fade-in', isNew: true })
      );

      expect(result.current.animatedStyle).toBeDefined();
    });

    it('supports none type', () => {
      const { result } = renderHook(() =>
        useMessageBubbleAnimation({ type: 'none', isNew: true })
      );

      expect(result.current.animatedStyle.opacity).toBe(1);
      expect(result.current.animatedStyle.transform).toContainEqual({ scale: 1 });
    });
  });

  describe('delay handling', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('accepts delay parameter', () => {
      const { result } = renderHook(() =>
        useMessageBubbleAnimation({ isNew: true, delay: 100 })
      );

      expect(result.current.animatedStyle).toBeDefined();
    });

    it('handles zero delay', () => {
      const { result } = renderHook(() =>
        useMessageBubbleAnimation({ isNew: true, delay: 0 })
      );

      expect(result.current.animatedStyle).toBeDefined();
    });
  });

  describe('no animation cases', () => {
    it('skips animation when not new', () => {
      const { result } = renderHook(() =>
        useMessageBubbleAnimation({ isNew: false, type: 'spring-scale' })
      );

      expect(result.current.animatedStyle.opacity).toBe(1);
      expect(result.current.animatedStyle.transform).toContainEqual({ scale: 1 });
    });

    it('skips animation when type is none', () => {
      const { result } = renderHook(() =>
        useMessageBubbleAnimation({ isNew: true, type: 'none' })
      );

      expect(result.current.animatedStyle.opacity).toBe(1);
    });
  });
});
