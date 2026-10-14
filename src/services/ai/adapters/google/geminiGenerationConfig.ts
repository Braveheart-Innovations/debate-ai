const TIGHT_OUTPUT_TOKEN_CAP = 2048;

type GeminiThinkingConfig =
  | { thinkingLevel: 'minimal' | 'low' }
  | { thinkingBudget: number };

interface GeminiGenerationConfigOptions {
  model: string;
  temperature: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  supportsThinking?: boolean;
  /** 'low' asks for brief reasoning whatever the output cap (debate turns). */
  reasoningEffort?: 'low';
}

function normalizeMaxTokens(maxTokens: number | undefined): number | undefined {
  return typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0
    ? Math.floor(maxTokens)
    : undefined;
}

function getGeminiThinkingConfig(
  model: string,
  maxOutputTokens?: number,
  supportsThinking?: boolean,
  reasoningEffort?: 'low'
): GeminiThinkingConfig | undefined {
  // Catalog says this model has no thinking mode; nothing to configure.
  if (supportsThinking === false) {
    return undefined;
  }
  // Without a brief-reasoning request, only a tight output cap lowers thinking, so that reasoning
  // cannot crowd out the answer; the model's default applies otherwise.
  const briefReasoning = reasoningEffort === 'low';
  if (!briefReasoning && (!maxOutputTokens || maxOutputTokens > TIGHT_OUTPUT_TOKEN_CAP)) {
    return undefined;
  }

  const normalizedModel = model.toLowerCase();
  if (!normalizedModel.includes('gemini')) {
    return undefined;
  }

  if (normalizedModel.includes('gemini-2.5-pro') && (!maxOutputTokens || maxOutputTokens > 128)) {
    return { thinkingBudget: 128 };
  }

  if (normalizedModel.includes('gemini-2.5-flash')) {
    return { thinkingBudget: 0 };
  }

  // The tight-cap rule predates Gemini 4; a brief-reasoning request covers it too.
  if (normalizedModel.includes('gemini-3') || (briefReasoning && isGeminiFourOrLater(normalizedModel))) {
    if (normalizedModel.includes('flash') || normalizedModel.includes('lite')) {
      // gemini-3.7+ rejects thinkingLevel "minimal" ("Thinking level MINIMAL
      // is not supported for this model"; live-verified 2026-08-17 — 3.6
      // still accepts it and 3.7 accepts "low").
      return supportsMinimalThinkingLevel(normalizedModel)
        ? { thinkingLevel: 'minimal' }
        : { thinkingLevel: 'low' };
    }
    return { thinkingLevel: 'low' };
  }

  return undefined;
}

// Gemini 4 takes thinking levels low, medium and high, with no "minimal".
function isGeminiFourOrLater(normalizedModel: string): boolean {
  const version = /gemini-(\d+)/.exec(normalizedModel);
  return Boolean(version && Number(version[1]) >= 4);
}

function supportsMinimalThinkingLevel(normalizedModel: string): boolean {
  const version = /gemini-(\d+)(?:\.(\d+))?/.exec(normalizedModel);
  if (!version) {
    return true;
  }
  const major = Number(version[1]);
  const minor = Number(version[2] ?? '0');
  return major < 3 || (major === 3 && minor < 7);
}

export function buildGeminiGenerationConfig({
  model,
  temperature,
  topP,
  topK,
  maxTokens,
  supportsThinking,
  reasoningEffort,
}: GeminiGenerationConfigOptions): Record<string, unknown> {
  const resolvedMaxTokens = normalizeMaxTokens(maxTokens);
  const config: Record<string, unknown> = {
    temperature,
  };

  if (typeof topP === 'number') {
    config.topP = topP;
  }

  if (typeof topK === 'number') {
    config.topK = topK;
  }

  if (resolvedMaxTokens) {
    config.maxOutputTokens = resolvedMaxTokens;
  }

  const thinkingConfig = getGeminiThinkingConfig(model, resolvedMaxTokens, supportsThinking, reasoningEffort);
  if (thinkingConfig) {
    config.thinkingConfig = thinkingConfig;
  }

  return config;
}

export function extractGeminiText(parts: Array<{ text?: unknown }> | undefined): string {
  if (!Array.isArray(parts)) {
    return '';
  }

  return parts
    .filter((part): part is { text: string } => typeof part.text === 'string')
    .map(part => part.text)
    .join('');
}
