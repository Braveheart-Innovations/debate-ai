/**
 * Refresh data (analyzeRefreshData): fetch a model's sources again on the
 * server and, when the data changed, run the model on it as a new scenario.
 * A watch run is the same thing on a schedule (web docs/analyze-beyond-reports-plan.md,
 * "The watch design").
 *
 *  1. Every source is fetched again, on the server: keys never enter the
 *     sandbox, and none is woken yet. A source that fails stops the refresh
 *     with nothing changed.
 *  2. Every response matches its copy byte for byte: no new data. Nothing is
 *     saved.
 *  3. Otherwise the new copies go into the model's folder and the recipe runs
 *     with the given values, as Run model does. Results that a scenario
 *     already has mean no new data either (a source can change its bytes
 *     daily without new data: FRED repeats the request's date in every row).
 *  4. New results: the new copies are saved as new versions of the source
 *     files, with their fetch provenance, then the results as a new scenario,
 *     both marked metadata.dataRefresh; the scenario is named for its fetch
 *     date. When nothing is saved (no new data, or the recipe failed on the
 *     new data), the previous copies go back: the folder keeps the data its
 *     scenarios used.
 *
 * It holds the session as Run model does (a recipeRuns record) from the moment
 * the data is found changed to the last save: a check that finds no new data
 * never blocks a turn, and a turn never blocks it.
 *
 * A watch's run (analyze/watches) is the same refresh with `watchId`, which
 * marks what it saves, and `pauseIfWoken`: a sandbox the run woke is paused
 * before the session is let go, so it doesn't hold one of the user's slots.
 */
import type { ToolResultProvenance } from '../contract/types';
import type { Artifact } from '../contract/types/notebook';
import { MODEL_RESULTS_FILENAME, parseModelResults, type ModelResultsV1 } from '../contract/services/analyze/models/modelResults';
import { refetchServerTool, type RefetchResult } from '../../tools';
import { sha256Hex } from '../../fetchToSandbox';
import { getSandboxService } from '../../sandbox/callables';
import { deriveArtifactLineage, withArtifactPreviewMetadata } from '../capture/artifacts';
import { isRawTextArtifact } from '../engine/artifactFilesystemHydration';
import { fetchRequestArgs, writeFetchRecord, type FetchRecord } from '../engine/fetchRecords';
import { createSandboxBridge } from '../engine/sandboxBridge';
import { artifactRef, loadArtifactsNamed, removeUndefined } from '../engine/sessionStore';
import { buildFetchProvenance } from '../engine/tools/provenance';
import { SessionFilesSync } from '../engine/uploads';
import { findModelSources, modelOutputDir, sourceEndpoint, summarizeSources, type ModelSource, type ModelSourceSummary } from './modelSources';
import { RECIPE_RUN_TIMEOUT_MS } from './recipeRunStore';
import {
  RecipeNotFoundError,
  buildRecipeRunArtifacts,
  claimRecipeRun,
  defaultRunRecipeDeps,
  loadRecipeForRun,
  outputFiles,
  recipeRunCode,
  saveArtifacts,
  tabularMetadata,
  type RunRecipeDeps,
} from './runRecipe';

export type RefreshOutcome = 'new_data' | 'no_change' | 'error';

export interface RefreshDataResult {
  runId: string;
  outcome: RefreshOutcome;
  /** When the model's data was fetched: just now for new data, else when the data it has was. */
  fetchedAt: number;
  /** The new versions saved: the source copies, then the scenario's files. */
  outputArtifactIds: string[];
  stdout: string;
  error?: string;
  /** New data: the scenario's results file and what it shows (null when it has none). */
  scenario?: { artifactId: string; results: ModelResultsV1 | null };
}

export interface RefreshOptions {
  /** A watch's run: marks the copies and the scenario it saves (metadata.dataRefresh.watchId). */
  watchId?: string;
  /** Pause the session's sandbox when done, if it was this refresh that woke it. */
  pauseIfWoken?: boolean;
}

/** None of the model's files is an unchanged copy of fetched data (uploads only, a Salesforce workspace). */
export class NoModelSourcesError extends Error {
  constructor() {
    super('This model can\'t be refreshed: none of its files is an unchanged copy of fetched data.');
  }
}

export interface RefreshDataDeps extends RunRecipeDeps {
  refetch: (record: FetchRecord) => Promise<RefetchResult>;
}

export function refreshDataDeps(uid: string, keyValue: string): RefreshDataDeps {
  return {
    ...defaultRunRecipeDeps,
    refetch: (record) => refetchServerTool(uid, record.tool, fetchRequestArgs(record), keyValue),
  };
}

/** The model's sources, as the Model view shows them (none: it can't be refreshed). */
export async function listModelSources(uid: string, sessionId: string, recipeArtifactId: string): Promise<ModelSourceSummary[]> {
  const snapshot = await artifactRef(uid, sessionId, recipeArtifactId).get();
  const recipe = snapshot.exists ? (snapshot.data() as Artifact) : null;
  if (!recipe || recipe.type !== 'recipe') throw new RecipeNotFoundError();
  return summarizeSources(await findModelSources(uid, sessionId, recipe));
}

