/**
 * Session records the server loop writes for the web app to read: messages
 * and artifacts under users/{uid}/conversations/{sessionId}/, in the same
 * shape and with the same Storage offload as the web's ChatHistoryService
 * (saveMessage, saveArtifact, deleteArtifact, getSession, getSessionArtifacts).
 */
import { getFirestore, FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import type { Message } from '../contract/types';
import type { Artifact } from '../contract/types/notebook';
import { ARTIFACT_DATA_NOT_LOADED } from '../contract/types/notebook';
import {
  decodeArtifactPreviewFromFirestore,
  encodeArtifactPreviewForFirestore,
} from '../contract/services/history/artifactPreviewFirestoreCodec';
import {
  PAYLOAD_OFFLOAD_THRESHOLD,
  PAYLOAD_SENTINEL,
  deletePayloadForUser,
  downloadPayload,
  estimateDocBytes,
  uploadPayloadForUser,
  type StoredPayloadRefs,
} from '../../cloudPayloadStorage';

type AnyRecord = Record<string, unknown>;

// Firestore doesn't accept undefined values - remove them from objects.
// Ported from symposium-ai-web ChatHistoryService removeUndefined.
export const removeUndefined = <T,>(value: T): T => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => removeUndefined(entry))
      .filter((entry) => entry !== undefined) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      if (entry === undefined) return;
      const cleaned = removeUndefined(entry);
      if (cleaned === undefined) return;
      result[key] = cleaned;
    });
    return result as T;
  }
  return value;
};

export function messageRef(uid: string, sessionId: string, messageId: string): DocumentReference {
  return getFirestore().doc(`users/${uid}/conversations/${sessionId}/messages/${messageId}`);
}

export function artifactRef(uid: string, sessionId: string, artifactId: string): DocumentReference {
  return getFirestore().doc(`users/${uid}/conversations/${sessionId}/artifacts/${artifactId}`);
}

// ============================================================================
// Messages
// ============================================================================

/**
 * Same record shape the web app writes (ChatHistoryService buildMessageRecord),
 * so History, restore, and the transcript read server-written messages as-is.
 * Attachments are not persisted, matching the client.
 */
export function buildMessageRecord(sessionId: string, message: Message, conversationTurn?: number): AnyRecord {
  const wordCount = message.content ? message.content.trim().split(/\s+/).filter(Boolean).length : 0;
  const metadata = message.metadata
    ? removeUndefined({
        ...message.metadata,
        sessionId: message.metadata.sessionId || sessionId,
        wordCount: message.metadata.wordCount ?? wordCount,
        ...(conversationTurn ? { conversationTurn } : {}),
      })
    : wordCount > 0 || conversationTurn
      ? removeUndefined({
          sessionId,
          wordCount,
          ...(conversationTurn ? { conversationTurn } : {}),
        })
      : undefined;
  const metadataValue = metadata && Object.keys(metadata).length > 0 ? metadata : undefined;

  return removeUndefined({
    id: message.id,
    sender: message.sender,
    senderType: message.senderType,
    content: message.content,
    timestamp: message.timestamp,
    mentions: message.mentions,
    metadata: metadataValue,
  });
}

/**
 * The message record ready to `set(…, { merge: true })`: oversized fields are
 * uploaded and replaced by the sentinel (metadata first, then content), as
 * ChatHistoryService.saveMessage / offloadMessageRecord do.
 */
export async function prepareMessageRecord(uid: string, sessionId: string, message: Message): Promise<AnyRecord> {
  const record = buildMessageRecord(sessionId, message);
  if (estimateDocBytes(record) <= PAYLOAD_OFFLOAD_THRESHOLD) {
    // Clear any stale payloadRefs from a previous offloaded version.
    return { ...record, payloadRefs: FieldValue.delete() };
  }

  const payloadRefs: StoredPayloadRefs = {};
  const basePath = `users/${uid}/sessions/${sessionId}/messages/${message.id}`;
  if (record.metadata && estimateDocBytes(record) > PAYLOAD_OFFLOAD_THRESHOLD) {
    payloadRefs.metadata = await uploadPayloadForUser(uid, `${basePath}/metadata.json`, JSON.stringify(record.metadata), 'application/json');
    record.metadata = PAYLOAD_SENTINEL;
  }
  if (typeof record.content === 'string' && record.content && estimateDocBytes(record) > PAYLOAD_OFFLOAD_THRESHOLD) {
    payloadRefs.content = await uploadPayloadForUser(uid, `${basePath}/content.txt`, record.content, 'text/plain');
    record.content = PAYLOAD_SENTINEL;
  }
  if (Object.keys(payloadRefs).length > 0) record.payloadRefs = payloadRefs;
  if (estimateDocBytes(record) > PAYLOAD_OFFLOAD_THRESHOLD) {
    throw new Error(`DOCUMENT_TOO_LARGE: message ${message.id} still ${estimateDocBytes(record)} bytes after offloading`);
  }
  return record;
}

