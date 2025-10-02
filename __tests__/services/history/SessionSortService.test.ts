import { SessionSortService } from '@/services/history/SessionSortService';
import type { ChatSession } from '@/types';

const createAI = (id: string, name: string) => ({
  id,
  provider: id as ChatSession['selectedAIs'][number]['provider'],
  name,
  model: 'test-model',
});

const createSession = (overrides: Partial<ChatSession>): ChatSession => ({
  id: 'session',
  selectedAIs: [createAI('claude', 'Claude')],
  messages: [],
  isActive: true,
  createdAt: Date.now(),
  sessionType: 'chat',
  lastMessageAt: undefined,
  ...overrides,
});

describe('SessionSortService', () => {
  let service: SessionSortService;
  let sessions: ChatSession[];
  const now = new Date('2025-01-10T10:00:00Z').getTime();

  beforeEach(() => {
    (SessionSortService as unknown as { instance?: SessionSortService }).instance = undefined;
    service = SessionSortService.getInstance();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    sessions = [
      createSession({
        id: 's1',
        createdAt: now - 1 * 60 * 60 * 1000,
        lastMessageAt: now - 30 * 60 * 1000,
        messages: Array.from({ length: 4 }, (_, idx) => ({
          id: `m${idx}`,
          sender: idx % 2 === 0 ? 'You' : 'Claude',
          senderType: idx % 2 === 0 ? 'user' : 'ai',
          content: 'Message',
          timestamp: now,
        })),
        selectedAIs: [createAI('claude', 'Claude'), createAI('gemini', 'Gemini')],
      }),
      createSession({
        id: 's2',
        createdAt: now - 3 * 24 * 60 * 60 * 1000,
        lastMessageAt: now - 2 * 24 * 60 * 60 * 1000,
        messages: Array.from({ length: 2 }, (_, idx) => ({
          id: `mA${idx}`,
          sender: 'You',
          senderType: 'user',
          content: 'Short',
          timestamp: now,
        })),
        selectedAIs: [createAI('gpt', 'GPT-5')],
      }),
      createSession({
        id: 's3',
        createdAt: now - 20 * 24 * 60 * 60 * 1000,
        messages: Array.from({ length: 8 }, (_, idx) => ({
          id: `mB${idx}`,
          sender: 'Claude',
          senderType: 'ai',
          content: 'Long conversation',
          timestamp: now,
        })),
        selectedAIs: [createAI('claude', 'Claude'), createAI('grok', 'Grok'), createAI('perplexity', 'Perplexity')],
      }),
    ];
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sorts sessions by built-in fields', () => {
    const byDateDesc = service.sortByDate(sessions, 'desc').map(s => s.id);
    expect(byDateDesc[0]).toBe('s1');

    const byLastActivity = service.sortByLastActivity(sessions, 'desc').map(s => s.id);
    expect(byLastActivity[0]).toBe('s1');

    const byMessageCountAsc = service.sortByMessageCount(sessions, 'asc').map(s => s.messages.length);
    expect(byMessageCountAsc).toEqual([2, 4, 8]);

    const byAICountDesc = service.sortByAICount(sessions, 'desc').map(s => s.selectedAIs.length);
    expect(byAICountDesc).toEqual([3, 2, 1]);

    const byNamesAsc = service.sortByAINames(sessions, 'asc').map(s => s.id);
    expect(byNamesAsc).toEqual(['s1', 's3', 's2']);

    const byQuality = service.sortByConversationQuality(sessions, 'desc');
    expect(byQuality[0].id).toBe('s3');
  });

  it('sorts via generic options and strategies', () => {
    expect(service.sort(sessions, { field: 'createdAt', direction: 'asc' })[0].id).toBe('s3');
    expect(service.sort(sessions, { field: 'messageCount', direction: 'desc' })[0].id).toBe('s3');

    const alphabetical = service.sortByStrategy(sessions, 'alphabetical');
    expect(alphabetical[0].id).toBe('s1');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const fallback = service.sortByStrategy(sessions, 'missing');
    expect(fallback[0].id).toBe('s1');
    expect(warnSpy).toHaveBeenCalled();

    service.registerStrategy({ name: 'custom', compareFn: (a, b) => a.id.localeCompare(b.id) });
    const custom = service.sortByStrategy(sessions, 'custom');
    expect(custom.map(s => s.id)).toEqual(['s1', 's2', 's3']);
  });

  it('supports multi-sort and smart sort heuristics', () => {
    const multi = service.multiSort(sessions, [
      { field: 'aiCount', direction: 'desc' },
      { field: 'messageCount', direction: 'asc' },
    ]);
    expect(multi[0].id).toBe('s3');
    expect(multi[2].id).toBe('s2');

    const smart = service.smartSort(sessions);
    expect(smart[0].id).toBe('s3');
  });

  it('groups sessions by relative date buckets', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(now));
    const groups = service.groupByDate(sessions);
    expect(groups.Today?.map(s => s.id)).toEqual(expect.arrayContaining(['s1']));
    expect(groups['This Week']?.map(s => s.id)).toEqual(expect.arrayContaining(['s2']));
    expect(groups['This Month']?.map(s => s.id)).toEqual(expect.arrayContaining(['s3']));
    expect(Object.keys(groups)).toEqual(expect.arrayContaining(['Today', 'This Week', 'This Month']));
    jest.useRealTimers();
  });
});
