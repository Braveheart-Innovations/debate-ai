/**
 * Watches (web docs/analyze-beyond-reports-plan.md, "The watch design"): a
 * model whose data is fetched again on a schedule, and run when it changed.
 *
 *   users/{uid}/watches/{watchId}
 *
 * Written only by the server: analyzeWatchSet and analyzeWatchControl (so the
 * checks live once, here, and a phone needs no copy of them) and the runs
 * (watchRun.ts). The owner reads them (firestore.rules). One watch per model:
 * its id comes from the session and the recipe's name. Stopping a watch
 * deletes it; the scenarios it made stay.
 */
import { createHash } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import type { Artifact, RecipeParamValue } from '../contract/types/notebook';
import { MODEL_RESULTS_FILENAME, parseModelResults, type ModelResultsV1 } from '../contract/services/analyze/models/modelResults';
import { isPremiumOrTrial } from '../../usageTracking';
import { loadArtifactsById, removeUndefined } from '../engine/sessionStore';
import { findModelSources, modelOutputDir } from '../recipes/modelSources';
import { NoModelSourcesError } from '../recipes/refreshData';
import { loadRecipeForRun } from '../recipes/runRecipe';
import { WatchInputError, nextRunAfter, readSchedule, type WatchSchedule } from './schedule';

export type WatchStatus = 'active' | 'paused';
/** Why a watch is paused: the user paused it, or premium or the trial ended. */
export type WatchPauseReason = 'user' | 'entitlement';
export type WatchOutcome = 'new_data' | 'no_change' | 'skipped' | 'error';

export interface WatchAlert {
  /** A `show_metric` label from the model's results. */
  metric: string;
  direction: 'above' | 'below';
  value: number;
}

/** A numeric metric as the last scenario showed it: what the next run's alerts compare with. */
export interface WatchMetric {
  label: string;
  value: number;
  unit?: string;
  decimals?: number;
}

export interface WatchLastRun {
  at: number;
  outcome: WatchOutcome;
  /** Why it was skipped, or the error. */
  reason?: string;
  /** New data: the scenario's results file. */
  scenarioId?: string;
  /** When the data the model has was fetched. */
  fetchedAt?: number;
}

