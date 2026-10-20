/**
 * A watch's run (web docs/analyze-beyond-reports-plan.md, "A watch run"): one
 * Cloud Task per due watch, queued by the sweep (callables.ts).
 *
 *  1. It takes the watch's lease, so a duplicate delivery does nothing.
 *  2. A scheduled time that passed while the run was blocked is skipped, with
 *     its reason and one notification; the run then goes for the latest time.
 *  3. The user must still have Premium or a trial (else the watch pauses, and
 *     says why), and the model must still exist (else the watch is deleted).
 *  4. It refreshes the model's data as Refresh data does (refreshData.ts):
 *     no sandbox unless the data changed, the scenario marked with the watch,
 *     and a sandbox it woke paused straight after.
 *  5. Blocked (the session busy, the sandbox slots full, the day's ceiling):
 *     it stays due, and the sweep tries again.
 *  6. Otherwise the outcome is recorded, the next time computed, and the
 *     notifications sent: new data (unless switched off), each alert that
 *     crossed its line since the last scenario, and an error once until a run
 *     succeeds.
 *
 * A watch never calls an AI.
 */
import { getFirestore } from 'firebase-admin/firestore';
import type { RecipeParamValue } from '../contract/types/notebook';
import { SandboxCeilingError, SandboxLimitError } from '../../sandbox/service';
import { notifyWatch, type WatchNotification } from '../engine/notifications';
import { removeUndefined } from '../engine/sessionStore';
import { SessionBusyError } from '../engine/turns';
import type { RefreshDataResult, RefreshOptions } from '../recipes/refreshData';
import { formatDay, nextRunAfter } from './schedule';
import {
  numericMetrics,
  watchRef,
  type WatchAlert,
  type WatchDoc,
  type WatchLastRun,
  type WatchMetric,
} from './watchStore';

/** Longer than a refresh can take: the fetches, a sync, a five-minute recipe run, the saves. */
export const WATCH_LEASE_MS = 15 * 60_000;

export interface WatchRunPayload {
  uid: string;
  watchId: string;
  /** The nextRunAt the sweep saw: a delivery for a time that's since moved does nothing. */
  dueAt: number;
}

export interface WatchRunDeps {
  now: () => number;
  canWatch: (uid: string) => Promise<boolean>;
  latestRecipeId: (uid: string, sessionId: string, recipeName: string) => Promise<string | null>;
  refresh: (
    uid: string,
    sessionId: string,
    recipeArtifactId: string,
    values: Record<string, RecipeParamValue>,
    options: RefreshOptions,
  ) => Promise<RefreshDataResult>;
  notify: (uid: string, notification: WatchNotification) => Promise<void>;
}

export type WatchRunResult =
  | { kind: 'not_due' }
  | { kind: 'paused' }
  | { kind: 'deleted' }
  | { kind: 'blocked'; reason: string }
  | { kind: 'ran'; outcome: RefreshDataResult['outcome'] };

/** Why a run couldn't start, as a skipped run's words give it ("… until the next scheduled run"); null for any other error. */
export function blockedReason(error: unknown): string | null {
  if (error instanceof SessionBusyError) return 'The session was busy with a turn or a model run';
  if (error instanceof SandboxLimitError) return `Your ${error.limit} Analyze sessions were using their Python environments`;
  if (error instanceof SandboxCeilingError) {
    return `Your sessions had used the day's ${Math.round(error.ceilingMs / (60 * 60_000))} hours of Python`;
  }
  return null;
}

/** A metric's value as the model shows it: grouped, with its decimals (else up to 2), and its unit. */
export function formatMetric(metric: Pick<WatchMetric, 'value' | 'unit' | 'decimals'>): string {
  const number = metric.value.toLocaleString('en-US', {
    minimumFractionDigits: metric.decimals ?? 0,
    maximumFractionDigits: metric.decimals ?? 2,
  });
  const unit = metric.unit?.trim();
  if (!unit) return number;
  return unit === '%' ? `${number}%` : `${number} ${unit}`;
}

function across(value: number, alert: WatchAlert): boolean {
  return alert.direction === 'above' ? value > alert.value : value < alert.value;
}

