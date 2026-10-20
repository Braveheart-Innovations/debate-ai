/**
 * Watches' functions (web docs/analyze-beyond-reports-plan.md, "The watch design"):
 *
 *   analyzeWatchSet       turn a watch on for a model, or save a changed one
 *   analyzeWatchControl   pause, resume or stop a watch
 *   analyzeWatchSweep     every 5 minutes on the clock (:00, :05, ...): queue a
 *                         run for each watch that's due
 *   analyzeWatchRun       one watch's run (watchRun.ts), a Cloud Task per watch,
 *                         so one slow run never holds up the others
 *
 * The sweep's query: collection group watches, status == active, nextRunAt
 * up to now (firestore.indexes.json; deployed by hand from debateai).
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { getFunctions } from 'firebase-admin/functions';
import { getFirestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { encryptionKey } from '../../apiKeys';
import { SERVER_TOOL_SECRETS } from '../../tools';
import { isPremiumOrTrial } from '../../usageTracking';
import { notifyWatch } from '../engine/notifications';
import { NoModelSourcesError, refreshDataDeps, refreshModelData } from '../recipes/refreshData';
import { NoRecipeSandboxError, RecipeNotFoundError, RecipeValuesError } from '../recipes/runRecipe';
import { WatchInputError } from './schedule';
import {
  WatchNotAllowedError,
  WatchNotFoundError,
  controlWatch,
  latestRecipeId,
  publicWatch,
  setWatch,
  type WatchControlOp,
  type WatchDoc,
} from './watchStore';
import { runWatch, type WatchRunDeps, type WatchRunPayload } from './watchRun';
import { markSessionWatched } from '../engine/sessionSummary';

export const WATCH_RUN_FUNCTION = 'analyzeWatchRun';
/** A queued run that hasn't started by the next sweep is queued again (duplicates do nothing: the lease and dueAt). */
const REQUEUE_MS = 4 * 60_000;
const SWEEP_PAGE = 200;
/** The run's deadline: a refresh's fetches, a five-minute recipe run and its saves, with room to spare. */
const RUN_TIMEOUT_SECONDS = 1200;

function requireUid(uid: string | undefined): string {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to use Analyze.');
  return uid;
}

function requireString(value: unknown, field: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new HttpsError('invalid-argument', `${field} is required`);
  }
  return value;
}

/** The errors both callables can meet, as the web shows them. */
function toHttpsError(error: unknown): HttpsError {
  if (error instanceof HttpsError) return error;
  if (error instanceof WatchNotAllowedError) return new HttpsError('permission-denied', error.message, { reason: 'watch-entitlement' });
  if (error instanceof WatchNotFoundError) return new HttpsError('not-found', error.message);
  if (error instanceof RecipeNotFoundError || error instanceof NoRecipeSandboxError || error instanceof NoModelSourcesError) {
    return new HttpsError('failed-precondition', error.message);
  }
  if (error instanceof RecipeValuesError || error instanceof WatchInputError) return new HttpsError('invalid-argument', error.message);
  console.error('[analyzeWatch] failed', error);
  return new HttpsError('internal', 'The watch could not be saved. Please try again.');
}

export const analyzeWatchSet = onCall(
  { region: 'us-central1', timeoutSeconds: 120 },
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    const data = (request.data ?? {}) as Record<string, unknown>;
    const values = data.values ?? {};
    if (typeof values !== 'object' || values === null || Array.isArray(values)) throw new HttpsError('invalid-argument', 'values must be an object');
    try {
      const watch = await setWatch(uid, {
        sessionId: requireString(data.sessionId, 'sessionId'),
        recipeArtifactId: requireString(data.recipeArtifactId, 'recipeArtifactId'),
        values: values as Record<string, unknown>,
        schedule: data.schedule,
        alerts: data.alerts,
        notifyOnNewData: typeof data.notifyOnNewData === 'boolean' ? data.notifyOnNewData : undefined,
        scenarioArtifactId: typeof data.scenarioArtifactId === 'string' ? data.scenarioArtifactId : undefined,
      });
      return { watch: publicWatch(watch) };
    } catch (error) {
      throw toHttpsError(error);
    }
  },
);

