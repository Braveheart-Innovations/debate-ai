import JSZip from 'jszip';

const records: Array<Record<string, unknown>> = [];
const payloads = new Map<string, Uint8Array>();
let storedMarker: string | null = null;

const mockSandbox = {
  writeFile: jest.fn(async (_uid: string, _key: string, input: { path: string; base64: string }) => {
    if (input.path.endsWith('session-files.json')) storedMarker = Buffer.from(input.base64, 'base64').toString('utf8');
  }),
  readFile: jest.fn(async () => {
    if (storedMarker === null) throw new Error('missing');
    return { base64: Buffer.from(storedMarker).toString('base64') };
  }),
  extractZips: jest.fn(async () => undefined),
};

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ get: async () => ({ docs: records.map((record) => ({ data: () => record })) }) }) }),
}));
jest.mock('firebase-admin/storage', () => ({ getStorage: () => ({}) }));
jest.mock('../../../sandbox/callables', () => ({ getSandboxService: () => mockSandbox }));
jest.mock('../../../sandbox/service', () => ({ FILE_CHUNK_BYTES: 1024, SandboxLimitError: class extends Error {} }));
jest.mock('../../../cloudPayloadStorage', () => ({
  downloadPayloadBytes: async (payload: { id: string }) => Buffer.from(payloads.get(payload.id)!),
  deletePayloadForUser: jest.fn(),
  downloadPayloadRange: jest.fn(),
  uploadBytesForUser: jest.fn(),
}));
jest.mock('../sessionStore', () => ({
  listSessionArtifactIds: async () => [],
  loadArtifactsById: async () => [],
  removeUndefined: <T>(value: T) => value,
}));
jest.mock('../artifactFilesystemHydration', () => ({ mountArtifactsToSandbox: jest.fn() }));

import { SessionFilesSync } from '../uploads';

async function upload(id: string, path: string, bytes: Uint8Array) {
  payloads.set(id, bytes);
  records.push({ id, pythonPath: path, sha256: `sha-${id}`, size: bytes.byteLength, uploadedAt: records.length, payload: { id } });
}

async function salesforceZip(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('qa/sfdx-project.json', JSON.stringify({ packageDirectories: [{ path: 'force-app', default: true }] }));
  zip.file('qa/force-app/main/default/objects/Lead/fields/Ready_to_Convert__c.field-meta.xml', '<CustomField/>');
  return new Uint8Array(await zip.generateAsync({ type: 'arraybuffer' }));
}

describe('SessionFilesSync and the Salesforce workspace', () => {
  beforeEach(async () => {
    records.length = 0;
    payloads.clear();
    storedMarker = null;
    jest.clearAllMocks();
    await upload('u1', '/uploads/qa-salesforce-metadata.zip', await salesforceZip());
    await upload('u2', '/uploads/enrollments.csv', new TextEncoder().encode('center,count\n1,2'));
  });

  it('unpacks a Salesforce bundle into the workspace when a new sandbox gets the uploads back', async () => {
    await new SessionFilesSync('uid', 's1', 'key').sync();
    expect(mockSandbox.extractZips).toHaveBeenCalledWith('uid', 'key', ['/uploads/qa-salesforce-metadata.zip'], '/data/salesforce/workspace');
    expect(JSON.parse(storedMarker!).salesforceBundles).toEqual(['u1']);

    // Nothing new: no second unpack, in this round or the next one.
    await new SessionFilesSync('uid', 's1', 'key').sync();
    expect(mockSandbox.extractZips).toHaveBeenCalledTimes(1);
  });

  it('empties the workspace when the bundle is removed', async () => {
    await new SessionFilesSync('uid', 's1', 'key').sync();
    records.splice(0, 1);
    await new SessionFilesSync('uid', 's1', 'key').sync();
    expect(mockSandbox.extractZips).toHaveBeenLastCalledWith('uid', 'key', [], '/data/salesforce/workspace');
    expect(JSON.parse(storedMarker!).salesforceBundles).toBeUndefined();
  });

  it('goes ahead with the round when the unpack fails (the audit unpacks it again)', async () => {
    mockSandbox.extractZips.mockRejectedValueOnce(new Error('disk full'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(new SessionFilesSync('uid', 's1', 'key').sync()).resolves.toBeUndefined();
    expect(JSON.parse(storedMarker!).uploads).toEqual({ u1: 'sha-u1', u2: 'sha-u2' });
    warn.mockRestore();
  });

  it('unpacks packets imported on their own beside the bundle, so their limits.csv is in the workspace', async () => {
    await new SessionFilesSync('uid', 's1', 'key').sync();
    const packets = new JSZip();
    packets.file('qa/.symposium/salesforce-insights/20261016T182500Z-limits/limits.csv', 'limit,max,remaining,at\nDataStorageMB,486640,293200,2026-10-16T18:25:00Z');
    await upload('u3', '/uploads/qa-salesforce-insights.zip', new Uint8Array(await packets.generateAsync({ type: 'arraybuffer' })));
    await new SessionFilesSync('uid', 's1', 'key').sync();
    // Sorted, as the audit lists them, so both unpack under one checksum.
    expect(mockSandbox.extractZips).toHaveBeenLastCalledWith('uid', 'key', ['/uploads/qa-salesforce-insights.zip', '/uploads/qa-salesforce-metadata.zip'], '/data/salesforce/workspace');
    expect(JSON.parse(storedMarker!).salesforceBundles).toEqual(['u1', 'u3']);
  });

  it('leaves the workspace alone in a session with no Salesforce bundle', async () => {
    records.splice(0, 1);
    await new SessionFilesSync('uid', 's1', 'key').sync();
    expect(mockSandbox.extractZips).not.toHaveBeenCalled();
  });
});
