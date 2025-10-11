import { PromptDebugLogger } from '@/services/debug/PromptDebugLogger';

describe('PromptDebugLogger', () => {
  const originalEnv = { ...process.env };
  const originalDev = (global as any).__DEV__;
  const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

  afterEach(() => {
    process.env = { ...originalEnv };
    (global as any).__DEV__ = originalDev;
    consoleSpy.mockClear();
  });

  afterAll(() => {
    consoleSpy.mockRestore();
  });

  it('is disabled by default', () => {
    delete process.env.NODE_ENV;
    delete process.env.DEBUG_PROMPTS;
    (global as any).__DEV__ = false;
    expect(PromptDebugLogger.enabled()).toBe(false);
    PromptDebugLogger.logTurn('test', { aiId: 'id', aiName: 'Test' });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('logs when debug flags enabled and truncates long prompts', () => {
    process.env.NODE_ENV = 'production';
    process.env.DEBUG_PROMPTS = '1';
    const longPrompt = 'a'.repeat(9000);
    PromptDebugLogger.logTurn('turn-1', {
      aiId: 'ai',
      aiName: 'AI',
      systemPromptApplied: longPrompt,
      userPrompt: longPrompt,
    });
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const logged = consoleSpy.mock.calls[0][0];
    expect(logged).toContain('…[truncated]');
  });

  it('logs when __DEV__ is true', () => {
    (global as any).__DEV__ = true;
    PromptDebugLogger.logTurn('dev', { aiId: 'a', aiName: 'AI' });
    expect(consoleSpy).toHaveBeenCalled();
  });
});