export async function writeMessage(uid: string, sessionId: string, message: Message): Promise<void> {
  const record = await prepareMessageRecord(uid, sessionId, message);
  await messageRef(uid, sessionId, message.id).set(record, { merge: true });
}

/** Put offloaded fields back (web hydratePayloadRefs); a failed download leaves the sentinel. */
async function hydratePayloadRefs(record: AnyRecord): Promise<void> {
  const refs = record.payloadRefs as StoredPayloadRefs | undefined;
  if (!refs) return;
  await Promise.all([
    refs.content && record.content === PAYLOAD_SENTINEL
      ? downloadPayload(refs.content).then((text) => { record.content = text; })
      : undefined,
    refs.metadata && record.metadata === PAYLOAD_SENTINEL
      ? downloadPayload(refs.metadata).then((text) => { record.metadata = JSON.parse(text); })
      : undefined,
    refs.data && record.data === PAYLOAD_SENTINEL
      ? downloadPayload(refs.data).then((text) => { record.data = text; })
      : undefined,
  ].map((pending) => pending?.catch((error) => {
    console.warn(`[analyzeRun] could not hydrate an offloaded payload of ${String(record.id)}`, error);
  })));
}

export async function loadSessionMessages(uid: string, sessionId: string): Promise<Message[]> {
  const snapshot = await getFirestore()
    .collection(`users/${uid}/conversations/${sessionId}/messages`)
    .orderBy('timestamp', 'asc')
    .get();
  const records = snapshot.docs.map((doc) => doc.data() as AnyRecord);
  await Promise.all(records.map(hydratePayloadRefs));
  return records.map(({ payloadRefs: _payloadRefs, ...message }) => message as unknown as Message);
}

// ============================================================================
// Artifacts
// ============================================================================

/**
 * The artifact record ready to `set(…, { merge: true })`
 * (ChatHistoryService.saveArtifact): `userId` for the collectionGroup
 * queries, `data` offloaded only when the doc is over the threshold, sync
 * state marked synced, and preview table rows encoded for Firestore.
 */
export async function prepareArtifactRecord(uid: string, sessionId: string, artifact: Artifact): Promise<AnyRecord> {
  const record = removeUndefined({ ...artifact, userId: uid }) as AnyRecord;
  const data = typeof record.data === 'string' ? record.data : '';
  const payloadRefs: StoredPayloadRefs = {};
  const canOffloadData = estimateDocBytes(record) > PAYLOAD_OFFLOAD_THRESHOLD
    && data.length > 0
    && data !== PAYLOAD_SENTINEL
    && data !== ARTIFACT_DATA_NOT_LOADED
    && data !== '__BUNDLE_TOO_LARGE__';
  if (canOffloadData) {
    payloadRefs.data = await uploadPayloadForUser(
      uid,
      `users/${uid}/sessions/${sessionId}/artifacts/${artifact.id}/data.txt`,
      data,
      'text/plain',
    );
    record.data = PAYLOAD_SENTINEL;
    record.payloadRefs = payloadRefs;
  }
  if (estimateDocBytes(record) > PAYLOAD_OFFLOAD_THRESHOLD) {
    throw new Error(`DOCUMENT_TOO_LARGE: artifact ${artifact.id} still ${estimateDocBytes(record)} bytes after offloading`);
  }

  record.metadata = removeUndefined({
    ...((record.metadata as AnyRecord | undefined) ?? {}),
    cloudSyncState: 'synced',
    ...(payloadRefs.data ? { payloadBytes: payloadRefs.data.bytes } : {}),
    quotaBlocked: false,
    lastSyncError: null,
  });
  // Clear any stale payloadRefs from a previous offloaded version.
  if (!payloadRefs.data) record.payloadRefs = FieldValue.delete();
  return encodeArtifactPreviewForFirestore(record);
}

/** The session's artifacts with offloaded data hydrated (getSessionArtifacts). */
export async function loadSessionArtifacts(uid: string, sessionId: string): Promise<Array<Artifact & { payloadRefs?: StoredPayloadRefs }>> {
  const snapshot = await getFirestore()
    .collection(`users/${uid}/conversations/${sessionId}/artifacts`)
    .orderBy('createdAt', 'asc')
    .get();
  const records = snapshot.docs.map((doc) => decodeArtifactPreviewFromFirestore(doc.data()) as AnyRecord);
  await Promise.all(records.map(hydratePayloadRefs));
  return records as unknown as Array<Artifact & { payloadRefs?: StoredPayloadRefs }>;
}

/** Remove an artifact's offloaded payloads (after its doc is deleted). */
export async function deleteArtifactPayloads(uid: string, refs: StoredPayloadRefs | undefined): Promise<void> {
  if (!refs) return;
  await Promise.all([refs.data, refs.content, refs.metadata]
    .filter((ref): ref is NonNullable<typeof ref> => Boolean(ref))
    .map((ref) => deletePayloadForUser(uid, ref)));
}
