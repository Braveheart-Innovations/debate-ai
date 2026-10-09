import type { Message } from '../../contract/types';
import type { ToolDefinition } from '../../contract/lib/ai/tools/types';
import {
  WEB_SEARCH_SYSTEM_NOTE,
  buildModelRequest,
  ensureMessageAlternation,
  formatHistory,
  getEffectiveToolRequest,
  sanitizeToolsForProvider,
  type ResumptionContext,
} from '../requestShaping';

const opts = { providerId: 'claude' };

// Ported verbatim from symposium-ai-web src/lib/ai/__tests__/base-adapter.test.ts
// ("formatHistory"), calling the extracted pure function.
describe('formatHistory', () => {
  it('should return empty array for empty history', () => {
    expect(formatHistory([], opts)).toEqual([]);
  });

  it('should format user messages correctly', () => {
    const history: Message[] = [
      { id: '1', content: 'Hello', sender: 'User', senderType: 'user', timestamp: Date.now() },
    ];
    expect(formatHistory(history, opts)).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('should format assistant messages correctly in chat mode', () => {
    const history: Message[] = [
      { id: '1', content: 'Hello', sender: 'User', senderType: 'user', timestamp: Date.now() },
      { id: '2', content: 'Hi there!', sender: 'Claude', senderType: 'ai', timestamp: Date.now() },
    ];
    expect(formatHistory(history, opts)).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ]);
  });

  it('should truncate history to last 20 messages (non-tool flows)', () => {
    const history: Message[] = Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      content: `Message ${i}`,
      sender: i % 2 === 0 ? 'User' : 'Claude',
      senderType: (i % 2 === 0 ? 'user' : 'ai') as 'user' | 'ai',
      timestamp: Date.now(),
    }));
    expect(formatHistory(history, opts).length).toBeLessThanOrEqual(20);
  });

  it('should add resumption context as first message', () => {
    const history: Message[] = [
      { id: '1', content: 'Hello', sender: 'User', senderType: 'user', timestamp: Date.now() },
    ];
    const resumptionContext: ResumptionContext = {
      isResuming: true,
      originalPrompt: { id: '0', content: 'Original question that was very long', sender: 'User', senderType: 'user', timestamp: Date.now() },
    };
    const result = formatHistory(history, { ...opts, resumptionContext });
    expect(result[0].role).toBe('user');
    expect(result[0].content).toContain('[Continuation note]');
    expect(result[0].content).toContain('Original question');
  });

  it('should merge consecutive same-role messages', () => {
    const history: Message[] = [
      { id: '1', content: 'Hello', sender: 'User', senderType: 'user', timestamp: Date.now() },
      { id: '2', content: 'World', sender: 'User', senderType: 'user', timestamp: Date.now() },
    ];
    expect(formatHistory(history, opts)).toEqual([{ role: 'user', content: 'Hello\n\nWorld' }]);
  });

  it('should keep assistant tool-call messages separate from adjacent assistant text', () => {
    const history: Message[] = [
      { id: '1', content: 'Planning step.', sender: 'Claude', senderType: 'ai', timestamp: Date.now() },
      {
        id: '2',
        content: '',
        sender: 'Claude',
        senderType: 'ai',
        timestamp: Date.now(),
        metadata: {
          toolCalls: [
            { id: 'call_1', type: 'function', function: { name: 'fetch_api', arguments: '{"url":"https://example.com"}' } },
          ],
        },
      },
    ];
    const result = formatHistory(history, opts);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ role: 'assistant', content: 'Planning step.' });
    expect(result[1]).toMatchObject({
      role: 'assistant',
      content: '',
      toolCalls: [
        { id: 'call_1', type: 'function', function: { name: 'fetch_api', arguments: '{"url":"https://example.com"}' } },
      ],
    });
  });

  it('should filter out messages with empty content', () => {
    const history: Message[] = [
      { id: '1', content: 'Hello', sender: 'User', senderType: 'user', timestamp: Date.now() },
      { id: '2', content: '', sender: 'Claude', senderType: 'ai', timestamp: Date.now() },
      { id: '3', content: 'Goodbye', sender: 'User', senderType: 'user', timestamp: Date.now() },
    ];
    expect(formatHistory(history, opts)).toEqual([{ role: 'user', content: 'Hello\n\nGoodbye' }]);
  });

  describe('debate mode', () => {
    const debate = { ...opts, isDebateMode: true };

    it('should treat own messages as assistant role', () => {
      const history: Message[] = [
        { id: '1', content: 'Hello', sender: 'User', senderType: 'user', timestamp: Date.now() },
        { id: '2', content: 'My argument', sender: 'Claude', senderType: 'ai', timestamp: Date.now(), metadata: { providerId: 'claude' } },
      ];
      expect(formatHistory(history, debate)[1]).toEqual({ role: 'assistant', content: 'My argument' });
    });

    it('should wrap other AI messages as user role with speaker tag', () => {
      const history: Message[] = [
        { id: '1', content: 'Other argument', sender: 'ChatGPT', senderType: 'ai', timestamp: Date.now(), metadata: { providerId: 'openai' } },
      ];
      expect(formatHistory(history, debate)[0]).toEqual({ role: 'user', content: '[ChatGPT] Other argument' });
    });

    it('should use default speaker name when sender is not provided', () => {
      const history: Message[] = [
        { id: '1', content: 'Argument', sender: '', senderType: 'ai', timestamp: Date.now(), metadata: { providerId: 'openai' } },
      ];
      expect(formatHistory(history, debate)[0].content).toContain('[Other AI]');
    });
  });
});

