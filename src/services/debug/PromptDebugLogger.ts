import { Logger } from '@/services/logging';

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
    const isDev =
      (typeof __DEV__ !== 'undefined' && __DEV__) || process?.env?.NODE_ENV === 'development';
    const optIn = process?.env?.DEBUG_PROMPTS === '1';
    return Boolean(isDev || optIn);
  }

  static logTurn(label: string, payload: PromptDebugPayload): void {
    if (!PromptDebugLogger.enabled()) return;
    try {
      // Use a compact label + pretty JSON for readability in RN logs
      // Avoid massive spam: cap extremely large prompts but keep them mostly intact
      const cap = (s?: string) => {
        const redacted = s ? Logger.redactString(s) : s;
        return redacted && redacted.length > 8000 ? redacted.slice(0, 8000) + '\n…[truncated]' : redacted;
      };
      const sanitized: PromptDebugPayload = {
        ...payload,
        systemPromptApplied: cap(payload.systemPromptApplied),
        systemPromptAdapter: cap(payload.systemPromptAdapter),
        userPrompt: cap(payload.userPrompt),
      };
      // eslint-disable-next-line no-console -- opt-in prompt dump for developers; must print verbatim, not through the redacting logger
      console.log(`\n[PromptDebug][${label}]\n` + JSON.stringify(sanitized, null, 2));
    } catch {
      // ignore logging errors
    }
  }
}
