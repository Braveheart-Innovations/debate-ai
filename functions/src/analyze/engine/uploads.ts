/**
 * Analyze uploads on the server (Phase 3 Step 5). The sandbox holds the
 * working copy at the upload's pythonPath. Storage keeps the original so it
 * outlives the sandbox, which is deleted after 7 idle days. A fresh sandbox
 * gets the session's files back before a step runs tools, as the browser
 * re-mounted IndexedDB uploads and saved artifacts before each send.
 *
 *   users/{uid}/conversations/{sessionId}/analyzeUploads/{uploadId}     UploadRecord
 *   Storage users/{uid}/sessions/{sessionId}/uploads/{uploadId}/…/file.bin   the bytes (quota-counted)
 *
 * Rules: owners read the records; only the server writes them.
 */
import * as crypto from 'crypto';
import { getFirestore } from 'firebase-admin/firestore';
import type { FileMetadata, FileSourceMetadata } from '../contract/services/files/types';
import { getSandboxService } from '../../sandbox/callables';
import {
  deletePayloadForUser,
  downloadPayloadBytes,
  uploadBytesForUser,
  type StoredPayloadRef,
} from '../../cloudPayloadStorage';
import { readWholeFile } from './sandboxBridge';
import { createSandboxFiles } from './tools/sandboxFiles';
import { loadSessionArtifacts, removeUndefined } from './sessionStore';
import { mountArtifactsToSandbox } from './artifactFilesystemHydration';

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

export async function listUploads(uid: string, sessionId: string): Promise<FileMetadata[]> {
  const snapshot = await uploadsCollection(uid, sessionId).get();
  return snapshot.docs
    .map((doc) => toMetadata(doc.data() as UploadRecord))
    .sort((a, b) => a.uploadedAt - b.uploadedAt);
}

/**
 * Keep a file the client just wrote into the sandbox: copy it to Storage and
 * record it. Re-committing unchanged bytes is a no-op.
 */
export async function commitUpload(
  uid: string,
  sessionId: string,
  sandboxSessionKey: string,
  input: { pythonPath: string; mimeType: string; source?: FileSourceMetadata },
): Promise<FileMetadata> {
  const pythonPath = assertUploadPath(input.pythonPath);
  const id = uploadIdFor(pythonPath);
  const ref = uploadsCollection(uid, sessionId).doc(id);
  const bytes = await readWholeFile(uid, sandboxSessionKey, pythonPath);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');

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

/** Forget an upload: its record, its Storage copy and the sandbox file. */
export async function removeUpload(uid: string, sessionId: string, sandboxSessionKey: string, path: unknown): Promise<void> {
  const pythonPath = assertUploadPath(path);
  const ref = uploadsCollection(uid, sessionId).doc(uploadIdFor(pythonPath));
  const existing = (await ref.get()).data() as UploadRecord | undefined;
  await ref.delete();
  if (existing) await deletePayloadForUser(uid, existing.payload);
  await getSandboxService().deleteFile(uid, sandboxSessionKey, pythonPath);
}

async function hasMarker(uid: string, sandboxSessionKey: string): Promise<boolean> {
  try {
    await getSandboxService().readFile(uid, sandboxSessionKey, { path: SESSION_FILES_MARKER });
    return true;
  } catch {
    return false;
  }
}

/**
 * Give a new sandbox the session's uploads and saved artifacts (the browser's
 * mountStoredFilesToSandbox + mountArtifactsToSandbox before each send).
 * Cheap when the sandbox already has them: one marker read. Returns whether
 * it restored.
 */
export async function restoreSessionFiles(uid: string, sessionId: string, sandboxSessionKey: string): Promise<boolean> {
  if (await hasMarker(uid, sandboxSessionKey)) return false;
  const service = getSandboxService();

  const uploads = (await uploadsCollection(uid, sessionId).get()).docs.map((doc) => doc.data() as UploadRecord);
  for (const upload of uploads) {
    const bytes = await downloadPayloadBytes(upload.payload);
    await service.writeFile(uid, sandboxSessionKey, {
      path: upload.pythonPath,
      base64: bytes.toString('base64'),
      skipIfUnchanged: { size: upload.size, sha256: upload.sha256 },
    });
  }

  const artifacts = await loadSessionArtifacts(uid, sessionId);
  await mountArtifactsToSandbox(createSandboxFiles(uid, sandboxSessionKey), artifacts);

  await service.writeFile(uid, sandboxSessionKey, {
    path: SESSION_FILES_MARKER,
    base64: Buffer.from(JSON.stringify({ restoredAt: Date.now(), uploads: uploads.length, artifacts: artifacts.length })).toString('base64'),
  });
  return true;
}
