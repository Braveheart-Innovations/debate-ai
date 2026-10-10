/**
 * The user's notifications (Phase 3 decision 6): written when an operator run
 * needs the user or is done, so a run that finishes, fails, waits on a team
 * plan or asks a question with no tab open doesn't stall unseen.
 *
 *   users/{uid}/notifications/{id}
 *
 * The web header bell reads them (and Phase 4 mobile push will). Rules: the
 * owner reads them and may only set `read`; only the server creates them.
 * Ids are deterministic per run and event, and a write never replaces an
 * existing doc, so a redelivered step neither duplicates a notification nor
 * marks a read one unread.
 */
import { getFirestore } from 'firebase-admin/firestore';
import type { AnalyzeRunDoc } from './runStore';
import type { TeamPlan } from '../team/types';

export type NotificationKind = 'completed' | 'error' | 'awaiting_approval' | 'asked_user';

export interface NotificationDoc {
  id: string;
  kind: NotificationKind;
  mode: 'analyze';
  sessionId: string;
  runId: string;
  /** The question, the error, or the plan's rationale (short). */
  detail?: string;
  createdAt: number;
  read: boolean;
}

const DETAIL_CHARS = 300;
/** Firestore's ALREADY_EXISTS. */
const ALREADY_EXISTS = 6;

function notificationsPath(uid: string): string {
  return `users/${uid}/notifications`;
}

function clip(text: string | undefined): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  return trimmed.length > DETAIL_CHARS ? `${trimmed.slice(0, DETAIL_CHARS - 1)}…` : trimmed;
}

async function createOnce(uid: string, doc: NotificationDoc): Promise<void> {
  try {
    await getFirestore().doc(`${notificationsPath(uid)}/${doc.id}`).create(doc);
  } catch (error) {
    if ((error as { code?: number }).code !== ALREADY_EXISTS) throw error;
  }
}

function base(run: AnalyzeRunDoc, id: string, kind: NotificationKind, detail: string | undefined, now: number): NotificationDoc {
  const clipped = clip(detail);
  return {
    id,
    kind,
    mode: 'analyze',
    sessionId: run.sessionId,
    runId: run.runId,
    ...(clipped ? { detail: clipped } : {}),
    createdAt: now,
    read: false,
  };
}

/**
 * An operator turn ended. A Stop is the user's own doing and isn't notified;
 * a turn that ended by asking the user is a question, not a completion.
 */
export async function notifyTurnEnded(run: AnalyzeRunDoc, outcome: string, now = Date.now()): Promise<void> {
  if (run.kind !== 'operator') return;
  if (outcome === 'completed') {
    const question = run.team?.askedUser?.questions;
    if (question !== undefined) {
      await createOnce(run.uid, base(run, `${run.runId}_asked_user`, 'asked_user', question, now));
    } else {
      await createOnce(run.uid, base(run, `${run.runId}_completed`, 'completed', undefined, now));
    }
  } else if (outcome === 'error') {
    await createOnce(run.uid, base(run, `${run.runId}_error`, 'error', run.error?.message, now));
  }
}

/** Plans the user has to approve: one notification per plan. */
export async function notifyPlansPending(run: AnalyzeRunDoc, plans: TeamPlan[], now = Date.now()): Promise<void> {
  if (run.kind !== 'operator') return;
  for (const plan of plans) {
    await createOnce(run.uid, base(run, `${run.runId}_plan_${plan.id}`, 'awaiting_approval', plan.rationale, now));
  }
}
