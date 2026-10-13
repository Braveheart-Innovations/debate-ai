import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { E2BSandboxProvider } from './e2bProvider';
import { FirestoreSandboxStore } from './firestoreStore';
import { recordSandboxUsage } from '../usageTracking';
import { SandboxSessionService } from './service';

export const e2bApiKey = defineSecret('E2B_API_KEY');

/**
 * Built from scripts/build-sandbox-template.mjs. Templates are versioned by name and
 * never rebuilt in place: a same-name rebuild reaches every new sandbox at once.
 */
export const SANDBOX_TEMPLATE = 'symposium-analyze-v2';
/**
 * The next template, dark-tested by SANDBOX_TEMPLATE_TESTERS before the switch.
 * The switch is: SANDBOX_TEMPLATE = this, then this = null.
 */
export const SANDBOX_TEMPLATE_CANDIDATE: string | null = 'symposium-analyze-v3';
/**
 * Accounts that get SANDBOX_TEMPLATE_CANDIDATE while one is set:
 *  - mspencer@braveheartinnovations.com (Michael's web account)
 *  - the live-proxy test account (automated harness)
 */
export const SANDBOX_TEMPLATE_TESTERS: ReadonlySet<string> = new Set([
  'NIxWoHSaoZbleBOUfnJVpocHTY22',
  'm8zEMeTFGUaZ0xXyuZ6Fu57rWa72',
]);

export function sandboxTemplateFor(uid: string): string {
  return SANDBOX_TEMPLATE_CANDIDATE && SANDBOX_TEMPLATE_TESTERS.has(uid) ? SANDBOX_TEMPLATE_CANDIDATE : SANDBOX_TEMPLATE;
}
const IDLE_TIMEOUT_MS = 15 * 60_000;
/** Sandboxes one user can have awake at once (Michael, 2026-10-11): E2B Hobby allows 20 for everyone. */
const MAX_AWAKE_SANDBOXES_PER_USER = 3;
/** Sandboxes (and the uploaded files inside them) are deleted after this much inactivity. */
export const SANDBOX_RETENTION_MS = 7 * 24 * 60 * 60_000;

let service: SandboxSessionService | null = null;
/** Shared with executeTool, which writes fetch_api responses straight into the sandbox. */
export function getSandboxService(): SandboxSessionService {
  if (!service) {
    service = new SandboxSessionService({
      provider: new E2BSandboxProvider(e2bApiKey.value()),
      store: new FirestoreSandboxStore(),
      templateFor: sandboxTemplateFor,
      idleTimeoutMs: IDLE_TIMEOUT_MS,
      now: () => Date.now(),
      meter: recordSandboxUsage,
      maxAwakePerUser: MAX_AWAKE_SANDBOXES_PER_USER,
    });
  }
  return service;
}

/** Session deletion: destroy the session's sandbox (its variables, uploads and outputs). */
export async function destroySessionSandbox(uid: string, sessionKey: string): Promise<void> {
  await getSandboxService().reset(uid, sessionKey);
}

/** Account deletion: destroy every sandbox the user owns. Call before deleting users/{uid}. */
export async function destroyUserSandboxes(uid: string): Promise<number> {
  return getSandboxService().destroyAllForUser(uid);
}

export const sandboxRetentionSweep = onSchedule(
  { schedule: 'every day 03:30', timeZone: 'America/Chicago', timeoutSeconds: 540, secrets: [e2bApiKey] },
  async () => {
    const removed = await getSandboxService().sweepIdle(SANDBOX_RETENTION_MS);
    console.log(`[sandbox] retention sweep removed ${removed} idle sandbox(es)`);
  },
);
