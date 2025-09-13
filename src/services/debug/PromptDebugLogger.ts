export type PromptDebugPayload = {
  aiId: string;
  aiName: string;
  model?: string;
  personalityId?: string;
  personalityName?: string;
  stance?: 'pro' | 'con';
  civility?: 1 | 2 | 3 | 4 | 5;
  format?: { id: string; name: string };
  phase?: string;
  round?: number;
  messageCount?: number;
  systemPromptApplied?: string; // what orchestrator set
  systemPromptAdapter?: string; // what adapter will actually send
  userPrompt?: string; // the message content for this turn
};

export class PromptDebugLogger {
  static enabled(): boolean {
    // __DEV__ is defined in React Native; fall back to NODE_ENV/DEBUG_PROMPTS
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isDev = (global as any)?.__DEV__ === true || process?.env?.NODE_ENV === 'development';
    const optIn = process?.env?.DEBUG_PROMPTS === '1';
    return Boolean(isDev || optIn);
  }

  static logTurn(label: string, payload: PromptDebugPayload): void {
    if (!PromptDebugLogger.enabled()) return;
    try {
      // Use a compact label + pretty JSON for readability in RN logs
      // Avoid massive spam: cap extremely large prompts but keep them mostly intact
      const cap = (s?: string) => (s && s.length > 8000 ? s.slice(0, 8000) + '\n…[truncated]' : s);
      const sanitized: PromptDebugPayload = {
        ...payload,
        systemPromptApplied: cap(payload.systemPromptApplied),
        systemPromptAdapter: cap(payload.systemPromptAdapter),
        userPrompt: cap(payload.userPrompt),
      };
      // eslint-disable-next-line no-console
      console.log(`\n[PromptDebug][${label}]\n` + JSON.stringify(sanitized, null, 2));
    } catch {
      // ignore logging errors
    }
  }
}

