// Ported verbatim from symposium-ai-web src/services/analyze/__tests__/history.test.ts (imports only).
import type { AI, Message } from '../../contract/types';
import { AnalyzeStatus, type AnalyzeSession } from '../contracts';
import { buildAnalyzeHistory, pruneHistoryIfNeeded } from '../history';

const TEST_AI: AI = {
  id: 'ai-openai',
  provider: 'openai',
  name: 'OpenAI',
  model: 'unknown-model',
};

function makeSession(messages: Message[]): AnalyzeSession {
  return {
    id: 'analyze_test',
    ai: TEST_AI,
    messages,
    startTime: Date.now(),
    status: AnalyzeStatus.IDLE,
  };
}

describe('analyze history pruning', () => {
  it('keeps first user message and last 4 tool exchange groups when over threshold', () => {
    const large = 'x'.repeat(50000);
    const messages: Message[] = [
      {
        id: 'u0',
        sender: 'user',
        senderType: 'user',
        content: 'initial question',
        timestamp: 1,
      },
    ];

    for (let i = 0; i < 6; i++) {
      messages.push({
        id: `ai_${i}`,
        sender: 'assistant',
        senderType: 'ai',
        content: `tool planning ${i} ${large}`,
        timestamp: 10 + i,
        metadata: {
          toolCalls: [
            {
              id: `call_${i}`,
              type: 'function',
              function: { name: 'fetch_api', arguments: '{"url":"https://example.com"}' },
            },
          ],
        },
      });
      messages.push({
        id: `tool_${i}`,
        sender: 'tool',
        senderType: 'tool',
        content: `tool result ${i} ${large}`,
        timestamp: 20 + i,
        metadata: {
          toolCallId: `call_${i}`,
          toolName: 'fetch_api',
          isToolResult: true,
        },
      });
    }

    const session = makeSession(messages);
    const pruned = pruneHistoryIfNeeded(session, messages);

    expect(pruned.some((msg) => msg.id === 'u0')).toBe(true);

    const pruneNotes = pruned.filter((msg) => msg.content.includes('earlier tool exchanges omitted'));
    expect(pruneNotes).toHaveLength(1);

    expect(pruned.some((msg) => msg.id === 'ai_0')).toBe(false);
    expect(pruned.some((msg) => msg.id === 'ai_1')).toBe(false);
    expect(pruned.some((msg) => msg.id === 'tool_0')).toBe(false);
    expect(pruned.some((msg) => msg.id === 'tool_1')).toBe(false);

    expect(pruned.some((msg) => msg.id === 'ai_2')).toBe(true);
    expect(pruned.some((msg) => msg.id === 'ai_3')).toBe(true);
    expect(pruned.some((msg) => msg.id === 'ai_4')).toBe(true);
    expect(pruned.some((msg) => msg.id === 'ai_5')).toBe(true);
  });

  it('filters empty placeholders but keeps tool messages and ai tool-call stubs', () => {
    const messages: Message[] = [
      {
        id: 'user_1',
        sender: 'user',
        senderType: 'user',
        content: 'hello',
        timestamp: 1,
      },
      {
        id: 'ai_empty',
        sender: 'assistant',
        senderType: 'ai',
        content: '',
        timestamp: 2,
      },
      {
        id: 'ai_tool_call',
        sender: 'assistant',
        senderType: 'ai',
        content: '',
        timestamp: 3,
        metadata: {
          toolCalls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'execute_python', arguments: '{"code":"print(1)"}' },
            },
          ],
        },
      },
      {
        id: 'tool_1',
        sender: 'tool',
        senderType: 'tool',
        content: 'Executed successfully',
        timestamp: 4,
        metadata: {
          toolCallId: 'call_1',
          toolName: 'execute_python',
          isToolResult: true,
        },
      },
    ];

    const history = buildAnalyzeHistory(makeSession(messages));

    expect(history.some((msg) => msg.id === 'ai_empty')).toBe(false);
    expect(history.some((msg) => msg.id === 'ai_tool_call')).toBe(true);
    expect(history.some((msg) => msg.id === 'tool_1')).toBe(true);
  });

  it('repairs an orphan tool result into plain context', () => {
    const messages: Message[] = [
      {
        id: 'user_1',
        sender: 'user',
        senderType: 'user',
        content: 'continue the prior analysis',
        timestamp: 1,
      },
      {
        id: 'tool_orphan',
        sender: 'tool',
        senderType: 'tool',
        content: 'Fetched API payload',
        timestamp: 2,
        metadata: {
          toolCallId: 'call_missing',
          toolName: 'fetch_api',
          isToolResult: true,
          success: true,
        },
      },
    ];

    const history = buildAnalyzeHistory(makeSession(messages));
    const restoredToolContext = history.find((message) => message.id === 'tool_orphan');

    expect(restoredToolContext?.senderType).toBe('user');
    expect(restoredToolContext?.content).toContain('Result of a fetch_api call:');
    // A factual record only — no steering text for the model to imitate.
    expect(restoredToolContext?.content).not.toMatch(/regenerate|reuse|already/i);
    expect(restoredToolContext?.content).toContain('Fetched API payload');
    expect(restoredToolContext?.metadata?.isToolResult).toBeUndefined();
    expect(restoredToolContext?.metadata?.toolCallId).toBeUndefined();
  });

  it('repairs an assistant tool-call group with missing results into plain text', () => {
    const messages: Message[] = [
      {
        id: 'user_1',
        sender: 'user',
        senderType: 'user',
        content: 'build a report',
        timestamp: 1,
      },
      {
        id: 'ai_tool_call',
        sender: 'assistant',
        senderType: 'ai',
        content: '',
        timestamp: 2,
        metadata: {
          toolCalls: [
            {
              id: 'call_python',
              type: 'function',
              function: { name: 'execute_python', arguments: '{"code":"print(1)"}' },
            },
          ],
        },
      },
      {
        id: 'assistant_final',
        sender: 'assistant',
        senderType: 'ai',
        content: 'Done.',
        timestamp: 3,
      },
    ];

    const history = buildAnalyzeHistory(makeSession(messages));
    const downgradedAssistant = history.find((message) => message.id === 'ai_tool_call');

    expect(downgradedAssistant?.senderType).toBe('ai');
    expect(downgradedAssistant?.metadata?.toolCalls).toBeUndefined();
    expect(downgradedAssistant?.content).toContain('Tool calls made here (no complete result was recorded):');
    expect(downgradedAssistant?.content).not.toMatch(/re-run|rebuild|reuse|already/i);
    // The actual code is preserved as plain text so the model sees what it ran.
    expect(downgradedAssistant?.content).toContain('print(1)');
  });

  it('keeps completed tool exchanges from earlier turns native', () => {
    const messages: Message[] = [
      {
        id: 'user_1',
        sender: 'user',
        senderType: 'user',
        content: 'audit this data',
        timestamp: 1,
      },
      {
        id: 'ai_tool_call',
        sender: 'assistant',
        senderType: 'ai',
        content: '',
        timestamp: 2,
        metadata: {
          toolCalls: [
            {
              id: 'call_python',
              type: 'function',
              function: { name: 'execute_python', arguments: '{"code":"print(1)"}' },
            },
          ],
        },
      },
      {
        id: 'tool_1',
        sender: 'tool',
        senderType: 'tool',
        content: 'Executed successfully',
        timestamp: 3,
        metadata: {
          toolCallId: 'call_python',
          toolName: 'execute_python',
          isToolResult: true,
          success: true,
        },
      },
      {
        id: 'assistant_final',
        sender: 'assistant',
        senderType: 'ai',
        content: 'Final report',
        timestamp: 4,
      },
      {
        id: 'user_followup',
        sender: 'user',
        senderType: 'user',
        content: 'continue from here',
        timestamp: 5,
      },
    ];

    const history = buildAnalyzeHistory(makeSession(messages));
    const priorToolCall = history.find((message) => message.id === 'ai_tool_call');
    const priorToolResult = history.find((message) => message.id === 'tool_1');

    // 2026-10-04: downgrading these to "I already made the tool call(s)…" text
    // taught Mistral sub-agents to write tool calls as text, ending their runs.
    expect(priorToolCall?.metadata?.toolCalls).toHaveLength(1);
    expect(priorToolCall?.content).toBe('');
    expect(priorToolResult?.senderType).toBe('tool');
    expect(priorToolResult?.metadata?.toolCallId).toBe('call_python');
  });

  it('keeps every completed tool exchange in a run native, not just the latest', () => {
    const messages: Message[] = [
      {
        id: 'user_1',
        sender: 'user',
        senderType: 'user',
        content: 'audit this data',
        timestamp: 1,
      },
      {
        id: 'ai_old_tool_call',
        sender: 'assistant',
        senderType: 'ai',
        content: '',
        timestamp: 2,
        metadata: {
          toolCalls: [
            {
              id: 'call_old',
              type: 'function',
              function: { name: 'fetch_api', arguments: '{"url":"https://example.com"}' },
            },
          ],
        },
      },
      {
        id: 'tool_old',
        sender: 'tool',
        senderType: 'tool',
        content: 'Fetched old payload',
        timestamp: 3,
        metadata: {
          toolCallId: 'call_old',
          toolName: 'fetch_api',
          isToolResult: true,
          success: true,
        },
      },
      {
        id: 'ai_active_tool_call',
        sender: 'assistant',
        senderType: 'ai',
        content: '',
        timestamp: 4,
        metadata: {
          toolCalls: [
            {
              id: 'call_active',
              type: 'function',
              function: { name: 'execute_python', arguments: '{"code":"print(2)"}' },
            },
          ],
        },
      },
      {
        id: 'tool_active',
        sender: 'tool',
        senderType: 'tool',
        content: 'Executed active call',
        timestamp: 5,
        metadata: {
          toolCallId: 'call_active',
          toolName: 'execute_python',
          isToolResult: true,
          success: true,
        },
      },
    ];

    const history = buildAnalyzeHistory(makeSession(messages));
    const oldToolCall = history.find((message) => message.id === 'ai_old_tool_call');
    const oldToolResult = history.find((message) => message.id === 'tool_old');
    const activeToolCall = history.find((message) => message.id === 'ai_active_tool_call');
    const activeToolResult = history.find((message) => message.id === 'tool_active');

    expect(oldToolCall?.metadata?.toolCalls).toHaveLength(1);
    expect(oldToolResult?.senderType).toBe('tool');
    expect(oldToolResult?.metadata?.toolCallId).toBe('call_old');
    expect(activeToolCall?.metadata?.toolCalls).toHaveLength(1);
    expect(activeToolResult?.senderType).toBe('tool');
    expect(activeToolResult?.metadata?.toolCallId).toBe('call_active');
  });

  it('preserves full tool result content without arbitrary truncation', () => {
    const largeResult = `START-${'x'.repeat(7000)}-END`;
    const messages: Message[] = [
      {
        id: 'user_1',
        sender: 'user',
        senderType: 'user',
        content: 'summarize the Salesforce audit',
        timestamp: 1,
      },
      {
        id: 'tool_large',
        sender: 'tool',
        senderType: 'tool',
        content: largeResult,
        timestamp: 2,
        metadata: {
          toolCallId: 'call_large',
          toolName: 'salesforce_metadata_audit',
          isToolResult: true,
          success: true,
        },
      },
    ];

    const history = buildAnalyzeHistory(makeSession(messages));
    const toolMessage = history.find((message) => message.id === 'tool_large');

    // The arbitrary 6000-char cap is gone: the full output survives end-to-end so
    // the model never thinks its data was lost. Context pressure is handled by
    // pruneHistoryIfNeeded instead.
    expect(toolMessage?.content).toContain('START-');
    expect(toolMessage?.content).toContain('-END');
    expect(toolMessage?.content).not.toContain('shortened');
    expect(toolMessage?.content).not.toContain('excerpt truncated');
  });

  it('preserves full execute_python tool-call code in the active exchange (no omission)', () => {
    const largeCode = `print('start')\n${'x'.repeat(7000)}\nprint('TAIL_MARKER')`;
    const messages: Message[] = [
      {
        id: 'user_1',
        sender: 'user',
        senderType: 'user',
        content: 'build a report',
        timestamp: 1,
      },
      {
        id: 'ai_tool_call',
        sender: 'assistant',
        senderType: 'ai',
        content: '',
        timestamp: 2,
        metadata: {
          toolCalls: [
            {
              id: 'call_python',
              type: 'function',
              function: {
                name: 'execute_python',
                arguments: JSON.stringify({ code: largeCode }),
              },
            },
          ],
        },
      },
      {
        id: 'tool_1',
        sender: 'tool',
        senderType: 'tool',
        content: 'Executed successfully. Generated 1 interactive visualization(s) saved to /output/.',
        timestamp: 3,
        metadata: {
          toolCallId: 'call_python',
          toolName: 'execute_python',
          isToolResult: true,
        },
      },
    ];

    const history = buildAnalyzeHistory(makeSession(messages));
    const activeToolCall = history.find((message) => message.id === 'ai_tool_call')?.metadata?.toolCalls?.[0];
    const args = activeToolCall?.function.arguments || '';

    // The model's own code is retained in full — it must see what it just ran.
    expect(args).toContain('TAIL_MARKER');
    expect(args).not.toContain('code omitted from history');
  });

  it('preserves full write_output_file content in the active exchange (no omission)', () => {
    const largeHtml = `<html>${'x'.repeat(7000)}TAIL_MARKER</html>`;
    const messages: Message[] = [
      {
        id: 'user_1',
        sender: 'user',
        senderType: 'user',
        content: 'build a rich HTML report',
        timestamp: 1,
      },
      {
        id: 'ai_tool_call',
        sender: 'assistant',
        senderType: 'ai',
        content: '',
        timestamp: 2,
        metadata: {
          toolCalls: [
            {
              id: 'call_write',
              type: 'function',
              function: {
                name: 'write_output_file',
                arguments: JSON.stringify({
                  path: '/output/site/index.html',
                  content: largeHtml,
                  append: false,
                }),
              },
            },
          ],
        },
      },
      {
        id: 'tool_1',
        sender: 'tool',
        senderType: 'tool',
        content: 'Wrote 7 KB to /output/site/index.html. File size is now 7 KB.',
        timestamp: 3,
        metadata: {
          toolCallId: 'call_write',
          toolName: 'write_output_file',
          isToolResult: true,
        },
      },
    ];

    const history = buildAnalyzeHistory(makeSession(messages));
    const activeToolCall = history.find((message) => message.id === 'ai_tool_call')?.metadata?.toolCalls?.[0];
    const args = activeToolCall?.function.arguments || '';

    // Full payload retained in the active exchange — no arbitrary omission.
    expect(args).toContain('TAIL_MARKER');
    expect(args).toContain('/output/site/index.html');
    expect(args).not.toContain('content omitted from history');
  });
});
