/**
 * Analyze uploads on the server. The client sends a file's bytes here in
 * chunks (analyzeUploads write); Storage keeps it, quota-counted, and the
 * record lists it. Clients never touch the sandbox: SessionFilesSync puts
 * each upload at its pythonPath before every round (and before a manual cell
 * re-run), so a new or recycled sandbox gets the session's files back.
 *
 *   users/{uid}/conversations/{sessionId}/analyzeUploads/{uploadId}     UploadRecord
 *   Storage users/{uid}/sessions/{sessionId}/uploads/{uploadId}/…/file.bin   the bytes (quota-counted)
 *   Storage analyzeScratch/users/{uid}/conversations/{sessionId}/uploadParts/…  chunks until the last arrives
 *
 * Rules: owners read the records; only the server writes them.
 */
import * as crypto from 'crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { FileMetadata, FileSourceMetadata } from '../contract/services/files/types';
import { getSandboxService } from '../../sandbox/callables';
import { FILE_CHUNK_BYTES, SandboxUnavailableError } from '../../sandbox/service';
import {
  deletePayloadForUser,
  downloadPayloadBytes,
  downloadPayloadRange,
  uploadBytesForUser,
  type StoredPayloadRef,
} from '../../cloudPayloadStorage';
import type { SandboxFiles } from './tools/sandboxFiles';
import { listSessionArtifactIds, loadArtifactsById, removeUndefined } from './sessionStore';
import { mountArtifactsToSandbox } from './artifactFilesystemHydration';
import { isSalesforceWorkspaceZip, SALESFORCE_WORKSPACE_ROOT } from '../salesforce/SalesforceMetadataService';

/** Written after a restore; a sandbox without it is new (or was reset) and gets the session's files. */
export const SESSION_FILES_MARKER = '/home/user/.symposium/session-files.json';

export interface UploadRecord extends FileMetadata {
  sha256: string;
  payload: StoredPayloadRef;
}

export class UploadInputError extends Error {}

/** Same rules as read_file's paths: under /uploads/, no traversal. */
export function assertUploadPath(path: unknown): string {
  if (typeof path !== 'string' || !path.startsWith('/uploads/') || path.length > 1024
    || path.split('/').some((segment) => segment === '..' || segment === '.')
    || path.endsWith('/')) {
    throw new UploadInputError('path must be a file under /uploads/');
  }
  return path;
}

/** One record per sandbox path: uploading the same path again replaces it. */
export function uploadIdFor(pythonPath: string): string {
  return crypto.createHash('sha256').update(pythonPath).digest('hex').slice(0, 32);
}

function uploadsCollection(uid: string, sessionId: string) {
  return getFirestore().collection(`users/${uid}/conversations/${sessionId}/analyzeUploads`);
}

function toMetadata(record: UploadRecord): FileMetadata {
  const { sha256: _sha, payload: _payload, ...metadata } = record;
  return metadata;
}

/** The session's upload records, oldest first. */
export async function loadUploadRecords(uid: string, sessionId: string): Promise<UploadRecord[]> {
  const snapshot = await uploadsCollection(uid, sessionId).get();
  return snapshot.docs
    .map((doc) => doc.data() as UploadRecord)
    .sort((a, b) => a.uploadedAt - b.uploadedAt);
}

export async function listUploads(uid: string, sessionId: string): Promise<FileMetadata[]> {
  return (await loadUploadRecords(uid, sessionId)).map(toMetadata);
}

const SCRATCH_BUCKET = 'symposium-ai.firebasestorage.app';

function scratchFile(path: string) {
  return getStorage().bucket(SCRATCH_BUCKET).file(path);
}

function partsPrefix(uid: string, sessionId: string, uploadId: string, sha256: string): string {
  return `analyzeScratch/users/${uid}/conversations/${sessionId}/uploadParts/${uploadId}/${sha256}/`;
}

export interface UploadChunkInput {
  pythonPath: string;
  chunkIndex: number;
  totalChunks: number;
  /** This chunk's bytes, base64 (at most FILE_CHUNK_BYTES decoded). */
  base64: string;
  /** The whole file's size and sha256, checked when the last chunk arrives. */
  size: number;
  sha256: string;
  mimeType: string;
  source?: FileSourceMetadata;
}

