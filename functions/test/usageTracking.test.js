const assert = require('node:assert/strict');
const { FieldValue } = require('firebase-admin/firestore');
const test = require('node:test');

const {
  buildTokenUsageMutation,
  buildImageGenerationMutation,
  buildMediaGenerationMutation,
  monthlyCountersAfterRollover,
  normalizeSessionType,
  mapSessionTypeToFreeTier,
  computeFreeTierGate,
  freeLimitError,
  freeTierGateError,
  buildSandboxUsageUpdate,
  freeTierLimit,
} = require('../lib/usageTracking');

const DATE = '2026-06-12';
const MONTH = '2026-06';

function tokenRecord(overrides = {}) {
  return {
    messageId: 'm1',
    sessionId: 's1',
    providerId: 'claude',
    modelId: 'claude-sonnet-4-6',
    inputTokens: 600,
    outputTokens: 400,
    totalTokens: 1000,
    sessionType: 'chat',
    timestamp: Date.now(),
    ...overrides,
  };
}

test('normalizeSessionType accepts known modes and falls back to chat', () => {
  assert.equal(normalizeSessionType('debate'), 'debate');
  assert.equal(normalizeSessionType('analyze'), 'analyze');
  assert.equal(normalizeSessionType('comparison'), 'comparison');
  assert.equal(normalizeSessionType('not-a-mode'), 'chat');
  assert.equal(normalizeSessionType(undefined), 'chat');
});

test('monthlyCountersAfterRollover carries counters within the same month', () => {
  const counters = monthlyCountersAfterRollover(
    { currentMonth: MONTH, currentMonthTokens: 10, currentMonthRequests: 2, currentMonthImages: 3, currentMonthMedia: 4 },
    MONTH
  );
  assert.equal(counters.isNewMonth, false);
  assert.deepEqual(
    [counters.currentMonthTokens, counters.currentMonthRequests, counters.currentMonthImages, counters.currentMonthMedia],
    [10, 2, 3, 4]
  );
});

test('monthlyCountersAfterRollover resets every counter on a new month', () => {
  const counters = monthlyCountersAfterRollover(
    { currentMonth: '2026-05', currentMonthTokens: 10, currentMonthRequests: 2, currentMonthImages: 3, currentMonthMedia: 4 },
    MONTH
  );
  assert.equal(counters.isNewMonth, true);
  assert.deepEqual(
    [counters.currentMonthTokens, counters.currentMonthRequests, counters.currentMonthImages, counters.currentMonthMedia],
    [0, 0, 0, 0]
  );
});

test('token usage increments daily provider, model, mode, and totals', () => {
  const { daily } = buildTokenUsageMutation(
    {
      date: DATE,
      providers: { claude: { totalInputTokens: 100, totalOutputTokens: 50, totalTokens: 150, requestCount: 1 } },
      byModel: { 'claude-sonnet-4-6': { inputTokens: 100, outputTokens: 50, requests: 1 } },
      byMode: { chat: { tokens: 150, requests: 1 } },
      totalTokens: 150,
      totalRequests: 1,
    },
    null,
    tokenRecord(),
    DATE,
    MONTH
  );

  assert.deepEqual(daily.providers.claude, {
    totalInputTokens: 700,
    totalOutputTokens: 450,
    totalTokens: 1150,
    requestCount: 2,
  });
  assert.deepEqual(daily.byModel['claude-sonnet-4-6'], { inputTokens: 700, outputTokens: 450, requests: 2 });
  assert.deepEqual(daily.byMode.chat, { tokens: 1150, requests: 2 });
  assert.equal(daily.totalTokens, 1150);
  assert.equal(daily.totalRequests, 2);
});

test('token usage records byMode per session type in daily and summary docs', () => {
  const { daily, summary } = buildTokenUsageMutation(
    {},
    null,
    tokenRecord({ sessionType: 'debate' }),
    DATE,
    MONTH
  );

  assert.deepEqual(daily.byMode, { debate: { tokens: 1000, requests: 1 } });
  assert.deepEqual(summary.byMode, { debate: { tokens: 1000, requests: 1 } });
});

test('token usage clamps unknown session types to chat', () => {
  const { summary } = buildTokenUsageMutation({}, null, tokenRecord({ sessionType: 'weird' }), DATE, MONTH);
  assert.deepEqual(Object.keys(summary.byMode), ['chat']);
});

