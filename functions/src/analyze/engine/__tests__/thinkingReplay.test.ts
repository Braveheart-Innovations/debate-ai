import type { Message } from '../../contract/types';
import type { CanonicalToolCall } from '../../../types/canonical';
import { buildModelRequest } from '../../model/requestShaping';
import { ClaudeRuntime } from '../../../providers/claude/runtime';
import { buildAnalyzeHistory } from '../history';
import { AnalyzeStatus, type AnalyzeSession } from '../contracts';

/** A tool call as ClaudeRuntime.streamParse returns it for a reply that thought. */
const call = (id: string, code: string, signature: string, text = ''): CanonicalToolCall => ({
  id,
  type: 'function',
  function: { name: 'execute_python', arguments: JSON.stringify({ code }) },
  extra_content: {
    claude: {
      before: [{ type: 'thinking', thinking: '', signature }, ...(text ? [{ type: 'text' as const, text }] : [])],
      fields: { caller: { type: 'direct' } },
    },
  },
});

const ask = (id: string, content: string, timestamp: number): Message => ({ id, sender: 'You', senderType: 'user', content, timestamp });

const round = (id: string, content: string, calls: CanonicalToolCall[], timestamp: number, aiId = 'ai-claude'): Message => ({
  id,
  sender: 'Claude',
  senderType: 'ai',
  content,
  timestamp,
  // Stored as the loop stores it: the calls from message_complete, extra_content included.
  metadata: { providerId: 'claude', aiId, ...(calls.length > 0 ? { toolCalls: calls as never } : {}) },
});

const result = (callId: string, content: string, timestamp: number): Message => ({
  id: `toolresult_${callId}`,
  sender: 'tool',
  senderType: 'tool',
  content,
  timestamp,
  metadata: { isToolResult: true, toolCallId: callId, toolName: 'execute_python', success: true },
});

function claudeBody(messages: Message[], currentAskId: string) {
  const session: AnalyzeSession = {
    id: 's',
    ai: { id: 'ai-claude', provider: 'claude', model: 'claude-sonnet-5-5', name: 'Claude' } as AnalyzeSession['ai'],
    messages,
    startTime: 0,
    status: AnalyzeStatus.STREAMING,
  };
  const shaped = buildModelRequest({
    providerId: 'claude',
    modelId: 'claude-sonnet-5-5',
    prompt: '',
    history: buildAnalyzeHistory(session, currentAskId),
    systemPrompt: 'Rules.',
    identityId: 'ai-claude',
  });
  return new ClaudeRuntime().buildRequest({ model: 'claude-sonnet-5-5', messages: shaped.messages, systemPrompt: shaped.systemPrompt, promptCache: true }, 'k').body as {
    messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>;
  };
}

const signatures = (body: ReturnType<typeof claudeBody>) => body.messages.flatMap((message) => (
  Array.isArray(message.content) ? message.content.filter((block) => block.type === 'thinking').map((block) => block.signature) : []
));

describe('Claude thinking through the Analyze history', () => {
  it('the current turn sends each round back with its thinking, in order', () => {
    const body = claudeBody([
      ask('msg_1', 'Audit the flows.', 1),
      round('run_1_r0', 'Reading the flows.', [call('c1', 'print(1)', 'SIG-1', 'Reading the flows.')], 2),
      result('c1', '1', 3),
      round('run_1_r1', '', [call('c2', 'print(2)', 'SIG-2')], 4),
      result('c2', '2', 5),
    ], 'msg_1');
    expect(signatures(body)).toEqual(['SIG-1', 'SIG-2']);
    expect(body.messages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: '', signature: 'SIG-1' },
        { type: 'text', text: 'Reading the flows.' },
        { caller: { type: 'direct' }, type: 'tool_use', id: 'c1', name: 'execute_python', input: { code: 'print(1)' } },
      ],
    });
  });

  it('an earlier turn is a record: none of its thinking goes back', () => {
    const body = claudeBody([
      ask('msg_1', 'Audit the flows.', 1),
      round('run_1_r0', '', [call('c1', 'print(1)', 'SIG-OLD')], 2),
      result('c1', '1', 3),
      round('run_1_r1', 'Lead has nineteen active flows.', [], 4),
      ask('msg_2', 'Now the Event flows.', 5),
      round('run_2_r0', '', [call('c2', 'print(2)', 'SIG-NEW')], 6),
      result('c2', '2', 7),
    ], 'msg_2');
    expect(signatures(body)).toEqual(['SIG-NEW']);
  });

  it("another AI's tool calls never come back, so neither does its thinking", () => {
    const body = claudeBody([
      ask('msg_1', 'Audit the flows.', 1),
      round('run_t_r0', '', [call('t1', 'print(9)', 'SIG-TEAMMATE')], 2, 'ai-other-claude'),
      result('t1', '9', 3),
      round('run_1_r0', '', [call('c1', 'print(1)', 'SIG-OWN')], 4),
      result('c1', '1', 5),
    ], 'msg_1');
    expect(signatures(body)).toEqual(['SIG-OWN']);
  });

  it('a round whose calls lost their results is repaired to text, without its thinking', () => {
    const body = claudeBody([
      ask('msg_1', 'Audit the flows.', 1),
      round('run_1_r0', '', [call('c1', 'print(1)', 'SIG-STOPPED')], 2),
    ], 'msg_1');
    expect(signatures(body)).toEqual([]);
  });
});
