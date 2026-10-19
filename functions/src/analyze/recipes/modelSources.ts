/**
 * A model's sources: the files in its folder that are unchanged copies of a
 * fetched response, so their SHA-256 equals a fetch record's responseHash. A
 * recipe reads copies under /output/<name>/, never /data (the MODELS prompt
 * has the agent copy what it needs, because /data doesn't come back on a new
 * sandbox), so the hash is what ties a file to the request that made it.
 * Refresh data fetches each source again; the folder's other files (an
 * assumptions table, a cleaned extract) stay as they are.
 */
import { getFirestore } from 'firebase-admin/firestore';
import type { Artifact } from '../contract/types/notebook';
import { MODEL_RESULTS_FILENAME } from '../contract/services/analyze/models/modelResults';
import { sha256Hex } from '../../fetchToSandbox';
import { artifactDataToArrayBuffer } from '../engine/artifactFilesystemHydration';
import { fetchRecordsByHash, fetchRequestArgs, recordTranscriptFetches, type FetchRecord } from '../engine/fetchRecords';
import { PAYLOAD_SENTINEL } from '../../cloudPayloadStorage';
import { loadArtifactsById } from '../engine/sessionStore';
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

/**
 * The model's sources, by name. A session from before fetch records were kept
 * has its transcripts read the first time a file finds no record.
 */
export async function findModelSources(uid: string, sessionId: string, recipe: Artifact): Promise<ModelSource[]> {
  const files = (await loadModelFolderFiles(uid, sessionId, modelOutputDir(recipe)))
    .filter((file) => typeof file.data === 'string' && file.data.length > 0 && file.data !== PAYLOAD_SENTINEL);
  if (files.length === 0) return [];
  const hashed = files.map((file) => {
    const bytes = Buffer.from(artifactDataToArrayBuffer(file));
    return { file, bytes, hash: sha256Hex(bytes) };
  });
  const hashes = hashed.map((entry) => entry.hash);
  let records = await fetchRecordsByHash(uid, sessionId, hashes);
  if (hashed.some((entry) => !records.has(entry.hash)) && await recordTranscriptFetches(uid, sessionId)) {
    records = await fetchRecordsByHash(uid, sessionId, hashes);
  }
  return hashed
    .filter((entry) => records.has(entry.hash))
    .map((entry) => ({ file: entry.file, bytes: entry.bytes, fetch: records.get(entry.hash)! }))
    .sort((a, b) => a.file.name.localeCompare(b.file.name));
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
