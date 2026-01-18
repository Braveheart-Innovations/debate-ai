import { usePersonality, usePersonalityById, MergedPersonality } from '@/hooks/usePersonality';

describe('usePersonality hook exports', () => {
  it('exports usePersonality hook', () => {
    expect(usePersonality).toBeDefined();
    expect(typeof usePersonality).toBe('function');
  });

  it('exports usePersonalityById hook', () => {
    expect(usePersonalityById).toBeDefined();
    expect(typeof usePersonalityById).toBe('function');
  });

  it('exports MergedPersonality type (compile-time check)', () => {
    // This is a compile-time type check - if MergedPersonality is not exported,
    // TypeScript would fail to compile this file
    const testFn = (p: MergedPersonality | null): string => p?.id ?? 'null';
    expect(testFn(null)).toBe('null');
  });
});