test('token usage preserves image stats on the same daily provider', () => {
  // Regression: the old write replaced the provider object, erasing images
  const images = { totalImages: 2, byDimensions: { '1024x1024': 2 }, byQuality: { hd: 2 } };
  const { daily } = buildTokenUsageMutation(
    { providers: { claude: { images, totalTokens: 0 } } },
    null,
    tokenRecord(),
    DATE,
    MONTH
  );

  assert.deepEqual(daily.providers.claude.images, images);
  assert.equal(daily.providers.claude.totalTokens, 1000);
});

test('token usage preserves media counters and unknown fields in the summary', () => {
  // Regression: the old write rebuilt the summary without media fields
  const { summary } = buildTokenUsageMutation(
    {},
    {
      currentMonth: MONTH,
      currentMonthTokens: 5,
      currentMonthRequests: 1,
      currentMonthImages: 7,
      currentMonthMedia: 3,
      totalTokensAllTime: 5,
      totalRequestsAllTime: 1,
      totalImagesAllTime: 7,
      totalMediaAllTime: 3,
      byProvider: {},
      byModel: {},
      someFutureField: 'kept',
    },
    tokenRecord(),
    DATE,
    MONTH
  );

  assert.equal(summary.totalMediaAllTime, 3);
  assert.equal(summary.currentMonthMedia, 3);
  assert.equal(summary.currentMonthImages, 7);
  assert.equal(summary.someFutureField, 'kept');
  assert.equal(summary.currentMonthTokens, 1005);
  assert.equal(summary.currentMonthRequests, 2);
});

test('token usage month rollover resets all counters before applying the record', () => {
  const { summary } = buildTokenUsageMutation(
    {},
    {
      currentMonth: '2026-05',
      currentMonthTokens: 999,
      currentMonthRequests: 99,
      currentMonthImages: 9,
      currentMonthMedia: 9,
      totalTokensAllTime: 999,
      totalRequestsAllTime: 99,
      totalImagesAllTime: 9,
      byProvider: {},
      byModel: {},
    },
    tokenRecord(),
    DATE,
    MONTH
  );

  assert.equal(summary.currentMonth, MONTH);
  assert.equal(summary.currentMonthTokens, 1000);
  assert.equal(summary.currentMonthRequests, 1);
  assert.equal(summary.currentMonthImages, 0);
  assert.equal(summary.currentMonthMedia, 0);
  assert.equal(summary.totalTokensAllTime, 1999);
});

test('image generation preserves token fields in the daily doc', () => {
  // Regression: the old write replaced the daily doc, erasing the day's
  // byModel, byMode, totalTokens, and totalRequests
  const { daily } = buildImageGenerationMutation(
    {
      date: DATE,
      providers: { openai: { totalTokens: 500, requestCount: 2 } },
      byModel: { 'gpt-5.5': { inputTokens: 300, outputTokens: 200, requests: 2 } },
      byMode: { chat: { tokens: 500, requests: 2 } },
      totalTokens: 500,
      totalRequests: 2,
    },
    null,
    { providerId: 'openai', modelId: 'dall-e-3', imageCount: 1, dimensions: '1024x1024', quality: 'hd', timestamp: Date.now() },
    DATE,
    MONTH
  );

  assert.equal(daily.totalTokens, 500);
  assert.equal(daily.totalRequests, 2);
  assert.deepEqual(daily.byModel['gpt-5.5'], { inputTokens: 300, outputTokens: 200, requests: 2 });
  assert.deepEqual(daily.byMode.chat, { tokens: 500, requests: 2 });
  assert.equal(daily.totalImages, 1);
  assert.equal(daily.providers.openai.totalTokens, 500);
  assert.deepEqual(daily.providers.openai.images, {
    totalImages: 1,
    byDimensions: { '1024x1024': 1 },
    byQuality: { hd: 1 },
  });
});

