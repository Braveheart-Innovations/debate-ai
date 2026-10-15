const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { GoogleRuntime } = require('../lib/providers/google/runtime');
const { getGeminiThinkingConfig, getGeminiDeepThinkingConfig } = require('../lib/providers/google/thinking');

describe('GoogleRuntime thinking controls', () => {
  it('uses minimal thinking for tight Gemini 3 Flash output caps', () => {
    const runtime = new GoogleRuntime();
    const request = runtime.buildRequest(
      {
        model: 'gemini-3.5-flash',
        messages: [{ role: 'user', content: 'Keep this short.' }],
        maxTokens: 512,
        temperature: 0.4,
      },
      'test-key'
    );

    assert.deepEqual(request.body.generationConfig, {
      temperature: 0.4,
      maxOutputTokens: 512,
      thinkingConfig: { thinkingLevel: 'minimal' },
    });
  });

  it('uses low thinking for tight Gemini 3 Pro output caps', () => {
    assert.deepEqual(
      getGeminiThinkingConfig('gemini-3.1-pro-preview', 512),
      { thinkingLevel: 'low' }
    );
  });

  it('uses low thinking for Gemini 3.7+ Flash, which rejects minimal', () => {
    assert.deepEqual(
      getGeminiThinkingConfig('gemini-3.7-flash', 256),
      { thinkingLevel: 'low' }
    );
    // 3.6 and earlier still accept minimal.
    assert.deepEqual(
      getGeminiThinkingConfig('gemini-3.6-flash', 256),
      { thinkingLevel: 'minimal' }
    );
  });

  it('gives Gemini 4 Argon thinking levels, never minimal', () => {
    // Live-verified 2026-10-15: minimal 400s; low and high are accepted.
    assert.deepEqual(getGeminiThinkingConfig('gemini-4-argon', 512), { thinkingLevel: 'low' });
    assert.deepEqual(getGeminiDeepThinkingConfig('gemini-4-argon', 8192), { thinkingLevel: 'high' });
    assert.equal(getGeminiThinkingConfig('gemini-4-argon', 8192), undefined);
  });

  it('disables Gemini 2.5 Flash thinking for tight output caps', () => {
    assert.deepEqual(
      getGeminiThinkingConfig('gemini-2.5-flash', 512),
      { thinkingBudget: 0 }
    );
  });

  it('keeps default dynamic thinking when no tight output cap is set', () => {
    const runtime = new GoogleRuntime();
    const request = runtime.buildRequest(
      {
        model: 'gemini-3.5-flash',
        messages: [{ role: 'user', content: 'Think deeply.' }],
        temperature: 0.7,
      },
      'test-key'
    );

    assert.deepEqual(request.body.generationConfig, {
      temperature: 0.7,
      maxOutputTokens: 8192,
    });
  });
});

describe('GoogleRuntime API key', () => {
  it('sends the key in the x-goog-api-key header, never in the URL', () => {
    const runtime = new GoogleRuntime();
    const request = runtime.buildRequest(
      { model: 'gemini-3.8-flash', messages: [{ role: 'user', content: 'hi' }] },
      'AIza-secret-key'
    );

    assert.equal(request.headers['x-goog-api-key'], 'AIza-secret-key');
    assert.ok(!request.url.includes('AIza-secret-key'), request.url);
    assert.ok(!/[?&]key=/.test(request.url), request.url);
  });
});
