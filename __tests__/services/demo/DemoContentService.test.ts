import type { DemoChat, DemoCompare, DemoDebate } from '@/types/demo';
import type { DemoRecordingEntry, DemoRecordingType } from '@/assets/demo/recordingsManifest';

const mockSortProviders = (providers: string[]) => [...providers].sort().join('+');

const chatEntries: DemoRecordingEntry<DemoChat>[] = [
  {
    id: 'chat-1',
    type: 'chat',
    providers: ['anthropic', 'openai'],
    title: 'Philosophy Debate',
    data: { id: 'chat-1', title: 'Philosophy Debate', events: [] },
  },
  {
    id: 'chat-2',
    type: 'chat',
    providers: ['anthropic', 'openai'],
    title: 'Tech Talk',
    data: { id: 'chat-2', title: 'Tech Talk', events: [] },
  },
];

const compareEntries: DemoRecordingEntry<DemoCompare>[] = [
  {
    id: 'compare-1',
    type: 'compare',
    providers: ['openai', 'anthropic'],
    title: 'Model Showdown',
    data: { id: 'compare-1', title: 'Model Showdown', category: 'model', runs: [] },
  },
];

const debateEntries: DemoRecordingEntry<DemoDebate>[] = [
  {
    id: 'debate-1',
    type: 'debate',
    providers: ['openai', 'anthropic'],
    title: 'Climate',
    topic: 'Is climate change reversible?',
    data: { id: 'debate-1', topic: 'Is climate change reversible?', participants: [], events: [] },
  },
];

const mockRecordingsIndex: Record<DemoRecordingType, Record<string, DemoRecordingEntry[]>> = {
  chat: { [mockSortProviders(chatEntries[0].providers)]: chatEntries },
  compare: { [mockSortProviders(compareEntries[0].providers)]: compareEntries },
  debate: { [mockSortProviders(debateEntries[0].providers)]: debateEntries },
};

const mockRecordingsByIdMap = new Map<string, DemoRecordingEntry>(
  [...chatEntries, ...compareEntries, ...debateEntries].map(entry => [entry.id, entry]),
);

const mockComboKey = jest.fn((providers: string[]) => mockSortProviders(providers));
const mockGetRecordingsByProviders = jest.fn(
  (type: DemoRecordingType, providers: string[]) =>
    mockRecordingsIndex[type]?.[mockSortProviders(providers)] || [],
);

jest.mock('@/assets/demo/recordingsManifest', () => ({
  comboKey: (providers: string[]) => mockComboKey(providers),
  getRecordingsByProviders: (type: DemoRecordingType, providers: string[]) =>
    mockGetRecordingsByProviders(type, providers),
  recordingsById: mockRecordingsByIdMap,
}));

const loadDemoContentService = () => {
  let svc: typeof import('@/services/demo/DemoContentService').DemoContentService;
  jest.isolateModules(() => {
    svc = (require('@/services/demo/DemoContentService') as typeof import('@/services/demo/DemoContentService')).DemoContentService;
  });
  return svc!;
};

describe('DemoContentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates combo key generation to manifest helper', () => {
    const DemoContentService = loadDemoContentService();
    const key = DemoContentService.comboKey(['openai', 'anthropic']);
    expect(mockComboKey).toHaveBeenCalledWith(['openai', 'anthropic']);
    expect(key).toBe(mockSortProviders(['openai', 'anthropic']));
  });

  it('rotates chat samples for repeated requests', async () => {
    const DemoContentService = loadDemoContentService();
    const first = await DemoContentService.getChatSampleForProviders(['openai', 'anthropic']);
    const second = await DemoContentService.getChatSampleForProviders(['anthropic', 'openai']);

    expect(first?.id).toBe('chat-1');
    expect(second?.id).toBe('chat-2');
  });

  it('lists samples with titles and returns deep clones', async () => {
    const DemoContentService = loadDemoContentService();
    const list = DemoContentService.listCompareSamples(['openai', 'anthropic']);
    expect(list).toEqual([{ id: 'compare-1', title: 'Model Showdown' }]);

    const compare = await DemoContentService.findCompareById('compare-1');
    expect(compare).not.toBeNull();
    if (!compare) throw new Error('expected compare-1 to resolve');
    compare.id = 'mutated';

    const compareAgain = await DemoContentService.findCompareById('compare-1');
    expect(compareAgain?.id).toBe('compare-1');
  });

  it('notifies subscribers on clearCache and ingestRecording', async () => {
    const DemoContentService = loadDemoContentService();
    const listener = jest.fn();
    const unsubscribe = DemoContentService.subscribe(listener);

    DemoContentService.clearCache();
    expect(listener).toHaveBeenCalledTimes(1);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    await DemoContentService.ingestRecording(null);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(
      '[DemoContentService] Recording captured. Run `node scripts/demo/build-recordings-manifest.js` to regenerate the manifest.',
    );
    process.env.NODE_ENV = originalEnv;
    warnSpy.mockRestore();
    unsubscribe();
  });

  it('lists debate samples with fallback title/topic', () => {
    const DemoContentService = loadDemoContentService();
    const list = DemoContentService.listDebateSamples(['openai', 'anthropic']);
    expect(list).toEqual([
      {
        id: 'debate-1',
        title: 'Climate',
        topic: 'Is climate change reversible?',
      },
    ]);
  });
});
