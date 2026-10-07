import { getFirestore } from 'firebase-admin/firestore';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import type { SandboxRecord, SandboxRecordRef, SandboxStore } from './types';

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
}

function toRef(doc: QueryDocumentSnapshot): SandboxRecordRef {
  return { uid: doc.ref.parent.parent!.id, sessionKey: doc.id, record: doc.data() as SandboxRecord };
}
