import type { Message } from '../../contract/types';

jest.mock('firebase-admin/firestore', () => ({ getFirestore: jest.fn(), FieldValue: { delete: jest.fn() } }));
jest.mock('firebase-admin/storage', () => ({ getStorage: jest.fn() }));

import { fetchesInTranscript } from '../fetchRecords';

function aiMessage(calls: Array<{ id: string; name: string; args: Record<string, unknown> | string }>): Message {
  return {
    id: 'ai-1',
    sender: 'ChatGPT',
    senderType: 'ai',
    content: '',
    timestamp: 1,
    metadata: {
      toolCalls: calls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: typeof call.args === 'string' ? call.args : JSON.stringify(call.args) },
      })),
    },
  } as unknown as Message;
}

function toolResult(callId: string, toolName: string, content: string, provenance?: Record<string, unknown>, success = true): Message {
  return {
    id: `toolresult_${callId}`,
    sender: 'tool',
    senderType: 'tool',
    content,
    timestamp: 2,
    metadata: { toolCallId: callId, toolName, isToolResult: true, success, toolProvenance: provenance },
  } as unknown as Message;
}

const provenance = (hash: string) => ({ tool: 'fetch_api', endpoint: 'e', method: 'GET', parameters: {}, parameterHash: 'p', fetchedAt: '2026-10-12T15:00:00.000Z', responseHash: hash, cacheStatus: 'fresh' });

describe('fetchesInTranscript', () => {
  it('pairs each saved fetch with the call that made it, inferring a managed key reference', () => {
    const messages = [
      aiMessage([
        { id: 'call_1', name: 'fetch_api', args: { url: 'https://api.stlouisfed.org/fred/series/observations', query_params: { series_id: 'UNRATE' } } },
        { id: 'call_2', name: 'fetch_url', args: { url: 'https://example.org/table.html' } },
        { id: 'call_3', name: 'execute_python', args: { code: 'print(1)' } },
      ]),
      toolResult('call_1', 'fetch_api', 'Fetched 2.1KB → saved to /data/fetch_call_1.json (provenance: /data/fetch_call_1.provenance.json)', provenance('h1')),
      toolResult('call_2', 'fetch_url', 'Fetched 900B → saved to /data/fetch_call_2.txt (provenance: …)', provenance('h2')),
      toolResult('call_3', 'execute_python', '1'),
    ];
    const records = fetchesInTranscript(messages, 'run-7');
    expect(records).toEqual([
      {
        tool: 'fetch_api',
        request: JSON.stringify({ url: 'https://api.stlouisfed.org/fred/series/observations', query_params: { series_id: 'UNRATE' }, api_key_ref: 'fred' }),
        path: '/data/fetch_call_1.json',
        responseHash: 'h1',
        fetchedAt: Date.parse('2026-10-12T15:00:00.000Z'),
        origin: 'transcript',
        runId: 'run-7',
        toolCallId: 'call_1',
      },
      expect.objectContaining({ tool: 'fetch_url', path: '/data/fetch_call_2.txt', responseHash: 'h2', toolCallId: 'call_2' }),
    ]);
  });

  it('skips failed fetches, results without a hash, and calls whose arguments don\'t parse', () => {
    const messages = [
      aiMessage([
        { id: 'a', name: 'fetch_api', args: { url: 'https://x.org/a' } },
        { id: 'b', name: 'fetch_api', args: { url: 'https://x.org/b' } },
        { id: 'c', name: 'fetch_api', args: '{not json' },
      ]),
      toolResult('a', 'fetch_api', 'HTTP 404', undefined, false),
      toolResult('b', 'fetch_api', 'Fetched (failed to save to filesystem)'),
      toolResult('c', 'fetch_api', 'saved to /data/fetch_c.json', provenance('h3')),
    ];
    expect(fetchesInTranscript(messages)).toEqual([]);
  });
});
