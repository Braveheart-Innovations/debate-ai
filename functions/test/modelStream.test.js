const assert = require('node:assert/strict');
const test = require('node:test');
const { streamModel, mapProviderError, CANCELLED_CODE, DEADLINE_CODE } = require('../lib/modelStream');

function sse(events) {
  const payload = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload));
      controller.close();
    },
  });
}

const CLAUDE_REPLY = [
  { type: 'message_start', message: { usage: { input_tokens: 12 } } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' world' } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
];

function deps(overrides = {}) {
  const calls = { fetch: [], usage: [] };
  return {
    calls,
    deps: {
      getApiKey: async () => 'sk-test',
      fetch: async (url, init) => {
        calls.fetch.push({ url, init, body: JSON.parse(init.body) });
        return new Response(sse(CLAUDE_REPLY), { status: 200 });
      },
      recordUsage: async (uid, record) => { calls.usage.push({ uid, record }); },
      ...overrides,
    },
  };
}

function request(overrides = {}) {
  return {
    uid: 'u1',
    providerId: 'claude',
    model: 'claude-sonnet-5-5',
    messages: [{ role: 'user', content: 'hi' }],
    keyValue: 'k',
    sessionId: 's1',
    sessionType: 'analyze',
    ...overrides,
  };
}

async function collect(gen) {
  const out = [];
  for await (const event of gen) out.push(event);
  return out;
}

test('streams canonical events and records usage before returning', async () => {
  const { deps: d, calls } = deps();
  const events = await collect(streamModel(request(), d));
  assert.deepEqual(events.filter((e) => e.type === 'text_delta').map((e) => e.delta), ['Hello', ' world']);
  const done = events.at(-1);
  assert.equal(done.type, 'message_complete');
  assert.equal(done.finish_reason, 'stop');
  assert.equal(calls.usage.length, 1);
  assert.equal(calls.usage[0].uid, 'u1');
  assert.deepEqual(
    { input: calls.usage[0].record.inputTokens, output: calls.usage[0].record.outputTokens, type: calls.usage[0].record.sessionType },
    { input: 12, output: 3, type: 'analyze' },
  );
});

test('a missing key ends with failed-precondition and never calls the provider', async () => {
  const { deps: d, calls } = deps({ getApiKey: async () => null });
  const events = await collect(streamModel(request(), d));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'error');
  assert.equal(events[0].code, 'failed-precondition');
  assert.equal(calls.fetch.length, 0);
});

test('unsupported provider and empty messages are rejected up front', async () => {
  const { deps: d } = deps();
  const [perplexity] = await collect(streamModel(request({ providerId: 'perplexity' }), d));
  assert.equal(perplexity.code, 'invalid-argument');
  const [empty] = await collect(streamModel(request({ messages: [] }), d));
  assert.equal(empty.code, 'invalid-argument');
});

test('a forced tool choice the model rejects is resent once, unforced', async () => {
  const { deps: d, calls } = deps({
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      calls.fetch.push({ body });
      if (body.tool_choice) {
        return new Response('{"type":"error","error":{"message":"tool_choice: type \\"any\\" is not supported for this model."}}', { status: 400 });
      }
      return new Response(sse(CLAUDE_REPLY), { status: 200 });
    },
  });
  const events = await collect(streamModel(request({
    tools: [{ name: 'propose_team', description: 'd', parameters: { type: 'object', properties: {} } }],
    toolChoice: 'required',
  }), d));
  assert.equal(calls.fetch.length, 2);
  assert.ok(calls.fetch[0].body.tool_choice);
  assert.equal(calls.fetch[1].body.tool_choice, undefined);
  assert.equal(events.at(-1).type, 'message_complete');
});

test('provider HTTP failures map to user-facing codes', async () => {
  for (const [status, code] of [[401, 'permission-denied'], [429, 'resource-exhausted'], [400, 'invalid-argument'], [503, 'internal']]) {
    const { deps: d, calls } = deps({ fetch: async () => new Response('{"error":{"message":"nope"}}', { status }) });
    const events = await collect(streamModel(request(), d));
    assert.equal(events.length, 1);
    assert.equal(events[0].code, code, `status ${status}`);
    assert.equal(calls.usage.length, 0);
  }
  assert.match(mapProviderError('openai', 401).message, /ChatGPT API key is invalid/);
});

function hangingFetch(calls) {
  return async (url, init) => {
    calls.fetch.push({ url });
    return new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
  };
}

test('caller cancellation aborts the provider fetch and ends with code cancelled', async () => {
  const calls = { fetch: [] };
  const { deps: d } = deps({ fetch: hangingFetch(calls) });
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 20);
  const events = await collect(streamModel(request({ signal: controller.signal }), d));
  assert.equal(events.length, 1);
  assert.equal(events[0].code, CANCELLED_CODE);
});

test('a call that outlives timeoutMs ends with deadline-exceeded', async () => {
  const calls = { fetch: [] };
  const { deps: d } = deps({ fetch: hangingFetch(calls) });
  const events = await collect(streamModel(request({ timeoutMs: 30 }), d));
  assert.equal(events.length, 1);
  assert.equal(events[0].code, DEADLINE_CODE);
});

test('a network failure ends with a single internal error, never a throw', async () => {
  const { deps: d } = deps({ fetch: async () => { throw new TypeError('fetch failed'); } });
  const events = await collect(streamModel(request(), d));
  assert.equal(events.length, 1);
  assert.equal(events[0].code, 'internal');
});

test('a failed usage write does not fail the stream', async () => {
  const { deps: d } = deps({ recordUsage: async () => { throw new Error('firestore down'); } });
  const events = await collect(streamModel(request(), d));
  assert.equal(events.at(-1).type, 'message_complete');
});
