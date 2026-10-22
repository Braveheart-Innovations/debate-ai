import type { DocumentReference } from 'firebase-admin/firestore';
import { RunEventWriter, type RunEvent } from '../runStore';

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(),
  FieldValue: {},
  Timestamp: { fromMillis: (ms: number) => ({ ms }) },
}));
jest.mock('firebase-admin/storage', () => ({ getStorage: jest.fn() }));

function fakeRunRef() {
  const docs: Array<{ id: string; data: { events: RunEvent[] } }> = [];
  const ref = {
    collection: () => ({
      doc: (id: string) => ({
        set: async (data: { events: RunEvent[] }) => { docs.push({ id, data }); },
      }),
    }),
    update: jest.fn(async () => undefined),
  };
  return { ref: ref as unknown as DocumentReference, docs };
}

describe('RunEventWriter', () => {
  it('merges a message\'s reasoning deltas like its text, and keeps reasoning and text apart', async () => {
    const { ref, docs } = fakeRunRef();
    const writer = new RunEventWriter(ref, 0);
    writer.push({ type: 'reasoning', messageId: 'r0', text: 'The flows share ' });
    writer.push({ type: 'reasoning', messageId: 'r0', text: 'an object.' });
    writer.push({ type: 'text', messageId: 'r0', text: 'Checking.' });
    writer.push({ type: 'reasoning', messageId: 'r1', text: 'Next round.' });
    await writer.close();
    expect(docs).toHaveLength(1);
    expect(docs[0].data.events).toEqual([
      { type: 'reasoning', messageId: 'r0', text: 'The flows share an object.' },
      { type: 'text', messageId: 'r0', text: 'Checking.' },
      { type: 'reasoning', messageId: 'r1', text: 'Next round.' },
    ]);
  });
});
