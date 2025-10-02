import { SessionFilterService } from '@/services/history/SessionFilterService';
import type { ChatSession, Message } from '@/types';

const createAI = (id: string, provider: ChatSession['selectedAIs'][number]['provider'], name: string) => ({
  id,
  provider,
  name,
  model: 'test-model',
});

const createMessage = (id: string, content: string, senderType: Message['senderType'] = 'user'): Message => ({
  id,
  sender: senderType === 'user' ? 'You' : 'Claude',
  senderType,
  content,
  timestamp: Date.now(),
});

const createSession = (overrides: Partial<ChatSession>): ChatSession => ({
  id: 'session-1',
  selectedAIs: [createAI('claude', 'claude', 'Claude')],
  messages: [],
  isActive: true,
  createdAt: Date.now(),
  sessionType: 'chat',
  lastMessageAt: Date.now(),
  ...overrides,
});

describe('SessionFilterService', () => {
  let service: SessionFilterService;
  let sessions: ChatSession[];
  const now = new Date('2025-01-10T10:00:00Z').getTime();

  beforeEach(() => {
    (SessionFilterService as unknown as { instance?: SessionFilterService }).instance = undefined;
    service = SessionFilterService.getInstance();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    sessions = [
      createSession({
        id: 's1',
        selectedAIs: [createAI('claude', 'claude', 'Claude')],
        messages: [
          createMessage('m1', 'Discuss climate policy'),
          createMessage('m2', 'AI debate about energy', 'ai'),
        ],
        createdAt: now,
        lastMessageAt: now,
      }),
      createSession({
        id: 's2',
        selectedAIs: [createAI('gpt', 'openai', 'GPT-5'), createAI('gemini', 'google', 'Gemini')],
        messages: [
          createMessage('m3', 'Summary of conversation'),
          createMessage('m4', 'Gemini adds a thought', 'ai'),
          createMessage('m5', 'Moderator follow up'),
          createMessage('m6', 'Another angle from GPT', 'ai'),
        ],
        createdAt: now - 3 * 24 * 60 * 60 * 1000,
        lastMessageAt: now - 2 * 24 * 60 * 60 * 1000,
      }),
      createSession({
        id: 's3',
        selectedAIs: [createAI('mistral', 'mistral', 'Mistral Hermes')],
        messages: [createMessage('m7', 'Short note')],
        createdAt: now - 40 * 24 * 60 * 60 * 1000,
        lastMessageAt: now - 40 * 24 * 60 * 60 * 1000,
      }),
      createSession({
        id: 's4',
        selectedAIs: [createAI('claude', 'claude', 'Claude'), createAI('grok', 'grok', 'Grok')],
        messages: Array.from({ length: 12 }, (_, idx) =>
          createMessage(`m8${idx}`, `Long form ${idx}`, idx % 2 === 0 ? 'ai' : 'user')
        ),
        createdAt: now - 6 * 24 * 60 * 60 * 1000,
        lastMessageAt: now - 6 * 24 * 60 * 60 * 1000,
      }),
    ];
  });

  afterEach(() => {
    jest.restoreAllMocks();
    service.clearCache();
  });

  it('filters by search term and caches results', () => {
    const result = service.filterBySearchTerm(sessions, 'Claude');
    expect(result.map(s => s.id)).toEqual(['s1', 's4']);

    const internals = service as unknown as { searchCache: Map<string, ChatSession[]>; regexCache: Map<string, RegExp> };
    expect(internals.searchCache.size).toBeGreaterThan(0);
    expect(internals.regexCache.size).toBeGreaterThan(0);

    // Same search should hit the cache even if sessions array changes
    sessions[0].selectedAIs[0].name = 'Changed';
    const cached = service.filterBySearchTerm(sessions, 'Claude');
    expect(cached.map(s => s.id)).toEqual(['s1', 's4']);
  });

  it('finds search matches across AI names and messages', () => {
    const aiMatches = service.findSearchMatches(sessions, 'Claude');
    expect(aiMatches.some(match => match.matchType === 'aiName')).toBe(true);

    const messageMatches = service.findSearchMatches(sessions, 'policy');
    expect(messageMatches.some(match => match.matchType === 'messageContent')).toBe(true);
  });

  it('filters using advanced options', () => {
    const dateFiltered = service.filterByOptions(sessions, {
      dateRange: {
        start: new Date(now - 5 * 24 * 60 * 60 * 1000),
        end: new Date(now - 2 * 24 * 60 * 60 * 1000),
      },
    });
    expect(dateFiltered.map(s => s.id)).toEqual(['s2']);

    const providerFiltered = service.filterByOptions(sessions, { aiProviders: ['google'] });
    expect(providerFiltered.map(s => s.id)).toEqual(['s2']);

    const messageCountFiltered = service.filterByOptions(sessions, { messageCountRange: { min: 3, max: 10 } });
    expect(messageCountFiltered.map(s => s.id)).toContain('s2');
  });

  it('supports AI combinations, activity levels, and recency filters', () => {
    const combos = service.filterByAICombination(sessions, ['Claude', 'Grok']);
    expect(combos.map(s => s.id)).toEqual(['s4']);

    const activityLow = service.filterByActivity(sessions, 'low');
    const activityHigh = service.filterByActivity(sessions, 'high');
    expect(activityLow.some(s => s.id === 's3')).toBe(true);
    expect(activityHigh.some(s => s.id === 's4')).toBe(true);

    jest.useFakeTimers();
    jest.setSystemTime(new Date(now));
    const recencyWeek = service.filterByRecency(sessions, 'week');
    expect(recencyWeek.map(s => s.id)).toEqual(['s1', 's2', 's4']);
    const recencyMonth = service.filterByRecency(sessions, 'month');
    expect(recencyMonth.map(s => s.id)).toEqual(['s1', 's2', 's4']);
    jest.useRealTimers();
  });

  it('applies registered strategies and exposes availability', () => {
    const hasMessages = service.filterByStrategy(sessions, 'has-messages');
    expect(hasMessages.length).toBe(4);

    const spy = jest.spyOn(console, 'warn').mockImplementation();
    const fallback = service.filterByStrategy(sessions, 'missing');
    expect(fallback).toEqual(sessions);
    expect(spy).toHaveBeenCalled();

    service.registerStrategy({ name: 'custom', predicate: session => session.id === 's2' });
    const custom = service.filterByStrategy(sessions, 'custom');
    expect(custom.map(s => s.id)).toEqual(['s2']);

    expect(service.getAvailableStrategies()).toEqual(expect.arrayContaining(['has-messages', 'custom']));
  });

  it('returns full text search details and highlight mapping', () => {
    const results = service.fullTextSearch(sessions, 'debate');
    expect(results.sessions.map(s => s.id)).toEqual(['s1']);
    expect(results.matches[0].sessionId).toBe('s1');
    expect(results.highlightMap.get('s1')).toEqual(expect.arrayContaining(['AI debate about energy']));
  });

  it('runs smart searches for dates, providers, and free text', () => {
    const date = service.smartSearch(sessions, '1/7/2025');
    expect(date.length).toBeGreaterThan(0);

    const provider = service.smartSearch(sessions, 'claude');
    expect(provider.map(s => s.id)).toEqual(expect.arrayContaining(['s1', 's4']));

    const text = service.smartSearch(sessions, 'policy');
    expect(text.map(s => s.id)).toEqual(['s1']);
  });

  it('clears caches on demand', () => {
    service.filterBySearchTerm(sessions, 'Claude');
    const internals = service as unknown as { searchCache: Map<string, ChatSession[]>; regexCache: Map<string, RegExp> };
    expect(internals.searchCache.size).toBeGreaterThan(0);
    service.clearCache();
    expect(internals.searchCache.size).toBe(0);
    expect(internals.regexCache.size).toBe(0);
  });
});
