/**
 * analyzeRunSweeper: recovers runs whose task was lost. Every hand-off
 * commits its state, then enqueues; a process that dies in between (or a step
 * that used up its Cloud Tasks retries) leaves a run queued or running with
 * no task, and its session blocked. Every few minutes this finds runs with no
 * live lease and no progress for STRANDED_MS and enqueues a fresh step
 * (duplicates are harmless: the lease and status gates make extras no-ops).
 * A run swept MAX_SWEEPS times without progress is given up on as an error,
 * so a run that crashes every time can't loop forever.
 *
 * Query: collection group analyzeRuns, status in [queued, running], updatedAt
 * before the cutoff (firestore.indexes.json; deployed by hand from debateai).
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { enqueueStep } from './queue';
import { finishRun, runRef, type AnalyzeRunDoc } from './runStore';
import { endedChildResult, finishChild } from '../team/teamStore';

/** Longer than any Cloud Tasks retry gap (≤ 60 s) plus a lease (30 s): steps bump updatedAt on every attempt. */
export const STRANDED_MS = 5 * 60_000;
export const MAX_SWEEPS = 3;
const BATCH = 200;

export interface SweepOutcome {
  requeued: string[];
  failed: string[];
}

export async function sweepStrandedRuns(now = Date.now()): Promise<SweepOutcome> {
  const snapshot = await getFirestore()
    .collectionGroup('analyzeRuns')
    .where('status', 'in', ['queued', 'running'])
    .where('updatedAt', '<', now - STRANDED_MS)
    .limit(BATCH)
    .get();
  const outcome: SweepOutcome = { requeued: [], failed: [] };
  for (const doc of snapshot.docs) {
    const run = doc.data() as AnalyzeRunDoc & { sweepCount?: number };
    // A live lease is a step at work (a long model call doesn't touch updatedAt).
    if (run.lease && run.lease.expiresAt > now) continue;
    const ref = runRef(run.uid, run.sessionId, run.runId);
    const sweeps = (run.sweepCount ?? 0) + 1;
    try {
      if (sweeps > MAX_SWEEPS) {
        const message = 'The run stopped making progress and was ended.';
        if (run.kind === 'operator' || run.kind === 'reviewer') await finishRun(ref, 'error', { message, code: 'deadline-exceeded' });
        else await finishChild(run, run.result ?? endedChildResult(run, 'failed', `The subagent failed: ${message}`));
        outcome.failed.push(doc.ref.path);
        continue;
      }
      await ref.update({ sweepCount: sweeps, updatedAt: now });
      await enqueueStep({ uid: run.uid, sessionId: run.sessionId, runId: run.runId });
      outcome.requeued.push(doc.ref.path);
    } catch (error) {
      console.error('[analyzeSweeper] could not recover a run', { path: doc.ref.path, error });
    }
  }
  return outcome;
}

export const analyzeRunSweeper = onSchedule(
  { schedule: 'every 5 minutes', region: 'us-central1', timeoutSeconds: 300 },
  async () => {
    const { requeued, failed } = await sweepStrandedRuns();
    if (requeued.length || failed.length) console.warn('[analyzeSweeper] recovered stranded runs', { requeued, failed });
  },
);