/** The alerts the new metrics crossed: across the line now, and not across it in the last scenario the watch knew. */
export function crossedAlerts(alerts: WatchAlert[], previous: WatchMetric[] | undefined, current: WatchMetric[]): Array<{ alert: WatchAlert; now: WatchMetric; before?: WatchMetric }> {
  return alerts.flatMap((alert) => {
    const now = current.find((metric) => metric.label === alert.metric);
    if (!now || !across(now.value, alert)) return [];
    const before = previous?.find((metric) => metric.label === alert.metric);
    if (before && across(before.value, alert)) return [];
    return [{ alert, now, ...(before ? { before } : {}) }];
  });
}

/**
 * The alerts whose metric the new results don't show, when the last scenario
 * the watch knew did (or it knew none): a label with a date in it ("Forecast
 * for Sep 2027") moves with new data, and the alert can't go off. Once each.
 */
export function missingAlerts(alerts: WatchAlert[], previous: WatchMetric[] | undefined, current: WatchMetric[]): WatchAlert[] {
  const shows = (metrics: WatchMetric[], alert: WatchAlert) => metrics.some((metric) => metric.label === alert.metric);
  return alerts.filter((alert) => !shows(current, alert) && (!previous || shows(previous, alert)));
}

function firstLine(text: string | undefined): string {
  return (text ?? '').split('\n').map((line) => line.trim()).find(Boolean) ?? 'The watch stopped with an error.';
}

/** Take the watch for this delivery, or null when it isn't due at `dueAt`, isn't active, or another run has it. */
async function takeLease(payload: WatchRunPayload, owner: string, now: number): Promise<WatchDoc | null> {
  const ref = watchRef(payload.uid, payload.watchId);
  return getFirestore().runTransaction(async (tx) => {
    const watch = (await tx.get(ref)).data() as WatchDoc | undefined;
    if (!watch || watch.status !== 'active' || watch.nextRunAt !== payload.dueAt) return null;
    if (watch.lease && watch.lease.expiresAt > now) return null;
    tx.update(ref, { lease: { owner, expiresAt: now + WATCH_LEASE_MS } });
    return watch;
  });
}

/**
 * The run's record, written against the watch as it is now: the user may have
 * changed its schedule, paused or stopped it while the run was at work.
 */
async function finishRun(uid: string, id: string, apply: (current: WatchDoc) => Partial<WatchDoc>): Promise<void> {
  const ref = watchRef(uid, id);
  await getFirestore().runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data() as WatchDoc | undefined;
    if (!current) return;
    const { lease: _lease, queuedAt: _queuedAt, blocked: _blocked, ...rest } = current;
    tx.set(ref, removeUndefined({ ...rest, ...apply(current) }));
  });
}

