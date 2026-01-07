import { GeminiAdapter } from '@/services/ai/adapters/google/GeminiAdapter';
import type { AdapterConfig } from '@/services/ai/types/adapter.types';
import type { Message } from '@/types';

// Mock react-native-sse
jest.mock('react-native-sse', () => {
  return jest.fn().mockImplementation(() => ({
    addEventListener: jest.fn(),
    close: jest.fn(),
  }));
});

// Mock fetch for non-streaming tests
global.fetch = jest.fn();

describe('GeminiAdapter - Web Search & Citations', () => {
  let adapter: GeminiAdapter;
  const baseConfig: AdapterConfig = {
    provider: 'google',
    apiKey: 'test-api-key',
    model: 'gemini-2.5-pro',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
  });

  describe('extractCitationsFromGrounding', () => {
    it('should extract citations from Gemini grounding metadata', async () => {
      const config = { ...baseConfig, webSearchEnabled: true };
      adapter = new GeminiAdapter(config);

      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'This is the response text.' }],
            },
            groundingMetadata: {
              groundingChunks: [
                {
                  web: {
                    uri: 'https://example.com/article1',
                    title: 'Article 1 Title',
                  },
                },
                {
                  web: {
                    uri: 'https://example.com/article2',
                    title: 'Article 2 Title',
                  },
                },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await adapter.sendMessage('Test message');

      expect(result.metadata?.citations).toHaveLength(2);
      expect(result.metadata?.citations).toEqual([
        {
          index: 1,
          url: 'https://example.com/article1',
          title: 'Article 1 Title',
          domain: 'Article 1 Title',
        },
        {
          index: 2,
          url: 'https://example.com/article2',
          title: 'Article 2 Title',
          domain: 'Article 2 Title',
        },
      ]);
    });

    it('should handle response with no grounding metadata', async () => {
      const config = { ...baseConfig, webSearchEnabled: true };
      adapter = new GeminiAdapter(config);

      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'This is the response text.' }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await adapter.sendMessage('Test message');

      expect(result.metadata?.citations).toBeUndefined();
    });

    it('should handle empty grounding chunks array', async () => {
      const config = { ...baseConfig, webSearchEnabled: true };
      adapter = new GeminiAdapter(config);

      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'This is the response text.' }],
            },
            groundingMetadata: {
              groundingChunks: [],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await adapter.sendMessage('Test message');

      expect(result.metadata?.citations).toBeUndefined();
    });

    it('should use title as domain for Gemini citations', async () => {
      const config = { ...baseConfig, webSearchEnabled: true };
      adapter = new GeminiAdapter(config);

      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Response text' }],
            },
            groundingMetadata: {
              groundingChunks: [
                {
                  web: {
                    uri: 'https://google.com/url?redirect=example.com',
                    title: 'Example Website',
                  },
                },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await adapter.sendMessage('Test message');

      expect(result.metadata?.citations).toEqual([
        {
          index: 1,
          url: 'https://google.com/url?redirect=example.com',
          title: 'Example Website',
          domain: 'Example Website',
        },
      ]);
    });

    it('should provide fallback domain when title is missing', async () => {
      const config = { ...baseConfig, webSearchEnabled: true };
      adapter = new GeminiAdapter(config);

      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Response text' }],
            },
            groundingMetadata: {
              groundingChunks: [
                {
                  web: {
                    uri: 'https://example.com',
                  },
                },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await adapter.sendMessage('Test message');

      expect(result.metadata?.citations).toEqual([
        {
          index: 1,
          url: 'https://example.com',
          title: undefined,
          domain: 'Source 1',
        },
      ]);
    });
  });

  describe('Web Search Tool Integration', () => {
    it('should add google_search tool to request body when webSearchEnabled is true', async () => {
      const config = { ...baseConfig, webSearchEnabled: true };
      adapter = new GeminiAdapter(config);

      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Response text' }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await adapter.sendMessage('Test message');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('generateContent'),
        expect.objectContaining({
          method: 'POST',
          body: expect.any(String),
        })
      );

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      expect(requestBody.tools).toEqual([{ google_search: {} }]);
    });

    it('should not add google_search tool when webSearchEnabled is false', async () => {
      const config = { ...baseConfig, webSearchEnabled: false };
      adapter = new GeminiAdapter(config);

      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Response text' }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await adapter.sendMessage('Test message');

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      expect(requestBody.tools).toBeUndefined();
    });

    it('should not add google_search tool when webSearchEnabled is undefined', async () => {
      const config = { ...baseConfig }; // webSearchEnabled not set
      adapter = new GeminiAdapter(config);

      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Response text' }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await adapter.sendMessage('Test message');

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      expect(requestBody.tools).toBeUndefined();
    });
  });

  describe('Streaming with Web Search', () => {
    it('should use non-streaming when webSearchEnabled is true', async () => {
      const config = { ...baseConfig, webSearchEnabled: true };
      adapter = new GeminiAdapter(config);

      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Response with citations' }],
            },
            groundingMetadata: {
              groundingChunks: [
                {
                  web: {
                    uri: 'https://example.com',
                    title: 'Example',
                  },
                },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const onEvent = jest.fn();
      const generator = adapter.streamMessage('Test', [], undefined, undefined, undefined, undefined, onEvent);

      // Consume all chunks
      const chunks: string[] = [];
      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      const fullText = chunks.join('');
      expect(fullText).toBe('Response with citations');

      // Should emit citations event
      expect(onEvent).toHaveBeenCalledWith({
        type: 'citations',
        citations: [
          {
            index: 1,
            url: 'https://example.com',
            title: 'Example',
            domain: 'Example',
          },
        ],
      });
    });

    it('should simulate streaming with controlled chunk size', async () => {
      const config = { ...baseConfig, webSearchEnabled: true };
      adapter = new GeminiAdapter(config);

      const longText = 'A'.repeat(100);
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: longText }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const generator = adapter.streamMessage('Test');

      const chunks: string[] = [];
      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      // Should receive multiple chunks (chunkSize = 8 in implementation)
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.join('')).toBe(longText);
    });

    it('should use real streaming when webSearchEnabled is false', async () => {
      const config = { ...baseConfig, webSearchEnabled: false };
      adapter = new GeminiAdapter(config);

      const EventSource = require('react-native-sse');
      let mockEventSource: {
        addEventListener: jest.Mock;
        close: jest.Mock;
      };

      EventSource.mockImplementationOnce(() => {
        mockEventSource = {
          addEventListener: jest.fn((eventType: string, handler: (evt: unknown) => void) => {
            if (eventType === 'message') {
              // Simulate streaming chunks
              setTimeout(() => {
                handler({ data: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Chunk 1' }] } }] }) });
              }, 10);
              setTimeout(() => {
                handler({
                  data: JSON.stringify({
                    candidates: [{ content: { parts: [{ text: ' Chunk 2' }] }, finishReason: 'STOP' }],
                  }),
                });
              }, 20);
            }
          }),
          close: jest.fn(),
        };
        return mockEventSource;
      });

      const generator = adapter.streamMessage('Test');

      const chunks: string[] = [];
      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      expect(chunks).toContain('Chunk 1');
      expect(chunks).toContain(' Chunk 2');
    });
  });

  describe('Citation Metadata Integration', () => {
    it('should include citations in metadata when present', async () => {
      const config = { ...baseConfig, webSearchEnabled: true };
      adapter = new GeminiAdapter(config);

      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Response' }],
            },
            groundingMetadata: {
              groundingChunks: [
                {
                  web: {
                    uri: 'https://example.com/1',
                    title: 'Source 1',
                  },
                },
                {
                  web: {
                    uri: 'https://example.com/2',
                    title: 'Source 2',
                  },
                },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await adapter.sendMessage('Test');

      expect(result.metadata).toEqual({
        citations: [
          {
            index: 1,
            url: 'https://example.com/1',
            title: 'Source 1',
            domain: 'Source 1',
          },
          {
            index: 2,
            url: 'https://example.com/2',
            title: 'Source 2',
            domain: 'Source 2',
          },
        ],
      });
    });

    it('should not include metadata when no citations exist', async () => {
      const config = { ...baseConfig, webSearchEnabled: true };
      adapter = new GeminiAdapter(config);

      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Response' }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await adapter.sendMessage('Test');

      expect(result.metadata).toBeUndefined();
    });
  });

  describe('Conversation History with Web Search', () => {
    it('should handle conversation history when web search is enabled', async () => {
      const config = { ...baseConfig, webSearchEnabled: true };
      adapter = new GeminiAdapter(config);

      const history: Message[] = [
        {
          id: '1',
          sender: 'User',
          senderType: 'user',
          content: 'What is AI?',
          timestamp: Date.now() - 1000,
        },
        {
          id: '2',
          sender: 'Gemini',
          senderType: 'ai',
          content: 'AI stands for Artificial Intelligence.',
          timestamp: Date.now(),
          metadata: { providerId: 'google' },
        },
      ];

      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'More details about AI...' }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await adapter.sendMessage('Tell me more', history);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      // Verify tools are included
      expect(requestBody.tools).toEqual([{ google_search: {} }]);

      // Verify history is formatted correctly
      expect(requestBody.contents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            parts: [{ text: 'What is AI?' }],
          }),
          expect.objectContaining({
            role: 'model',
            parts: [{ text: 'AI stands for Artificial Intelligence.' }],
          }),
          expect.objectContaining({
            role: 'user',
            parts: [{ text: 'Tell me more' }],
          }),
        ])
      );
    });
  });
});
