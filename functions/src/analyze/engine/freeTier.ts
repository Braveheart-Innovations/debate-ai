/**
 * Analyze's free tier: 5 sessions, lifetime; trial and paid are uncapped
 * (isActiveServerOwnedPremium). A session counts at its first turn
 * (analyzeStartTurn, keyed on the session id); its follow-ups and everything
 * else that acts on it are free. Uploads to a session that hasn't been counted
 * only check: they're allowed while the user has sessions left.
 *
 * At the limit the callables throw the free-limit refusal every mode shares
 * (usageTracking freeLimitError), which the client shows as the limit card.
 */
import { checkFreeTierForInteraction, enforceFreeTierForInteraction, freeTierGateError } from '../../usageTracking';

/** A session's first turn counts it; later turns find its marker. Throws at the limit. */
export async function countAnalyzeSession(uid: string, sessionId: string): Promise<void> {
  const gate = await enforceFreeTierForInteraction(uid, 'analyze', sessionId);
  if (!gate.allowed) throw freeTierGateError(gate, 'analyze');
}

/** Uploads: the same decision without counting. Throws at the limit for a session that hasn't been counted. */
export async function assertAnalyzeSessionAllowed(uid: string, sessionId: string): Promise<void> {
  const gate = await checkFreeTierForInteraction(uid, 'analyze', sessionId);
  if (!gate.allowed) throw freeTierGateError(gate, 'analyze');
}
