import { buildGeminiGenerationConfig, extractGeminiText } from '@/services/ai/adapters/google/geminiGenerationConfig';

const thinkingFor = (model: string, options: { maxTokens?: number; reasoningEffort?: 'low'; supportsThinking?: boolean } = {}): unknown =>
  buildGeminiGenerationConfig({ model, temperature: 0.7, ...options }).thinkingConfig;

describe('buildGeminiGenerationConfig', () => {
  it('passes sampling and the output cap through', () => {
    expect(buildGeminiGenerationConfig({ model: 'gemini-3.8-flash', temperature: 0.4, topP: 0.9, topK: 20, maxTokens: 6144.7 })).toEqual({
      temperature: 0.4,
      topP: 0.9,
      topK: 20,
      maxOutputTokens: 6144,
    });
    expect(buildGeminiGenerationConfig({ model: 'gemini-3.8-flash', temperature: 0.4, maxTokens: 0 })).toEqual({ temperature: 0.4 });
  });

  describe('with a brief-reasoning request (debate turns)', () => {
    it('asks Gemini 3.7 and later for low thinking, whatever the cap', () => {
      expect(thinkingFor('gemini-3.8-flash', { maxTokens: 6144, reasoningEffort: 'low' })).toEqual({ thinkingLevel: 'low' });
      expect(thinkingFor('gemini-3.7-flash', { maxTokens: 1536, reasoningEffort: 'low' })).toEqual({ thinkingLevel: 'low' });
      expect(thinkingFor('gemini-3.8-flash', { reasoningEffort: 'low' })).toEqual({ thinkingLevel: 'low' });
    });

    it('counts Gemini 4 as 3.7 and later', () => {
      expect(thinkingFor('gemini-4-argon', { maxTokens: 6144, reasoningEffort: 'low' })).toEqual({ thinkingLevel: 'low' });
    });

    it('asks Flash and Lite models before 3.7 for minimal thinking', () => {
      expect(thinkingFor('gemini-3.6-flash', { maxTokens: 6144, reasoningEffort: 'low' })).toEqual({ thinkingLevel: 'minimal' });
      expect(thinkingFor('gemini-3.5-flash-lite', { maxTokens: 6144, reasoningEffort: 'low' })).toEqual({ thinkingLevel: 'minimal' });
    });

    it('asks Pro models for low thinking', () => {
      expect(thinkingFor('gemini-3.1-pro-preview', { maxTokens: 6144, reasoningEffort: 'low' })).toEqual({ thinkingLevel: 'low' });
    });

    it('uses the smallest thinking budget on Gemini 2.5', () => {
      expect(thinkingFor('gemini-2.5-flash', { maxTokens: 6144, reasoningEffort: 'low' })).toEqual({ thinkingBudget: 0 });
      expect(thinkingFor('gemini-2.5-pro', { maxTokens: 6144, reasoningEffort: 'low' })).toEqual({ thinkingBudget: 128 });
    });

    it('configures nothing for a model without thinking', () => {
      expect(thinkingFor('gemini-3.8-flash', { maxTokens: 6144, reasoningEffort: 'low', supportsThinking: false })).toBeUndefined();
      expect(thinkingFor('gemma-4', { maxTokens: 6144, reasoningEffort: 'low' })).toBeUndefined();
    });
  });

  describe('without a reasoning request (chat and other modes)', () => {
    it('leaves thinking at the model default under a generous cap', () => {
      expect(thinkingFor('gemini-3.8-flash', { maxTokens: 6144 })).toBeUndefined();
      expect(thinkingFor('gemini-3.8-flash')).toBeUndefined();
      expect(thinkingFor('gemini-4-argon', { maxTokens: 6144 })).toBeUndefined();
    });

    it('lowers thinking only under a tight cap, as before', () => {
      expect(thinkingFor('gemini-3.8-flash', { maxTokens: 1536 })).toEqual({ thinkingLevel: 'low' });
      expect(thinkingFor('gemini-3.6-flash', { maxTokens: 2048 })).toEqual({ thinkingLevel: 'minimal' });
      expect(thinkingFor('gemini-3.1-pro-preview', { maxTokens: 1024 })).toEqual({ thinkingLevel: 'low' });
      expect(thinkingFor('gemini-2.5-flash', { maxTokens: 1024 })).toEqual({ thinkingBudget: 0 });
      expect(thinkingFor('gemini-2.5-pro', { maxTokens: 1024 })).toEqual({ thinkingBudget: 128 });
      expect(thinkingFor('gemini-2.5-pro', { maxTokens: 100 })).toBeUndefined();
      expect(thinkingFor('gemini-4-argon', { maxTokens: 1536 })).toBeUndefined();
      expect(thinkingFor('gemini-3.8-flash', { maxTokens: 1536, supportsThinking: false })).toBeUndefined();
    });
  });
});

describe('extractGeminiText', () => {
  it('joins the text parts and skips the rest', () => {
    expect(extractGeminiText([{ text: 'one ' }, { text: 2 }, { text: 'two' }])).toBe('one two');
    expect(extractGeminiText(undefined)).toBe('');
  });
});
