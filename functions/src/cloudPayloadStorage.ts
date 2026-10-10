import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import * as crypto from 'crypto';

try { admin.app(); } catch { admin.initializeApp(); }

const STORAGE_BUCKET = 'symposium-ai.firebasestorage.app';
const GIB = 1024 * 1024 * 1024;

/**
 * Per-user Storage quotas, counted separately so uploads can never crowd out
 * the offloaded messages and artifacts a session needs to save its work.
 * Storage is cheap (~$0.026/GB-month); these are abuse guards.
 */
type QuotaPool = 'payloads' | 'uploads';
const QUOTAS: Record<QuotaPool, { doc: string; limitBytes: number; warningBytes: number }> = {
  payloads: { doc: 'storage-payloads', limitBytes: 2 * GIB, warningBytes: 1.6 * GIB },
  uploads: { doc: 'storage-uploads', limitBytes: 2 * GIB, warningBytes: 1.6 * GIB },
};

function poolFor(recordType: unknown): QuotaPool {
  return recordType === 'upload' ? 'uploads' : 'payloads';
}
const RESERVATION_TTL_MS = 10 * 60 * 1000;

const MAX_PAYLOAD_BYTES = {
  messageMetadata: 25 * 1024 * 1024,
  messageContent: 10 * 1024 * 1024,
  artifactData: 25 * 1024 * 1024,
  /** An Analyze upload's original bytes (the composer's per-file limit). */
  uploadFile: 100 * 1024 * 1024,
} as const;

type PayloadField = 'metadata' | 'content' | 'data' | 'file';
type PayloadRecordType = 'message' | 'artifact' | 'upload';

type PayloadPathPolicy = {
  userId: string;
  sessionId: string;
  recordType: PayloadRecordType;
  collection: 'messages' | 'artifacts' | 'uploads';
  recordId: string;
  reservationId?: string;
  field: PayloadField;
  fileName: string;
  contentType: 'application/json' | 'text/plain' | 'application/octet-stream';
  maxBytes: number;
};

type CloudPayloadRef = {
  version?: unknown;
  provider?: unknown;
  path?: unknown;
  bytes?: unknown;
  sha256?: unknown;
  contentType?: unknown;
  reservationId?: unknown;
};

type UsageDoc = {
  currentBytes?: number;
  reservedBytes?: number;
  objectCount?: number;
  limitBytes?: number;
};

function db() {
  return getFirestore();
}

function bucket() {
  return getStorage().bucket(STORAGE_BUCKET);
}

function requireUid(auth: { uid?: string } | undefined): string {
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }
  return auth.uid;
}

function stringValue(value: unknown, label: string, maxLength = 512): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new HttpsError('invalid-argument', `${label} is invalid`);
  }
  return value;
}

function numberValue(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpsError('invalid-argument', `${label} is invalid`);
  }
  return value;
}

function parsePayloadPath(path: string): PayloadPathPolicy | null {
  const parts = path.split('/');
  if (
    (parts.length !== 7 && parts.length !== 9)
    || parts.some(part => part.length === 0)
    || parts[0] !== 'users'
    || parts[2] !== 'sessions'
  ) {
    return null;
  }

  const [, userId, , sessionId, collection, recordId] = parts;
  const hasReservation = parts.length === 9;
  if (hasReservation && parts[6] !== 'payloads') return null;

  const reservationId = hasReservation ? parts[7] : undefined;
  const fileName = hasReservation ? parts[8] : parts[6];

  if (collection === 'messages') {
    if (fileName === 'metadata.json') {
      return {
        userId,
        sessionId,
        recordType: 'message',
        collection,
        recordId,
        reservationId,
        field: 'metadata',
        fileName,
        contentType: 'application/json',
        maxBytes: MAX_PAYLOAD_BYTES.messageMetadata,
      };
    }
    if (fileName === 'content.txt') {
      return {
        userId,
        sessionId,
        recordType: 'message',
        collection,
        recordId,
        reservationId,
        field: 'content',
        fileName,
        contentType: 'text/plain',
        maxBytes: MAX_PAYLOAD_BYTES.messageContent,
      };
    }
  }

  if (collection === 'artifacts' && fileName === 'data.txt') {
    return {
      userId,
      sessionId,
      recordType: 'artifact',
      collection,
      recordId,
      reservationId,
      field: 'data',
      fileName,
      contentType: 'text/plain',
      maxBytes: MAX_PAYLOAD_BYTES.artifactData,
    };
  }

  // Written only by the server (Analyze uploads); clients can't reserve these.
  if (collection === 'uploads' && fileName === 'file.bin') {
    return {
      userId,
      sessionId,
      recordType: 'upload',
      collection,
      recordId,
      reservationId,
      field: 'file',
      fileName,
      contentType: 'application/octet-stream',
      maxBytes: MAX_PAYLOAD_BYTES.uploadFile,
    };
  }

  return null;
}