/** `done: false` until the last chunk; an unchanged file is done at chunk 0. */
export type UploadChunkResult = { done: false } | { done: true; file: FileMetadata };

/**
 * One chunk of an upload. Chunks are staged in server-only scratch; the last
 * one assembles the file, checks it against the declared size and sha256, and
 * keeps it (Storage + record). Uploading the same bytes again ends at chunk 0.
 */
export async function writeUploadChunk(uid: string, sessionId: string, input: UploadChunkInput): Promise<UploadChunkResult> {
  const pythonPath = assertUploadPath(input.pythonPath);
  const { chunkIndex, totalChunks, size } = input;
  if (!Number.isInteger(totalChunks) || totalChunks < 1 || !Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= totalChunks) {
    throw new UploadInputError('chunkIndex must be within totalChunks');
  }
  if (!Number.isInteger(size) || size < 0) throw new UploadInputError('size must be a byte count');
  if (!/^[0-9a-f]{64}$/.test(input.sha256)) throw new UploadInputError('sha256 must be a hex digest');
  const id = uploadIdFor(pythonPath);
  const ref = uploadsCollection(uid, sessionId).doc(id);

  if (chunkIndex === 0) {
    const existing = (await ref.get()).data() as UploadRecord | undefined;
    if (existing?.sha256 === input.sha256 && existing.size === size) return { done: true, file: toMetadata(existing) };
  }

  const bytes = Buffer.from(input.base64, 'base64');
  if (bytes.byteLength > FILE_CHUNK_BYTES) throw new UploadInputError(`a chunk carries at most ${FILE_CHUNK_BYTES} bytes`);
  const prefix = partsPrefix(uid, sessionId, id, input.sha256);
  if (chunkIndex < totalChunks - 1) {
    await scratchFile(`${prefix}${chunkIndex}`).save(bytes, { contentType: 'application/octet-stream', resumable: false });
    return { done: false };
  }

  const parts: Buffer[] = [];
  for (let index = 0; index < totalChunks - 1; index += 1) {
    const [part] = await scratchFile(`${prefix}${index}`).download().catch(() => {
      throw new UploadInputError(`chunk ${index} is missing: send the file again`);
    });
    parts.push(part);
  }
  parts.push(bytes);
  const whole = Buffer.concat(parts);
  const sha256 = crypto.createHash('sha256').update(whole).digest('hex');
  try {
    if (whole.byteLength !== size || sha256 !== input.sha256) {
      throw new UploadInputError('the file arrived incomplete or changed: send it again');
    }
    return { done: true, file: await keepUpload(uid, sessionId, pythonPath, whole, sha256, input) };
  } finally {
    await getStorage().bucket(SCRATCH_BUCKET).deleteFiles({ prefix, force: true }).catch((error) => {
      console.warn('[analyzeUploads] could not delete upload chunks', { id, error });
    });
  }
}

async function keepUpload(
  uid: string,
  sessionId: string,
  pythonPath: string,
  bytes: Buffer,
  sha256: string,
  input: { mimeType: string; source?: FileSourceMetadata },
): Promise<FileMetadata> {
  const id = uploadIdFor(pythonPath);
  const ref = uploadsCollection(uid, sessionId).doc(id);
  const existing = (await ref.get()).data() as UploadRecord | undefined;
  if (existing?.sha256 === sha256) return toMetadata(existing);

  const payload = await uploadBytesForUser(
    uid,
    `users/${uid}/sessions/${sessionId}/uploads/${id}/file.bin`,
    bytes,
    'application/octet-stream',
  );
  const record: UploadRecord = removeUndefined({
    id,
    sessionId,
    filename: pythonPath.slice('/uploads/'.length),
    mimeType: input.mimeType || 'application/octet-stream',
    size: bytes.byteLength,
    uploadedAt: Date.now(),
    pythonPath,
    ...input.source,
    sha256,
    payload,
  }) as UploadRecord;
  try {
    await ref.set(record);
  } catch (error) {
    await deletePayloadForUser(uid, payload).catch(() => undefined);
    throw error;
  }
  if (existing) {
    await deletePayloadForUser(uid, existing.payload).catch((error) => {
      console.warn('[analyzeUploads] could not delete a replaced upload\'s payload', { id, error });
    });
  }
  return toMetadata(record);
}

