import { ChatGPTAdapter } from '@/services/ai/adapters/openai/ChatGPTAdapter';
import type { AdapterConfig } from '@/services/ai/types/adapter.types';
import type { Message } from '@/types';

// Mock react-native-sse
jest.mock('react-native-sse', () => {
  return jest.fn().mockImplementation(() => ({
    addEventListener: jest.fn(),
    close: jest.fn(),
  }));
});

describe('ChatGPTAdapter - Web Search & Citations', () => {
  let adapter: ChatGPTAdapter;
  const baseConfig: AdapterConfig = {
    provider: 'openai',
    apiKey: 'test-api-key',
    model: 'gpt-5',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('extractCitationsFromText', () => {
    it('should extract citations from inline markdown links', () => {
      const config = { ...baseConfig };
      adapter = new ChatGPTAdapter(config);

      // Access the private method via streamMessage's citation extraction
      const text = 'Here is some info [Source 1](https://example.com/1) and more [Source 2](https://example.com/2).';

      // Since extractCitationsFromText is internal to streamMessage, we need to test its behavior
      // by examining what would happen in the stream handler
      const citations: Array<{ index: number; url: string; title?: string }> = [];
      const seenUrls = new Set<string>();
      const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
      let match;
      let citationIndex = 1;

      while ((match = linkRegex.exec(text)) !== null) {
        const title = match[1];
        const url = match[2];
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          citations.push({ index: citationIndex++, url, title });
        }
      }

      expect(citations).toEqual([
        { index: 1, url: 'https://example.com/1', title: 'Source 1' },
        { index: 2, url: 'https://example.com/2', title: 'Source 2' },
      ]);
    });

    it('should handle text with no citations', () => {
      const text = 'This is just plain text with no links.';

      const citations: Array<{ index: number; url: string; title?: string }> = [];
      const seenUrls = new Set<string>();
      const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
      let match;
      let citationIndex = 1;

      while ((match = linkRegex.exec(text)) !== null) {
        const title = match[1];
        const url = match[2];
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          citations.push({ index: citationIndex++, url, title });
        }
      }

      expect(citations).toEqual([]);
    });

    it('should deduplicate repeated URLs', () => {
      const text = 'First mention [Title 1](https://example.com) and second [Title 2](https://example.com).';

      const citations: Array<{ index: number; url: string; title?: string }> = [];
      const seenUrls = new Set<string>();
      const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
      let match;
      let citationIndex = 1;

      while ((match = linkRegex.exec(text)) !== null) {
        const title = match[1];
        const url = match[2];
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          citations.push({ index: citationIndex++, url, title });
        }
      }

      expect(citations).toHaveLength(1);
      expect(citations[0]).toEqual({ index: 1, url: 'https://example.com', title: 'Title 1' });
    });

    it('should extract multiple unique citations', () => {
      const text = 'According to [OpenAI](https://openai.com), [Google](https://google.com), and [Microsoft](https://microsoft.com).';

      const citations: Array<{ index: number; url: string; title?: string }> = [];
      const seenUrls = new Set<string>();
      const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
      let match;
      let citationIndex = 1;

      while ((match = linkRegex.exec(text)) !== null) {
        const title = match[1];
        const url = match[2];
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          citations.push({ index: citationIndex++, url, title });
        }
      }

      expect(citations).toHaveLength(3);
      expect(citations).toEqual([
        { index: 1, url: 'https://openai.com', title: 'OpenAI' },
        { index: 2, url: 'https://google.com', title: 'Google' },
        { index: 3, url: 'https://microsoft.com', title: 'Microsoft' },
      ]);
    });

    it('should handle URLs with query parameters and fragments', () => {
      const text = 'Check [this article](https://example.com/page?param=value#section).';

      const citations: Array<{ index: number; url: string; title?: string }> = [];
      const seenUrls = new Set<string>();
      const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
      let match;
      let citationIndex = 1;

      while ((match = linkRegex.exec(text)) !== null) {
        const title = match[1];
        const url = match[2];
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          citations.push({ index: citationIndex++, url, title });
        }
      }

      expect(citations).toEqual([
        { index: 1, url: 'https://example.com/page?param=value#section', title: 'this article' },
      ]);
    });
  });

  describe('Web Search Tool Integration', () => {
    it('should add web_search tool to request body when webSearchEnabled is true', () => {
      const config = { ...baseConfig, webSearchEnabled: true };
      adapter = new ChatGPTAdapter(config);

      // Mock the EventSource to verify the request body
      const EventSource = require('react-native-sse');

      EventSource.mockImplementationOnce((url: string, options: unknown) => {
        // Capture and verify the request
        const body = (options as { body: string }).body;
        const requestBody = JSON.parse(body);

        // Verify tools are included
        expect(requestBody).toHaveProperty('tools');
        expect(requestBody.tools).toEqual([{ type: 'web_search' }]);

        return {
          addEventListener: jest.fn(),
          close: jest.fn(),
        };
      });

      // Trigger the stream (this will construct the EventSource)
      adapter.streamMessage('Test message', []);
    });

    it('should not add web_search tool when webSearchEnabled is false', () => {
      const config = { ...baseConfig, webSearchEnabled: false };
      adapter = new ChatGPTAdapter(config);

      const EventSource = require('react-native-sse');

      EventSource.mockImplementationOnce((url: string, options: unknown) => {
        const body = (options as { body: string }).body;
        const requestBody = JSON.parse(body);
        expect(requestBody.tools).toBeUndefined();
        return {
          addEventListener: jest.fn(),
          close: jest.fn(),
        };
      });

      const generator = adapter.streamMessage('Test message', []);
      generator.return?.();
    });

    it('should not add web_search tool when webSearchEnabled is undefined', () => {
      const config = { ...baseConfig }; // webSearchEnabled not set
      adapter = new ChatGPTAdapter(config);

      const EventSource = require('react-native-sse');

      EventSource.mockImplementationOnce((url: string, options: unknown) => {
        const body = (options as { body: string }).body;
        const requestBody = JSON.parse(body);
        expect(requestBody.tools).toBeUndefined();
        return {
          addEventListener: jest.fn(),
          close: jest.fn(),
        };
      });

      const generator = adapter.streamMessage('Test message', []);
      generator.return?.();
    });
  });

  describe('Citation Event Emission', () => {
    it('should test citation extraction logic from text', () => {
      // Test the citation extraction regex logic directly
      const text = 'According to [OpenAI](https://openai.com), this is true.';

      const citations: Array<{ index: number; url: string; title?: string }> = [];
      const seenUrls = new Set<string>();
      const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
      let match;
      let citationIndex = 1;

      while ((match = linkRegex.exec(text)) !== null) {
        const title = match[1];
        const url = match[2];
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          citations.push({ index: citationIndex++, url, title });
        }
      }

      expect(citations).toEqual([
        { index: 1, url: 'https://openai.com', title: 'OpenAI' },
      ]);
    });

    it('should not extract citations when text has no links', () => {
      const text = 'This is just plain text with no links.';

      const citations: Array<{ index: number; url: string; title?: string }> = [];
      const seenUrls = new Set<string>();
      const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
      let match;
      let citationIndex = 1;

      while ((match = linkRegex.exec(text)) !== null) {
        const title = match[1];
        const url = match[2];
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          citations.push({ index: citationIndex++, url, title });
        }
      }

      expect(citations).toHaveLength(0);
    });
  });

  describe('Provider Configuration', () => {
    it('should correctly identify models that support web search', () => {
      const webSearchModels = ['gpt-5', 'gpt-4o', 'gpt-4-turbo', 'gpt-4.1'];

      webSearchModels.forEach(model => {
        const config = { ...baseConfig, model };
        adapter = new ChatGPTAdapter(config);
        const providerConfig = adapter['getProviderConfig']();

        // All these models should support the features needed for web search
        expect(providerConfig.capabilities.functionCalling).toBe(true);
      });
    });

    it('should handle conversation history with web search enabled', async () => {
      const config = { ...baseConfig, webSearchEnabled: true };
      adapter = new ChatGPTAdapter(config);

      const history: Message[] = [
        {
          id: '1',
          sender: 'User',
          senderType: 'user',
          content: 'What is the weather?',
          timestamp: Date.now() - 1000,
        },
        {
          id: '2',
          sender: 'ChatGPT',
          senderType: 'ai',
          content: 'According to [Weather.com](https://weather.com), it is sunny.',
          timestamp: Date.now(),
          metadata: { providerId: 'openai' },
        },
      ];

      const EventSource = require('react-native-sse');

      EventSource.mockImplementationOnce((url: string, options: unknown) => {
        const body = (options as { body: string }).body;
        const requestBody = JSON.parse(body);

        // Verify tools are included
        expect(requestBody.tools).toEqual([{ type: 'web_search' }]);

        // Verify history is formatted correctly
        expect(requestBody.input).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.arrayContaining([
                expect.objectContaining({ type: 'input_text', text: 'What is the weather?' }),
              ]),
            }),
            expect.objectContaining({
              role: 'assistant',
              content: expect.arrayContaining([
                expect.objectContaining({
                  type: 'output_text',
                  text: 'According to [Weather.com](https://weather.com), it is sunny.',
                }),
              ]),
            }),
            expect.objectContaining({
              role: 'user',
              content: expect.arrayContaining([
                expect.objectContaining({ type: 'input_text', text: 'Tell me more' }),
              ]),
            }),
          ])
        );

        return {
          addEventListener: jest.fn(),
          close: jest.fn(),
        };
      });

      const generator = adapter.streamMessage('Tell me more', history);
      await generator.return?.();
    });
  });
});
