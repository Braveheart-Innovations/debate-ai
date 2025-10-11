import type { DemoChat, DemoCompare, DemoDebate, DemoMessageEvent } from '@/types/demo';

const buildPrimeChatSample = (): DemoChat => ({
  id: 'chat-prime',
  events: [
    { type: 'message', role: 'user', content: 'Hello' },
    { type: 'message', role: 'assistant', content: 'Claude intro', speakerProvider: 'claude' },
    { type: 'stream', role: 'assistant', content: ' detail', speakerProvider: 'claude' },
    { type: 'message', role: 'assistant', content: 'OpenAI intro', speakerProvider: 'openai' },
  ] as DemoMessageEvent[],
} as unknown as DemoChat);

const buildChatScriptSample = (): DemoChat => ({
  id: 'chat-1',
  events: [
    { type: 'message', role: 'user', content: 'Intro question' },
    { type: 'message', role: 'assistant', content: 'Claude intro', speakerProvider: 'claude' },
    { type: 'message', role: 'assistant', content: 'OpenAI intro', speakerProvider: 'openai' },
    { type: 'message', role: 'user', content: 'Tell me more' },
    { type: 'stream', role: 'assistant', content: 'Detail ', speakerProvider: 'claude' },
    { type: 'stream', role: 'assistant', content: 'continued', speakerProvider: 'claude' },
    { type: 'message', role: 'assistant', content: 'Answer from OpenAI', speakerProvider: 'openai' },
    { type: 'message', role: 'assistant', content: 'Gemini reply', speakerProvider: 'google' },
  ] as DemoMessageEvent[],
} as unknown as DemoChat);

const buildCompareSample = (): DemoCompare => ({
  id: 'compare-1',
  title: 'Compare Run',
  runs: [
    {
      prompt: 'Run prompt',
      columns: [
        {
          name: 'Claude',
          events: [
            { type: 'message', role: 'assistant', content: 'Claude answer' },
          ],
        },
        {
          name: 'ChatGPT',
          events: [
            { type: 'stream', role: 'assistant', content: 'OpenAI chunk' },
            { type: 'stream', role: 'assistant', content: ' appended' },
          ],
        },
      ],
    },
  ],
} as unknown as DemoCompare);

const buildDebateSample = (): DemoDebate => ({
  id: 'debate-1',
  events: [
    { type: 'stream', role: 'assistant', content: 'First ', speakerProvider: 'claude' },
    { type: 'stream', role: 'assistant', content: 'turn', speakerProvider: 'claude' },
    { type: 'message', role: 'assistant', content: 'OpenAI reply', speakerProvider: 'openai' },
  ],
} as unknown as DemoDebate);

const loadRouter = () => {
  let module: typeof import('@/services/demo/DemoPlaybackRouter');
  jest.isolateModules(() => {
    module = require('@/services/demo/DemoPlaybackRouter');
  });
    // @ts-expect-error set by isolateModules
  return module!;
};

describe('DemoPlaybackRouter', () => {
  it('primes chat queues from sample events', () => {
    const router = loadRouter();
    router.primeChat(buildPrimeChatSample());
    expect(router.nextProviderResponse('claude')).toBe('Claude intro detail');
    expect(router.nextProviderResponse('openai')).toBe('OpenAI intro');
    expect(router.nextProviderResponse('openai')).toBeUndefined();
  });

  it('builds chat turns and tracks completion', () => {
    const router = loadRouter();
    router.loadChatScript(buildChatScriptSample());
    expect(router.hasNextChatTurn()).toBe(true);

    let { user, providers } = router.primeNextChatTurn();
    expect(user).toBe('Intro question');
    expect(providers).toEqual(['claude', 'openai']);
    expect(router.getCurrentTurnProviders()).toEqual(['claude', 'openai']);
    expect(router.isTurnComplete()).toBe(false);
    router.markProviderComplete('claude');
    expect(router.isTurnComplete()).toBe(false);
    router.markProviderComplete('openai');
    expect(router.isTurnComplete()).toBe(true);

    ({ user, providers } = router.primeNextChatTurn());
    expect(user).toBe('Tell me more');
    expect(providers).toEqual(['claude', 'openai', 'google']);
    expect(router.hasNextChatTurn()).toBe(false);
  });

  it('builds compare script and primes turns', () => {
    const router = loadRouter();
    router.loadCompareScript(buildCompareSample());
    expect(router.hasNextCompareTurn()).toBe(true);
    const turn = router.primeNextCompareTurn();
    expect(turn.user).toBe('Run prompt');
    expect(router.nextProviderResponse('claude')).toBe('Claude answer');
    expect(router.nextProviderResponse('openai')).toBe('OpenAI chunk appended');
    expect(router.nextProviderResponse('google')).toBeUndefined();
  });

  it('primes debate queues aggregating stream chunks', () => {
    const router = loadRouter();
    router.primeDebate(buildDebateSample());
    expect(router.nextProviderResponse('claude')).toBe('First turn');
    expect(router.nextProviderResponse('openai')).toBe('OpenAI reply');
  });

  it('primes compare first run for legacy flow', () => {
    const router = loadRouter();
    router.primeCompare(buildCompareSample());
    expect(router.nextProviderResponse('claude')).toBe('Claude answer');
    expect(router.nextProviderResponse('openai')).toBe('OpenAI chunk appended');
  });
});
