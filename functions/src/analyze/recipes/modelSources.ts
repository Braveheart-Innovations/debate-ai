/**
 * A model's sources: the files in its folder that are unchanged copies of a
 * fetched response, so their SHA-256 equals a fetch record's responseHash. A
 * recipe reads copies under /output/<name>/, never /data (the MODELS prompt
 * has the agent copy what it needs, because /data doesn't come back on a new
 * sandbox), so the hash is what ties a file to the request that made it.
 * Refresh data fetches each source again; the folder's other files (an
 * assumptions table, a cleaned extract) stay as they are.
 *
 * The server marks each file it saves with what it found
 * (metadata.fetchedFrom), so the Model view knows a model's sources without
 * asking; it asks only about files saved before the marks.
 */
import { getFirestore } from 'firebase-admin/firestore';
import type { Artifact } from '../contract/types/notebook';
import { MODEL_RESULTS_FILENAME } from '../contract/services/analyze/models/modelResults';
import { sha256Hex } from '../../fetchToSandbox';
import { artifactDataToArrayBuffer } from '../engine/artifactFilesystemHydration';
import { fetchRecordsByHash, fetchRequestArgs, recordTranscriptFetches, sessionBeganWithRecords, type FetchRecord } from '../engine/fetchRecords';
import { PAYLOAD_SENTINEL } from '../../cloudPayloadStorage';
import { artifactRef, loadArtifactsById } from '../engine/sessionStore';
import { recipeOutputDir } from './recipeParams';

export interface ModelSource {
  /** The file's latest version. */
  file: Artifact;
  /** Its bytes, as the sandbox has them. */
  bytes: Buffer;
  /** The fetch it's a copy of. */
  fetch: FetchRecord;
}

/** The recipe's folder under /output. */
export function modelOutputDir(recipe: Artifact): string {
  return recipe.metadata?.recipe?.outputDir ?? recipeOutputDir(recipe.name);
}

function versionOf(artifact: { metadata?: { versionNumber?: number } }): number {
  return artifact.metadata?.versionNumber ?? 1;
}

/** The latest version of each file in the model's folder, except its results file, data loaded. */
export async function loadModelFolderFiles(uid: string, sessionId: string, outputDir: string): Promise<Artifact[]> {
  const prefix = `${outputDir}/`;
  const snapshot = await getFirestore()
    .collection(`users/${uid}/conversations/${sessionId}/artifacts`)
    .where('name', '>=', prefix)
    .where('name', '<', `${prefix}`)
    .select('name', 'createdAt', 'metadata.versionNumber')
    .get();
  const latest = new Map<string, { id: string; createdAt: number; metadata?: { versionNumber?: number } }>();
  for (const doc of snapshot.docs) {
    const entry = doc.data() as { name: string; createdAt: number; metadata?: { versionNumber?: number } };
    if (entry.name === `${prefix}${MODEL_RESULTS_FILENAME}`) continue;
    const current = latest.get(entry.name);
    if (!current || versionOf(entry) > versionOf(current) || (versionOf(entry) === versionOf(current) && entry.createdAt > current.createdAt)) {
      latest.set(entry.name, { id: doc.id, createdAt: entry.createdAt, metadata: entry.metadata });
    }
  }
  return loadArtifactsById(uid, sessionId, [...latest.values()].map((entry) => entry.id));
}

export type FetchedFromMark = NonNullable<NonNullable<Artifact['metadata']>['fetchedFrom']>;

interface CheckedFile {
  file: Artifact;
  bytes: Buffer;
  /** The fetch it's an unchanged copy of, if any. */
  fetch?: FetchRecord;
}

/** A file's bytes as the sandbox has them: what a fetch record's responseHash is of. */
function fileBytes(file: Artifact): Buffer {
  return Buffer.from(artifactDataToArrayBuffer(file));
}

function hasData(file: Artifact): boolean {
  return typeof file.data === 'string' && file.data.length > 0 && file.data !== PAYLOAD_SENTINEL;
}

/**
 * The newest fetch record for each hash. A session from before records were
 * kept has its transcripts read the first time a hash finds none.
 */
async function recordsFor(uid: string, sessionId: string, hashes: string[]): Promise<Map<string, FetchRecord>> {
  const records = await fetchRecordsByHash(uid, sessionId, hashes);
  if (hashes.every((hash) => records.has(hash)) || await sessionBeganWithRecords(uid, sessionId)) return records;
  return await recordTranscriptFetches(uid, sessionId) ? fetchRecordsByHash(uid, sessionId, hashes) : records;
}

