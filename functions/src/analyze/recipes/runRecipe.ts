/**
 * A Model re-run (analyzeRunRecipe): run a recipe again with the user's
 * values, without an agent turn, and save what it writes as new versions of
 * the same artifacts.
 *
 *  - It runs in the session's sandbox (resumed if paused; recreated with the
 *    session's uploads and saved artifacts when it's gone), through the
 *    kernel's run_recipe, in fresh globals.
 *  - Its record is `recipeRuns/{runId}`, kept out of analyzeRuns: the step
 *    loop and the sweeper never see it. A running record holds the session:
 *    no turn starts and no other recipe runs until it ends (a crashed one
 *    stops holding after RECIPE_RUN_STALE_MS).
 *  - Capture is narrow: only files, each a new version of the same-name
 *    artifact (lineage), carrying metadata.recipeRun. No transcript message,
 *    no bundling, no report-material demotion. A file whose bytes didn't
 *    change is not a new version.
 */
import { randomBytes } from 'node:crypto';
import { getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import type { Artifact, RecipeParamValue } from '../contract/types/notebook';
import { repairModelAuthoredHtml } from '../contract/services/artifacts/htmlProfiles';
import { decodeBase64ToUtf8 } from '../contract/lib/encoding/utf8Base64';
import { deriveArtifactLineage, withArtifactPreviewMetadata } from '../capture/artifacts';
import { injectProvenanceSourcesSection, isTabularJsonArray } from '../capture/helpers';
import { MIME_MAP } from '../capture/streamCompletedHandler';
import { createSandboxBridge, type ExecutionResult } from '../engine/sandboxBridge';
import { artifactRef, latestByName, loadArtifactsNamed, prepareArtifactRecord, removeUndefined } from '../engine/sessionStore';
import { OPERATOR_ACTIVE, type AnalyzeRunDoc } from '../engine/runStore';
import { SessionBusyError, findLatestOperatorRun } from '../engine/turns';
import { SessionFilesSync } from '../engine/uploads';
import { isRecipeFilename, validateRecipeValues } from './recipeParams';
import {
  RECIPE_RUN_TIMEOUT_MS,
  activeRecipeRunIn,
  recipeRunsPath,
  type RecipeRunDoc,
  type RecipeRunStatus,
} from './recipeRunStore';

export interface RecipeRunResult {
  runId: string;
  status: Exclude<RecipeRunStatus, 'running'>;
  outputArtifactIds: string[];
  stdout: string;
  error?: string;
}

export class RecipeNotFoundError extends Error {
  constructor() {
    super('That model is no longer in this session.');
  }
}

export class RecipeValuesError extends Error {}

/** The session has no operator run yet, so there's no sandbox to run in. */
export class NoRecipeSandboxError extends Error {
  constructor() {
    super('This session has no Python environment yet.');
  }
}

/** Python that runs the recipe with these values (JSON both ways, so any string survives quoting). */
export function recipeRunCode(recipeName: string, values: Record<string, RecipeParamValue>): string {
  const path = `/output/${recipeName.replace(/^\/?output\//, '')}`;
  return `run_recipe(${JSON.stringify(path)}, params=_sym_json.loads(${JSON.stringify(JSON.stringify(values))}))`;
}

function extensionOf(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

/** Row and column counts for a tabular file, as capture records them. */
export function tabularMetadata(mimeType: string, base64: string): NonNullable<Artifact['metadata']> | null {
  let text: string;
  try {
    text = decodeBase64ToUtf8(base64);
  } catch {
    return null;
  }
  if (mimeType === 'text/csv' || mimeType === 'text/tab-separated-values') {
    const lines = text.split('\n').filter((line) => line.trim());
    if (lines.length < 2) return null;
    const headers = lines[0].split(mimeType === 'text/csv' ? ',' : '\t').map((header) => header.trim().replace(/^"|"$/g, ''));
    if (headers.length < 2) return null;
    return { rowCount: lines.length - 1, columnCount: headers.length, schema: headers.map((name) => ({ name, type: 'string' })) };
  }
  if (mimeType === 'application/json') {
    try {
      const parsed = JSON.parse(text);
      if (!isTabularJsonArray(parsed)) return null;
      const columns = Object.keys(parsed[0]);
      return {
        rowCount: parsed.length,
        columnCount: columns.length,
        schema: columns.map((name) => ({ name, type: typeof parsed[0][name] === 'number' ? 'number' : typeof parsed[0][name] === 'boolean' ? 'boolean' : 'string' })),
      };
    } catch {
      return null;
    }
  }
  return null;
}

export interface RecipeOutputFile {
  filename: string;
  /** base64 for data files, the text for HTML. */
  data: string;
  kind: 'data' | 'html';
}

/** The run's output files as new versions of the session's artifacts. */
export function buildRecipeRunArtifacts(input: {
  sessionId: string;
  recipe: Artifact;
  runId: string;
  values: Record<string, RecipeParamValue>;
  ranAt: number;
  existing: Artifact[];
  outputs: RecipeOutputFile[];
  /** A Refresh data run: the outputs ran on data fetched at this time. */
  dataRefresh?: NonNullable<Artifact['metadata']>['dataRefresh'];
}): Artifact[] {
  const { sessionId, recipe, runId, values, ranAt, existing, dataRefresh } = input;
  const created: Artifact[] = [];
  input.outputs.forEach((output, index) => {
    // The recipe itself doesn't change by running it.
    if (isRecipeFilename(output.filename)) return;
    const prior = latestByName(existing, output.filename);
    const provenance = prior?.provenance ?? recipe.provenance;
    const mimeType = output.kind === 'html' ? 'text/html' : (MIME_MAP[extensionOf(output.filename)] || 'application/octet-stream');
    const data = output.kind === 'html'
      ? repairModelAuthoredHtml(injectProvenanceSourcesSection(output.data, provenance?.sources))
      : output.data;
    if (prior && prior.data === data) return;

    let type: Artifact['type'] = prior?.type
      ?? (output.kind === 'html' || mimeType === 'text/html' ? 'html' : mimeType.startsWith('image/') ? 'image' : 'data');
    const tabular = type === 'dataset' || type === 'data' ? tabularMetadata(mimeType, data) : null;
    if (type === 'data' && tabular) type = 'dataset';

    const lineage = prior ? deriveArtifactLineage(prior, existing) : undefined;
    const metadata: NonNullable<Artifact['metadata']> = removeUndefined({
      fileSize: output.kind === 'html' ? Buffer.byteLength(data, 'utf8') : Buffer.from(data, 'base64').byteLength,
      // Where the prior sat (output or a report's material) stays where it is.
      artifactDisposition: prior?.metadata?.artifactDisposition,
      reportMaterialRole: prior?.metadata?.reportMaterialRole,
      artifactGroupId: prior?.metadata?.artifactGroupId,
      sourceOutputArtifactId: prior?.metadata?.sourceOutputArtifactId,
      ...(tabular ?? {}),
      ...(lineage ?? {}),
      recipeRun: { recipeName: recipe.name, runId, values, ranAt },
      dataRefresh,
    });
    created.push(withArtifactPreviewMetadata(removeUndefined({
      id: `artifact-recipe-${runId}-${index}`,
      cellId: `recipe-${runId}`,
      sessionId,
      name: output.filename,
      type,
      mimeType,
      data,
      createdAt: ranAt,
      metadata,
      provenance,
      ...(type === 'html' && prior ? { profile: prior.profile, policyReport: prior.policyReport } : {}),
    }) as Artifact));
  });
  return created;
}

export function outputFiles(result: ExecutionResult): RecipeOutputFile[] {
  return [
    ...(result.dataOutputs ?? []).map((file) => ({ filename: file.filename, data: file.base64, kind: 'data' as const })),
    ...(result.htmlOutputs ?? []).map((file) => ({ filename: file.filename, data: file.content, kind: 'html' as const })),
  ];
}

export interface RunRecipeDeps {
  now: () => number;
  newRunId: () => string;
}

export const defaultRunRecipeDeps: RunRecipeDeps = {
  now: () => Date.now(),
  newRunId: () => `recipe_${Date.now()}_${randomBytes(6).toString('hex')}`,
};

/** The recipe, the values checked against its inputs, and the sandbox it runs in. */
export async function loadRecipeForRun(
  uid: string,
  sessionId: string,
  recipeArtifactId: string,
  requestedValues: Record<string, unknown>,
): Promise<{ recipe: Artifact; values: Record<string, RecipeParamValue>; sessionKey: string }> {
  const recipeSnap = await artifactRef(uid, sessionId, recipeArtifactId).get();
  const recipe = recipeSnap.exists ? (recipeSnap.data() as Artifact) : null;
  if (!recipe || recipe.type !== 'recipe') throw new RecipeNotFoundError();

  let values: Record<string, RecipeParamValue>;
  try {
    values = validateRecipeValues(recipe.metadata?.recipe?.params ?? [], requestedValues);
  } catch (error) {
    throw new RecipeValuesError(error instanceof Error ? error.message : String(error));
  }

  const latest = await findLatestOperatorRun(uid, sessionId);
  if (!latest) throw new NoRecipeSandboxError();
  return { recipe, values, sessionKey: latest.config.sandboxSessionKey };
}

/** Claim the session for a recipe run: no operator turn running, no other recipe run. */
export async function claimRecipeRun(uid: string, sessionId: string, record: RecipeRunDoc): Promise<DocumentReference> {
  const db = getFirestore();
  const runRef = db.doc(`${recipeRunsPath(uid, sessionId)}/${record.runId}`);
  await db.runTransaction(async (tx) => {
    const operators = await tx.get(db.collection(`users/${uid}/conversations/${sessionId}/analyzeRuns`).where('status', 'in', OPERATOR_ACTIVE));
    if (operators.docs.some((doc) => (doc.data() as AnalyzeRunDoc).kind === 'operator')) throw new SessionBusyError();
    if (await activeRecipeRunIn(tx, uid, sessionId, record.startedAt)) throw new SessionBusyError();
    tx.set(runRef, record);
  });
  return runRef;
}

/** Save artifacts the server made (new versions), in order. */
export async function saveArtifacts(uid: string, sessionId: string, artifacts: Artifact[]): Promise<void> {
  for (const artifact of artifacts) {
    await artifactRef(uid, sessionId, artifact.id).set(await prepareArtifactRecord(uid, sessionId, artifact), { merge: true });
  }
}

export async function runRecipe(
  uid: string,
  sessionId: string,
  recipeArtifactId: string,
  requestedValues: Record<string, unknown>,
  deps: RunRecipeDeps = defaultRunRecipeDeps,
): Promise<RecipeRunResult> {
  const { recipe, values, sessionKey } = await loadRecipeForRun(uid, sessionId, recipeArtifactId, requestedValues);
  const runId = deps.newRunId();
  const runRef = await claimRecipeRun(uid, sessionId, {
    runId, recipeArtifactId, recipeName: recipe.name, values, status: 'running', startedAt: deps.now(),
  });

  const finish = async (result: Omit<RecipeRunResult, 'runId'>): Promise<RecipeRunResult> => {
    await runRef.update(removeUndefined({
      status: result.status,
      finishedAt: deps.now(),
      outputArtifactIds: result.outputArtifactIds,
      stdout: result.stdout,
      error: result.error,
    }));
    return { runId, ...result };
  };

  try {
    // The recipe and its inputs are in the sandbox (re-mounted when it was recreated).
    await new SessionFilesSync(uid, sessionId, sessionKey).sync();
    const result = await createSandboxBridge(uid, sessionKey).execute(recipeRunCode(recipe.name, values), { timeout: RECIPE_RUN_TIMEOUT_MS });
    // Whatever it wrote before failing is still saved: a partial run is visible, not lost.
    const outputs = outputFiles(result);
    const existing = outputs.length > 0 ? await loadArtifactsNamed(uid, sessionId, outputs.map((output) => output.filename)) : [];
    const artifacts = buildRecipeRunArtifacts({
      sessionId,
      recipe,
      runId,
      values,
      ranAt: deps.now(),
      existing,
      outputs,
    });
    await saveArtifacts(uid, sessionId, artifacts);
    return await finish({
      status: result.success ? 'completed' : 'error',
      outputArtifactIds: artifacts.map((artifact) => artifact.id),
      stdout: result.stdout,
      ...(result.error ? { error: result.error } : {}),
    });
  } catch (error) {
    await finish({
      status: 'error',
      outputArtifactIds: [],
      stdout: '',
      error: error instanceof Error ? error.message : String(error),
    }).catch((finishError) => console.warn('[analyzeRunRecipe] could not record the failed run', finishError));
    throw error;
  }
}