export interface WatchDoc {
  id: string;
  uid: string;
  sessionId: string;
  /** The recipe's name (`<name>.recipe.py`): the model, across its versions. */
  recipeName: string;
  title: string;
  /** The inputs a run uses: the selected scenario's when the watch was turned on, changeable. */
  values: Record<string, RecipeParamValue>;
  schedule: WatchSchedule;
  alerts: WatchAlert[];
  notifyOnNewData: boolean;
  status: WatchStatus;
  pausedReason?: WatchPauseReason;
  /** The next due time. */
  nextRunAt: number;
  lastRun?: WatchLastRun;
  metrics?: WatchMetric[];
  /** When the data behind `metrics` was fetched. */
  metricsFetchedAt?: number;
  /** The run due at nextRunAt couldn't start: why, and since when. The sweep retries it. */
  blocked?: { reason: string; since: number };
  /** An error was notified; the next one waits for a run that succeeds. */
  errorNotified?: boolean;
  /** A run at work. */
  lease?: { owner: string; expiresAt: number };
  /** When the sweep last queued a run. */
  queuedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export class WatchNotAllowedError extends Error {
  constructor() {
    super('Watches come with Premium or a free trial.');
  }
}

export class WatchNotFoundError extends Error {
  constructor() {
    super('This watch no longer exists.');
  }
}

export function watchesPath(uid: string): string {
  return `users/${uid}/watches`;
}

export function watchId(sessionId: string, recipeName: string): string {
  return createHash('sha256').update(`${sessionId}\n${recipeName}`).digest('hex').slice(0, 32);
}

export function watchRef(uid: string, id: string) {
  return getFirestore().doc(`${watchesPath(uid)}/${id}`);
}

/** The model's name: the recipe's docstring title, else its filename in words. */
export function modelTitle(recipe: Artifact): string {
  const title = recipe.metadata?.recipe?.title?.trim();
  if (title) return title;
  const words = (recipe.name.split('/').pop() ?? recipe.name).replace(/\.recipe\.py$/i, '').replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The numeric metrics a scenario shows. */
export function numericMetrics(results: ModelResultsV1 | null | undefined): WatchMetric[] {
  return (results?.items ?? []).flatMap((item) => (item.kind === 'metric' && typeof item.value === 'number' && Number.isFinite(item.value)
    ? [removeUndefined({ label: item.label, value: item.value, unit: item.unit, decimals: item.decimals })]
    : []));
}

function readAlerts(input: unknown): WatchAlert[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new WatchInputError('Alerts must be a list.');
  return input.map((entry) => {
    const alert = (entry ?? {}) as Record<string, unknown>;
    const metric = typeof alert.metric === 'string' ? alert.metric.trim() : '';
    if (!metric || metric.length > 200) throw new WatchInputError('An alert needs the metric it watches.');
    if (alert.direction !== 'above' && alert.direction !== 'below') throw new WatchInputError('An alert is for a value above or below a line.');
    if (typeof alert.value !== 'number' || !Number.isFinite(alert.value)) throw new WatchInputError('An alert needs a number to compare with.');
    return { metric, direction: alert.direction, value: alert.value };
  });
}

export interface WatchSetInput {
  sessionId: string;
  recipeArtifactId: string;
  values: Record<string, unknown>;
  schedule: unknown;
  alerts?: unknown;
  notifyOnNewData?: boolean;
  /** The scenario the panel opened on: the first run's alerts compare with its metrics. */
  scenarioArtifactId?: string;
}

export interface WatchStoreDeps {
  now: () => number;
  canWatch: (uid: string) => Promise<boolean>;
}

export const defaultWatchStoreDeps: WatchStoreDeps = {
  now: () => Date.now(),
  canWatch: isPremiumOrTrial,
};

/** The fields the web reads (no lease or queue bookkeeping). */
export function publicWatch(watch: WatchDoc): Omit<WatchDoc, 'lease' | 'queuedAt'> {
  const { lease: _lease, queuedAt: _queuedAt, ...rest } = watch;
  return rest;
}

/** Turn a watch on, or save a changed one (its status, last run and history stay). */
export async function setWatch(uid: string, input: WatchSetInput, deps: WatchStoreDeps = defaultWatchStoreDeps): Promise<WatchDoc> {
  if (!await deps.canWatch(uid)) throw new WatchNotAllowedError();
  const schedule = readSchedule(input.schedule);
  const alerts = readAlerts(input.alerts);
  const { sessionId } = input;
  const { recipe, values } = await loadRecipeForRun(uid, sessionId, input.recipeArtifactId, input.values);
  const sources = await findModelSources(uid, sessionId, recipe);
  if (sources.length === 0) throw new NoModelSourcesError();

  let baseline: Pick<WatchDoc, 'metrics' | 'metricsFetchedAt'> = {};
  if (input.scenarioArtifactId) {
    const [scenario] = await loadArtifactsById(uid, sessionId, [input.scenarioArtifactId]);
    if (scenario?.name === `${modelOutputDir(recipe)}/${MODEL_RESULTS_FILENAME}`) {
      baseline = {
        metrics: numericMetrics(parseModelResults(Buffer.from(scenario.data, 'base64').toString('utf8'))),
        metricsFetchedAt: scenario.metadata?.dataRefresh?.fetchedAt ?? Math.max(...sources.map((source) => source.fetch.fetchedAt)),
      };
    }
  }

  const id = watchId(sessionId, recipe.name);
  const ref = watchRef(uid, id);
  const now = deps.now();
  return getFirestore().runTransaction(async (tx) => {
    const existing = (await tx.get(ref)).data() as WatchDoc | undefined;
    const watch: WatchDoc = removeUndefined({
      ...(existing ?? { status: 'active' as const, createdAt: now }),
      id,
      uid,
      sessionId,
      recipeName: recipe.name,
      title: modelTitle(recipe),
      values,
      schedule,
      alerts,
      notifyOnNewData: input.notifyOnNewData ?? true,
      nextRunAt: nextRunAfter(schedule, now),
      ...(baseline.metrics ? baseline : {}),
      // A changed schedule starts over: nothing is waiting to run.
      blocked: undefined,
      queuedAt: undefined,
      updatedAt: now,
    });
    tx.set(ref, watch);
    return watch;
  });
}

export type WatchControlOp = 'pause' | 'resume' | 'stop';

/** Pause, resume or stop (delete) a watch. Resuming checks that the user can still watch. */
export async function controlWatch(
  uid: string,
  id: string,
  op: WatchControlOp,
  deps: WatchStoreDeps = defaultWatchStoreDeps,
): Promise<WatchDoc | null> {
  const ref = watchRef(uid, id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new WatchNotFoundError();
  if (op === 'stop') {
    await ref.delete();
    return null;
  }
  const now = deps.now();
  if (op === 'resume' && !await deps.canWatch(uid)) throw new WatchNotAllowedError();
  const watch = snapshot.data() as WatchDoc;
  const update = op === 'pause'
    ? { status: 'paused', pausedReason: 'user', blocked: FieldValue.delete(), updatedAt: now }
    : { status: 'active', pausedReason: FieldValue.delete(), blocked: FieldValue.delete(), nextRunAt: nextRunAfter(watch.schedule, now), updatedAt: now };
  await ref.update(update);
  return (await ref.get()).data() as WatchDoc;
}

/** The model's latest recipe version, or null when the model (or its session) is gone. */
export async function latestRecipeId(uid: string, sessionId: string, recipeName: string): Promise<string | null> {
  const snapshot = await getFirestore()
    .collection(`users/${uid}/conversations/${sessionId}/artifacts`)
    .where('name', '==', recipeName)
    .select('type', 'createdAt', 'metadata.versionNumber')
    .get();
  const latest = snapshot.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as Pick<Artifact, 'type' | 'createdAt' | 'metadata'>) }))
    .filter((artifact) => artifact.type === 'recipe')
    .sort((a, b) => ((b.metadata?.versionNumber ?? 1) - (a.metadata?.versionNumber ?? 1)) || (b.createdAt - a.createdAt))[0];
  return latest?.id ?? null;
}
