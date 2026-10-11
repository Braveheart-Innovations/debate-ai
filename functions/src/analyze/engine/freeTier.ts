/**
 * Analyze's free tier: 5 sessions, lifetime; trial and paid are uncapped
 * (isActiveServerOwnedPremium). A session counts at its first turn
 * (analyzeStartTurn, keyed on the session id); its follow-ups and everything
 * else that acts on it are free. Uploads to a session that hasn't been counted
 * only check: they're allowed while the user has sessions left.
 *
 * At the limit the callables throw resource-exhausted with a typed detail the
 * client shows as the limit card.
 */
import { HttpsError } from 'firebase-functions/v2/https';
import { checkFreeTierForInteraction, enforceFreeTierForInteraction, freeTierLimit } from '../../usageTracking';

export const ANALYZE_FREE_LIMIT_REASON = 'analyze-free-limit';

export interface AnalyzeFreeLimitDetails {
  reason: typeof ANALYZE_FREE_LIMIT_REASON;
  limit: number;
}

export function analyzeFreeLimitError(): HttpsError {
  const limit = freeTierLimit('analyze');
  const details: AnalyzeFreeLimitDetails = { reason: ANALYZE_FREE_LIMIT_REASON, limit };
  return new HttpsError('resource-exhausted', `You've used your ${limit} free Analyze sessions.`, details);
}

/** A session's first turn counts it; later turns find its marker. Throws at the limit. */
export async function countAnalyzeSession(uid: string, sessionId: string): Promise<void> {
  const gate = await enforceFreeTierForInteraction(uid, 'analyze', sessionId);
  if (!gate.allowed) throw analyzeFreeLimitError();
}

/** Uploads: the same decision without counting. Throws at the limit for a session that hasn't been counted. */
export async function assertAnalyzeSessionAllowed(uid: string, sessionId: string): Promise<void> {
  const gate = await checkFreeTierForInteraction(uid, 'analyze', sessionId);
  if (!gate.allowed) throw analyzeFreeLimitError();
}