function requirePayloadPath(path: string): PayloadPathPolicy {
  const parsed = parsePayloadPath(path);
  if (!parsed) {
    throw new HttpsError('invalid-argument', 'Invalid payload path');
  }
  return parsed;
}

function validatePayloadPolicy(
  uid: string,
  path: string,
  bytes: number,
  sha256: string,
  contentType: string,
): PayloadPathPolicy {
  const policy = requirePayloadPath(path);
  if (policy.userId !== uid) {
    throw new HttpsError('permission-denied', 'Payload path does not belong to this user');
  }
  if (contentType !== policy.contentType) {
    throw new HttpsError('invalid-argument', 'Invalid payload content type');
  }
  if (bytes <= 0 || bytes > policy.maxBytes) {
    throw new HttpsError('invalid-argument', 'Payload size exceeds the allowed limit');
  }
  if (!/^[a-f0-9]{64}$/i.test(sha256)) {
    throw new HttpsError('invalid-argument', 'Payload SHA-256 is invalid');
  }
  return policy;
}

function reservationPath(policy: PayloadPathPolicy, reservationId: string): string {
  return `users/${policy.userId}/sessions/${policy.sessionId}/${policy.collection}/${policy.recordId}/payloads/${reservationId}/${policy.fileName}`;
}

function usageRef(uid: string, pool: QuotaPool) {
  return db().collection('users').doc(uid).collection('usage').doc(QUOTAS[pool].doc);
}

function reservationsRef(uid: string) {
  return db().collection('users').doc(uid).collection('storageReservations');
}

function normalizeUsage(data: UsageDoc | undefined, pool: QuotaPool): Required<UsageDoc> {
  return {
    currentBytes: typeof data?.currentBytes === 'number' ? data.currentBytes : 0,
    reservedBytes: typeof data?.reservedBytes === 'number' ? data.reservedBytes : 0,
    objectCount: typeof data?.objectCount === 'number' ? data.objectCount : 0,
    limitBytes: typeof data?.limitBytes === 'number' ? data.limitBytes : QUOTAS[pool].limitBytes,
  };
}