/** A range of an upload's bytes from Storage (the client's Download). */
export async function readUploadChunk(
  uid: string,
  sessionId: string,
  path: unknown,
  offset: number,
): Promise<{ base64: string; size: number; eof: boolean }> {
  const pythonPath = assertUploadPath(path);
  if (!Number.isInteger(offset) || offset < 0) throw new UploadInputError('offset must be a byte offset');
  const record = (await uploadsCollection(uid, sessionId).doc(uploadIdFor(pythonPath)).get()).data() as UploadRecord | undefined;
  if (!record) throw new UploadInputError('no such upload');
  if (offset >= record.size) return { base64: '', size: record.size, eof: true };
  const end = Math.min(record.size, offset + FILE_CHUNK_BYTES);
  const bytes = await downloadPayloadRange(record.payload, offset, end);
  return { base64: bytes.toString('base64'), size: record.size, eof: end >= record.size };
}

/** Forget an upload: its record, its Storage copy and the sandbox file. */
export async function removeUpload(uid: string, sessionId: string, path: unknown): Promise<void> {
  const pythonPath = assertUploadPath(path);
  const ref = uploadsCollection(uid, sessionId).doc(uploadIdFor(pythonPath));
  const existing = (await ref.get()).data() as UploadRecord | undefined;
  await ref.delete();
  if (existing) await deletePayloadForUser(uid, existing.payload);
  try {
    await getSandboxService().deleteFile(uid, sessionId, pythonPath);
  } catch (error) {
    // At the per-user sandbox limit (or the day's ceiling) the copy stays in the sandbox; the upload itself is gone.
    if (!(error instanceof SandboxUnavailableError)) throw error;
  }
}

interface SessionFilesMarker {
  restoredAt: number;
  /** Saved artifacts already mounted under /output. */
  artifactIds?: string[];
  /** Uploads already in the sandbox: upload id → sha256. */
  uploads?: Record<string, string>;
  /** The uploads that are Salesforce bundles, unpacked into the workspace. */
  salesforceBundles?: string[];
}

async function readMarker(uid: string, sandboxSessionKey: string): Promise<SessionFilesMarker | null> {
  try {
    const chunk = await getSandboxService().readFile(uid, sandboxSessionKey, { path: SESSION_FILES_MARKER });
    return JSON.parse(Buffer.from(chunk.base64, 'base64').toString('utf8')) as SessionFilesMarker;
  } catch {
    return null;
  }
}

/** Mounting that leaves a file alone when it already has these exact bytes. */
function unchangedSkippingFiles(uid: string, sandboxSessionKey: string): Pick<SandboxFiles, 'mountFile'> {
  return {
    mountFile: async (filename, data, path) => {
      const target = path || `/uploads/${filename}`;
      const bytes = Buffer.from(data);
      await getSandboxService().writeFile(uid, sandboxSessionKey, {
        path: target,
        base64: bytes.toString('base64'),
        skipIfUnchanged: { size: bytes.byteLength, sha256: crypto.createHash('sha256').update(bytes).digest('hex') },
      });
      return target;
    },
  };
}

/**
 * Keeps a sandbox's files in step with the session:
 *  - every upload is at its pythonPath (a new sandbox gets them all back; an
 *    upload added or replaced since the last round is written in);
 *  - saved artifacts not yet mounted go under /output/<name>, where the tool
 *    history tells the model they are (toolResultHistory's file summary);
 *  - a Salesforce bundle is unpacked into the workspace, as the audit does, so
 *    Python and recipes find it there on a new sandbox too.
 * sync() runs before every round and before a manual cell re-run. The marker
 * file remembers what's mounted; a round with nothing new costs two queries.
 * A session with no uploads or saved artifacts doesn't touch the sandbox, so
 * it starts only when a tool needs it.
 */
