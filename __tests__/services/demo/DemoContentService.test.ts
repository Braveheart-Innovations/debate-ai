import type { DemoChat, DemoCompare, DemoDebate } from '@/types/demo';

type DemoEntry<T> = {
  id: string;
  type: 'chat' | 'compare' | 'debate';
  providers: string[];
  title?: string;
  topic?: string;
  data: T;
};

const sortProviders = (providers: string[]) => [...providers].sort().join('+');

const chatEntries: DemoEntry<DemoChat>[] = [
  {
    id: 'chat-1',
    type: 'chat',
    providers: ['anthropic', 'openai'],
    title: 'Philosophy Debate',
    data: { id: 'chat-1', messages: [] } as unknown as DemoChat,
  },
  {
    id: 'chat-2',
    type: 'chat',
    providers: ['anthropic', 'openai'],
    title: 'Tech Talk',
    data: { id: 'chat-2', messages: [] } as unknown as DemoChat,
  },
];

const compareEntries: DemoEntry<DemoCompare>[] = [
  {
    id: 'compare-1',
    type: 'compare',
    providers: ['openai', 'anthropic'],
    title: 'Model Showdown',
    data: { id: 'compare-1', prompts: [] } as unknown as DemoCompare,
  },
];

const debateEntries: DemoEntry<DemoDebate>[] = [
  {
    id: 'debate-1',
    type: 'debate',
    providers: ['openai', 'anthropic'],
    title: 'Climate',
    topic: 'Is climate change reversible?',
    data: { id: 'debate-1', rounds: [] } as unknown as DemoDebate,
  },
];

const mockRecordingsIndex: Record<string, Record<string, DemoEntry<any>[]>> = {
  chat: { [sortProviders(chatEntries[0].providers)]: chatEntries },
  compare: { [sortProviders(compareEntries[0].providers)]: compareEntries },
  debate: { [sortProviders(debateEntries[0].providers)]: debateEntries },
};

const mockRecordingsByIdMap = new Map<string, DemoEntry<any>>(
  [...chatEntries, ...compareEntries, ...debateEntries].map(entry => [entry.id, entry]),
);

const comboKeyMock = jest.fn((providers: string[]) => sortProviders(providers));
const getRecordingsByProvidersMock = jest.fn(
  (type: 'chat' | 'compare' | 'debate', providers: string[]) =>
    mockRecordingsIndex[type]?.[sortProviders(providers)] || [],
);

jest.mock('@/assets/demo/recordingsManifest', () => ({
  comboKey: jest.fn((providers: string[]) => sortProviders(providers)),
  getRecordingsByProviders: jest.fn((type: string, providers: string[]) =>
    mockRecordingsIndex[type]?.[sortProviders(providers)] || [],
  ),
  recordingsById: mockRecordingsByIdMap,
}));

const { comboKey } = require('@/assets/demo/recordingsManifest') as {
  comboKey: jest.Mock;
};
comboKey.mockImplementation(comboKeyMock);
const { getRecordingsByProviders } = require('@/assets/demo/recordingsManifest') as {
  getRecordingsByProviders: jest.Mock;
};
getRecordingsByProviders.mockImplementation(getRecordingsByProvidersMock);

const loadDemoContentService = () => {
  let svc: typeof import('@/services/demo/DemoContentService').DemoContentService;
  jest.isolateModules(() => {
    svc = require('@/services/demo/DemoContentService').DemoContentService;
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
    expect(comboKeyMock).toHaveBeenCalledWith(['openai', 'anthropic']);
    expect(key).toBe(sortProviders(['openai', 'anthropic']));
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
    (compare as DemoCompare).id = 'mutated';

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
