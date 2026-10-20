import type { Artifact } from '../../contract/types/notebook';
import type { RefreshDataResult } from '../../recipes/refreshData';

// ── An in-memory Firestore: docs by path, transactions run in order, collection-group queries ──
const mockDelete = Symbol('delete');
const mockDocs = new Map<string, Record<string, unknown>>();
const mockClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function mockRef(path: string) {
  const id = path.split('/').pop() as string;
  return {
    path,
    id,
    async get() {
      const data = mockDocs.get(path);
      return { exists: Boolean(data), id, ref: mockRef(path), data: () => (data ? mockClone(data) : undefined) };
    },
    async set(data: Record<string, unknown>) { mockDocs.set(path, mockClone(data)); },
    async update(fields: Record<string, unknown>) {
      const data = mockDocs.get(path);
      if (!data) throw Object.assign(new Error('NOT_FOUND'), { code: 5 });
      for (const [key, value] of Object.entries(fields)) {
        if (value === mockDelete) delete data[key];
        else data[key] = mockClone(value);
      }
    },
    async delete() { mockDocs.delete(path); },
    async create(data: Record<string, unknown>) {
      if (mockDocs.has(path)) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
      mockDocs.set(path, mockClone(data));
    },
  };
}

type Filter = [string, string, unknown];
function mockGroupQuery(name: string, filters: Filter[] = [], order?: string, limit = Infinity, after?: { id: string; ref: { path: string } }) {
  return {
    where: (field: string, op: string, value: unknown) => mockGroupQuery(name, [...filters, [field, op, value]], order, limit, after),
    orderBy: (field: string) => mockGroupQuery(name, filters, field, limit, after),
    limit: (count: number) => mockGroupQuery(name, filters, order, count, after),
    startAfter: (doc: { id: string; ref: { path: string } }) => mockGroupQuery(name, filters, order, limit, doc),
    async get() {
      let matches = [...mockDocs.entries()]
        .filter(([path]) => path.split('/').at(-2) === name)
        .filter(([, data]) => filters.every(([field, op, value]) => (op === '==' ? data[field] === value : (data[field] as number) <= (value as number))))
        .sort(([pathA, a], [pathB, b]) => (order ? (a[order] as number) - (b[order] as number) : 0) || pathA.localeCompare(pathB));
      if (after) matches = matches.slice(matches.findIndex(([path]) => path === after.ref.path) + 1);
      const docs = matches.slice(0, limit).map(([path, data]) => ({ id: path.split('/').pop(), ref: mockRef(path), data: () => mockClone(data) }));
      return { docs, size: docs.length };
    },
  };
}

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: mockRef,
    collectionGroup: (name: string) => mockGroupQuery(name),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
      get: (ref: ReturnType<typeof mockRef>) => ref.get(),
      set: (ref: ReturnType<typeof mockRef>, data: Record<string, unknown>) => ref.set(data),
      update: (ref: ReturnType<typeof mockRef>, data: Record<string, unknown>) => ref.update(data),
    }),
  }),
  FieldValue: { delete: () => mockDelete, serverTimestamp: () => 0, increment: (n: number) => n },
}));
jest.mock('firebase-admin/storage', () => ({ getStorage: jest.fn() }));
jest.mock('firebase-admin/functions', () => ({ getFunctions: jest.fn() }));
jest.mock('../../../cloudPayloadStorage', () => ({
  PAYLOAD_SENTINEL: '__PAYLOAD_OFFLOADED__',
  PAYLOAD_OFFLOAD_THRESHOLD: 900_000,
  estimateDocBytes: () => 0,
  uploadPayloadForUser: jest.fn(),
  downloadPayload: jest.fn(),
  deletePayloadForUser: jest.fn(),
}));
jest.mock('../../../tools', () => ({ refetchServerTool: jest.fn(), SERVER_TOOL_SECRETS: [] }));
jest.mock('../../../apiKeys', () => ({ encryptionKey: { value: () => 'key' } }));
jest.mock('../../../sandbox/callables', () => ({ getSandboxService: jest.fn() }));
jest.mock('../../../usageTracking', () => ({ isPremiumOrTrial: jest.fn(async () => true) }));