describe('Analyze tool exchanges', () => {
  const now = Date.now();
  const history: Message[] = [
    { id: 'u', content: 'Analyze this', sender: 'User', senderType: 'user', timestamp: now },
    {
      id: 'a1', content: '', sender: 'Claude', senderType: 'ai', timestamp: now,
      metadata: { toolCalls: [{ id: 'call_1', type: 'function', function: { name: 'execute_python', arguments: '{}' } }] },
    },
    { id: 't1', content: 'ok', sender: 'tool', senderType: 'tool', timestamp: now, metadata: { isToolResult: true, toolCallId: 'call_1' } },
    // A reviewer's message from another provider: labeled user content, never "our" words.
    { id: 'r', content: 'Check the totals', sender: 'GPT-6.1 Sol', senderType: 'ai', timestamp: now, metadata: { providerId: 'openai' } },
  ];

  it('keeps own call/result pairs and labels other AIs as user content', () => {
    expect(formatHistory(history, opts)).toEqual([
      { role: 'user', content: 'Analyze this' },
      expect.objectContaining({ role: 'assistant', content: '', toolCalls: [expect.objectContaining({ id: 'call_1' })] }),
      expect.objectContaining({ role: 'tool', content: 'ok', toolCallId: 'call_1' }),
      { role: 'user', content: '[GPT-6.1 Sol] Check the totals' },
    ]);
  });

  it('drops a tool result whose call was made by another AI', () => {
    const foreign: Message[] = [
      history[0],
      { ...history[1], metadata: { ...history[1].metadata, providerId: 'openai' } },
      history[2],
    ];
    const roles = formatHistory(foreign, opts).map((m) => m.role);
    expect(roles).not.toContain('tool');
  });
});

describe('ensureMessageAlternation', () => {
  it('merges same-role text, keeps tool messages apart, and never starts with assistant', () => {
    const result = ensureMessageAlternation([
      { role: 'assistant', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'tool', content: 'r', toolCallId: 'c1' },
      { role: 'tool', content: 's', toolCallId: 'c2' },
    ]);
    expect(result.map((m) => [m.role, m.content])).toEqual([
      ['user', '[Conversation continues]'],
      ['assistant', 'a\n\nb'],
      ['tool', 'r'],
      ['tool', 's'],
    ]);
  });
});

const tool: ToolDefinition = {
  name: 'fetch_api',
  description: 'Fetch',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 50, default: 10, description: 'n' },
      mode: { type: ['string', 'null'], description: 'm' } as never,
    },
    required: ['limit'],
  },
} as ToolDefinition;