function outputPath(name: string): string {
  return `/output/${name.replace(/^\/?output\//, '')}`;
}

/** A source's new copy as the next version of its file, carrying the fetch it came from. */
export function buildSourceCopyArtifacts(input: {
  sessionId: string;
  runId: string;
  fetchedAt: number;
  watchId?: string;
  copies: Array<{ file: Artifact; bytes: Buffer; provenance: ToolResultProvenance }>;
}): Artifact[] {
  const { sessionId, runId, fetchedAt, watchId } = input;
  return input.copies.map(({ file, bytes, provenance }, index) => {
    const text = isRawTextArtifact(file);
    const data = text ? bytes.toString('utf8') : bytes.toString('base64');
    const tabular = !text && (file.type === 'dataset' || file.type === 'data') ? tabularMetadata(file.mimeType, data) : null;
    const metadata: NonNullable<Artifact['metadata']> = removeUndefined({
      fileSize: bytes.byteLength,
      // Where the prior sat (output or a report's material) stays where it is.
      artifactDisposition: file.metadata?.artifactDisposition,
      reportMaterialRole: file.metadata?.reportMaterialRole,
      artifactGroupId: file.metadata?.artifactGroupId,
      sourceOutputArtifactId: file.metadata?.sourceOutputArtifactId,
      ...(tabular ?? {}),
      ...deriveArtifactLineage(file, [file]),
      dataRefresh: removeUndefined({ runId, fetchedAt, watchId }),
    });
    return withArtifactPreviewMetadata(removeUndefined({
      id: `artifact-refresh-${runId}-${index}`,
      cellId: `refresh-${runId}`,
      sessionId,
      name: file.name,
      type: file.type,
      mimeType: file.mimeType,
      data,
      createdAt: fetchedAt,
      metadata,
      provenance: { ...(file.provenance ?? { generator: 'python' }), sources: [provenance] },
    }) as Artifact);
  });
}

interface Refetched {
  source: ModelSource;
  bytes: Buffer;
  hash: string;
}

type Outcome = Omit<RefreshDataResult, 'runId'>;