test('image generation preserves media counters in the summary', () => {
  const { summary } = buildImageGenerationMutation(
    {},
    {
      currentMonth: MONTH,
      currentMonthTokens: 5,
      currentMonthRequests: 1,
      currentMonthImages: 2,
      currentMonthMedia: 3,
      totalTokensAllTime: 5,
      totalRequestsAllTime: 1,
      totalImagesAllTime: 2,
      totalMediaAllTime: 3,
      byProvider: {},
      byModel: {},
    },
    { providerId: 'openai', modelId: 'dall-e-3', imageCount: 2, dimensions: '512x512', timestamp: Date.now() },
    DATE,
    MONTH
  );

  assert.equal(summary.totalImagesAllTime, 4);
  assert.equal(summary.currentMonthImages, 4);
  assert.equal(summary.totalMediaAllTime, 3);
  assert.equal(summary.currentMonthMedia, 3);
  assert.equal(summary.currentMonthTokens, 5);
});

test('media generation preserves token and image fields', () => {
  const { daily, summary } = buildMediaGenerationMutation(
    {
      totalTokens: 100,
      totalImages: 5,
      byModel: { 'claude-sonnet-4-6': { inputTokens: 60, outputTokens: 40, requests: 1 } },
    },
    {
      currentMonth: MONTH,
      currentMonthTokens: 100,
      currentMonthRequests: 1,
      currentMonthImages: 5,
      currentMonthMedia: 0,
      totalTokensAllTime: 100,
      totalRequestsAllTime: 1,
      totalImagesAllTime: 5,
      byProvider: {},
      byModel: {},
    },
    { providerId: 'elevenlabs', modelId: 'eleven-v3', mediaType: 'audio', operation: 'tts', timestamp: Date.now() },
    DATE,
    MONTH
  );

  assert.equal(daily.totalTokens, 100);
  assert.equal(daily.totalImages, 5);
  assert.equal(daily.totalMedia, 1);
  assert.deepEqual(daily.providers.elevenlabs.media, {
    totalGenerations: 1,
    byMediaType: { audio: 1 },
    byOperation: { tts: 1 },
  });
  assert.equal(summary.currentMonthTokens, 100);
  assert.equal(summary.currentMonthImages, 5);
  assert.equal(summary.currentMonthMedia, 1);
  assert.equal(summary.totalMediaAllTime, 1);
});

// ---------------------------------------------------------------------------
// Free-tier gate (server-authoritative proxy enforcement)
// ---------------------------------------------------------------------------

const FULL_USAGE = {
  freeDebatesRemaining: 5,
  freeComparesRemaining: 5,
  freeChatsRemaining: 5,
  freeAnalyzesRemaining: 5,
};

test('mapSessionTypeToFreeTier maps comparison->compare and passes others through', () => {
  assert.equal(mapSessionTypeToFreeTier('comparison'), 'compare');
  assert.equal(mapSessionTypeToFreeTier('compare'), 'compare');
  assert.equal(mapSessionTypeToFreeTier('chat'), 'chat');
  assert.equal(mapSessionTypeToFreeTier('debate'), 'debate');
  assert.equal(mapSessionTypeToFreeTier('analyze'), 'analyze');
  assert.equal(mapSessionTypeToFreeTier('bogus'), undefined);
  assert.equal(mapSessionTypeToFreeTier(undefined), undefined);
});

const gate = (overrides) => computeFreeTierGate({
  sessionType: 'chat', interactionId: 'i1', isPremium: false, markerType: undefined, usage: FULL_USAGE,
  ...overrides,
});

test('gate: a free account\'s call without a session type is refused, not let through', () => {
  const { result, decrementTo } = gate({ sessionType: undefined });
  assert.deepEqual(result, { allowed: false, reason: 'unlabeled' });
  assert.equal(decrementTo, undefined);
});

test('gate: a free account\'s call with an unknown session type is refused', () => {
  assert.deepEqual(gate({ sessionType: 'bogus' }).result, { allowed: false, reason: 'unlabeled' });
  assert.deepEqual(gate({ sessionType: 'constructor' }).result, { allowed: false, reason: 'unlabeled' });
});

test('gate: a free account\'s call without a session id is refused, not let through', () => {
  const { result, decrementTo } = gate({ interactionId: undefined });
  assert.deepEqual(result, { allowed: false, reason: 'unlabeled' });
  assert.equal(decrementTo, undefined);
});

test('gate: Create isn\'t a free-tier session type (it checks a trial or subscription instead)', () => {
  assert.deepEqual(gate({ sessionType: 'create' }).result, { allowed: false, reason: 'unlabeled' });
});