describe('tool schemas', () => {
  it('passes tools through untouched for providers with full JSON Schema', () => {
    expect(sanitizeToolsForProvider([tool], 'claude')[0]).toBe(tool);
  });

  it('strips Gemini-unsupported keywords and maps integer to number', () => {
    const [gemini] = sanitizeToolsForProvider([tool], 'google');
    expect(gemini.parameters.additionalProperties).toBeUndefined();
    expect(gemini.parameters.properties.limit).toEqual({ type: 'number', description: 'n' });
    expect(gemini.parameters.properties.mode.type).toBe('string');
  });

  it('runs Command A+ in auto mode (it rejects tool_choice)', () => {
    expect(getEffectiveToolRequest('cohere', 'command-a-plus-05-2026', [tool], 'required')).toEqual({ tools: [tool] });
    expect(getEffectiveToolRequest('cohere', 'command-a-plus-05-2026', [tool], 'none')).toEqual({});
    expect(getEffectiveToolRequest('claude', 'claude-opus-5-5', [tool], 'required')).toEqual({ tools: [tool], toolChoice: 'required' });
  });


});

describe('buildModelRequest', () => {
  const base = { providerId: 'claude', modelId: 'claude-sonnet-5-5', history: [] as Message[] };

  it('appends the prompt as the user turn', () => {
    const shaped = buildModelRequest({ ...base, prompt: 'Hi' });
    expect(shaped.messages).toEqual([expect.objectContaining({ role: 'user', content: 'Hi' })]);
  });

  it('adds no empty user turn after tool results (follow-up rounds)', () => {
    const history: Message[] = [
      { id: 'u', content: 'Go', sender: 'User', senderType: 'user', timestamp: 1 },
      { id: 'a', content: '', sender: 'Claude', senderType: 'ai', timestamp: 1, metadata: { toolCalls: [{ id: 'c1', type: 'function', function: { name: 'execute_python', arguments: '{}' } }] } },
      { id: 't', content: 'done', sender: 'tool', senderType: 'tool', timestamp: 1, metadata: { isToolResult: true, toolCallId: 'c1' } },
    ];
    const shaped = buildModelRequest({ ...base, history, prompt: '' });
    expect(shaped.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool']);
    expect(shaped.messages[1].tool_calls?.[0].id).toBe('c1');
    expect(shaped.messages[2].tool_call_id).toBe('c1');
  });

  it('adds the web_search note only when web_search is offered', () => {
    const search = { ...tool, name: 'web_search' } as ToolDefinition;
    expect(buildModelRequest({ ...base, prompt: 'x', systemPrompt: 'S', tools: [search] }).systemPrompt)
      .toBe(`S\n\n${WEB_SEARCH_SYSTEM_NOTE}`);
    expect(buildModelRequest({ ...base, prompt: 'x', systemPrompt: 'S', tools: [tool] }).systemPrompt).toBe('S');
  });

  it('drops parameters the model does not accept (catalog-driven)', () => {
    // claude-opus-5-5 rejects temperature; maxTokens is accepted.
    const opus = buildModelRequest({ ...base, modelId: 'claude-opus-5-5', prompt: 'x', temperature: 0.7, maxTokens: 1000 });
    expect(opus.temperature).toBeUndefined();
    expect(opus.maxTokens).toBe(1000);
  });

  it('defaults Gemini to temperature 1.0 when none is requested', () => {
    const gemini = buildModelRequest({ ...base, providerId: 'google', modelId: 'gemini-3.8-flash', prompt: 'x' });
    expect(gemini.temperature).toBe(1.0);
  });

  it('passes only image and document attachments to the canonical request', () => {
    const shaped = buildModelRequest({
      ...base,
      prompt: 'look',
      attachments: [
        { type: 'image', uri: 'u', mimeType: 'image/png', base64: 'AA', fileName: 'p.png' },
        { type: 'audio', uri: 'a', mimeType: 'audio/mpeg' },
      ],
    });
    expect(shaped.attachments).toEqual([expect.objectContaining({ type: 'image', fileName: 'p.png' })]);
    expect(shaped.messages[0].content).toContain('[Attachment 1] image p.png');
  });
});
