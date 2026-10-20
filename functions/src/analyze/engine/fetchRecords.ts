/**
 * Fetch records: `users/{uid}/conversations/{sessionId}/fetches/{id}`, written
 * by the server only (no rule matches them, like analyzeSandboxes). One per
 * response the loop saved, for the operator and teammates alike, holding the
 * request as the AI sent it so Refresh data can make it again. Provenance
 * can't serve: it shortens long values and redacts some keys. The key the
 * server adds for a connector is never part of the request.
 *
 * Sessions from before records were kept have the same requests in their
 * transcripts: those are read once, the first time a refresh needs them.
 */
import { getFirestore } from 'firebase-admin/firestore';
import type { Message, ToolResultProvenance } from '../contract/types';
import type { ToolCall } from '../contract/lib/ai/tools/types';
import { loadSessionMessages, removeUndefined, runMessageStore } from './sessionStore';
import { withInferredManagedApiKeyRef } from './tools/serverToolExecutor';

export type FetchTool = 'fetch_api' | 'fetch_url';

export interface FetchRecordDoc {
  tool: FetchTool;
  /** The arguments as the AI sent them (with any inferred api_key_ref), as JSON: a body can hold nested arrays. */
  request: string;
  /** Where the response was saved. */
  path: string;
  /** SHA-256 of the saved bytes: an unchanged copy of the file has the same. */
  responseHash: string;
  fetchedAt: number;
  /** A fetch the AI made in a run, one read from an older session's transcript, or a Refresh data fetch. */
  origin: 'run' | 'transcript' | 'refresh';
  bytes?: number;
  runId?: string;
  toolCallId?: string;
}

export interface FetchRecord extends FetchRecordDoc {
  id: string;
}

export function fetchesPath(uid: string, sessionId: string): string {
  return `users/${uid}/conversations/${sessionId}/fetches`;
}

/** Marks a session whose transcripts were read. It has no responseHash, so lookups never return it. */
const TRANSCRIPTS_READ_ID = 'transcripts-read';

/** Records were kept from here on (debate-ai #294 finished deploying 2026-10-19 19:05 UTC). */
export const FETCH_RECORDS_SINCE = Date.UTC(2026, 9, 19, 20, 0);

export function isFetchTool(toolName: string): toolName is FetchTool {
  return toolName === 'fetch_api' || toolName === 'fetch_url';
}

export async function writeFetchRecord(uid: string, sessionId: string, record: FetchRecordDoc, id?: string): Promise<string> {
  const collection = getFirestore().collection(fetchesPath(uid, sessionId));
  const ref = id ? collection.doc(id) : collection.doc();
  await ref.set(removeUndefined(record));
  return ref.id;
}

/** The request to make again: the AI's arguments. */
export function fetchRequestArgs(record: FetchRecordDoc): Record<string, unknown> {
  const parsed = JSON.parse(record.request) as unknown;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}

/** The newest record for each of these response hashes. */
export async function fetchRecordsByHash(uid: string, sessionId: string, hashes: string[]): Promise<Map<string, FetchRecord>> {
  const unique = [...new Set(hashes)];
  const found = new Map<string, FetchRecord>();
  for (let i = 0; i < unique.length; i += 30) {
    const snapshot = await getFirestore()
      .collection(fetchesPath(uid, sessionId))
      .where('responseHash', 'in', unique.slice(i, i + 30))
      .get();
    for (const doc of snapshot.docs) {
      const record = { id: doc.id, ...(doc.data() as FetchRecordDoc) };
      const current = found.get(record.responseHash);
      if (!current || record.fetchedAt > current.fetchedAt) found.set(record.responseHash, record);
    }
  }
  return found;
}

const SAVED_PATH = /\/data\/fetch_[A-Za-z0-9_-]+\.[A-Za-z0-9]+/;

/**
 * The fetches in one transcript: each request from the AI's call, its hash from
 * the result's provenance (a response the loop saved; a failed fetch has none).
 */
export function fetchesInTranscript(messages: Message[], runId?: string): FetchRecordDoc[] {
  const calls = new Map<string, ToolCall>();
  for (const message of messages) {
    for (const call of (message.metadata?.toolCalls ?? []) as ToolCall[]) calls.set(call.id, call);
  }
  const records: FetchRecordDoc[] = [];
  for (const message of messages) {
    const metadata = message.metadata;
    if (!metadata?.isToolResult || metadata.success === false || !metadata.toolName || !isFetchTool(metadata.toolName)) continue;
    const provenance = metadata.toolProvenance as ToolResultProvenance | undefined;
    const call = metadata.toolCallId ? calls.get(metadata.toolCallId) : undefined;
    if (!provenance?.responseHash || !call) continue;
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
    } catch {
      continue;
    }
    const fetchedAt = Date.parse(provenance.fetchedAt);
    records.push(removeUndefined({
      tool: metadata.toolName,
      request: JSON.stringify(withInferredManagedApiKeyRef(metadata.toolName, args)),
      path: SAVED_PATH.exec(typeof message.content === 'string' ? message.content : '')?.[0] ?? '',
      responseHash: provenance.responseHash,
      fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : message.timestamp,
      origin: 'transcript' as const,
      runId,
      toolCallId: call.id,
    }));
  }
  return records;
}

/** Whether the session began after records were kept: every fetch it made has one, and its transcripts need no reading. */
export async function sessionBeganWithRecords(uid: string, sessionId: string): Promise<boolean> {
  const createdAt = (await getFirestore().doc(`users/${uid}/conversations/${sessionId}`).get()).get('createdAt') as unknown;
  return typeof createdAt === 'number' && createdAt >= FETCH_RECORDS_SINCE;
}

/**
 * Record the fetches in a session's transcripts (the operator's and every
 * teammate's), once: a session from before fetch records were kept. Whether
 * it read them now (false: they were read before).
 */
export async function recordTranscriptFetches(uid: string, sessionId: string): Promise<boolean> {
  const db = getFirestore();
  const marker = db.doc(`${fetchesPath(uid, sessionId)}/${TRANSCRIPTS_READ_ID}`);
  if ((await marker.get()).exists) return false;
  const records = fetchesInTranscript(await loadSessionMessages(uid, sessionId));
  const runs = await db.collection(`users/${uid}/conversations/${sessionId}/analyzeRuns`).select('kind').get();
  for (const run of runs.docs) {
    if (run.get('kind') === 'operator') continue;
    records.push(...fetchesInTranscript(await runMessageStore(uid, sessionId, run.id).load(), run.id));
  }
  for (let i = 0; i < records.length; i += 400) {
    const batch = db.batch();
    for (const record of records.slice(i, i + 400)) {
      // One id per call, so reading twice writes the same records.
      const id = `transcript-${record.runId ?? 'session'}-${(record.toolCallId ?? '').replace(/[^A-Za-z0-9_-]/g, '_')}`;
      batch.set(db.collection(fetchesPath(uid, sessionId)).doc(id), record);
    }
    await batch.commit();
  }
  await marker.set({ readAt: Date.now(), fetches: records.length });
  return true;
}
