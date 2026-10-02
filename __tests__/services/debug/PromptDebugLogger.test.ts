import { PromptDebugLogger } from '@/services/debug/PromptDebugLogger';

// `__DEV__` is declared as a read-only global; tests flip it via Reflect.
const setDev = (value: boolean): void => {
  Reflect.set(globalThis, '__DEV__', value);
};

describe('PromptDebugLogger', () => {
  const originalEnv = { ...process.env };
  const originalDev = __DEV__;
  const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

  afterEach(() => {
    process.env = { ...originalEnv };
    setDev(originalDev);
    consoleSpy.mockClear();
  });

  afterAll(() => {
    consoleSpy.mockRestore();
  });

  it('is disabled by default', () => {
    // NODE_ENV is typed as always present; Reflect removes it for this case.
    Reflect.deleteProperty(process.env, 'NODE_ENV');
    delete process.env.DEBUG_PROMPTS;
    setDev(false);
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
    setDev(true);
    PromptDebugLogger.logTurn('dev', { aiId: 'a', aiName: 'AI' });
    expect(consoleSpy).toHaveBeenCalled();
  });
});
