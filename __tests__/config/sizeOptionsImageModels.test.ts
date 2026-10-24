import { mapSizeToProvider } from '@/config/create/sizeOptions';

describe('Create image size mapping', () => {
  it('maps OpenAI portrait and landscape sizes by selected image model', () => {
    expect(mapSizeToProvider('portrait', 'openai', 'gpt-image-1.5')).toBe('1024x1536');
    expect(mapSizeToProvider('landscape', 'openai', 'gpt-image-1.5')).toBe('1536x1024');
    expect(mapSizeToProvider('portrait', 'openai', 'unknown-openai-image-model')).toBe('1024x1536');
    expect(mapSizeToProvider('landscape', 'openai', 'unknown-openai-image-model')).toBe('1536x1024');
  });

  it('preserves provider-native aspect ratios for Gemini and Grok', () => {
    expect(mapSizeToProvider('portrait', 'google', 'gemini-2.5-flash-image')).toBe('9:16');
    expect(mapSizeToProvider('landscape', 'google', 'gemini-3-pro-image')).toBe('16:9');
    expect(mapSizeToProvider('landscape', 'google', 'gemini-2.5-flash-image')).toBe('16:9');
    expect(mapSizeToProvider('square', 'grok', 'grok-imagine-image')).toBe('1:1');
  });

  it('falls back to the provider default image model when selection is invalid', () => {
    expect(mapSizeToProvider('portrait', 'openai', 'gpt-5.5')).toBe('1024x1536');
  });
});