export class SessionFilesSync {
  private marker: { artifactIds: Set<string>; uploads: Record<string, string>; salesforceBundles: Set<string> } | null = null;

  constructor(
    private readonly uid: string,
    private readonly sessionId: string,
    private readonly sandboxSessionKey: string,
  ) {}

  async sync(): Promise<void> {
    try {
      await this.syncFiles();
    } catch (error) {
      // At the per-user sandbox limit (or the day's ceiling): the round goes
      // ahead, a tool that needs the sandbox gets the message, and the next
      // round syncs again.
      if (!(error instanceof SandboxUnavailableError)) throw error;
      this.marker = null;
    }
  }

  private async syncFiles(): Promise<void> {
    const { uid, sessionId, sandboxSessionKey } = this;
    const service = getSandboxService();
    const records = await loadUploadRecords(uid, sessionId);
    const artifactIds = await listSessionArtifactIds(uid, sessionId);
    if (!this.marker) {
      // Nothing to mount: leave the sandbox alone. Reading the marker would
      // start one, and a text-only turn never needs it.
      if (records.length === 0 && artifactIds.length === 0) return;
      const stored = await readMarker(uid, sandboxSessionKey);
      this.marker = {
        artifactIds: new Set(stored?.artifactIds ?? []),
        uploads: { ...(stored?.uploads ?? {}) },
        salesforceBundles: new Set(stored?.salesforceBundles ?? []),
      };
    }
    const marker = this.marker;
    let changed = false;
    let bundlesChanged = false;

    for (const upload of records) {
      if (marker.uploads[upload.id] === upload.sha256) continue;
      const bytes = await downloadPayloadBytes(upload.payload);
      await service.writeFile(uid, sandboxSessionKey, {
        path: upload.pythonPath,
        base64: bytes.toString('base64'),
        skipIfUnchanged: { size: upload.size, sha256: upload.sha256 },
      });
      marker.uploads[upload.id] = upload.sha256;
      changed = true;
      const bundle = /\.zip$/i.test(upload.pythonPath) && await isSalesforceWorkspaceZip(bytes);
      if (bundle || marker.salesforceBundles.has(upload.id)) bundlesChanged = true;
      if (bundle) marker.salesforceBundles.add(upload.id);
      else marker.salesforceBundles.delete(upload.id);
    }
    const kept = new Set(records.map((upload) => upload.id));
    for (const id of Object.keys(marker.uploads)) {
      if (!kept.has(id)) {
        delete marker.uploads[id];
        changed = true;
      }
    }
    for (const id of [...marker.salesforceBundles]) {
      if (!kept.has(id)) {
        marker.salesforceBundles.delete(id);
        bundlesChanged = true;
      }
    }
    if (bundlesChanged) {
      // Sorted, as the audit lists them, so both unpack under one checksum (and skip a repeat).
      const bundles = records.filter((upload) => marker.salesforceBundles.has(upload.id)).map((upload) => upload.pythonPath).sort();
      try {
        await service.extractZips(uid, sandboxSessionKey, bundles, SALESFORCE_WORKSPACE_ROOT);
      } catch (error) {
        // The audit unpacks it again when it next runs.
        console.warn('[analyzeUploads] could not unpack the Salesforce workspace', { sessionId, error: error instanceof Error ? error.message : String(error) });
      }
    }

    const fresh = artifactIds.filter((id) => !marker.artifactIds.has(id));
    if (fresh.length > 0) {
      await mountArtifactsToSandbox(unchangedSkippingFiles(uid, sandboxSessionKey), await loadArtifactsById(uid, sessionId, fresh));
      for (const id of fresh) marker.artifactIds.add(id);
      changed = true;
    }
    if (!changed) return;
    const stored: SessionFilesMarker = {
      restoredAt: Date.now(),
      artifactIds: [...marker.artifactIds],
      uploads: marker.uploads,
      ...(marker.salesforceBundles.size > 0 ? { salesforceBundles: [...marker.salesforceBundles] } : {}),
    };
    await service.writeFile(uid, sandboxSessionKey, {
      path: SESSION_FILES_MARKER,
      base64: Buffer.from(JSON.stringify(stored)).toString('base64'),
    });
  }
}
