import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import type { AwakeClaim, SandboxRecord, SandboxRecordRef, SandboxStore } from './types';

/**
 * users/{uid}/analyzeSandboxes/{sessionKey}. No firestore.rules match exists for
 * this subcollection, so clients are denied by default: only these functions
 * (Admin SDK) can read or write the uid → sandbox mapping.
 */
export class FirestoreSandboxStore implements SandboxStore {
  private doc(uid: string, sessionKey: string) {
    return getFirestore().collection('users').doc(uid).collection('analyzeSandboxes').doc(sessionKey);
  }

  async get(uid: string, sessionKey: string): Promise<SandboxRecord | null> {
    const snapshot = await this.doc(uid, sessionKey).get();
    return snapshot.exists ? (snapshot.data() as SandboxRecord) : null;
  }

  async put(uid: string, sessionKey: string, record: SandboxRecord): Promise<void> {
    await this.doc(uid, sessionKey).set(record);
  }

  async touch(uid: string, sessionKey: string, at: number): Promise<void> {
    await this.doc(uid, sessionKey).update({ lastUsedAt: at });
  }

  async delete(uid: string, sessionKey: string): Promise<void> {
    await this.doc(uid, sessionKey).delete();
  }

  async listForUser(uid: string): Promise<SandboxRecordRef[]> {
    const snapshot = await getFirestore().collection('users').doc(uid).collection('analyzeSandboxes').get();
    return snapshot.docs.map(toRef);
  }

  /** Collection-group range query; needs the analyzeSandboxes.lastUsedAt fieldOverride. */
  async listIdle(before: number, limit: number): Promise<SandboxRecordRef[]> {
    const snapshot = await getFirestore()
      .collectionGroup('analyzeSandboxes')
      .where('lastUsedAt', '<', before)
      .orderBy('lastUsedAt')
      .limit(limit)
      .get();
    return snapshot.docs.map(toRef);
  }

  /**
   * users/{uid}/sandboxSlots/awake: { until: { [sessionKey]: ms } }. One doc per
   * user, so parallel claims serialize on it. Server-only like the records.
   */
  async claimAwake(uid: string, sessionKey: string, at: number, awakeForMs: number, limit: number): Promise<AwakeClaim> {
    const ref = getFirestore().collection('users').doc(uid).collection('sandboxSlots').doc('awake');
    return getFirestore().runTransaction(async (transaction) => {
      const stored = ((await transaction.get(ref)).data()?.until ?? {}) as Record<string, number>;
      const others = Object.entries(stored).filter(([key, until]) => key !== sessionKey && until > at);
      if (others.length >= limit) return { ok: false, freesAt: Math.min(...others.map(([, until]) => until)) };
      // Expired entries are dropped as the map is rewritten.
      transaction.set(ref, { until: { ...Object.fromEntries(others), [sessionKey]: at + awakeForMs } });
      return { ok: true };
    });
  }

  async releaseAwake(uid: string, sessionKey: string): Promise<void> {
    const ref = getFirestore().collection('users').doc(uid).collection('sandboxSlots').doc('awake');
    await getFirestore().runTransaction(async (transaction) => {
      const until = { ...((await transaction.get(ref)).data()?.until ?? {}) } as Record<string, number>;
      if (!(sessionKey in until)) return;
      delete until[sessionKey];
      transaction.set(ref, { until, updatedAt: FieldValue.serverTimestamp() });
    });
  }
}

function toRef(doc: QueryDocumentSnapshot): SandboxRecordRef {
  return { uid: doc.ref.parent.parent!.id, sessionKey: doc.id, record: doc.data() as SandboxRecord };
}
