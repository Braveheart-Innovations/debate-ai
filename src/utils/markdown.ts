/**
 * Lightweight guardrails for rendering untrusted Markdown.
 * Mitigates markdown-it CPU DoS by limiting size and line lengths.
 */
export type SanitizeMarkdownOptions = {
  maxChars?: number; // absolute cap on content size
  maxLines?: number; // trim after this many lines
  maxLineLength?: number; // trim overly long single lines
  maxCodeBlockChars?: number; // cap per fenced code block
};

const DEFAULTS: Required<SanitizeMarkdownOptions> = {
  maxChars: 20000,
  maxLines: 400,
  maxLineLength: 1000,
  maxCodeBlockChars: 3000,
};

export function sanitizeMarkdown(input: string, opts: SanitizeMarkdownOptions = {}): string {
  const cfg = { ...DEFAULTS, ...opts };
  if (!input) return '';

  let text = input;
  if (text.length > cfg.maxChars) {
    text = text.slice(0, cfg.maxChars) + '\n\n…\n';
  }

  const lines = text.split(/\r?\n/);
  const limitedLines: string[] = [];
  let inFence = false;
  let codeChars = 0;

  for (let i = 0; i < lines.length && limitedLines.length < cfg.maxLines; i++) {
    let line = lines[i];
    const fenceMatch = line.match(/^\s*```/);
    if (fenceMatch) {
      // Toggle fenced code mode
      if (inFence) {
        inFence = false;
        codeChars = 0;
      } else {
        inFence = true;
      }
      limitedLines.push(line);
      continue;
    }

    if (inFence) {
      if (codeChars >= cfg.maxCodeBlockChars) continue; // skip extra code
      if (codeChars + line.length > cfg.maxCodeBlockChars) {
        const remaining = Math.max(0, cfg.maxCodeBlockChars - codeChars);
        line = line.slice(0, remaining) + '\n…';
      }
      codeChars += line.length;
      limitedLines.push(line);
      continue;
    }

    if (line.length > cfg.maxLineLength) {
      line = line.slice(0, cfg.maxLineLength) + ' …';
    }
    limitedLines.push(line);
  }

  return limitedLines.join('\n');
}