export async function refreshModelData(
  uid: string,
  sessionId: string,
  recipeArtifactId: string,
  requestedValues: Record<string, unknown>,
  deps: RefreshDataDeps,
  options: RefreshOptions = {},
): Promise<RefreshDataResult> {
  const { recipe, values, sessionKey } = await loadRecipeForRun(uid, sessionId, recipeArtifactId, requestedValues);
  const sources = await findModelSources(uid, sessionId, recipe);
  if (sources.length === 0) throw new NoModelSourcesError();
  const dataFetchedAt = Math.max(...sources.map((source) => source.fetch.fetchedAt));
  const runId = deps.newRunId();
  const noChange = (stdout = ''): Outcome => ({ outcome: 'no_change', fetchedAt: dataFetchedAt, outputArtifactIds: [], stdout });

  // 1. Each fetch once, however many copies of it the folder has.
  const responses = new Map<string, RefetchResult>();
  for (const source of sources) {
    if (!responses.has(source.fetch.id)) responses.set(source.fetch.id, await deps.refetch(source.fetch));
  }
  const fetchedAt = deps.now();
  const changed: Refetched[] = [];
  for (const source of sources) {
    const response = responses.get(source.fetch.id)!;
    if (!response.success) {
      return {
        runId,
        outcome: 'error',
        fetchedAt: dataFetchedAt,
        outputArtifactIds: [],
        stdout: '',
        error: `${sourceEndpoint(source.fetch) || source.file.name} couldn't be fetched again: ${response.error}`,
      };
    }
    const hash = sha256Hex(response.bytes);
    if (hash !== sha256Hex(source.bytes)) changed.push({ source, bytes: response.bytes, hash });
  }
  // 2. The same bytes: no new data, and no sandbox woken.
  if (changed.length === 0) return { runId, ...noChange() };

  // 3. The model on the new copies, holding the session.
  const runRef = await claimRecipeRun(uid, sessionId, {
    runId, recipeArtifactId, recipeName: recipe.name, values, status: 'running', startedAt: deps.now(), refresh: {},
  });
  const service = getSandboxService();
  const finish = async (outcome: Outcome): Promise<RefreshDataResult> => {
    await runRef.update(removeUndefined({
      status: outcome.outcome === 'error' ? 'error' : 'completed',
      finishedAt: deps.now(),
      outputArtifactIds: outcome.outputArtifactIds,
      stdout: outcome.stdout,
      error: outcome.error,
      refresh: { outcome: outcome.outcome, fetchedAt: outcome.fetchedAt },
    }));
    return { runId, ...outcome };
  };

  let wasAwake = true;
  try {
    if (options.pauseIfWoken) wasAwake = await service.isAwake(uid, sessionKey);
    await new SessionFilesSync(uid, sessionId, sessionKey).sync();
    const putCopies = async (which: 'new' | 'previous') => {
      for (const entry of changed) {
        const bytes = which === 'new' ? entry.bytes : entry.source.bytes;
        await service.writeFile(uid, sessionKey, { path: outputPath(entry.source.file.name), base64: bytes.toString('base64') });
      }
    };
    const putPreviousBack = () => putCopies('previous').catch((error) => {
      console.warn('[analyzeRefreshData] could not put the previous data back', { sessionId, error: error instanceof Error ? error.message : String(error) });
    });

    let saving = false;
    let outcome: Outcome;
    try {
      await putCopies('new');
      const result = await createSandboxBridge(uid, sessionKey).execute(recipeRunCode(recipe.name, values), { timeout: RECIPE_RUN_TIMEOUT_MS });
      if (!result.success) {
        outcome = { outcome: 'error', fetchedAt: dataFetchedAt, outputArtifactIds: [], stdout: result.stdout, error: result.error || 'The model stopped with an error.' };
      } else {
        const sourceNames = new Set(sources.map((source) => source.file.name));
        const outputs = outputFiles(result).filter((output) => !sourceNames.has(output.filename));
        const existing = outputs.length > 0 ? await loadArtifactsNamed(uid, sessionId, outputs.map((output) => output.filename)) : [];
        const dataRefresh = removeUndefined({ runId, fetchedAt, watchId: options.watchId });
        const scenario = buildRecipeRunArtifacts({
          sessionId, recipe, runId, values, ranAt: deps.now(), existing, outputs, dataRefresh,
        });
        const resultsName = `${modelOutputDir(recipe)}/${MODEL_RESULTS_FILENAME}`;
        const results = outputs.find((output) => output.filename === resultsName);
        // Results a scenario already has: the data changed in a way the model doesn't read.
        const sameResults = results
          ? existing.some((artifact) => artifact.name === resultsName && artifact.data === results.data)
          : scenario.length === 0;
        if (sameResults) {
          outcome = noChange(result.stdout);
        } else {
          const copies = buildSourceCopyArtifacts({
            sessionId,
            runId,
            fetchedAt,
            watchId: options.watchId,
            copies: await Promise.all(changed.map(async (entry) => ({
              file: entry.source.file,
              bytes: entry.bytes,
              provenance: {
                ...await buildFetchProvenance({
                  toolName: entry.source.fetch.tool,
                  args: fetchRequestArgs(entry.source.fetch),
                  rawContent: '',
                  responseHash: entry.hash,
                }),
                fetchedAt: new Date(fetchedAt).toISOString(),
              },
            }))),
          });
          // The data first: a scenario is never saved without the data it ran on.
          saving = true;
          await saveArtifacts(uid, sessionId, [...copies, ...scenario]);
          for (const entry of changed) {
            await writeFetchRecord(uid, sessionId, {
              tool: entry.source.fetch.tool,
              request: entry.source.fetch.request,
              path: outputPath(entry.source.file.name),
              responseHash: entry.hash,
              bytes: entry.bytes.byteLength,
              fetchedAt,
              origin: 'refresh',
              runId,
            });
          }
          const resultsArtifact = scenario.find((artifact) => artifact.name === resultsName);
          outcome = {
            outcome: 'new_data',
            fetchedAt,
            outputArtifactIds: [...copies, ...scenario].map((artifact) => artifact.id),
            stdout: result.stdout,
            ...(resultsArtifact && results
              ? { scenario: { artifactId: resultsArtifact.id, results: parseModelResults(Buffer.from(results.data, 'base64').toString('utf8')) } }
              : {}),
          };
        }
      }
    } catch (error) {
      if (!saving) await putPreviousBack();
      throw error;
    }
    if (outcome.outcome !== 'new_data') await putPreviousBack();
    if (!wasAwake) await pauseWoken(uid, sessionId, sessionKey);
    return await finish(outcome);
  } catch (error) {
    if (!wasAwake) await pauseWoken(uid, sessionId, sessionKey);
    await finish({
      outcome: 'error',
      fetchedAt: dataFetchedAt,
      outputArtifactIds: [],
      stdout: '',
      error: error instanceof Error ? error.message : String(error),
    }).catch((finishError) => console.warn('[analyzeRefreshData] could not record the failed run', finishError));
    throw error;
  }
}

/** A sandbox this refresh woke: paused while the session is still held, so no turn is using it. */
async function pauseWoken(uid: string, sessionId: string, sessionKey: string): Promise<void> {
  await getSandboxService().pause(uid, sessionKey).catch((error) => {
    console.warn('[analyzeRefreshData] could not pause the sandbox', { sessionId, error: error instanceof Error ? error.message : String(error) });
  });
}
