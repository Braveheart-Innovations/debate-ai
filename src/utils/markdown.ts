/**
 * Smart markdown sanitization that targets the actual CVE-2022-21670 vulnerability
 * while preserving legitimate content and user experience.
 *
 * The vulnerability: Specific patterns with >50K chars can cause ReDoS in markdown-it's
 * newline rule. We detect and neutralize these patterns without truncating normal content.
 */

export type SanitizeMarkdownOptions = {
  /** Maximum consecutive whitespace chars before breaking (default: 50000) */
  maxConsecutiveWhitespace?: number;
  /** Maximum total chars before lazy rendering (default: 100000) */
  lazyRenderThreshold?: number;
  /** Whether to add warning when content is modified (default: true) */
  showWarning?: boolean;
};

const DEFAULTS: Required<SanitizeMarkdownOptions> = {
  maxConsecutiveWhitespace: 50000, // Based on CVE-2022-21670 threshold
  lazyRenderThreshold: 100000,     // Reasonable limit for mobile performance
  showWarning: true,
};

/**
 * Detects and neutralizes ReDoS patterns without destroying legitimate content
 */
export function sanitizeMarkdown(input: string, opts: SanitizeMarkdownOptions = {}): string {
  const cfg = { ...DEFAULTS, ...opts };
  if (!input) return '';

  let text = input;
  let wasModified = false;

  // Detect and break up pathological whitespace patterns (the actual vulnerability)
  // This regex finds runs of spaces/tabs/newlines that could trigger ReDoS
  const dangerousPattern = /[\s\n\r\t]{50000,}/g;

  if (dangerousPattern.test(text)) {
    // Break up long whitespace runs with a marker to prevent ReDoS
    text = text.replace(dangerousPattern, (match) => {
      wasModified = true;
      // Keep some whitespace for formatting but break the pattern
      const keepChars = 100;
      const prefix = match.substring(0, keepChars);
      const suffix = match.substring(match.length - keepChars);
      return `${prefix}\n[... ${match.length - (keepChars * 2)} whitespace characters omitted for safety ...]\n${suffix}`;
    });
  }

  // For extremely long content, suggest lazy rendering
  if (text.length > cfg.lazyRenderThreshold) {
    // Don't truncate - let the component handle lazy rendering
    // Just mark it for lazy rendering
    return text;
  }

  // Add warning if content was modified
  if (wasModified && cfg.showWarning) {
    text = text + '\n\n_[Note: Content was modified to prevent rendering issues]_';
  }

  return text;
}

/**
 * Check if content should be lazy rendered based on length
 */
export function shouldLazyRender(content: string, threshold?: number): boolean {
  const limit = threshold ?? DEFAULTS.lazyRenderThreshold;
  return content.length > limit;
}

/**
 * Split content into chunks for lazy rendering
 */
export function splitForLazyRender(content: string, chunkSize: number = 10000): string[] {
  if (content.length <= chunkSize) return [content];

  const chunks: string[] = [];
  const lines = content.split('\n');
  let currentChunk = '';
  let currentSize = 0;

  for (const line of lines) {
    // Keep code blocks together if possible
    const isCodeFence = line.trim().startsWith('```');

    if (currentSize + line.length > chunkSize && currentSize > 0 && !isCodeFence) {
      // Start a new chunk
      chunks.push(currentChunk);
      currentChunk = line;
      currentSize = line.length;
    } else {
      // Add to current chunk
      currentChunk = currentChunk ? `${currentChunk}\n${line}` : line;
      currentSize += line.length + 1;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Analyze markdown for potential issues without modifying it
 */
export function analyzeMarkdownSafety(content: string): {
  safe: boolean;
  issues: string[];
  stats: {
    totalLength: number;
    lineCount: number;
    maxLineLength: number;
    hasLongWhitespace: boolean;
    codeBlockCount: number;
  };
} {
  const lines = content.split('\n');
  const issues: string[] = [];

  // Check for ReDoS pattern
  const hasLongWhitespace = /[\s\n\r\t]{50000,}/.test(content);
  if (hasLongWhitespace) {
    issues.push('Contains whitespace patterns that could cause performance issues');
  }

  // Count code blocks
  let codeBlockCount = 0;
  let inCodeBlock = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (!inCodeBlock) {
        codeBlockCount++;
      }
      inCodeBlock = !inCodeBlock;
    }
  }

  const maxLineLength = Math.max(...lines.map(l => l.length));

  return {
    safe: issues.length === 0,
    issues,
    stats: {
      totalLength: content.length,
      lineCount: lines.length,
      maxLineLength,
      hasLongWhitespace,
      codeBlockCount,
    },
  };
}