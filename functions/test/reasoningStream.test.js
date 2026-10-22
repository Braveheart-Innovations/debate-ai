const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { ClaudeRuntime } = require('../lib/providers/claude/runtime');
const { OpenAIRuntime } = require('../lib/providers/openai/runtime');
const { GoogleRuntime } = require('../lib/providers/google/runtime');
const { getCohereRuntime } = require('../lib/providers/cohere/runtime');
const { buildResponsesBody, parseResponsesStream } = require('../lib/providers/openai/responses');
const { streamModel, refusesReasoningSummary } = require('../lib/modelStream');

// Each provider's stream shapes below are as the live APIs sent them (2026-10-22).

function sse(events) {
  const payload = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(payload)); c.close(); } });
}

async function collect(gen) {
  const out = [];
  for await (const event of gen) out.push(event);
  return out;
}

const reasoningOf = (events) => events.filter((e) => e.type === 'reasoning_delta').map((e) => e.delta).join('');
const textOf = (events) => events.filter((e) => e.type === 'text_delta').map((e) => e.delta).join('');

const CLAUDE_SUMMARIZED = [
  { type: 'message_start', message: { usage: { input_tokens: 12 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'These two tasks are independent, ' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'so I\'ll run them in parallel.\n\n' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'SIG' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Checking both.' } },
  { type: 'content_block_stop', index: 1 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 30 } },
];

describe('Claude: summarized thinking', () => {
  const build = (streamReasoning) => new ClaudeRuntime().buildRequest({
    model: 'claude-sonnet-5-5',
    messages: [{ role: 'user', content: 'hi' }],
    streamReasoning,
  }, 'key').body;

  it('asks for a summary of its thinking only when the caller streams reasoning', () => {
    assert.equal(build(true).thinking.display, 'summarized');
    assert.equal(build(true).thinking.type, 'adaptive');
    assert.equal(build(undefined).thinking.display, undefined);
  });

  it('streams the summary as reasoning, apart from the answer', async () => {
    const events = await collect(new ClaudeRuntime().streamParse(sse(CLAUDE_SUMMARIZED), 't'));
    assert.equal(reasoningOf(events), 'These two tasks are independent, so I\'ll run them in parallel.\n\n');
    assert.equal(textOf(events), 'Checking both.');
  });

  it('streams nothing for thinking whose display is omitted', async () => {
    const omitted = CLAUDE_SUMMARIZED.map((e) => (e.delta?.type === 'thinking_delta' ? { ...e, delta: { type: 'thinking_delta', thinking: '' } } : e));
    const events = await collect(new ClaudeRuntime().streamParse(sse(omitted), 't'));
    assert.equal(reasoningOf(events), '');
  });
});

describe('OpenAI Responses: reasoning summaries', () => {
  it('asks for summaries, beside the effort when there is one', () => {
    const base = { model: 'gpt-6.1-sol', messages: [{ role: 'user', content: 'hi' }], stream: true };
    assert.deepEqual(buildResponsesBody({ ...base, reasoningSummary: true }).reasoning, { summary: 'auto' });
    assert.deepEqual(buildResponsesBody({ ...base, reasoningSummary: true, reasoningEffort: 'high' }).reasoning, { effort: 'high', summary: 'auto' });
    assert.equal(buildResponsesBody(base).reasoning, undefined);
  });

  it('routes the flag from the request', () => {
    const { body } = new OpenAIRuntime('openai').buildRequest({ model: 'gpt-6.1-sol', messages: [{ role: 'user', content: 'hi' }], streamReasoning: true }, 'key');
    assert.deepEqual(body.reasoning, { summary: 'auto' });
  });

  it('streams each summary part as reasoning, a blank line between parts', async () => {
    const events = await collect(parseResponsesStream(sse([
      { type: 'response.reasoning_summary_text.delta', delta: '**Analyzing the flows**\n\nI need to ' },
      { type: 'response.reasoning_summary_text.delta', delta: 'check trigger order.' },
      { type: 'response.reasoning_summary_part.done' },
      { type: 'response.reasoning_summary_text.delta', delta: '**Counting**' },
      { type: 'response.reasoning_summary_part.done' },
      { type: 'response.output_text.delta', delta: 'Done.' },
      { type: 'response.completed', response: { status: 'completed', output: [], usage: { input_tokens: 1, output_tokens: 1 } } },
    ])));
    assert.equal(reasoningOf(events), '**Analyzing the flows**\n\nI need to check trigger order.\n\n**Counting**\n\n');
    assert.equal(textOf(events), 'Done.');
  });
});

describe('OpenAI-compatible providers: reasoning_content', () => {
  it('streams DeepSeek, Kimi, GLM and Grok reasoning apart from the answer', async () => {
    const events = await collect(new OpenAIRuntime('deepseek').streamParse(sse([
      { choices: [{ delta: { reasoning_content: 'Need plan. ' } }] },
      { choices: [{ delta: { reasoning_content: 'Use the tool.' } }] },
      { choices: [{ delta: { content: 'Plan:' } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } },
    ]), 't'));
    assert.equal(reasoningOf(events), 'Need plan. Use the tool.');
    assert.equal(textOf(events), 'Plan:');
  });
});

describe('Gemini: thought summaries', () => {
  const generation = (model, streamReasoning) => new GoogleRuntime().buildRequest({
    model,
    messages: [{ role: 'user', content: 'hi' }],
    maxTokens: 32000,
    streamReasoning,
  }, 'key').body.generationConfig;

  it('asks for thoughts on the models that think, only when the caller streams reasoning', () => {
    assert.deepEqual(generation('gemini-3.8-flash', true).thinkingConfig, { includeThoughts: true });
    assert.deepEqual(generation('gemini-2.5-pro', true).thinkingConfig, { includeThoughts: true });
    assert.equal(generation('gemini-3.8-flash', undefined).thinkingConfig, undefined);
    assert.equal(generation('gemini-2.0-flash', true).thinkingConfig, undefined);
  });

  it('keeps the model\'s thinking setting beside includeThoughts', () => {
    const config = new GoogleRuntime().buildRequest({
      model: 'gemini-3.8-flash', messages: [{ role: 'user', content: 'hi' }], maxTokens: 32000, deepThinking: true, streamReasoning: true,
    }, 'key').body.generationConfig.thinkingConfig;
    assert.equal(config.includeThoughts, true);
    assert.equal(config.thinkingLevel, 'high');
  });

  it('streams thought parts as reasoning, never as the answer', async () => {
    const events = await collect(new GoogleRuntime().streamParse(sse([
      { candidates: [{ content: { parts: [{ text: '**Addressing the Questions**\n\nI\'m planning.', thought: true }] } }] },
      { candidates: [{ content: { parts: [{ text: 'Here is the plan.' }] } }] },
      { candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } },
    ]), 't'));
    assert.equal(reasoningOf(events), '**Addressing the Questions**\n\nI\'m planning.');
    assert.equal(textOf(events), 'Here is the plan.');
  });
});

describe('Cohere: thinking and tool plans', () => {
  it('streams a reasoning model\'s thinking and a tool plan as reasoning', async () => {
    const events = await collect(getCohereRuntime().streamParse(sse([
      { type: 'content-delta', delta: { message: { content: { thinking: 'Okay, let\'s tackle these. ' } } } },
      { type: 'tool-plan-delta', delta: { message: { tool_plan: 'I will compute it.' } } },
      { type: 'content-delta', delta: { message: { content: { text: 'Answer.' } } } },
      { type: 'message-end', delta: { finish_reason: 'COMPLETE', usage: { billed_units: { input_tokens: 1, output_tokens: 1 } } } },
    ]), 't'));
    assert.equal(reasoningOf(events), 'Okay, let\'s tackle these. I will compute it.');
    assert.equal(textOf(events), 'Answer.');
  });
});

describe('streamModel: reasoning only for a caller that asks', () => {
  const deps = (fetch) => {
    const calls = [];
    return {
      calls,
      deps: {
        getApiKey: async () => 'sk-test',
        fetch: async (url, init) => {
          const body = JSON.parse(init.body);
          calls.push(body);
          return fetch(body);
        },
        recordUsage: async () => undefined,
      },
    };
  };
  const request = (overrides) => ({
    uid: 'u1', providerId: 'claude', model: 'claude-sonnet-5-5', messages: [{ role: 'user', content: 'hi' }],
    keyValue: 'k', sessionId: 's1', sessionType: 'analyze', ...overrides,
  });

  it('passes reasoning to a caller that asks, and drops it for one that doesn\'t (the chat proxy, the reviewer)', async () => {
    const asked = deps(() => new Response(sse(CLAUDE_SUMMARIZED), { status: 200 }));
    const withReasoning = await collect(streamModel(request({ streamReasoning: true }), asked.deps));
    assert.ok(reasoningOf(withReasoning).startsWith('These two tasks'));
    assert.equal(asked.calls[0].thinking.display, 'summarized');

    const unasked = deps(() => new Response(sse(CLAUDE_SUMMARIZED), { status: 200 }));
    const without = await collect(streamModel(request(), unasked.deps));
    assert.equal(without.filter((e) => e.type === 'reasoning_delta').length, 0);
    assert.equal(textOf(without), 'Checking both.');
  });

  it('resends once without summaries when OpenAI refuses them (an organization that isn\'t verified)', async () => {
    const reply = [
      { type: 'response.output_text.delta', delta: 'Hi' },
      { type: 'response.completed', response: { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hi' }] }], usage: { input_tokens: 1, output_tokens: 1 } } },
    ];
    const { deps: d, calls } = deps((body) => (body.reasoning?.summary
      ? new Response('{"error":{"message":"Your organization must be verified to generate reasoning summaries.","type":"invalid_request_error","param":"reasoning.summary","code":"unsupported_value"}}', { status: 400 })
      : new Response(sse(reply), { status: 200 })));
    const events = await collect(streamModel(request({ providerId: 'openai', model: 'gpt-6.1-sol', streamReasoning: true }), d));
    assert.equal(calls.length, 2);
    assert.equal(calls[0].reasoning.summary, 'auto');
    assert.equal(calls[1].reasoning, undefined);
    assert.equal(textOf(events), 'Hi');
    assert.equal(events.at(-1).type, 'message_complete');
  });

  it('sends any other refusal back as the error it is', async () => {
    const { deps: d, calls } = deps(() => new Response('{"error":{"message":"Invalid value for max_output_tokens."}}', { status: 400 }));
    const events = await collect(streamModel(request({ providerId: 'openai', model: 'gpt-6.1-sol', streamReasoning: true }), d));
    assert.equal(calls.length, 1);
    assert.equal(events.at(-1).type, 'error');
  });

  it('recognizes the refusal by its parameter or its wording', () => {
    assert.equal(refusesReasoningSummary('{"param":"reasoning.summary"}'), true);
    assert.equal(refusesReasoningSummary('Your organization must be verified to generate reasoning summaries.'), true);
    assert.equal(refusesReasoningSummary('Invalid value for max_output_tokens.'), false);
  });
});
