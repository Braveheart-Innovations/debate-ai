const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { OpenAIRuntime } = require('../lib/providers/openai/runtime');
const { GoogleRuntime } = require('../lib/providers/google/runtime');
const { parseResponsesStream } = require('../lib/providers/openai/responses');

// Usage as each API reported a repeated 5K-token prefix on its second call (live, 2026-10-22).

function sse(events) {
  const payload = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(payload)); c.close(); } });
}

async function usageOf(gen) {
  let usage;
  for await (const event of gen) if (event.type === 'message_complete') usage = event.usage;
  return usage;
}

describe('provider usage: the prompt cache and the thinking, as each API reports them', () => {
  it('OpenAI Responses: input_tokens_details', async () => {
    const usage = await usageOf(parseResponsesStream(sse([
      { type: 'response.output_text.delta', delta: 'OK' },
      { type: 'response.completed', response: { status: 'completed', output: [], usage: { input_tokens: 4854, input_tokens_details: { cache_write_tokens: 0, cached_tokens: 4851 }, output_tokens: 5 } } },
    ])));
    assert.deepEqual(usage, { inputTokens: 4854, outputTokens: 5, totalTokens: 4859, cacheReadTokens: 4851 });
  });

  it('OpenAI-compatible chat (OpenAI, DeepSeek, Kimi, GLM, Grok): prompt_tokens_details', async () => {
    const usage = await usageOf(new OpenAIRuntime('moonshot').streamParse(sse([
      { choices: [{ delta: { content: 'OK' } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 4940, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 4864, cache_write_tokens: 0 } } },
    ]), 't'));
    assert.deepEqual(usage, { inputTokens: 4940, outputTokens: 20, totalTokens: 4960, cacheReadTokens: 4864 });
    const first = await usageOf(new OpenAIRuntime('moonshot').streamParse(sse([
      { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 4940, completion_tokens: 20, prompt_tokens_details: { cache_write_tokens: 4864 } } },
    ]), 't'));
    assert.equal(first.cacheWriteTokens, 4864);
  });

  it('Gemini: its thinking counts as output, and implicit caching as cache reads', async () => {
    const usage = await usageOf(new GoogleRuntime().streamParse(sse([
      { candidates: [{ content: { parts: [{ text: 'Done.' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 5737, candidatesTokenCount: 47, thoughtsTokenCount: 150, cachedContentTokenCount: 3700, totalTokenCount: 5934 } },
    ]), 't'));
    assert.deepEqual(usage, { inputTokens: 5737, outputTokens: 197, totalTokens: 5934, cacheReadTokens: 3700 });
  });
});