test('gate: premium users always pass without decrement, labeled or not', () => {
  const { result, decrementTo } = gate({ isPremium: true, usage: { ...FULL_USAGE, freeChatsRemaining: 0 } });
  assert.deepEqual(result, { allowed: true, reason: 'premium' });
  assert.equal(decrementTo, undefined);
  assert.deepEqual(gate({ isPremium: true, sessionType: undefined, interactionId: undefined }).result, { allowed: true, reason: 'premium' });
});

test('gate: an already-counted interaction passes idempotently (no second decrement)', () => {
  const { result, decrementTo } = gate({ sessionType: 'debate', markerType: 'debate' });
  assert.deepEqual(result, { allowed: true, reason: 'counted' });
  assert.equal(decrementTo, undefined);
});

test('gate: a compare session\'s later calls find its marker (comparison maps to compare)', () => {
  assert.deepEqual(gate({ sessionType: 'comparison', markerType: 'compare' }).result, { allowed: true, reason: 'counted' });
});

test('gate: an id counted as one type can\'t stand in for another', () => {
  const { result, decrementTo } = gate({ sessionType: 'debate', markerType: 'chat' });
  assert.deepEqual(result, { allowed: false, reason: 'unlabeled' });
  assert.equal(decrementTo, undefined);
});

test('gate: first use of an interaction decrements the right counter', () => {
  const { result, decrementTo } = gate({ sessionType: 'comparison', usage: { ...FULL_USAGE, freeComparesRemaining: 3 } });
  assert.deepEqual(result, { allowed: true, reason: 'decremented', remaining: 2 });
  assert.equal(decrementTo, 2);
});

test('gate: exhausted free tier is rejected', () => {
  const { result, decrementTo } = gate({ sessionType: 'analyze', usage: { ...FULL_USAGE, freeAnalyzesRemaining: 0 } });
  assert.deepEqual(result, { allowed: false, reason: 'exhausted', remaining: 0 });
  assert.equal(decrementTo, undefined);
});

test('gate: an id that can\'t be a doc id is unlabeled', () => {
  assert.deepEqual(gate({ interactionId: 'a/b' }).result, { allowed: false, reason: 'unlabeled' });
  assert.deepEqual(gate({ interactionId: '..' }).result, { allowed: false, reason: 'unlabeled' });
  assert.deepEqual(gate({ interactionId: 'x'.repeat(257) }).result, { allowed: false, reason: 'unlabeled' });
});

test('refusals: every mode at its limit gets Analyze\'s typed free-limit error', () => {
  for (const [sessionType, type, label] of [['chat', 'chat', 'Chat'], ['comparison', 'compare', 'Compare'], ['debate', 'debate', 'Debate'], ['analyze', 'analyze', 'Analyze']]) {
    const error = freeTierGateError({ allowed: false, reason: 'exhausted', remaining: 0 }, sessionType);
    assert.equal(error.code, 'resource-exhausted');
    assert.equal(error.message, `You've used your 5 free ${label} sessions.`);
    assert.deepEqual(error.details, { reason: 'free-limit', type, limit: 5 });
  }
});

test('refusals: Create has no free sessions; an unlabeled call is an out-of-date page', () => {
  const create = freeLimitError('create');
  assert.equal(create.code, 'resource-exhausted');
  assert.equal(create.message, 'Create comes with a free trial or a subscription.');
  assert.deepEqual(create.details, { reason: 'free-limit', type: 'create', limit: 0 });
  const unlabeled = freeTierGateError({ allowed: false, reason: 'unlabeled' }, undefined);
  assert.equal(unlabeled.code, 'failed-precondition');
  assert.equal(unlabeled.message, 'This page is out of date. Reload it to keep going.');
});

test('free tier: 5 Analyze sessions', () => {
  assert.equal(freeTierLimit('analyze'), 5);
});

test('sandbox usage increments only the fields it carries, under the daily doc\'s sandbox map', () => {
  const update = buildSandboxUsageUpdate({ calls: 1, executeMs: 1234.4, awakeMs: 0, creates: 1 }, DATE);
  assert.equal(update.date, DATE);
  assert.deepEqual(Object.keys(update.sandbox).sort(), ['calls', 'creates', 'executeMs']);
  assert.equal(update.sandbox.executeMs.isEqual(FieldValue.increment(1234)), true);
  assert.equal(update.sandbox.calls.isEqual(FieldValue.increment(1)), true);
});
