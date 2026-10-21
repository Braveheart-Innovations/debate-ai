const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { ClaudeRuntime } = require('../lib/providers/claude/runtime');
const { OpenAIRuntime } = require('../lib/providers/openai/runtime');
const { GoogleRuntime } = require('../lib/providers/google/runtime');
const { streamModel } = require('../lib/modelStream');

const tools = [{ name: 'execute_python', description: 'd', parameters: { type: 'object', properties: {} } }];
// An Analyze round: the user's ask, two tool rounds, the newest results last.
const messages = [
  { role: 'user', content: 'Audit the holidays.' },
  { role: 'assistant', content: '', tool_calls: [{ id: 't1', type: 'function', function: { name: 'execute_python', arguments: '{"code":"1"}' } }] },
  { role: 'tool', tool_call_id: 't1', content: 'one' },
  { role: 'assistant', content: '', tool_calls: [{ id: 't2', type: 'function', function: { name: 'execute_python', arguments: '{"code":"2"}' } }] },
  { role: 'tool', tool_call_id: 't2', content: 'two' },
];
const request = (extra = {}) => ({ model: 'claude-sonnet-5-5', messages, systemPrompt: 'Rules.', maxTokens: 1000, tools, ...extra });

function breakpoints(body) {
  const found = [];
  const system = Array.isArray(body.system) ? body.system : [];
  system.forEach((block, i) => block.cache_control && found.push(`system:${i}`));
  body.messages.forEach((message, i) => {
    if (typeof message.content === 'string') return;
    message.content.forEach((block, j) => block.cache_control && found.push(`${message.role}:${i}:${j}:${block.type}`));
  });
  return found;
}

function sse(events) {
  const payload = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(payload)); c.close(); } });
}

async function collect(gen) {
  const out = [];
  for await (const event of gen) out.push(event);
  return out;
}

describe('prompt caching (ProviderRequest.promptCache)', () => {
  it('Claude: the system prompt and the two newest user messages end in a breakpoint', () => {
    const body = new ClaudeRuntime().buildRequest(request({ promptCache: true }), 'k').body;
    assert.deepEqual(body.system, [{ type: 'text', text: 'Rules.', cache_control: { type: 'ephemeral' } }]);
    assert.deepEqual(breakpoints(body), ['system:0', 'user:2:0:tool_result', 'user:4:0:tool_result']);
    // Breakpoints change nothing else: same messages, same text.
    const plain = new ClaudeRuntime().buildRequest(request(), 'k').body;
    const strip = (value) => JSON.parse(JSON.stringify(value, (k, v) => (k === 'cache_control' ? undefined : v)));
    assert.deepEqual(strip(body.messages), strip(plain.messages));
  });

  it('Claude: a first round marks the ask itself, as a text block', () => {
    const body = new ClaudeRuntime().buildRequest(request({ promptCache: true, messages: [messages[0]] }), 'k').body;
    assert.deepEqual(body.messages[0].content, [{ type: 'text', text: 'Audit the holidays.', cache_control: { type: 'ephemeral' } }]);
  });

  it('Claude: nothing is marked without the flag', () => {
    const body = new ClaudeRuntime().buildRequest(request(), 'k').body;
    assert.equal(body.system, 'Rules.');
    assert.deepEqual(breakpoints(body), []);
  });

  it('OpenAI and Gemini ignore it: they cache repeated prefixes on their own', () => {
    for (const [runtime, model] of [[new OpenAIRuntime(), 'gpt-6.1-sol'], [new GoogleRuntime(), 'gemini-3.8-flash']]) {
      assert.deepEqual(
        runtime.buildRequest(request({ model, promptCache: true }), 'k').body,
        runtime.buildRequest(request({ model }), 'k').body,
        model,
      );
    }
  });

  it('Claude: input counts the cached part too, and the cache split is reported', async () => {
    const runtime = new ClaudeRuntime();
    const cached = await collect(runtime.streamParse(sse([
      { type: 'message_start', message: { usage: { input_tokens: 10, cache_read_input_tokens: 200, cache_creation_input_tokens: 30 } } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
    ]), 't'));
    assert.deepEqual(cached.at(-1).usage, { inputTokens: 240, outputTokens: 5, totalTokens: 245, cacheReadTokens: 200, cacheWriteTokens: 30 });
    const plain = await collect(runtime.streamParse(sse([
      { type: 'message_start', message: { usage: { input_tokens: 12 } } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
    ]), 't'));
    assert.deepEqual(plain.at(-1).usage, { inputTokens: 12, outputTokens: 3, totalTokens: 15 });
  });

  it('streamModel passes the flag to the runtime and records all the input as usage', async () => {
    const sent = [];
    const usage = [];
    const deps = {
      getApiKey: async () => 'sk-test',
      fetch: async (url, init) => {
        sent.push(JSON.parse(init.body));
        return new Response(sse([
          { type: 'message_start', message: { usage: { input_tokens: 10, cache_read_input_tokens: 200, cache_creation_input_tokens: 0 } } },
          { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
        ]), { status: 200 });
      },
      recordUsage: async (uid, record) => { usage.push(record); },
    };
    await collect(streamModel({
      uid: 'u1', providerId: 'claude', model: 'claude-sonnet-5-5', messages, systemPrompt: 'Rules.', tools,
      keyValue: 'k', sessionId: 's1', sessionType: 'analyze', promptCache: true,
    }, deps));
    assert.equal(breakpoints(sent[0]).length, 3);
    assert.equal(usage[0].inputTokens, 210);
  });
});
