import { SessionSortService } from '../SessionSortService';
import { ChatSession, AIConfig, Message } from '../../../types';

const createAI = (overrides: Partial<AIConfig> = {}): AIConfig => ({
  id: 'ai-alpha',
  provider: 'openai',
  name: 'Alpha',
  model: 'gpt-4',
  ...overrides,
});

const createMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'msg-1',
  sender: 'You',
  senderType: 'user',
  content: 'Hello',
  timestamp: 1,
  ...overrides,
});

let idCounter = 0;
const createSession = (overrides: Partial<ChatSession> = {}): ChatSession => ({
  id: `session-${idCounter++}`,
  selectedAIs: overrides.selectedAIs || [createAI()],
  messages: overrides.messages || [createMessage()],
  isActive: overrides.isActive ?? false,
  createdAt: overrides.createdAt ?? Date.now(),
  lastMessageAt: overrides.lastMessageAt,
  sessionType: overrides.sessionType,
  topic: overrides.topic,
  debateConfig: overrides.debateConfig,
});

describe('SessionSortService', () => {
  let service: SessionSortService;

  beforeEach(() => {
    service = new SessionSortService();
  });

  it('sortByDate orders by createdAt desc by default', () => {
    const sessions = [
      createSession({ createdAt: 10 }),
      createSession({ createdAt: 30 }),
      createSession({ createdAt: 20 }),
    ];

    const sorted = service.sortByDate(sessions);
    expect(sorted.map(s => s.createdAt)).toEqual([30, 20, 10]);
  });

  it('sortByLastActivity uses lastMessageAt fallback to createdAt', () => {
    const sessions = [
      createSession({ createdAt: 10, lastMessageAt: 20 }),
      createSession({ createdAt: 20 }),
      createSession({ createdAt: 30, lastMessageAt: 25 }),
    ];

    const sorted = service.sortByLastActivity(sessions);
    expect(sorted.map(s => s.createdAt)).toEqual([
      sessions[2].createdAt,
      sessions[0].createdAt,
      sessions[1].createdAt,
    ]);
  });

  it('sortByMessageCount orders by number of messages', () => {
    const sessions = [
      createSession({ messages: [createMessage()] }),
      createSession({ messages: [createMessage(), createMessage({ id: 'm2' })] }),
      createSession({ messages: [] }),
    ];

    const sorted = service.sortByMessageCount(sessions);
    expect(sorted.map(s => s.messages.length)).toEqual([2, 1, 0]);
  });

  it('sortByAICount orders by AI diversity', () => {
    const sessions = [
      createSession({ selectedAIs: [createAI(), createAI({ id: 'ai-beta', name: 'Beta' })] }),
      createSession({ selectedAIs: [createAI()] }),
    ];

    const sorted = service.sortByAICount(sessions);
    expect(sorted.map(s => s.selectedAIs.length)).toEqual([2, 1]);
  });

  it('sortByAINames sorts alphabetically', () => {
    const sessions = [
      createSession({ selectedAIs: [createAI({ name: 'Zeta' })] }),
      createSession({ selectedAIs: [createAI({ name: 'Alpha' })] }),
      createSession({ selectedAIs: [createAI({ name: 'Beta' })] }),
    ];

    const sortedAsc = service.sortByAINames(sessions);
    expect(sortedAsc.map(s => s.selectedAIs[0].name)).toEqual(['Alpha', 'Beta', 'Zeta']);

    const sortedDesc = service.sortByAINames(sessions, 'desc');
    expect(sortedDesc.map(s => s.selectedAIs[0].name)).toEqual(['Zeta', 'Beta', 'Alpha']);
  });

  it('sortByConversationQuality sorts by messages per AI', () => {
    const sessions = [
      createSession({
        messages: [createMessage(), createMessage({ id: 'm2' }), createMessage({ id: 'm3' })],
        selectedAIs: [createAI(), createAI({ id: 'ai-beta', name: 'Beta' })],
      }),
      createSession({
        messages: [createMessage(), createMessage({ id: 'm2' })],
        selectedAIs: [createAI()],
      }),
    ];

    const sorted = service.sortByConversationQuality(sessions);
    expect(sorted[0].messages.length / sorted[0].selectedAIs.length).toBeCloseTo(2);
  });

  describe('sort', () => {
    const sessions = [
      createSession({ createdAt: 1, messages: [], selectedAIs: [] }),
      createSession({ createdAt: 2, messages: [createMessage()], selectedAIs: [createAI()] }),
    ];

    it('uses createdAt when field is createdAt', () => {
      const sorted = service.sort(sessions, { field: 'createdAt', direction: 'asc' });
      expect(sorted[0].createdAt).toBe(1);
    });

    it('uses lastMessageAt strategy', () => {
      const custom = [
        createSession({ createdAt: 1, lastMessageAt: 30 }),
        createSession({ createdAt: 2, lastMessageAt: 20 }),
      ];
      const sorted = service.sort(custom, { field: 'lastMessageAt', direction: 'asc' });
      expect(sorted[0].lastMessageAt).toBe(20);
    });

    it('defaults to date sort for unknown field', () => {
      const sorted = service.sort(sessions, { field: 'unknown' as never, direction: 'asc' });
      expect(sorted.map(s => s.createdAt)).toEqual([1, 2]);
    });
  });

  describe('sortByStrategy', () => {
    it('uses registered strategy with compareFn', () => {
      service.registerStrategy({
        name: 'shortest',
        field: 'messageCount',
        direction: 'asc',
        compareFn: (a, b) => a.messages.length - b.messages.length,
      });

      const sessions = [
        createSession({ messages: [createMessage(), createMessage({ id: 'm2' })] }),
        createSession({ messages: [createMessage()] }),
      ];

      const sorted = service.sortByStrategy(sessions, 'shortest');
      expect(sorted[0].messages).toHaveLength(1);
    });

    it('falls back to default and warns when strategy missing', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const sessions = [
        createSession({ createdAt: 10 }),
        createSession({ createdAt: 20 }),
      ];

      const sorted = service.sortByStrategy(sessions, 'missing');
      expect(sorted[0].createdAt).toBe(20);
      expect(warn).toHaveBeenCalledWith(
        "Sort strategy 'missing' not found, using default date sort"
      );
      warn.mockRestore();
    });

    it('guards against invalid field on strategy', () => {
      service.registerStrategy({
        name: 'bad-field',
        field: 'invalid' as never,
        direction: 'desc',
      });
      const sessions = [
        createSession({ createdAt: 10 }),
        createSession({ createdAt: 30 }),
      ];

      const sorted = service.sortByStrategy(sessions, 'bad-field');
      expect(sorted[0].createdAt).toBe(30);
    });
  });

  it('getAvailableStrategies returns registered names', () => {
    const names = service.getAvailableStrategies();
    expect(names).toEqual(expect.arrayContaining(['recent', 'active', 'complex']));
  });

  it('multiSort applies criteria sequentially', () => {
    const sessions = [
      createSession({ createdAt: 1, messages: [createMessage()], selectedAIs: [createAI(), createAI({ id: 'b', name: 'B' })] }),
      createSession({ createdAt: 1, messages: [createMessage(), createMessage({ id: 'm2' })], selectedAIs: [createAI()] }),
      createSession({ createdAt: 2, messages: [createMessage()], selectedAIs: [createAI()] }),
    ];

    const sorted = service.multiSort(sessions, [
      { field: 'createdAt', direction: 'asc' },
      { field: 'messageCount', direction: 'desc' },
      { field: 'aiCount', direction: 'asc' },
    ]);

    expect(sorted[0].messages).toHaveLength(2);
    expect(sorted[1].selectedAIs.length).toBe(2);
  });

  it('smartSort favors recency and activity', () => {
    const sessions = [
      createSession({
        createdAt: 1,
        lastMessageAt: 2,
        messages: [createMessage()],
        selectedAIs: [createAI()],
      }),
      createSession({
        createdAt: 5,
        lastMessageAt: 6,
        messages: [createMessage(), createMessage({ id: 'm2' })],
        selectedAIs: [createAI(), createAI({ id: 'b', name: 'B' })],
      }),
    ];

    const sorted = service.smartSort(sessions);
    expect(sorted[0].createdAt).toBe(sessions[0].createdAt);
  });

  it('groupByDate buckets sessions by relative recency and sorts inside groups', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-03-10T12:00:00Z'));

    const sessions = [
      createSession({ createdAt: new Date('2024-03-10T09:00:00Z').getTime() }), // Today
      createSession({ createdAt: new Date('2024-03-09T12:00:00Z').getTime() }), // Yesterday
      createSession({ createdAt: new Date('2024-03-05T12:00:00Z').getTime() }), // This Week
      createSession({ createdAt: new Date('2024-02-20T12:00:00Z').getTime() }), // This Month
      createSession({ createdAt: new Date('2023-12-15T12:00:00Z').getTime() }), // Month label
      createSession({ createdAt: new Date('2022-06-01T12:00:00Z').getTime() }), // Year label
    ];

    const groups = service.groupByDate(sessions);
    expect(Object.keys(groups)).toEqual(
      expect.arrayContaining(['Today', 'Yesterday', 'This Week', 'This Month', 'December 2023', '2022'])
    );

    const todaySessions = groups['Today'];
    expect(todaySessions[0].createdAt).toBeGreaterThanOrEqual(todaySessions[1]?.createdAt ?? 0);

    jest.useRealTimers();
  });
});
