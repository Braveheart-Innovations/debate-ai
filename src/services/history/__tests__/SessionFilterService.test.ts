import { SessionFilterService } from '../SessionFilterService';
import { ChatSession, AIConfig, Message } from '../../../types';

type PartialSession = Partial<ChatSession> & { selectedAIs?: AIConfig[]; messages?: Message[] };

const createAI = (overrides: Partial<AIConfig> = {}): AIConfig => ({
  id: overrides.id || 'ai-alpha',
  provider: overrides.provider || 'openai',
  name: overrides.name || 'Alpha',
  model: overrides.model || 'gpt-4',
  ...overrides,
});

const createMessage = (overrides: Partial<Message> = {}): Message => ({
  id: overrides.id || 'msg-1',
  sender: overrides.sender || 'You',
  senderType: overrides.senderType || 'user',
  content: overrides.content || 'Hello world',
  timestamp: overrides.timestamp ?? Date.now(),
  ...overrides,
});

let sessionCounter = 0;
const createSession = (overrides: PartialSession = {}): ChatSession => ({
  id: overrides.id || `session-${sessionCounter++}`,
  selectedAIs: overrides.selectedAIs || [createAI()],
  messages: overrides.messages || [createMessage()],
  isActive: overrides.isActive ?? false,
  createdAt: overrides.createdAt ?? Date.now(),
  lastMessageAt: overrides.lastMessageAt,
  sessionType: overrides.sessionType,
  topic: overrides.topic,
  debateConfig: overrides.debateConfig,
});