const mockLoadRecipe = jest.fn();
const mockFindSources = jest.fn();
const mockLoadById = jest.fn();
jest.mock('../../recipes/runRecipe', () => ({
  ...jest.requireActual('../../recipes/runRecipe'),
  loadRecipeForRun: (...args: unknown[]) => mockLoadRecipe(...args),
}));
jest.mock('../../recipes/modelSources', () => ({
  ...jest.requireActual('../../recipes/modelSources'),
  findModelSources: (...args: unknown[]) => mockFindSources(...args),
}));
jest.mock('../../engine/sessionStore', () => ({
  ...jest.requireActual('../../engine/sessionStore'),
  loadArtifactsById: (...args: unknown[]) => mockLoadById(...args),
}));

import { SandboxCeilingError, SandboxLimitError } from '../../../sandbox/service';
import { SessionBusyError } from '../../engine/turns';
import { NoModelSourcesError } from '../../recipes/refreshData';
import { sweepDueWatches } from '../callables';
import { WatchNotAllowedError, WatchNotFoundError, controlWatch, setWatch, watchId, type WatchDoc } from '../watchStore';
import { blockedReason, crossedAlerts, formatMetric, missingAlerts, runWatch, type WatchRunDeps } from '../watchRun';

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
/** Oct 19, 2026, 7 AM in Chicago. */
const T0 = Date.UTC(2026, 9, 19, 12);
const chicago = { every: 'day' as const, hour: 7, timeZone: 'America/Chicago' };
const PATH = 'users/u1/watches/w1';

