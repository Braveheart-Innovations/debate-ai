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

  it('formats costs with tiered thresholds', () => {
    expect(formatCost(0)).toBe('Free');
    expect(formatCost(0.0005)).toBe('<$0.001');
    expect(formatCost(0.005)).toBe('$0.005');
    expect(formatCost(0.05)).toBe('$0.050');
    expect(formatCost(1.238)).toBe('$1.24');
  });

  it('estimates per-message cost for known and unknown models', () => {
    expect(getEstimatedCostPerMessage('openai', 'gpt-5')).toBe('$0.008');
    expect(getEstimatedCostPerMessage('unknown', 'model', 1_000, 1_000)).toBe('Free');
  });

  it('returns free message information when defined', () => {
    expect(getFreeMessageInfo('google', 'gemini-2.5-flash')).toBe('100 free messages/month');
    expect(getFreeMessageInfo('openai', 'gpt-5')).toBeNull();
  });
});