/** Each file in the model's folder, with the fetch it's a copy of. */
async function checkModelFiles(uid: string, sessionId: string, recipe: Artifact): Promise<CheckedFile[]> {
  const files = (await loadModelFolderFiles(uid, sessionId, modelOutputDir(recipe))).filter(hasData);
  if (files.length === 0) return [];
  const hashed = files.map((file) => {
    const bytes = fileBytes(file);
    return { file, bytes, hash: sha256Hex(bytes) };
  });
  const records = await recordsFor(uid, sessionId, hashed.map((entry) => entry.hash));
  return hashed.map(({ file, bytes, hash }) => ({ file, bytes, fetch: records.get(hash) }));
}

function toSources(checked: CheckedFile[]): ModelSource[] {
  return checked
    .flatMap(({ file, bytes, fetch }) => (fetch ? [{ file, bytes, fetch }] : []))
    .sort((a, b) => a.file.name.localeCompare(b.file.name));
}

/** The model's sources, by name. */
export async function findModelSources(uid: string, sessionId: string, recipe: Artifact): Promise<ModelSource[]> {
  return toSources(await checkModelFiles(uid, sessionId, recipe));
}

/** A copy's mark: where its fetch was made, and when. */
export function fetchedFromMark(record: FetchRecord): FetchedFromMark {
  return { endpoint: sourceEndpoint(record), fetchedAt: record.fetchedAt };
}

function sameMark(a: FetchedFromMark | null | undefined, b: FetchedFromMark | null): boolean {
  return a === b || (!!a && !!b && a.endpoint === b.endpoint && a.fetchedAt === b.fetchedAt);
}

/**
 * The model's sources, marking the folder's files on the way (files saved
 * before the marks), so the Model view knows them next time without asking.
 * A mark that fails to save is only a slower Model view next time.
 */
export async function findAndMarkModelSources(uid: string, sessionId: string, recipe: Artifact): Promise<ModelSource[]> {
  const checked = await checkModelFiles(uid, sessionId, recipe);
  await Promise.all(checked.map(async ({ file, fetch }) => {
    const mark = fetch ? fetchedFromMark(fetch) : null;
    if (sameMark(file.metadata?.fetchedFrom, mark)) return;
    await artifactRef(uid, sessionId, file.id).update({ 'metadata.fetchedFrom': mark }).catch((error: unknown) => {
      console.warn(`[modelSources] ${file.name} wasn't marked:`, error);
    });
  }));
  return toSources(checked);
}

/** A file a model can read: in a folder under /output, with its data, and not a model's results. */
function isFolderFile(artifact: Artifact): boolean {
  return artifact.name.includes('/') && !artifact.name.endsWith(`/${MODEL_RESULTS_FILENAME}`) && hasData(artifact);
}

/**
 * Mark the files a save is about to write: a copy of a fetch gets where and
 * when it was fetched, another file null. A file marked already (a Refresh
 * data copy) keeps its mark. Marks never stop a save: a failed lookup leaves
 * the files unmarked, and the Model view asks the server about them.
 */
export async function markFetchedCopies(uid: string, sessionId: string, artifacts: Artifact[]): Promise<Artifact[]> {
  try {
    const hashes = new Map(artifacts
      .filter((artifact) => artifact.metadata?.fetchedFrom === undefined && isFolderFile(artifact))
      .map((artifact) => [artifact.id, sha256Hex(fileBytes(artifact))] as const));
    if (hashes.size === 0) return artifacts;
    const records = await recordsFor(uid, sessionId, [...hashes.values()]);
    return artifacts.map((artifact) => {
      const hash = hashes.get(artifact.id);
      if (!hash) return artifact;
      const record = records.get(hash);
      return { ...artifact, metadata: { ...artifact.metadata, fetchedFrom: record ? fetchedFromMark(record) : null } };
    });
  } catch (error) {
    console.warn('[modelSources] the saved files weren\'t marked:', error);
    return artifacts;
  }
}

/** Where a source was fetched from: the URL without its query, which can hold a key. */
export function sourceEndpoint(record: FetchRecord): string {
  const url = fetchRequestArgs(record).url;
  if (typeof url !== 'string') return '';
  try {
    const parsed = new URL(/^https?:\/\//.test(url) ? url : `https://${url}`);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '';
  }
}

/** What the Model view shows of a model's sources. */
export interface ModelSourceSummary {
  name: string;
  endpoint: string;
  fetchedAt: number;
}

export function summarizeSources(sources: ModelSource[]): ModelSourceSummary[] {
  return sources.map((source) => ({ name: source.file.name, endpoint: sourceEndpoint(source.fetch), fetchedAt: source.fetch.fetchedAt }));
}
