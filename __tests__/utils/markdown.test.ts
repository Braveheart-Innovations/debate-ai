import {
  sanitizeMarkdown,
  shouldLazyRender,
  splitForLazyRender,
  analyzeMarkdownSafety,
} from '@/utils/markdown';

describe('markdown utils', () => {
  it('returns empty string when input is falsy', () => {
    // @ts-expect-error testing falsy input
    expect(sanitizeMarkdown(undefined)).toBe('');
    expect(sanitizeMarkdown('')).toBe('');
  });

  it('sanitizes dangerous whitespace and appends warning', () => {
    const longWhitespace = 'a'.repeat(10) + ' '.repeat(60000) + 'b'.repeat(10);
    const sanitized = sanitizeMarkdown(longWhitespace, { showWarning: true });
    expect(sanitized).toContain('whitespace characters omitted for safety');
    expect(sanitized.endsWith('_[Note: Content was modified to prevent rendering issues]_')).toBe(true);
  });

  it('supports lazy rendering threshold without warning', () => {
    const content = 'x'.repeat(120000);
    expect(shouldLazyRender(content)).toBe(true);
    expect(sanitizeMarkdown(content, { lazyRenderThreshold: 50000, showWarning: false })).toHaveLength(120000);
  });

  it('splits content into chunks while respecting code fences', () => {
    const content = ['```', 'code', '```', 'line1', 'line2', 'line3'].join('\n');
    const chunks = splitForLazyRender(content, 15);
    expect(chunks[0]).toContain('```\ncode\n```');
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('analyzes markdown safety stats', () => {
    const content = ['line', ' '.repeat(60000), '```', 'code', '```'].join('\n');
    const result = analyzeMarkdownSafety(content);
    expect(result.safe).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.stats.codeBlockCount).toBe(1);
    expect(result.stats.hasLongWhitespace).toBe(true);
  });
});