export async function runWatch(payload: WatchRunPayload, owner: string, deps: WatchRunDeps): Promise<WatchRunResult> {
  const { uid, watchId } = payload;
  const startedAt = deps.now();
  const watch = await takeLease(payload, owner, startedAt);
  if (!watch) return { kind: 'not_due' };
  const { schedule, sessionId } = watch;
  const day = (at: number) => formatDay(at, schedule.timeZone, startedAt);
  const target = { recipeName: watch.recipeName };
  const notify = (notification: Omit<WatchNotification, 'sessionId' | 'watchId' | 'target'>) => deps.notify(uid, {
    ...notification, sessionId, watchId, target,
  }).catch((error) => console.error('[analyzeWatchRun] notification failed', { watchId, error }));

  // 2. Scheduled times that came while this one waited.
  let due = payload.dueAt;
  let skipped: WatchLastRun | undefined;
  if (nextRunAfter(schedule, due) <= startedAt) {
    if (watch.blocked) {
      skipped = { at: startedAt, outcome: 'skipped', reason: `${watch.blocked.reason}.` };
      await notify({
        id: `${watchId}_skipped_${due}`,
        event: 'skipped',
        title: `${watch.title}: the ${day(due)} run was skipped`,
        body: `${watch.blocked.reason} until the next scheduled run.`,
      });
    }
    while (nextRunAfter(schedule, due) <= startedAt) due = nextRunAfter(schedule, due);
  }

  // A schedule the user changed while the run was at work keeps its own next time.
  const dueUnlessChanged = (current: WatchDoc) => (current.updatedAt === watch.updatedAt ? due : current.nextRunAt);

  // 3. Can it still run?
  if (!await deps.canWatch(uid)) {
    await finishRun(uid, watchId, (current) => ({
      status: 'paused', pausedReason: 'entitlement', nextRunAt: dueUnlessChanged(current), ...(skipped ? { lastRun: skipped } : {}), updatedAt: deps.now(),
    }));
    return { kind: 'paused' };
  }
  const recipeId = await deps.latestRecipeId(uid, sessionId, watch.recipeName);
  if (!recipeId) {
    await watchRef(uid, watchId).delete();
    return { kind: 'deleted' };
  }

  // 4. The refresh.
  let result: RefreshDataResult;
  try {
    result = await deps.refresh(uid, sessionId, recipeId, watch.values, { watchId, pauseIfWoken: true });
  } catch (error) {
    const reason = blockedReason(error);
    if (reason) {
      // 5. Still due: the sweep tries again.
      await finishRun(uid, watchId, (current) => ({
        nextRunAt: dueUnlessChanged(current),
        blocked: { reason, since: watch.blocked && !skipped ? watch.blocked.since : deps.now() },
        ...(skipped ? { lastRun: skipped } : {}),
        updatedAt: deps.now(),
      }));
      return { kind: 'blocked', reason };
    }
    result = {
      runId: '',
      outcome: 'error',
      fetchedAt: watch.lastRun?.fetchedAt ?? 0,
      outputArtifactIds: [],
      stdout: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // 6. The outcome.
  const finishedAt = deps.now();
  const lastRun: WatchLastRun = removeUndefined({
    at: finishedAt,
    outcome: result.outcome,
    reason: result.outcome === 'error' ? firstLine(result.error) : undefined,
    scenarioId: result.scenario?.artifactId,
    fetchedAt: result.fetchedAt || undefined,
  });
  const update: Partial<WatchDoc> = { lastRun, updatedAt: finishedAt, errorNotified: result.outcome === 'error' };

  if (result.outcome === 'error') {
    if (!watch.errorNotified) {
      await notify({ id: `${watchId}_error_${finishedAt}`, event: 'error', title: `${watch.title}: the watch couldn't run`, body: firstLine(result.error) });
    }
  } else if (result.outcome === 'new_data') {
    const metrics = numericMetrics(result.scenario?.results);
    for (const { alert, now, before } of crossedAlerts(watch.alerts, watch.metrics, metrics)) {
      const was = before && watch.metricsFetchedAt ? ` (${formatMetric(before)} on ${day(watch.metricsFetchedAt)})` : '';
      await notify({
        id: `${watchId}_alert_${result.runId}_${watch.alerts.indexOf(alert)}`,
        event: 'alert',
        title: `${watch.title}: ${alert.metric} ${alert.direction} ${formatMetric({ ...now, value: alert.value })}`,
        body: `${formatMetric(now)} in the data of ${day(result.fetchedAt)}${was}.`,
      });
    }
    for (const alert of missingAlerts(watch.alerts, watch.metrics, metrics)) {
      await notify({
        id: `${watchId}_alert_missing_${result.runId}_${watch.alerts.indexOf(alert)}`,
        event: 'alert_missing',
        title: `${watch.title}: an alert lost its number`,
        body: `The results on the data of ${day(result.fetchedAt)} have no "${alert.metric}", so the alert on it can't go off. Open the model's watch to pick another number.`,
      });
    }
    if (watch.notifyOnNewData) {
      await notify({
        id: `${watchId}_new_data_${result.runId}`,
        event: 'new_data',
        title: `${watch.title}: new data`,
        body: `Fetched ${day(result.fetchedAt)}. The model ran on it as a new scenario, "Data of ${day(result.fetchedAt)}".`,
      });
    }
    update.metrics = metrics;
    update.metricsFetchedAt = result.fetchedAt;
  }

  await finishRun(uid, watchId, (current) => ({
    ...update,
    nextRunAt: nextRunAfter(current.schedule, Math.max(due, finishedAt)),
  }));
  return { kind: 'ran', outcome: result.outcome };
}
