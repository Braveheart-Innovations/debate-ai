import { createHash } from 'node:crypto';
import type { Artifact } from '../../contract/types/notebook';
import type { FetchRecord } from '../../engine/fetchRecords';

/** Records by response hash, and the ones only an older session's transcripts hold. */
const mockRecords = new Map<string, FetchRecord>();
const mockTranscriptRecords = new Map<string, FetchRecord>();
const mockByHash = jest.fn(async (_uid: string, _sessionId: string, hashes: string[]) => (
  new Map(hashes.flatMap((hash) => (mockRecords.has(hash) ? [[hash, mockRecords.get(hash)!] as const] : [])))
));
const mockReadTranscripts = jest.fn(async () => {
  for (const [hash, record] of mockTranscriptRecords) mockRecords.set(hash, record);
  return true;
});
const mockBeganWithRecords = jest.fn(async () => true);
const mockUpdate = jest.fn(async (_id: string, _data: unknown) => undefined);
let mockFolder: Artifact[] = [];

jest.mock('firebase-admin/firestore', () => {
  const query = {
    where: () => query,
    select: () => query,
    get: async () => ({ docs: mockFolder.map((file) => ({ id: file.id, data: () => file })) }),
  };
  return { getFirestore: () => ({ collection: () => query }) };
});
jest.mock('../../../cloudPayloadStorage', () => ({ PAYLOAD_SENTINEL: '__PAYLOAD_OFFLOADED__' }));
jest.mock('../../engine/fetchRecords', () => ({
  fetchRecordsByHash: (uid: string, sessionId: string, hashes: string[]) => mockByHash(uid, sessionId, hashes),
  recordTranscriptFetches: () => mockReadTranscripts(),
  sessionBeganWithRecords: () => mockBeganWithRecords(),
  fetchRequestArgs: (record: { request: string }) => JSON.parse(record.request) as Record<string, unknown>,
}));
jest.mock('../../engine/sessionStore', () => ({
  artifactRef: (_uid: string, _sessionId: string, id: string) => ({ update: (data: unknown) => mockUpdate(id, data) }),
  loadArtifactsById: async (_uid: string, _sessionId: string, ids: string[]) => mockFolder.filter((file) => ids.includes(file.id)),
}));

import { findAndMarkModelSources, markFetchedCopies } from '../modelSources';

const DATA = '{"observations":[{"date":"2026-09-01","value":"7300"}]}';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const b64 = (text: string) => Buffer.from(text).toString('base64');

function file(id: string, name: string, text: string, metadata: Record<string, unknown> = {}): Artifact {
  return { id, cellId: 'c1', sessionId: 's1', name, type: 'data', mimeType: 'application/json', data: b64(text), createdAt: 1, metadata } as unknown as Artifact;
}

function record(hash: string): FetchRecord {
  return {
    id: 'fetch-1',
    tool: 'fetch_api',
    // The key in the query never reaches a mark.
    request: JSON.stringify({ url: 'https://api.stlouisfed.org/fred/series/observations?series_id=RSXFS&api_key=SECRET' }),
    path: '/data/fetch_call_1.json',
    responseHash: hash,
    fetchedAt: 100,
    origin: 'run',
  };
}

const MARK = { endpoint: 'https://api.stlouisfed.org/fred/series/observations', fetchedAt: 100 };

const recipe = {
  id: 'recipe-1',
  name: 'retail.recipe.py',
  type: 'recipe',
  data: 'PARAMS = {}',
  metadata: { recipe: { params: [], outputDir: 'retail' } },
} as unknown as Artifact;

beforeEach(() => {
  mockRecords.clear();
  mockTranscriptRecords.clear();
  mockByHash.mockClear();
  mockReadTranscripts.mockClear();
  mockBeganWithRecords.mockReset().mockResolvedValue(true);
  mockUpdate.mockClear();
  mockFolder = [];
});

describe('markFetchedCopies', () => {
  it('marks a copy of a fetch with where (no query) and when, another file in a folder null, and leaves the rest', async () => {
    mockRecords.set(sha(DATA), record(sha(DATA)));
    const refreshed = { endpoint: 'https://example.org/rates', fetchedAt: 5 };
    const marked = await markFetchedCopies('uid', 's1', [
      file('a1', 'retail/fetch_rsxfs.json', DATA),
      file('a2', 'retail/forecast.csv', 'month,value'),
      file('a3', 'retail/model.json', '{}'),
      file('a4', 'notes.json', DATA),
      { ...file('a5', 'retail/big.csv', ''), data: '__PAYLOAD_OFFLOADED__' } as Artifact,
      file('a6', 'retail/rates.json', DATA, { fetchedFrom: refreshed }),
    ]);
    expect(marked.map((artifact) => artifact.metadata?.fetchedFrom)).toEqual([MARK, null, undefined, undefined, undefined, refreshed]);
    expect(mockReadTranscripts).not.toHaveBeenCalled();
  });

  it('reads an older session\'s transcripts when a file matches no record, then marks', async () => {
    mockBeganWithRecords.mockResolvedValue(false);
    mockTranscriptRecords.set(sha(DATA), record(sha(DATA)));
    const marked = await markFetchedCopies('uid', 's1', [file('a1', 'retail/fetch_rsxfs.json', DATA), file('a2', 'retail/forecast.csv', 'x')]);
    expect(mockReadTranscripts).toHaveBeenCalledTimes(1);
    expect(marked.map((artifact) => artifact.metadata?.fetchedFrom)).toEqual([MARK, null]);
  });

  it('never reads the transcripts of a session that began with records, or when every file matches', async () => {
    mockTranscriptRecords.set(sha(DATA), record(sha(DATA)));
    const marked = await markFetchedCopies('uid', 's1', [file('a1', 'retail/forecast.csv', 'x')]);
    expect(marked[0].metadata?.fetchedFrom).toBeNull();
    mockBeganWithRecords.mockResolvedValue(false);
    mockRecords.set(sha(DATA), record(sha(DATA)));
    await markFetchedCopies('uid', 's1', [file('a1', 'retail/fetch_rsxfs.json', DATA)]);
    expect(mockReadTranscripts).not.toHaveBeenCalled();
  });

  it('leaves the files unmarked when the lookup fails, and the save goes on', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockByHash.mockRejectedValueOnce(new Error('Firestore unavailable'));
    const artifacts = [file('a1', 'retail/fetch_rsxfs.json', DATA)];
    await expect(markFetchedCopies('uid', 's1', artifacts)).resolves.toBe(artifacts);
    warn.mockRestore();
  });
});

describe('findAndMarkModelSources', () => {
  it('marks the files saved before the marks, skips a mark that\'s right, and returns the sources', async () => {
    mockRecords.set(sha(DATA), record(sha(DATA)));
    mockFolder = [
      file('a1', 'retail/fetch_rsxfs.json', DATA),
      file('a2', 'retail/forecast.csv', 'x', { fetchedFrom: null }),
      file('a3', 'retail/assumptions.csv', 'y'),
      file('a4', 'retail/model.json', '{}'),
    ];
    const sources = await findAndMarkModelSources('uid', 's1', recipe);
    expect(sources.map((source) => [source.file.name, source.fetch.id])).toEqual([['retail/fetch_rsxfs.json', 'fetch-1']]);
    expect(mockUpdate.mock.calls).toEqual([
      ['a1', { 'metadata.fetchedFrom': MARK }],
      ['a3', { 'metadata.fetchedFrom': null }],
    ]);
  });
});