export const analyzeWatchControl = onCall(
  { region: 'us-central1', timeoutSeconds: 60 },
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    const data = (request.data ?? {}) as Record<string, unknown>;
    const watchId = requireString(data.watchId, 'watchId');
    const op = data.op;
    if (op !== 'pause' && op !== 'resume' && op !== 'stop') throw new HttpsError('invalid-argument', 'op must be pause, resume or stop');
    try {
      const watch = await controlWatch(uid, watchId, op as WatchControlOp);
      return { watch: watch ? publicWatch(watch) : null };
    } catch (error) {
      throw toHttpsError(error);
    }
  },
);

export async function enqueueWatchRun(payload: WatchRunPayload): Promise<void> {
  await getFunctions()
    .taskQueue(`locations/us-central1/functions/${WATCH_RUN_FUNCTION}`)
    .enqueue(payload, { dispatchDeadlineSeconds: RUN_TIMEOUT_SECONDS });
}

/** Queue a run for every active watch that's due and not already at work or queued. */
export async function sweepDueWatches(now = Date.now(), enqueue = enqueueWatchRun): Promise<string[]> {
  const queued: string[] = [];
  let after: QueryDocumentSnapshot | undefined;
  for (;;) {
    let query = getFirestore()
      .collectionGroup('watches')
      .where('status', '==', 'active')
      .where('nextRunAt', '<=', now)
      .orderBy('nextRunAt')
      .limit(SWEEP_PAGE);
    if (after) query = query.startAfter(after);
    const snapshot = await query.get();
    for (const doc of snapshot.docs) {
      const watch = doc.data() as WatchDoc;
      if (watch.lease && watch.lease.expiresAt > now) continue;
      if (watch.queuedAt && now - watch.queuedAt < REQUEUE_MS) continue;
      try {
        await doc.ref.update({ queuedAt: now });
        await enqueue({ uid: watch.uid, watchId: doc.id, dueAt: watch.nextRunAt });
        queued.push(doc.ref.path);
      } catch (error) {
        console.error('[analyzeWatchSweep] could not queue a run', { path: doc.ref.path, error });
      }
    }
    if (snapshot.size < SWEEP_PAGE) return queued;
    after = snapshot.docs[snapshot.docs.length - 1];
  }
}

export const analyzeWatchSweep = onSchedule(
  // Cron, not 'every 5 minutes': Cloud Scheduler counts that from when the job
  // was made (it fired at :04, :09, ...), so a 7:00 watch ran at 7:04.
  { schedule: '*/5 * * * *', region: 'us-central1', timeoutSeconds: 300 },
  async () => {
    const queued = await sweepDueWatches();
    if (queued.length) console.log('[analyzeWatchSweep] queued watch runs', { count: queued.length });
  },
);

export function watchRunDeps(keyValue: string): WatchRunDeps {
  return {
    now: () => Date.now(),
    canWatch: isPremiumOrTrial,
    latestRecipeId,
    refresh: (uid, sessionId, recipeArtifactId, values, options) => refreshModelData(
      uid, sessionId, recipeArtifactId, values, refreshDataDeps(uid, keyValue), options,
    ),
    notify: (uid, notification) => notifyWatch(uid, notification),
    markSession: markSessionWatched,
  };
}

export const analyzeWatchRun = onTaskDispatched<WatchRunPayload>(
  {
    region: 'us-central1',
    timeoutSeconds: RUN_TIMEOUT_SECONDS,
    memory: '1GiB',
    // The fetches (connector keys), then a recipe run in the sandbox.
    secrets: SERVER_TOOL_SECRETS,
    // A run that crashed keeps its lease until it expires; the sweep queues it again after that.
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 60 },
  },
  async (request) => {
    const result = await runWatch(request.data, `${request.id}:${request.retryCount}`, watchRunDeps(encryptionKey.value()));
    if (result.kind !== 'not_due') console.log('[analyzeWatchRun]', { watchId: request.data.watchId, ...result });
  },
);
