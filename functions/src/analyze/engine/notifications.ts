/**
 * The user's notifications (Phase 3 decision 6): written when an operator run
 * needs the user or is done, so a run that finishes, fails, waits on a team
 * plan or asks a question with no tab open doesn't stall unseen.
 *
 *   users/{uid}/notifications/{id}
 *
 * The web header bell reads them (and Phase 4 mobile push will). Rules: the
 * owner reads them, may only set `read`, and may delete them (dismiss / clear
 * read); only the server creates them.
 * Ids are deterministic per run and event, and a write never replaces an
 * existing doc, so a redelivered step neither duplicates a notification nor
 * marks a read one unread.
 *
 * A plan or a question stops needing the user once it's answered: the server
 * marks its notification `resolved` (and read), so "Needs you" drops it.
 *
 * A watch's run (analyze/watches) notifies with kind `watch`: no run, and the
 * server writes the title and body, because a phone push shows them as they
 * are (web docs/analyze-beyond-reports-plan.md, "Notifications").
 */
import { getFirestore } from 'firebase-admin/firestore';
import type { AnalyzeRunDoc } from './runStore';
import type { TeamPlan } from '../team/types';

export type NotificationKind = 'completed' | 'error' | 'awaiting_approval' | 'asked_user' | 'watch';

/** What a watch's notification is about. */
export type WatchEvent = 'new_data' | 'alert' | 'skipped' | 'error';

export interface NotificationDoc {
  id: string;
  kind: NotificationKind;
  mode: 'analyze';
  sessionId: string;
  /** The operator run (every kind but `watch`). */
  runId?: string;
  /** A watch's notification: what happened, the watch, what opening it shows, and the words. */
  event?: WatchEvent;
  watchId?: string;
  target?: { recipeName: string } | { artifactId: string };
  title?: string;
  body?: string;
  /** The question, the error, or the plan's goal (short). */
  detail?: string;
  createdAt: number;
  read: boolean;
  /** A plan or question that's been answered (or its run stopped): it no longer needs the user. */
  resolved?: boolean;
  resolvedAt?: number;
}

const DETAIL_CHARS = 300;
/** Firestore's ALREADY_EXISTS. */
const ALREADY_EXISTS = 6;
/** Firestore's NOT_FOUND. */
const NOT_FOUND = 5;

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

export interface WatchNotification {
  /** Unique per watch and occurrence: a redelivered run doesn't notify twice. */
  id: string;
  event: WatchEvent;
  sessionId: string;
  watchId: string;
  target: { recipeName: string } | { artifactId: string };
  title: string;
  body: string;
}

/** A watch's run found new data, crossed an alert, was skipped, or failed. */
export async function notifyWatch(uid: string, notification: WatchNotification, now = Date.now()): Promise<void> {
  await createOnce(uid, {
    ...notification,
    kind: 'watch',
    mode: 'analyze',
    title: clip(notification.title) ?? notification.title,
    body: clip(notification.body) ?? notification.body,
    createdAt: now,
    read: false,
  });
}

/** Plans the user has to approve: one notification per plan. */
export async function notifyPlansPending(run: AnalyzeRunDoc, plans: TeamPlan[], now = Date.now()): Promise<void> {
  if (run.kind !== 'operator') return;
  for (const plan of plans) {
    await createOnce(run.uid, base(run, `${run.runId}_plan_${plan.id}`, 'awaiting_approval', plan.goal, now));
  }
}

async function resolve(uid: string, id: string, now: number): Promise<void> {
  try {
    await getFirestore().doc(`${notificationsPath(uid)}/${id}`).update({ resolved: true, read: true, resolvedAt: now });
  } catch (error) {
    // Never notified (a crash lost it, or the plan was auto-approved): nothing to resolve.
    if ((error as { code?: number }).code !== NOT_FOUND) throw error;
  }
}

/** Plans that stopped waiting (approved, declined, "do it yourself", Stop). */
export async function resolvePlanNotifications(run: AnalyzeRunDoc, planIds: string[], now = Date.now()): Promise<void> {
  for (const planId of planIds) await resolve(run.uid, `${run.runId}_plan_${planId}`, now);
}

/** The user sent a message in the session: the questions its turns asked are answered. */
export async function resolveSessionQuestions(uid: string, sessionId: string, now = Date.now()): Promise<void> {
  const snapshot = await getFirestore()
    .collection(notificationsPath(uid))
    .where('sessionId', '==', sessionId)
    .where('kind', '==', 'asked_user')
    .get();
  for (const doc of snapshot.docs) {
    if ((doc.data() as NotificationDoc).resolved) continue;
    await resolve(uid, doc.id, now);
  }
}