async function releaseReservation(uid: string, reservationId: string, status: 'expired' | 'failed'): Promise<void> {
  const reservationRef = reservationsRef(uid).doc(reservationId);
  await db().runTransaction(async (transaction) => {
    const reservationSnap = await transaction.get(reservationRef);
    if (!reservationSnap.exists) return;
    const reservation = reservationSnap.data() ?? {};
    if (reservation.status !== 'reserved') return;
    const bytes = typeof reservation.bytes === 'number' ? reservation.bytes : 0;
    const pool = poolFor(reservation.recordType);
    const usageSnap = await transaction.get(usageRef(uid, pool));
    const usage = normalizeUsage(usageSnap.data() as UsageDoc | undefined, pool);

    transaction.set(usageRef(uid, pool), {
      currentBytes: usage.currentBytes,
      reservedBytes: Math.max(0, usage.reservedBytes - bytes),
      objectCount: usage.objectCount,
      limitBytes: QUOTAS[pool].limitBytes,
      warningBytes: QUOTAS[pool].warningBytes,
      lastUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    transaction.set(reservationRef, {
      status,
      releasedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

async function decrementUsageForDeletedObjects(uid: string, bytes: number, objectCount: number, pool: QuotaPool): Promise<void> {
  if (bytes <= 0 && objectCount <= 0) return;
  await db().runTransaction(async (transaction) => {
    const usageSnapshot = await transaction.get(usageRef(uid, pool));
    const usage = normalizeUsage(usageSnapshot.data() as UsageDoc | undefined, pool);
    transaction.set(usageRef(uid, pool), {
      currentBytes: Math.max(0, usage.currentBytes - Math.max(0, bytes)),
      reservedBytes: usage.reservedBytes,
      objectCount: Math.max(0, usage.objectCount - Math.max(0, objectCount)),
      limitBytes: QUOTAS[pool].limitBytes,
      warningBytes: QUOTAS[pool].warningBytes,
      lastUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

async function getObjectSize(path: string): Promise<number | null> {
  try {
    const [metadata] = await bucket().file(path).getMetadata();
    const size = Number(metadata.size);
    return Number.isFinite(size) ? size : null;
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 404) return null;
    throw error;
  }
}

async function deleteStorageObject(path: string): Promise<{ bytes: number; deleted: boolean }> {
  const bytes = await getObjectSize(path);
  await bucket().file(path).delete({ ignoreNotFound: true });
  return { bytes: bytes ?? 0, deleted: bytes !== null };
}

async function deleteStoragePrefix(uid: string, prefix: string): Promise<{ bytes: number; objects: number }> {
  if (!prefix.startsWith(`users/${uid}/sessions/`)) {
    throw new HttpsError('permission-denied', 'Storage prefix does not belong to this user');
  }

  const [files] = await bucket().getFiles({ prefix: `${prefix.replace(/\/$/, '')}/` });
  const deleted: Record<QuotaPool, { bytes: number; objects: number }> = {
    payloads: { bytes: 0, objects: 0 },
    uploads: { bytes: 0, objects: 0 },
  };

  for (const file of files) {
    const policy = parsePayloadPath(file.name);
    if (!policy || policy.userId !== uid) continue;
    const pool = deleted[poolFor(policy.recordType)];
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size);
    if (Number.isFinite(size)) pool.bytes += size;
    pool.objects += 1;
    await file.delete({ ignoreNotFound: true });
  }

  for (const pool of ['payloads', 'uploads'] as const) {
    await decrementUsageForDeletedObjects(uid, deleted[pool].bytes, deleted[pool].objects, pool);
  }
  return {
    bytes: deleted.payloads.bytes + deleted.uploads.bytes,
    objects: deleted.payloads.objects + deleted.uploads.objects,
  };
}

/**
 * Delete EVERY Cloud Storage object under a user's prefix (`users/{uid}/`).
 * Used by account deletion — broader than deleteStoragePrefix, which is scoped
 * to a single session for the interactive callable path. Prefix-scoped to the
 * user, so it cannot reach other users' data or content-addressed shared exports
 * (which live under `exports/`, not `users/`).
 */
export async function deleteAllUserStorage(uid: string): Promise<{ objects: number }> {
  if (!uid) throw new Error('deleteAllUserStorage: uid is required');
  let objects = 0;
  for (const prefix of [`users/${uid}/`, ...analyzeScratchPrefixes(uid)]) {
    const [files] = await bucket().getFiles({ prefix });
    for (const file of files) {
      await file.delete({ ignoreNotFound: true });
      objects += 1;
    }
  }
  return { objects };
}

/**
 * Server-private Analyze scratch (tool outputs awaiting capture, capture
 * traces), outside users/ so Storage rules deny clients. Scoped to a
 * session when one is given.
 */
function analyzeScratchPrefixes(uid: string, sessionId?: string): string[] {
  const session = sessionId ? `${sessionId}/` : '';
  return [
    `analyzeScratch/users/${uid}/conversations/${session}`,
    `analyzeScratch/captureTraces/${uid}/${session}`,
  ];
}

/**
 * Delete what the Analyze server loop keeps for a session that clients can't
 * delete themselves: runs (with their events, tool calls and transcripts),
 * the review queue, upload records and scratch. Upload bytes live under the
 * session's payload prefix, which the caller deletes.
 */
export async function deleteServerOwnedSessionData(uid: string, sessionId: string): Promise<void> {
  const session = db().doc(`users/${uid}/conversations/${sessionId}`);
  for (const name of ['analyzeRuns', 'reviewItems', 'analyzeUploads']) {
    await db().recursiveDelete(session.collection(name));
  }
  for (const prefix of analyzeScratchPrefixes(uid, sessionId)) {
    await bucket().deleteFiles({ prefix, force: true });
  }
}

async function deleteCollection(collection: FirebaseFirestore.CollectionReference, batchSize = 400): Promise<number> {
  let deleted = 0;
  while (true) {
    const snapshot = await collection.limit(batchSize).get();
    if (snapshot.empty) break;
    const batch = db().batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snapshot.size;
    if (snapshot.size < batchSize) break;
  }
  return deleted;
}

async function deleteReservationsForSession(uid: string, sessionId: string): Promise<number> {
  let deleted = 0;
  while (true) {
    const snapshot = await reservationsRef(uid)
      .where('sessionId', '==', sessionId)
      .limit(400)
      .get();
    if (snapshot.empty) break;
    const batch = db().batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snapshot.size;
    if (snapshot.size < 400) break;
  }
  return deleted;
}

/** Reserve quota and a reservation-scoped storage path for one payload upload. */
async function reserveUpload(
  uid: string,
  policy: PayloadPathPolicy,
  logicalPath: string,
  bytes: number,
  sha256: string,
  contentType: string,
) {
  const reservationRef = reservationsRef(uid).doc();
  const reservationId = reservationRef.id;
  const storagePath = reservationPath(policy, reservationId);
  const expiresAt = Timestamp.fromMillis(Date.now() + RESERVATION_TTL_MS);
  const pool = poolFor(policy.recordType);

  const result = await db().runTransaction(async (transaction) => {
    const usageSnapshot = await transaction.get(usageRef(uid, pool));
    const usage = normalizeUsage(usageSnapshot.data() as UsageDoc | undefined, pool);
    const nextReserved = usage.reservedBytes + bytes;
    if (usage.currentBytes + nextReserved > QUOTAS[pool].limitBytes) {
      throw new HttpsError(
        'resource-exhausted',
        pool === 'uploads'
          ? 'Upload storage is full (2 GB). Delete older Analyze sessions to free space.'
          : 'Cloud artifact storage quota exceeded',
        {
          currentBytes: usage.currentBytes,
          reservedBytes: usage.reservedBytes,
          limitBytes: QUOTAS[pool].limitBytes,
        },
      );
    }

    transaction.set(reservationRef, {
      uid,
      sessionId: policy.sessionId,
      recordType: policy.recordType,
      recordId: policy.recordId,
      field: policy.field,
      fileName: policy.fileName,
      logicalPath,
      storagePath,
      contentType,
      bytes,
      sha256,
      status: 'reserved',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt,
    });

    transaction.set(usageRef(uid, pool), {
      currentBytes: usage.currentBytes,
      reservedBytes: nextReserved,
      objectCount: usage.objectCount,
      limitBytes: QUOTAS[pool].limitBytes,
      warningBytes: QUOTAS[pool].warningBytes,
      lastUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return {
      reservationId,
      storagePath,
      expiresAt: expiresAt.toMillis(),
      currentBytes: usage.currentBytes,
      reservedBytes: nextReserved,
      limitBytes: QUOTAS[pool].limitBytes,
    };
  });

  return result;
}

/** Count a finished upload against the user's quota and mark its reservation finalized (idempotent). */
async function commitReservation(uid: string, reservationId: string, bytes: number) {
  const reservationRef = reservationsRef(uid).doc(reservationId);
  return db().runTransaction(async (transaction) => {
    const latestReservation = await transaction.get(reservationRef);
    if (!latestReservation.exists) {
      throw new HttpsError('not-found', 'Payload upload reservation not found');
    }
    const latest = latestReservation.data() ?? {};
    const pool = poolFor(latest.recordType);
    if (latest.status === 'finalized') {
      const usageSnap = await transaction.get(usageRef(uid, pool));
      const usage = normalizeUsage(usageSnap.data() as UsageDoc | undefined, pool);
      return {
        success: true,
        currentBytes: usage.currentBytes,
        reservedBytes: usage.reservedBytes,
        limitBytes: QUOTAS[pool].limitBytes,
      };
    }
    if (latest.status !== 'reserved') {
      throw new HttpsError('failed-precondition', 'Payload upload reservation is not active');
    }

    const usageSnap = await transaction.get(usageRef(uid, pool));
    const usage = normalizeUsage(usageSnap.data() as UsageDoc | undefined, pool);
    const nextCurrent = usage.currentBytes + bytes;
    const nextReserved = Math.max(0, usage.reservedBytes - bytes);

    transaction.set(usageRef(uid, pool), {
      currentBytes: nextCurrent,
      reservedBytes: nextReserved,
      objectCount: usage.objectCount + 1,
      limitBytes: QUOTAS[pool].limitBytes,
      warningBytes: QUOTAS[pool].warningBytes,
      lastUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    transaction.set(reservationRef, {
      status: 'finalized',
      finalizedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return {
      success: true,
      currentBytes: nextCurrent,
      reservedBytes: nextReserved,
      limitBytes: QUOTAS[pool].limitBytes,
    };
  });
}

export const reserveCloudPayloadUpload = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const data = request.data as Record<string, unknown>;
  const logicalPath = stringValue(data.path, 'path', 1024);
  const bytes = numberValue(data.bytes, 'bytes');
  const sha256 = stringValue(data.sha256, 'sha256', 64).toLowerCase();
  const contentType = stringValue(data.contentType, 'contentType', 128);
  const policy = validatePayloadPolicy(uid, logicalPath, bytes, sha256, contentType);
  if (policy.recordType === 'upload') {
    throw new HttpsError('invalid-argument', 'Uploads are stored by the server');
  }

  // Every account syncs (no paid gate); the per-pool quota is the guard.
  return reserveUpload(uid, policy, logicalPath, bytes, sha256, contentType);
});

export const finalizeCloudPayloadUpload = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const data = request.data as Record<string, unknown>;
  const reservationId = stringValue(data.reservationId, 'reservationId', 128);
  const storagePath = stringValue(data.path, 'path', 1024);
  const logicalPath = stringValue(data.logicalPath, 'logicalPath', 1024);
  const bytes = numberValue(data.bytes, 'bytes');
  const sha256 = stringValue(data.sha256, 'sha256', 64).toLowerCase();
  const contentType = stringValue(data.contentType, 'contentType', 128);

  const logicalPolicy = validatePayloadPolicy(uid, logicalPath, bytes, sha256, contentType);
  const storagePolicy = requirePayloadPath(storagePath);
  if (
    storagePolicy.userId !== uid
    || storagePolicy.sessionId !== logicalPolicy.sessionId
    || storagePolicy.recordType !== logicalPolicy.recordType
    || storagePolicy.recordId !== logicalPolicy.recordId
    || storagePolicy.field !== logicalPolicy.field
    || storagePolicy.reservationId !== reservationId
  ) {
    throw new HttpsError('invalid-argument', 'Payload storage path does not match reservation');
  }

  const reservationRef = reservationsRef(uid).doc(reservationId);
  const reservationSnap = await reservationRef.get();
  if (!reservationSnap.exists) {
    throw new HttpsError('not-found', 'Payload upload reservation not found');
  }

  const reservation = reservationSnap.data() ?? {};
  // Clients only finalize their own payloads (uploads are server-written).
  const pool: QuotaPool = 'payloads';
  if (reservation.status === 'finalized') {
    const usageSnap = await usageRef(uid, pool).get();
    const usage = normalizeUsage(usageSnap.data() as UsageDoc | undefined, pool);
    return {
      success: true,
      currentBytes: usage.currentBytes,
      reservedBytes: usage.reservedBytes,
      limitBytes: QUOTAS[pool].limitBytes,
    };
  }

  const expiresAt = reservation.expiresAt as Timestamp | undefined;
  if (reservation.status !== 'reserved' || !expiresAt || expiresAt.toMillis() <= Date.now()) {
    await bucket().file(storagePath).delete({ ignoreNotFound: true });
    await releaseReservation(uid, reservationId, 'expired');
    throw new HttpsError('failed-precondition', 'Payload upload reservation expired');
  }

  if (
    reservation.uid !== uid
    || reservation.logicalPath !== logicalPath
    || reservation.storagePath !== storagePath
    || reservation.contentType !== contentType
    || reservation.bytes !== bytes
    || reservation.sha256 !== sha256
  ) {
    await bucket().file(storagePath).delete({ ignoreNotFound: true });
    await releaseReservation(uid, reservationId, 'failed');
    throw new HttpsError('invalid-argument', 'Payload upload does not match reservation');
  }

  try {
    const file = bucket().file(storagePath);
    const [metadata] = await file.getMetadata();
    const actualBytes = Number(metadata.size);
    if (actualBytes !== bytes || metadata.contentType !== contentType) {
      await file.delete({ ignoreNotFound: true });
      await releaseReservation(uid, reservationId, 'failed');
      throw new HttpsError('invalid-argument', 'Uploaded payload metadata does not match reservation');
    }

    const [payload] = await file.download();
    const actualSha = crypto.createHash('sha256').update(payload).digest('hex');
    if (actualSha !== sha256) {
      await file.delete({ ignoreNotFound: true });
      await releaseReservation(uid, reservationId, 'failed');
      throw new HttpsError('invalid-argument', 'Uploaded payload integrity check failed');
    }
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    const code = (error as { code?: number }).code;
    if (code === 404) {
      await releaseReservation(uid, reservationId, 'failed');
      throw new HttpsError('not-found', 'Reserved payload object was not uploaded');
    }
    throw error;
  }

  return commitReservation(uid, reservationId, bytes);
});

export const deleteCloudPayload = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const payloadRef = (request.data as Record<string, unknown>).payloadRef as CloudPayloadRef | undefined;
  if (!payloadRef || payloadRef.provider !== 'firebase_storage') {
    throw new HttpsError('invalid-argument', 'Invalid payload reference');
  }

  const path = stringValue(payloadRef.path, 'payload path', 1024);
  const bytes = numberValue(payloadRef.bytes, 'payload bytes');
  const contentType = stringValue(payloadRef.contentType, 'payload contentType', 128);
  const sha256 = stringValue(payloadRef.sha256, 'payload sha256', 64);
  const policy = validatePayloadPolicy(uid, path, bytes, sha256, contentType);

  const deleted = await deleteStorageObject(path);
  if (deleted.deleted) {
    await decrementUsageForDeletedObjects(uid, deleted.bytes || bytes, 1, poolFor(policy.recordType));
  }

  if (typeof payloadRef.reservationId === 'string') {
    await reservationsRef(uid).doc(payloadRef.reservationId).set({
      status: 'deleted',
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  return { success: true, bytesDeleted: deleted.bytes, objectCount: deleted.deleted ? 1 : 0 };
});

export const deleteCloudPayloadsForPath = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const basePath = stringValue((request.data as Record<string, unknown>).basePath, 'basePath', 1024);
  const parts = basePath.split('/');
  if (
    parts.length !== 4
    || parts[0] !== 'users'
    || parts[1] !== uid
    || parts[2] !== 'sessions'
    || !parts[3]
  ) {
    throw new HttpsError('invalid-argument', 'Invalid session payload prefix');
  }

  const result = await deleteStoragePrefix(uid, basePath);
  await deleteReservationsForSession(uid, parts[3]);
  // Every session delete calls this; the server-owned records go with it (clients can't delete them).
  await deleteServerOwnedSessionData(uid, parts[3]);
  return { success: true, bytesDeleted: result.bytes, objectCount: result.objects };
});

export const deleteUserCloudData = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const mode = (request.data as Record<string, unknown> | undefined)?.mode;
  const allowedModes = new Set(['chat', 'debate', 'comparison', 'analyze']);
  if (mode !== undefined && (typeof mode !== 'string' || !allowedModes.has(mode))) {
    throw new HttpsError('invalid-argument', 'Invalid cloud data mode');
  }

  const sessionCollection = db().collection('users').doc(uid).collection('conversations');
  const sessionSnapshot = mode
    ? await sessionCollection.where('sessionType', '==', mode).get()
    : await sessionCollection.get();

  let sessionsDeleted = 0;
  let messagesDeleted = 0;
  let artifactsDeleted = 0;
  let reservationsDeleted = 0;
  let bytesDeleted = 0;
  let objectsDeleted = 0;

  for (const sessionDoc of sessionSnapshot.docs) {
    const sessionId = sessionDoc.id;
    const storageResult = await deleteStoragePrefix(uid, `users/${uid}/sessions/${sessionId}`);
    bytesDeleted += storageResult.bytes;
    objectsDeleted += storageResult.objects;

    messagesDeleted += await deleteCollection(sessionDoc.ref.collection('messages'));
    artifactsDeleted += await deleteCollection(sessionDoc.ref.collection('artifacts'));
    reservationsDeleted += await deleteReservationsForSession(uid, sessionId);
    await deleteServerOwnedSessionData(uid, sessionId);
    await sessionDoc.ref.delete();
    sessionsDeleted += 1;
  }

  if (!mode) {
    for (const pool of ['payloads', 'uploads'] as const) {
      await usageRef(uid, pool).set({
        currentBytes: 0,
        reservedBytes: 0,
        objectCount: 0,
        limitBytes: QUOTAS[pool].limitBytes,
        warningBytes: QUOTAS[pool].warningBytes,
        lastUpdatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }

  return {
    success: true,
    sessionsDeleted,
    messagesDeleted,
    artifactsDeleted,
    reservationsDeleted,
    bytesDeleted,
    objectsDeleted,
  };
});

// ============================================================================
// Server-side writers (Analyze server loop, Phase 3)
// ============================================================================
//
// The server loop writes messages and artifacts itself, so it offloads large
// fields the way the web's CloudPayloadStorageService does: the same paths,
// policy, quota reservation and ref shape, with the upload done by the Admin
// SDK instead of a browser upload between the two callables.

/** Documents larger than this offload fields to Storage (web CloudPayloadStorageService OFFLOAD_THRESHOLD). */
export const PAYLOAD_OFFLOAD_THRESHOLD = 800_000;
/** Stands in for an offloaded field (web PAYLOAD_SENTINEL). */
export const PAYLOAD_SENTINEL = '__PAYLOAD_OFFLOADED__';

/** The web's CloudPayloadRef shape. */
export interface StoredPayloadRef {
  version: 1;
  provider: 'firebase_storage';
  path: string;
  bytes: number;
  sha256: string;
  contentType: string;
  offloadedAt: number;
  reservationId?: string;
}

export interface StoredPayloadRefs {
  data?: StoredPayloadRef;
  content?: StoredPayloadRef;
  metadata?: StoredPayloadRef;
}

/** Serialized byte size of a value (web estimateDocBytes). */
export function estimateDocBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value));
}

/**
 * Upload one payload on the user's behalf. `logicalPath` is the web's
 * convention (users/{uid}/sessions/{sessionId}/{messages|artifacts}/{id}/{file}).
 *
 * Unlike the reserve callable this does not require a subscription: the
 * server loop must persist what it produces, and "always sync" (Phase 3
 * decision 2) removes that gate product-wide. The byte quota still applies;
 * gating server-side Analyze itself is Phase 3 Step 7.
 */
export async function uploadPayloadForUser(
  uid: string,
  logicalPath: string,
  text: string,
  contentType: 'application/json' | 'text/plain',
): Promise<StoredPayloadRef> {
  return uploadBytesForUser(uid, logicalPath, Buffer.from(text, 'utf8'), contentType);
}

/** uploadPayloadForUser for bytes (Analyze uploads: users/{uid}/sessions/{sessionId}/uploads/{id}/file.bin). */
export async function uploadBytesForUser(
  uid: string,
  logicalPath: string,
  data: Buffer,
  contentType: 'application/json' | 'text/plain' | 'application/octet-stream',
): Promise<StoredPayloadRef> {
  const sha256 = crypto.createHash('sha256').update(data).digest('hex');
  const policy = validatePayloadPolicy(uid, logicalPath, data.byteLength, sha256, contentType);
  const reservation = await reserveUpload(uid, policy, logicalPath, data.byteLength, sha256, contentType);
  try {
    await bucket().file(reservation.storagePath).save(data, { contentType, resumable: false });
  } catch (error) {
    await releaseReservation(uid, reservation.reservationId, 'failed');
    throw error;
  }
  await commitReservation(uid, reservation.reservationId, data.byteLength);
  return {
    version: 1,
    provider: 'firebase_storage',
    path: reservation.storagePath,
    bytes: data.byteLength,
    sha256,
    contentType,
    offloadedAt: Date.now(),
    reservationId: reservation.reservationId,
  };
}

/** Read an offloaded payload back, verifying its hash (web downloadPayload). */
export async function downloadPayload(ref: StoredPayloadRef): Promise<string> {
  return (await downloadPayloadBytes(ref)).toString('utf8');
}

/** downloadPayload for bytes. */
export async function downloadPayloadBytes(ref: StoredPayloadRef): Promise<Buffer> {
  requirePayloadPath(ref.path);
  const [payload] = await bucket().file(ref.path).download();
  const actualSha = crypto.createHash('sha256').update(payload).digest('hex');
  if (actualSha !== ref.sha256) {
    throw new Error(`Payload integrity mismatch for ${ref.path}: expected ${ref.sha256}, got ${actualSha}`);
  }
  return payload;
}

/** Delete an offloaded payload and release its quota (deleteCloudPayload, as the server). */
export async function deletePayloadForUser(uid: string, ref: StoredPayloadRef): Promise<void> {
  const policy = requirePayloadPath(ref.path);
  if (policy.userId !== uid) throw new Error(`Payload ${ref.path} does not belong to ${uid}`);
  const deleted = await deleteStorageObject(ref.path);
  if (deleted.deleted) await decrementUsageForDeletedObjects(uid, deleted.bytes || ref.bytes, 1, poolFor(policy.recordType));
  if (ref.reservationId) {
    await reservationsRef(uid).doc(ref.reservationId).set({
      status: 'deleted',
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
}
