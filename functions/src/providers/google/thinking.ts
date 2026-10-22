const TIGHT_OUTPUT_TOKEN_CAP = 2048;
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

type GeminiThinkingConfig =
  | { thinkingLevel: 'minimal' | 'low' | 'high' }
  | { thinkingBudget: number };

interface GeminiGenerationConfigOptions {
  model: string;
  temperature: number;
  maxTokens?: number;
  /** Think harder than the default (ProviderRequest.deepThinking). */
  deepThinking?: boolean;
  /** Stream thought summaries (ProviderRequest.streamReasoning). */
  includeThoughts?: boolean;
}

/**
 * Gemini 2.5 thinking budget ceilings (Pro 32768, Flash and Flash-Lite 24576),
 * never above the output budget (thinking counts toward maxOutputTokens).
 */
const GEMINI_25_MAX_THINKING_BUDGET: Array<[string, number]> = [
  ['gemini-2.5-pro', 32768],
  ['gemini-2.5-flash', 24576],
];

/** The most thinking each Gemini family takes: thinkingLevel "high" on 3.x and later, the budget ceiling on 2.5. */
export function getGeminiDeepThinkingConfig(model: string, maxOutputTokens: number): GeminiThinkingConfig | undefined {
  const normalizedModel = model.toLowerCase();
  if (usesThinkingLevels(normalizedModel)) return { thinkingLevel: 'high' };
  const ceiling = GEMINI_25_MAX_THINKING_BUDGET.find(([prefix]) => normalizedModel.includes(prefix))?.[1];
  return ceiling ? { thinkingBudget: Math.min(ceiling, maxOutputTokens - 1) } : undefined;
}

function normalizeMaxTokens(maxTokens: number | undefined): number | undefined {
  return typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0
    ? Math.floor(maxTokens)
    : undefined;
}

export function getGeminiThinkingConfig(
  model: string,
  maxOutputTokens?: number
): GeminiThinkingConfig | undefined {
  if (!maxOutputTokens || maxOutputTokens > TIGHT_OUTPUT_TOKEN_CAP) {
    return undefined;
  }

  const normalizedModel = model.toLowerCase();
  if (!normalizedModel.includes('gemini')) {
    return undefined;
  }

  if (normalizedModel.includes('gemini-2.5-pro') && maxOutputTokens > 128) {
    return { thinkingBudget: 128 };
  }

  if (normalizedModel.includes('gemini-2.5-flash')) {
    return { thinkingBudget: 0 };
  }

  if (usesThinkingLevels(normalizedModel)) {
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

/**
 * Gemini 3 and later take thinkingLevel instead of thinkingBudget, including
 * codename models such as gemini-4-argon (low/medium/high; live-verified
 * 2026-10-15, "minimal" rejected).
 */
function usesThinkingLevels(normalizedModel: string): boolean {
  const version = /gemini-(\d+)/.exec(normalizedModel);
  return Boolean(version) && Number(version![1]) >= 3;
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

/** Gemini 2.5 and later think; earlier models take no thinkingConfig. */
function geminiThinks(model: string): boolean {
  const version = /gemini-(\d+)(?:\.(\d+))?/.exec(model.toLowerCase());
  if (!version) return false;
  const major = Number(version[1]);
  return major > 2 || (major === 2 && Number(version[2] ?? '0') >= 5);
}

export function buildGeminiGenerationConfig({
  model,
  temperature,
  maxTokens,
  deepThinking,
  includeThoughts,
}: GeminiGenerationConfigOptions): Record<string, unknown> {
  const resolvedMaxTokens = normalizeMaxTokens(maxTokens);
  const maxOutputTokens = resolvedMaxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const generationConfig: Record<string, unknown> = {
    temperature,
    maxOutputTokens,
  };

  const thinkingConfig = deepThinking
    ? getGeminiDeepThinkingConfig(model, maxOutputTokens)
    : getGeminiThinkingConfig(model, resolvedMaxTokens);
  // Thought summaries come back as parts marked `thought`, on the models that think.
  const withThoughts = includeThoughts && geminiThinks(model);
  if (thinkingConfig || withThoughts) {
    generationConfig.thinkingConfig = { ...thinkingConfig, ...(withThoughts ? { includeThoughts: true } : {}) };
  }

  return generationConfig;
}