function watch(overrides: Partial<WatchDoc> = {}): WatchDoc {
  return {
    id: 'w1',
    uid: 'u1',
    sessionId: 's1',
    recipeName: 'recession.recipe.py',
    title: 'Recession indicators',
    values: { months: 12 },
    schedule: chicago,
    alerts: [{ metric: 'Unemployment rate', direction: 'above', value: 4.5 }],
    notifyOnNewData: true,
    status: 'active',
    nextRunAt: T0,
    metrics: [{ label: 'Unemployment rate', value: 4.4, unit: '%', decimals: 1 }],
    metricsFetchedAt: Date.UTC(2026, 8, 19, 12),
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function results(rate: number) {
  return { version: 1 as const, kind: 'model_results' as const, values: {}, items: [{ kind: 'metric' as const, label: 'Unemployment rate', value: rate, unit: '%', decimals: 1 }] };
}

function newData(rate: number, fetchedAt = T0 + 30_000): RefreshDataResult {
  return { runId: 'recipe_9', outcome: 'new_data', fetchedAt, outputArtifactIds: ['copy', 'scenario'], stdout: '', scenario: { artifactId: 'scenario', results: results(rate) } };
}

const noChange: RefreshDataResult = { runId: 'recipe_9', outcome: 'no_change', fetchedAt: Date.UTC(2026, 8, 19, 12), outputArtifactIds: [], stdout: '' };

let clock = T0 + 60_000;
function deps(overrides: Partial<WatchRunDeps> = {}): WatchRunDeps & { refresh: jest.Mock; notify: jest.Mock; canWatch: jest.Mock; latestRecipeId: jest.Mock; markSession: jest.Mock } {
  return {
    now: () => clock,
    canWatch: jest.fn(async () => true),
    latestRecipeId: jest.fn(async () => 'recipe-3'),
    refresh: jest.fn(async () => newData(4.6)),
    notify: jest.fn(async () => undefined),
    markSession: jest.fn(async () => undefined),
    ...overrides,
  } as WatchRunDeps & { refresh: jest.Mock; notify: jest.Mock; canWatch: jest.Mock; latestRecipeId: jest.Mock; markSession: jest.Mock };
}

const stored = () => mockDocs.get(PATH) as unknown as WatchDoc | undefined;
const run = (run: WatchRunDeps, dueAt = T0) => runWatch({ uid: 'u1', watchId: 'w1', dueAt }, 'task-1', run);

beforeEach(() => {
  mockDocs.clear();
  jest.clearAllMocks();
  clock = T0 + 60_000;
});

describe('runWatch', () => {
  it('runs the model on new data, notifies the new data and an alert that crossed, and schedules the next run', async () => {
    mockDocs.set(PATH, watch() as unknown as Record<string, unknown>);
    const run1 = deps();
    expect(await run(run1)).toEqual({ kind: 'ran', outcome: 'new_data' });
    expect(run1.refresh).toHaveBeenCalledWith('u1', 's1', 'recipe-3', { months: 12 }, { watchId: 'w1', pauseIfWoken: true });
    expect(run1.notify.mock.calls.map(([, notification]) => notification)).toEqual([
      {
        id: 'w1_alert_recipe_9_0',
        event: 'alert',
        sessionId: 's1',
        watchId: 'w1',
        target: { recipeName: 'recession.recipe.py' },
        title: 'Recession indicators: Unemployment rate above 4.5%',
        body: '4.6% in the data of Oct 19 (4.4% on Sep 19).',
      },
      {
        id: 'w1_new_data_recipe_9',
        event: 'new_data',
        sessionId: 's1',
        watchId: 'w1',
        target: { recipeName: 'recession.recipe.py' },
        title: 'Recession indicators: new data',
        body: 'Fetched Oct 19. The model ran on it as a new scenario, "Data of Oct 19".',
      },
    ]);
    expect(stored()).toMatchObject({
      lastRun: { at: clock, outcome: 'new_data', scenarioId: 'scenario', fetchedAt: T0 + 30_000 },
      metrics: [{ label: 'Unemployment rate', value: 4.6, unit: '%', decimals: 1 }],
      metricsFetchedAt: T0 + 30_000,
      nextRunAt: T0 + DAY,
      errorNotified: false,
    });
    expect(stored()?.lease).toBeUndefined();
    // History moves the session up with what the run did.
    expect(run1.markSession).toHaveBeenCalledWith('u1', 's1', clock, 'Watch: new data, Oct 19');
  });

  it('doesn\'t alert again while a metric stays across its line, and keeps quiet about new data when that\'s switched off', async () => {
    mockDocs.set(PATH, watch({ notifyOnNewData: false, metrics: [{ label: 'Unemployment rate', value: 4.6, unit: '%', decimals: 1 }] }) as unknown as Record<string, unknown>);
    const run1 = deps({ refresh: jest.fn(async () => newData(4.7)) });
    await run(run1);
    expect(run1.notify).not.toHaveBeenCalled();
    expect(stored()?.metrics?.[0].value).toBe(4.7);
  });

  it('says once when an alert\'s metric is gone from the results (its label moved), and not again', async () => {
    mockDocs.set(PATH, watch({ notifyOnNewData: false }) as unknown as Record<string, unknown>);
    const moved: RefreshDataResult = {
      ...newData(4.6),
      scenario: { artifactId: 'scenario', results: { ...results(4.6), items: [{ kind: 'metric' as const, label: 'Unemployment rate, Oct', value: 4.6, unit: '%', decimals: 1 }] } },
    };
    const run1 = deps({ refresh: jest.fn(async () => moved) });
    await run(run1);
    expect(run1.notify.mock.calls.map(([, notification]) => [notification.id, notification.event, notification.title, notification.body])).toEqual([[
      'w1_alert_missing_recipe_9_0',
      'alert_missing',
      'Recession indicators: an alert lost its number',
      'The results on the data of Oct 19 have no "Unemployment rate", so the alert on it can\'t go off. Open the model\'s watch to pick another number.',
    ]]);

    clock = T0 + DAY + 60_000;
    const run2 = deps({ refresh: jest.fn(async () => ({ ...moved, runId: 'recipe_10', fetchedAt: T0 + DAY + 30_000 })) });
    await run(run2, T0 + DAY);
    expect(run2.notify).not.toHaveBeenCalled();
  });

  it('records no new data without a notification, and leaves History alone', async () => {
    mockDocs.set(PATH, watch() as unknown as Record<string, unknown>);
    const run1 = deps({ refresh: jest.fn(async () => noChange) });
    expect(await run(run1)).toEqual({ kind: 'ran', outcome: 'no_change' });
    expect(run1.notify).not.toHaveBeenCalled();
    expect(run1.markSession).not.toHaveBeenCalled();
    expect(stored()).toMatchObject({ lastRun: { outcome: 'no_change', fetchedAt: Date.UTC(2026, 8, 19, 12) }, nextRunAt: T0 + DAY });
    expect(stored()?.metrics?.[0].value).toBe(4.4);
  });

  it('notifies an error once, with its first line, until a run succeeds', async () => {
    mockDocs.set(PATH, watch() as unknown as Record<string, unknown>);
    const failing: RefreshDataResult = { runId: 'r', outcome: 'error', fetchedAt: 5, outputArtifactIds: [], stdout: '', error: 'api.stlouisfed.org couldn\'t be fetched again: HTTP 503\ndetails' };
    const run1 = deps({ refresh: jest.fn(async () => failing) });
    await run(run1);
    expect(run1.notify.mock.calls.map(([, notification]) => [notification.event, notification.title, notification.body])).toEqual([
      ['error', 'Recession indicators: the watch couldn\'t run', 'api.stlouisfed.org couldn\'t be fetched again: HTTP 503'],
    ]);
    expect(stored()).toMatchObject({ lastRun: { outcome: 'error', reason: 'api.stlouisfed.org couldn\'t be fetched again: HTTP 503' }, errorNotified: true });

    clock = T0 + DAY + 60_000;
    const run2 = deps({ refresh: jest.fn(async () => { throw new Error('KeyError: value'); }) });
    expect(await run(run2, T0 + DAY)).toEqual({ kind: 'ran', outcome: 'error' });
    expect(run2.notify).not.toHaveBeenCalled();
    expect(stored()?.lastRun?.reason).toBe('KeyError: value');

    clock = T0 + 2 * DAY + 60_000;
    await run(deps({ refresh: jest.fn(async () => noChange) }), T0 + 2 * DAY);
    expect(stored()?.errorNotified).toBe(false);
  });

  it('does nothing for a time that has moved, a paused watch, or one another run holds', async () => {
    mockDocs.set(PATH, watch() as unknown as Record<string, unknown>);
    const run1 = deps();
    expect(await run(run1, T0 - DAY)).toEqual({ kind: 'not_due' });
    mockDocs.set(PATH, watch({ lease: { owner: 'other', expiresAt: clock + 60_000 } }) as unknown as Record<string, unknown>);
    expect(await run(run1)).toEqual({ kind: 'not_due' });
    mockDocs.set(PATH, watch({ status: 'paused', pausedReason: 'user' }) as unknown as Record<string, unknown>);
    expect(await run(run1)).toEqual({ kind: 'not_due' });
    expect(run1.refresh).not.toHaveBeenCalled();
    // A lease that expired (a run that crashed) is taken over.
    mockDocs.set(PATH, watch({ lease: { owner: 'crashed', expiresAt: clock - 1 } }) as unknown as Record<string, unknown>);
    expect(await run(run1)).toEqual({ kind: 'ran', outcome: 'new_data' });
  });

  it('stays due while blocked; when the next time comes first, the blocked run is skipped with its reason and the new one runs', async () => {
    mockDocs.set(PATH, watch() as unknown as Record<string, unknown>);
    const busy = deps({ refresh: jest.fn(async () => { throw new SessionBusyError(); }) });
    expect(await run(busy)).toEqual({ kind: 'blocked', reason: 'The session was busy with a turn or a model run' });
    expect(stored()).toMatchObject({ nextRunAt: T0, blocked: { reason: 'The session was busy with a turn or a model run', since: clock } });
    expect(stored()?.lease).toBeUndefined();
    expect(busy.notify).not.toHaveBeenCalled();

    // Still blocked a sweep later: it keeps when it was first blocked.
    const since = clock;
    clock += 5 * 60_000;
    await run(busy);
    expect(stored()?.blocked?.since).toBe(since);

    // The next day's 7 AM came first.
    clock = T0 + DAY + 60_000;
    const next = deps({ refresh: jest.fn(async () => noChange) });
    expect(await run(next)).toEqual({ kind: 'ran', outcome: 'no_change' });
    expect(next.notify.mock.calls.map(([, notification]) => notification)).toEqual([expect.objectContaining({
      id: `w1_skipped_${T0}`,
      event: 'skipped',
      title: 'Recession indicators: the Oct 19 run was skipped',
      body: 'The session was busy with a turn or a model run until the next scheduled run.',
    })]);
    expect(stored()).toMatchObject({ lastRun: { outcome: 'no_change' }, nextRunAt: T0 + 2 * DAY });
    expect(stored()?.blocked).toBeUndefined();
  });

  it('says why a run couldn\'t start', () => {
    expect(blockedReason(new SandboxLimitError(3, 60_000, 15 * 60_000))).toBe('Your 3 Analyze sessions were using their Python environments');
    expect(blockedReason(new SandboxCeilingError(12 * HOUR, 3 * HOUR))).toBe('Your sessions had used the day\'s 12 hours of Python');
    expect(blockedReason(new Error('other'))).toBeNull();
  });

  it('pauses the watch when Premium or the trial has ended, and deletes it when the model is gone', async () => {
    mockDocs.set(PATH, watch() as unknown as Record<string, unknown>);
    const lapsed = deps({ canWatch: jest.fn(async () => false) });
    expect(await run(lapsed)).toEqual({ kind: 'paused' });
    expect(stored()).toMatchObject({ status: 'paused', pausedReason: 'entitlement', nextRunAt: T0 });
    expect(lapsed.refresh).not.toHaveBeenCalled();

    mockDocs.set(PATH, watch() as unknown as Record<string, unknown>);
    const gone = deps({ latestRecipeId: jest.fn(async () => null) });
    expect(await run(gone)).toEqual({ kind: 'deleted' });
    expect(stored()).toBeUndefined();
  });

  it('a schedule changed while the run was at work keeps its own next time', async () => {
    mockDocs.set(PATH, watch() as unknown as Record<string, unknown>);
    const run1 = deps({
      refresh: jest.fn(async () => {
        await mockRef(PATH).update({ schedule: { ...chicago, hour: 9 }, updatedAt: 2 });
        return noChange;
      }),
    });
    await run(run1);
    // Moved to 9 AM while the 7 AM run was at work: 9 AM today.
    expect(stored()?.nextRunAt).toBe(Date.UTC(2026, 9, 19, 14));
  });
});

describe('alerts and their words', () => {
  it('a metric crosses when it is across the line now and wasn\'t before', () => {
    const above = { metric: 'Rate', direction: 'above' as const, value: 5 };
    const below = { metric: 'Rate', direction: 'below' as const, value: 3 };
    const metric = (value: number) => [{ label: 'Rate', value }];
    expect(crossedAlerts([above], metric(4), metric(6))).toHaveLength(1);
    expect(crossedAlerts([above], metric(6), metric(7))).toHaveLength(0);
    expect(crossedAlerts([above], undefined, metric(6))).toHaveLength(1);
    expect(crossedAlerts([above], metric(4), metric(5))).toHaveLength(0);
    expect(crossedAlerts([below], metric(4), metric(2))).toHaveLength(1);
    expect(crossedAlerts([above], metric(4), [])).toHaveLength(0);
  });

  it('an alert\'s metric is missing when the results stop showing it, once', () => {
    const alert = { metric: 'Forecast for Sep 2027', direction: 'above' as const, value: 660 };
    const sep = [{ label: 'Forecast for Sep 2027', value: 654.6 }];
    const oct = [{ label: 'Forecast for Oct 2027', value: 657.1 }];
    expect(missingAlerts([alert], sep, oct)).toEqual([alert]);
    expect(missingAlerts([alert], oct, oct)).toEqual([]);
    expect(missingAlerts([alert], undefined, oct)).toEqual([alert]);
    expect(missingAlerts([alert], sep, sep)).toEqual([]);
  });

  it('formats a metric as the model shows it', () => {
    expect(formatMetric({ value: 4.567, unit: '%', decimals: 1 })).toBe('4.6%');
    expect(formatMetric({ value: 652013 })).toBe('652,013');
    expect(formatMetric({ value: 1893.5, unit: 'USD/month' })).toBe('1,893.5 USD/month');
  });
});

describe('setWatch and controlWatch', () => {
  const recipe = {
    id: 'recipe-3',
    name: 'recession.recipe.py',
    type: 'recipe',
    metadata: { recipe: { title: 'Recession indicators', params: [], outputDir: 'recession' } },
  } as unknown as Artifact;
  const id = watchId('s1', 'recession.recipe.py');
  const storeDeps = (canWatch = true) => ({ now: () => clock, canWatch: jest.fn(async () => canWatch) });
  const input = {
    sessionId: 's1',
    recipeArtifactId: 'recipe-3',
    values: { months: '12' },
    schedule: { every: 'day', hour: 7, timeZone: 'America/Chicago' },
    alerts: [{ metric: 'Unemployment rate', direction: 'above', value: 4.5 }],
  };

  beforeEach(() => {
    mockLoadRecipe.mockResolvedValue({ recipe, values: { months: 12 }, sessionKey: 'key' });
    mockFindSources.mockResolvedValue([{ fetch: { fetchedAt: Date.UTC(2026, 8, 19) } }]);
    mockLoadById.mockResolvedValue([{
      id: 'scenario-2',
      name: 'recession/model.json',
      data: Buffer.from(JSON.stringify(results(4.4))).toString('base64'),
      metadata: {},
    }]);
  });

  it('turns a watch on with the checked inputs, the next time, and the selected scenario\'s metrics', async () => {
    const saved = await setWatch('u1', { ...input, scenarioArtifactId: 'scenario-2' }, storeDeps());
    expect(saved).toMatchObject({
      id,
      sessionId: 's1',
      recipeName: 'recession.recipe.py',
      title: 'Recession indicators',
      values: { months: 12 },
      schedule: { every: 'day', hour: 7, timeZone: 'America/Chicago' },
      notifyOnNewData: true,
      status: 'active',
      nextRunAt: T0 + DAY,
      metrics: [{ label: 'Unemployment rate', value: 4.4, unit: '%', decimals: 1 }],
      metricsFetchedAt: Date.UTC(2026, 8, 19),
    });
    expect(mockDocs.get(`users/u1/watches/${id}`)).toMatchObject({ status: 'active' });
  });

  it('saving a paused watch keeps it paused with its history, and clears a wait for the old schedule', async () => {
    mockDocs.set(`users/u1/watches/${id}`, watch({
      id, status: 'paused', pausedReason: 'user', lastRun: { at: 5, outcome: 'no_change' }, blocked: { reason: 'r', since: 1 }, queuedAt: 3,
    }) as unknown as Record<string, unknown>);
    const saved = await setWatch('u1', { ...input, notifyOnNewData: false }, storeDeps());
    expect(saved).toMatchObject({ status: 'paused', pausedReason: 'user', lastRun: { at: 5, outcome: 'no_change' }, notifyOnNewData: false });
    expect(saved.blocked).toBeUndefined();
    expect(saved.queuedAt).toBeUndefined();
    // No scenario given: the metrics it knew stay.
    expect(saved.metrics?.[0].value).toBe(4.4);
  });

  it('refuses without Premium or a trial, and for a model with nothing to fetch again', async () => {
    await expect(setWatch('u1', input, storeDeps(false))).rejects.toThrow(WatchNotAllowedError);
    mockFindSources.mockResolvedValueOnce([]);
    await expect(setWatch('u1', input, storeDeps())).rejects.toThrow(NoModelSourcesError);
    expect(mockDocs.size).toBe(0);
  });

  it('pauses, resumes from now, and stops (deletes) a watch', async () => {
    mockDocs.set(PATH, watch({ nextRunAt: T0 - 3 * DAY, blocked: { reason: 'r', since: 1 } }) as unknown as Record<string, unknown>);
    expect(await controlWatch('u1', 'w1', 'pause', storeDeps())).toMatchObject({ status: 'paused', pausedReason: 'user' });
    expect(stored()?.blocked).toBeUndefined();
    await expect(controlWatch('u1', 'w1', 'resume', storeDeps(false))).rejects.toThrow(WatchNotAllowedError);
    const resumed = await controlWatch('u1', 'w1', 'resume', storeDeps());
    expect(resumed).toMatchObject({ status: 'active', nextRunAt: T0 + DAY });
    expect(resumed?.pausedReason).toBeUndefined();
    expect(await controlWatch('u1', 'w1', 'stop', storeDeps())).toBeNull();
    expect(stored()).toBeUndefined();
    await expect(controlWatch('u1', 'w1', 'pause', storeDeps())).rejects.toThrow(WatchNotFoundError);
  });
});

describe('sweepDueWatches', () => {
  it('queues each active watch that is due, unless a run holds it or it was just queued', async () => {
    const now = T0 + 60_000;
    const put = (uid: string, id: string, overrides: Partial<WatchDoc>) => mockDocs.set(`users/${uid}/watches/${id}`, watch({ uid, id, ...overrides }) as unknown as Record<string, unknown>);
    put('u1', 'due', {});
    put('u2', 'due-long-queued', { queuedAt: now - 10 * 60_000 });
    put('u1', 'leased', { lease: { owner: 'x', expiresAt: now + 60_000 } });
    put('u1', 'just-queued', { queuedAt: now - 60_000 });
    put('u1', 'paused', { status: 'paused' });
    put('u1', 'later', { nextRunAt: now + HOUR });
    const enqueue = jest.fn(async () => undefined);
    const queued = await sweepDueWatches(now, enqueue);
    expect(queued.sort()).toEqual(['users/u1/watches/due', 'users/u2/watches/due-long-queued']);
    expect(enqueue).toHaveBeenCalledWith({ uid: 'u1', watchId: 'due', dueAt: T0 });
    expect(mockDocs.get('users/u1/watches/due')?.queuedAt).toBe(now);
  });

  it('pages through every due watch', async () => {
    for (let i = 0; i < 205; i += 1) mockDocs.set(`users/u${i}/watches/w`, watch({ uid: `u${i}`, nextRunAt: T0 - i }) as unknown as Record<string, unknown>);
    const enqueue = jest.fn(async () => undefined);
    expect(await sweepDueWatches(T0 + 60_000, enqueue)).toHaveLength(205);
  });
});
