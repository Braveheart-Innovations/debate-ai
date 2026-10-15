const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { ClaudeRuntime } = require('../lib/providers/claude/runtime');
const { OpenAIRuntime } = require('../lib/providers/openai/runtime');
const { GoogleRuntime } = require('../lib/providers/google/runtime');

const tools = [{ name: 'propose_team', description: 'd', parameters: { type: 'object', properties: {} } }];
const base = (model, extra = {}) => ({
  model,
  messages: [{ role: 'user', content: 'Plan the team.' }],
  maxTokens: 64000,
  temperature: 1,
  tools,
  toolChoice: 'required',
  ...extra,
});
const build = (runtime, model, deepThinking) => runtime.buildRequest(base(model, deepThinking ? { deepThinking: true } : {}), 'k').body;

describe('deep thinking (the Team plan round)', () => {
  it('Claude: effort xhigh on models that take it; nothing otherwise, and nothing without the flag', () => {
    const claude = new ClaudeRuntime();
    for (const model of ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-4-7', 'claude-fable-5-1']) {
      assert.deepEqual(build(claude, model, true).output_config, { effort: 'xhigh' }, model);
      assert.equal(build(claude, model, false).output_config, undefined, model);
    }
    // Sonnet 4.5 rejects effort; Opus 4.6 / Sonnet 4.6 have no xhigh. (Haiku 4.5
    // now resolves to Haiku 5.5, which takes xhigh.)
    for (const model of ['claude-sonnet-4-5-20250929', 'claude-opus-4-6', 'claude-sonnet-4-6']) {
      assert.equal(build(claude, model, true).output_config, undefined, model);
    }
    // Never a fixed thinking budget: the current models reject budget_tokens.
    assert.equal(build(claude, 'claude-opus-5-5', true).thinking, undefined);
  });

  it('OpenAI: reasoning.effort high on Responses API models; chat-completions models unchanged', () => {
    const openai = new OpenAIRuntime();
    for (const model of ['gpt-6.1-sol', 'gpt-6-astra']) {
      assert.deepEqual(build(openai, model, true).reasoning, { effort: 'high' }, model);
      assert.equal(build(openai, model, false).reasoning, undefined, model);
    }
    // GPT-5.6 keeps the reasoning_effort 'none' it needs with tools.
    const chat = build(openai, 'gpt-5.6-sol', true);
    assert.equal(chat.reasoning_effort, 'none');
    assert.equal(chat.reasoning, undefined);
    assert.deepEqual(build(openai, 'gpt-5.6-sol', true), build(openai, 'gpt-5.6-sol', false));
  });

  it('Gemini: thinkingLevel high on 3.x, the budget ceiling on 2.5; default config without the flag', () => {
    const google = new GoogleRuntime();
    assert.deepEqual(build(google, 'gemini-3.8-flash', true).generationConfig.thinkingConfig, { thinkingLevel: 'high' });
    assert.deepEqual(build(google, 'gemini-3.1-pro-preview', true).generationConfig.thinkingConfig, { thinkingLevel: 'high' });
    assert.deepEqual(build(google, 'gemini-2.5-pro', true).generationConfig.thinkingConfig, { thinkingBudget: 32768 });
    assert.deepEqual(build(google, 'gemini-2.5-flash', true).generationConfig.thinkingConfig, { thinkingBudget: 24576 });
    assert.equal(build(google, 'gemini-3.8-flash', false).generationConfig.thinkingConfig, undefined);
    // Thinking counts toward maxOutputTokens: the budget leaves room for the answer.
    const tight = google.buildRequest({ ...base('gemini-2.5-pro'), maxTokens: 8192, deepThinking: true }, 'k').body;
    assert.deepEqual(tight.generationConfig.thinkingConfig, { thinkingBudget: 8191 });
  });
});