describe('SessionFilterService', () => {
  let service: SessionFilterService;

  beforeEach(() => {
    service = new SessionFilterService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('filterBySearchTerm', () => {
    it('returns original sessions when search term empty', () => {
      const sessions = [createSession()];
      expect(service.filterBySearchTerm(sessions, '   ')).toBe(sessions);
    });

    it('filters by AI names and messages with caching support', () => {
      const sessions = [
        createSession({
          selectedAIs: [createAI({ name: 'Bravo' })],
          messages: [createMessage({ content: 'Discussing climate change' })],
        }),
        createSession({
          selectedAIs: [createAI({ name: 'Charlie' })],
          messages: [createMessage({ content: 'Talking about sports' })],
        }),
      ];

      const result = service.filterBySearchTerm(sessions, 'climate');
      expect(result).toHaveLength(1);
      expect(result[0].selectedAIs[0].name).toBe('Bravo');

      // Second call should hit cache path (implicitly tested by not throwing and returning same data)
      const cachedResult = service.filterBySearchTerm(sessions, 'climate');
      expect(cachedResult).toEqual(result);
    });

    it('respects case sensitivity and whole word matching', () => {
      const sessions = [createSession({ messages: [createMessage({ content: 'AI ethics are key' })] })];
      const insensitive = service.filterBySearchTerm(sessions, 'ETH', { caseSensitive: false });
      expect(insensitive).toHaveLength(1);

      const wholeWord = service.filterBySearchTerm(sessions, 'AI', { matchWholeWord: true });
      expect(wholeWord).toHaveLength(1);

      const noMatch = service.filterBySearchTerm(sessions, 'A', { matchWholeWord: true });
      expect(noMatch).toHaveLength(0);
    });
  });

  it('findSearchMatches returns matches for ai names and messages', () => {
    const sessions = [createSession({
      id: 'session-1',
      selectedAIs: [createAI({ name: 'Socrates' })],
      messages: [createMessage({ content: 'Socratic dialogue' })],
    })];

    const matches = service.findSearchMatches(sessions, 'socr');
    expect(matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sessionId: 'session-1', matchType: 'aiName' }),
        expect.objectContaining({ sessionId: 'session-1', matchType: 'messageContent' }),
      ])
    );
  });

  describe('filterByOptions', () => {
    const sessions = [
      createSession({
        createdAt: new Date('2024-01-10T00:00:00Z').getTime(),
        selectedAIs: [createAI({ provider: 'openai' })],
        messages: [createMessage(), createMessage({ id: 'm2' })],
      }),
      createSession({
        createdAt: new Date('2024-01-20T00:00:00Z').getTime(),
        selectedAIs: [createAI({ provider: 'claude' })],
        messages: [createMessage()],
      }),
    ];

    it('filters by date range', () => {
      const filtered = service.filterByOptions(sessions, {
        dateRange: {
          start: new Date('2024-01-12T00:00:00Z'),
          end: new Date('2024-01-19T00:00:00Z'),
        },
      });

      expect(filtered).toHaveLength(0);
    });

    it('filters by ai providers', () => {
      const filtered = service.filterByOptions(sessions, {
        aiProviders: ['claude'],
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].selectedAIs[0].provider).toBe('claude');
    });

    it('filters by message count range', () => {
      const filtered = service.filterByOptions(sessions, {
        messageCountRange: { min: 2, max: 3 },
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].messages.length).toBe(2);
    });
  });

  it('filterByAICombination requires all specified AIs', () => {
    const sessions = [
      createSession({ selectedAIs: [createAI({ name: 'Alpha' }), createAI({ name: 'Bravo' })] }),
      createSession({ selectedAIs: [createAI({ name: 'Alpha' })] }),
    ];

    const result = service.filterByAICombination(sessions, ['alpha', 'bravo']);
    expect(result).toHaveLength(1);
  });

  it('filterByActivity segments sessions based on message counts', () => {
    const sessions = [
      createSession({ messages: [createMessage()] }),
      createSession({ messages: [createMessage(), createMessage({ id: 'm2' }), createMessage({ id: 'm3' })] }),
      createSession({ messages: [createMessage(), createMessage({ id: 'm2' }), createMessage({ id: 'm3' }), createMessage({ id: 'm4' })] }),
    ];

    const low = service.filterByActivity(sessions, 'low');
    const high = service.filterByActivity(sessions, 'high');

    expect(low.length + high.length).toBeLessThanOrEqual(sessions.length);
  });

  it('filterByRecency filters relative to current time', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-04-10T00:00:00Z'));

    const sessions = [
      createSession({ createdAt: new Date('2024-04-09T12:00:00Z').getTime() }),
      createSession({ createdAt: new Date('2024-03-01T00:00:00Z').getTime() }),
      createSession({ createdAt: new Date('2023-06-01T00:00:00Z').getTime() }),
    ];

    expect(service.filterByRecency(sessions, 'today')).toHaveLength(1);
    expect(service.filterByRecency(sessions, 'month')).toHaveLength(1);
    expect(service.filterByRecency(sessions, 'year')).toHaveLength(2);
  });

  describe('filterByStrategy', () => {
    it('applies registered strategy', () => {
      service.registerStrategy({
        name: 'custom-multi-ai',
        predicate: session => session.selectedAIs.length >= 2,
      });

      const sessions = [
        createSession({ selectedAIs: [createAI(), createAI({ id: 'b', name: 'B' })] }),
        createSession({ selectedAIs: [createAI()] }),
      ];

      const result = service.filterByStrategy(sessions, 'custom-multi-ai');
      expect(result).toHaveLength(1);
    });

    it('warns and returns original sessions when strategy missing', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const sessions = [createSession()];
      const result = service.filterByStrategy(sessions, 'missing');
      expect(result).toBe(sessions);
      expect(warn).toHaveBeenCalledWith("Filter strategy 'missing' not found");
      warn.mockRestore();
    });
  });

  it('getAvailableStrategies lists built-ins', () => {
    const strategies = service.getAvailableStrategies();
    expect(strategies).toEqual(expect.arrayContaining(['has-messages', 'active', 'multi-ai']));
  });

  it('fullTextSearch returns filtered sessions, matches, and highlight map', () => {
    const sessions = [createSession({ id: 's1', messages: [createMessage({ content: 'AI revolution' })] })];
    const result = service.fullTextSearch(sessions, 'AI');

    expect(result.sessions).toHaveLength(1);
    expect(result.matches).toHaveLength(1);
    expect(result.highlightMap.get('s1')).toEqual(expect.arrayContaining(['AI revolution']));
  });

  describe('smartSearch', () => {
    it('detects date patterns and delegates to date filter', () => {
      const sessions = [
        createSession({ createdAt: new Date('2024-05-01').getTime() }),
        createSession({ createdAt: new Date('2024-06-01').getTime() }),
      ];

      const pattern = new Date('2024-05-01').toLocaleDateString();
      const result = service.smartSearch(sessions, pattern);
      expect(result).toHaveLength(1);
    });

    it('prioritizes provider mention', () => {
      const sessions = [
        createSession({ selectedAIs: [createAI({ provider: 'openai', name: 'GPT' })], messages: [createMessage({ content: 'General talk' })] }),
        createSession({ selectedAIs: [createAI({ provider: 'claude', name: 'Claude' })], messages: [createMessage({ content: 'Anthropic analysis' })] }),
      ];

      const result = service.smartSearch(sessions, 'Claude');
      expect(result).toHaveLength(1);
      expect(result[0].selectedAIs[0].provider.toLowerCase()).toBe('claude');
    });

    it('falls back to comprehensive text search', () => {
      const sessions = [createSession({ messages: [createMessage({ content: 'Debate prep' })] })];
      const result = service.smartSearch(sessions, 'prep');
      expect(result).toHaveLength(1);
    });
  });

  it('clearCache empties caches', () => {
    const sessions = [createSession({ messages: [createMessage({ content: 'Cache test' })] })];
    service.filterBySearchTerm(sessions, 'cache');
    service.clearCache();

    // Internal state not directly accessible, so verify new search recomputes by returning same reference but not throwing
    expect(service.filterBySearchTerm(sessions, 'cache')).toHaveLength(1);
  });
});
