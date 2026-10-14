import {
  calculateMessageCost,
  formatCost,
  getEstimatedCostPerMessage,
  getFreeMessageInfo,
} from '@/config/modelPricing';

describe('Model pricing utilities', () => {
  it('calculates message cost when pricing is available', () => {
    const cost = calculateMessageCost('openai', 'gpt-5', 2_000, 4_000);
    // (2000 / 1M) * 1.25 + (4000 / 1M) * 10 = 0.0425
    expect(cost).toBeCloseTo(0.0425);
  });

  it('returns zero cost for unknown pricing', () => {
    expect(calculateMessageCost('openai', 'unknown-model', 2_000, 2_000)).toBe(0);
  });

  it.each([
    // Claude Haiku 5.5 at the up-to-100K-token prompt tier: $0.10 / $0.50
    ['claude', 'claude-haiku-5-5', 0.1, 0.5],
    // Gemini 4 Argon introductory price through 2026-11-30: $2 / $10
    ['google', 'gemini-4-argon', 2.0, 10.0],
    // Mistral Large 4 launch sale price: $0.68 / $2.09
    ['mistral', 'mistral-large-4', 0.68, 2.09],
    // DeepSeek V4 Pro standard (peak, cache-miss) price: $1.32 / $3.96
    ['deepseek', 'deepseek-v4-pro', 1.32, 3.96],
  ])('prices %s/%s per 1M input and output tokens', (provider, modelId, inputPer1M, outputPer1M) => {
    expect(calculateMessageCost(provider, modelId, 1_000_000, 0)).toBeCloseTo(inputPer1M);
    expect(calculateMessageCost(provider, modelId, 0, 1_000_000)).toBeCloseTo(outputPer1M);
  });

  it('formats costs with tiered thresholds', () => {
    expect(formatCost(0)).toBe('Free');
    expect(formatCost(0.0005)).toBe('<$0.001');
    expect(formatCost(0.005)).toBe('$0.005');
    expect(formatCost(0.05)).toBe('$0.050');
    expect(formatCost(1.238)).toBe('$1.24');
  });

  it('estimates per-message cost for known and unknown models', () => {
    expect(getEstimatedCostPerMessage('openai', 'gpt-5')).toBe('$0.008');
    expect(getEstimatedCostPerMessage('unknown', 'model', 1_000, 1_000)).toBe('Pricing unavailable');
  });

  it('returns free message information when defined', () => {
    // No models currently have free message quotas in the pricing config
    expect(getFreeMessageInfo('google', 'gemini-2.5-flash')).toBeNull();
    expect(getFreeMessageInfo('openai', 'gpt-5')).toBeNull();
  });
});
