const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { OpenAIRuntime } = require('../lib/providers/openai/runtime');
const {
  buildResponsesInput,
  buildResponsesBody,
  parseResponsesOutput,
  parseResponsesStream,
} = require('../lib/providers/openai/responses');

const TOOLS = [
  {
    name: 'get_weather',
    description: 'Get weather',
    parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
  },
];

function sseStream(events) {
  const encoder = new TextEncoder();
  const payload = events.map(e => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('');
  // Split at odd byte boundaries to exercise buffering.
  const bytes = encoder.encode(payload);
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 37) chunks.push(bytes.slice(i, i + 37));
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
}

async function collect(gen) {
  const out = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe('OpenAI Responses API routing', () => {
  it('builds a Responses request for gpt-6-astra with flat tools and no temperature', () => {
    const runtime = new OpenAIRuntime('openai');
    const built = runtime.buildRequest(
      {
        model: 'gpt-6-astra',
        systemPrompt: 'Be terse.',
        messages: [{ role: 'user', content: 'Weather in Paris?' }],
        maxTokens: 300,
        temperature: 0.7,
        tools: TOOLS,
        toolChoice: 'auto',
      },
      'sk-test'
    );

    assert.equal(built.url, 'https://api.openai.com/v1/responses');
    assert.equal(built.headers.Authorization, 'Bearer sk-test');
    assert.equal(built.body.model, 'gpt-6-astra');
    assert.equal(built.body.instructions, 'Be terse.');
    assert.equal(built.body.stream, true);
    assert.equal(built.body.store, false);
    assert.equal(built.body.max_output_tokens, 300);
    assert.equal('temperature' in built.body, false);
    assert.equal('messages' in built.body, false);
    assert.equal('reasoning_effort' in built.body, false);
    assert.deepEqual(built.body.tools, [
      { type: 'function', name: 'get_weather', description: 'Get weather', parameters: TOOLS[0].parameters },
    ]);
    assert.equal(built.body.tool_choice, 'auto');
    assert.deepEqual(built.body.input, [{ role: 'user', content: 'Weather in Paris?' }]);
  });

  it('keeps GPT-5.6 on chat completions with the reasoning_effort workaround', () => {
    const runtime = new OpenAIRuntime('openai');
    const built = runtime.buildRequest(
      { model: 'gpt-5.6-sol', messages: [{ role: 'user', content: 'hi' }], tools: TOOLS },
      'sk-test'
    );
    assert.equal(built.url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(built.body.reasoning_effort, 'none');
    assert.equal(built.body.temperature, 1);
    assert.equal(built.body.tools[0].type, 'function');
    assert.equal(built.body.tools[0].function.name, 'get_weather');
  });

  it('never routes OpenAI-compatible providers to the Responses API', () => {
    const grok = new OpenAIRuntime('grok').buildRequest(
      { model: 'gpt-6-astra', messages: [{ role: 'user', content: 'hi' }] },
      'k'
    );
    assert.equal(grok.url, 'https://api.x.ai/v1/chat/completions');
  });

  it('replays tool calls, tool results, and attachments as Responses input items', () => {
    const png = 'iVBORw0KGgo=';
    const { instructions, input } = buildResponsesInput(
      [
        { role: 'system', content: 'sys' },
        {
          role: 'user',
          content: 'Look',
          attachments: [{ type: 'image', uri: `data:image/png;base64,${png}`, mimeType: 'image/png' }],
        },
        {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } }],
        },
        { role: 'tool', content: '{"temp_c":21}', tool_call_id: 'call_1' },
        { role: 'assistant', content: 'It is 21C.' },
        { role: 'user', content: 'And the doc?' },
      ],
      undefined,
      [{ type: 'document', uri: 'data:application/pdf;base64,AAAA', mimeType: 'application/pdf', fileName: 'r.pdf' }]
    );

    assert.equal(instructions, 'sys');
    assert.deepEqual(input, [
      {
        role: 'user',
        content: [
          { type: 'input_image', image_url: `data:image/png;base64,${png}` },
          { type: 'input_text', text: 'Look' },
        ],
      },
      { type: 'function_call', call_id: 'call_1', name: 'get_weather', arguments: '{"city":"Paris"}' },
      { type: 'function_call_output', call_id: 'call_1', output: '{"temp_c":21}' },
      { role: 'assistant', content: 'It is 21C.' },
      {
        role: 'user',
        content: [
          { type: 'input_file', filename: 'r.pdf', file_data: 'data:application/pdf;base64,AAAA' },
          { type: 'input_text', text: 'And the doc?' },
        ],
      },
    ]);
  });

  it('builds a non-streaming body with an explicit system prompt winning over a system message', () => {
    const body = buildResponsesBody({
      model: 'gpt-5.5-pro',
      systemPrompt: 'explicit',
      messages: [{ role: 'system', content: 'ignored' }, { role: 'user', content: 'hi' }],
      stream: false,
    });
    assert.equal(body.instructions, 'explicit');
    assert.equal(body.stream, false);
    assert.equal('tools' in body, false);
    assert.equal('max_output_tokens' in body, false);
  });

  it('parses a non-streaming Responses object', () => {
    const parsed = parseResponsesOutput({
      status: 'completed',
      output: [
        { type: 'reasoning', id: 'rs_1' },
        { type: 'message', id: 'msg_1', content: [{ type: 'output_text', text: 'Hello ' }, { type: 'output_text', text: 'there' }] },
      ],
      usage: { input_tokens: 9, output_tokens: 5 },
    });
    assert.deepEqual(parsed, {
      content: 'Hello there',
      toolCalls: [],
      usage: { inputTokens: 9, outputTokens: 5 },
      finishReason: 'stop',
    });

    const truncated = parseResponsesOutput({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output: [{ type: 'function_call', id: 'fc_1', call_id: 'call_9', name: 'get_weather', arguments: '{"city":"Rome"}' }],
    });
    assert.equal(truncated.finishReason, 'length');
    assert.deepEqual(truncated.toolCalls, [
      { id: 'call_9', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Rome"}' } },
    ]);
  });

  it('turns a streamed function call into canonical tool events with usage', async () => {
    const runtime = new OpenAIRuntime('openai');
    const events = await collect(runtime.streamParse(sseStream([
      { type: 'response.created', response: { id: 'resp_1' } },
      { type: 'response.output_item.added', output_index: 0, item: { id: 'fc_1', type: 'function_call', status: 'in_progress', arguments: '', call_id: 'call_A', name: 'get_weather' } },
      { type: 'response.function_call_arguments.delta', item_id: 'fc_1', output_index: 0, delta: '{"city":' },
      { type: 'response.function_call_arguments.delta', item_id: 'fc_1', output_index: 0, delta: '"Paris"}' },
      { type: 'response.function_call_arguments.done', item_id: 'fc_1', output_index: 0, arguments: '{"city":"Paris"}' },
      { type: 'response.output_item.done', output_index: 0, item: { id: 'fc_1', type: 'function_call', status: 'completed', arguments: '{"city":"Paris"}', call_id: 'call_A', name: 'get_weather' } },
      { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 58, output_tokens: 18, total_tokens: 76 } } },
    ]), 'trace'));

    assert.deepEqual(events.map(e => e.type), [
      'tool_call_start',
      'tool_call_delta',
      'tool_call_delta',
      'tool_call_complete',
      'message_complete',
    ]);
    assert.deepEqual(events[0], { type: 'tool_call_start', index: 0, id: 'call_A', name: 'get_weather' });
    assert.equal(events[1].arguments_delta, '{"city":');
    assert.deepEqual(events[3].tool_call, {
      id: 'call_A',
      type: 'function',
      function: { name: 'get_weather', arguments: '{"city":"Paris"}' },
    });
    assert.deepEqual(events[4], {
      type: 'message_complete',
      finish_reason: 'tool_calls',
      usage: { inputTokens: 58, outputTokens: 18, totalTokens: 76 },
      tool_calls: [events[3].tool_call],
    });
  });

  it('streams text deltas and maps max_output_tokens truncation to length', async () => {
    const events = await collect(parseResponsesStream(sseStream([
      { type: 'response.created', response: {} },
      { type: 'response.output_item.added', output_index: 0, item: { id: 'msg_1', type: 'message' } },
      { type: 'response.output_text.delta', item_id: 'msg_1', delta: 'Hel' },
      { type: 'response.output_text.delta', item_id: 'msg_1', delta: 'lo' },
      { type: 'response.output_text.done', item_id: 'msg_1', text: 'Hello' },
      { type: 'response.incomplete', response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, usage: { input_tokens: 9, output_tokens: 16 } } },
    ]), 'trace'));

    assert.deepEqual(events, [
      { type: 'text_delta', delta: 'Hel' },
      { type: 'text_delta', delta: 'lo' },
      { type: 'message_complete', finish_reason: 'length', usage: { inputTokens: 9, outputTokens: 16, totalTokens: 25 }, tool_calls: undefined },
    ]);
  });

  it('surfaces a failed response as an error event', async () => {
    const events = await collect(parseResponsesStream(sseStream([
      { type: 'response.created', response: {} },
      { type: 'response.failed', response: { status: 'failed', error: { code: 'server_error', message: 'boom' } } },
    ]), 'trace'));
    assert.deepEqual(events[0], { type: 'error', message: 'boom', code: 'server_error' });
    assert.equal(events[1].type, 'message_complete');
    assert.equal(events[1].finish_reason, 'error');
  });

  it('still parses chat-completions streams through the same runtime', async () => {
    const runtime = new OpenAIRuntime('openai');
    const events = await collect(runtime.streamParse(sseStream([
      { choices: [{ delta: { content: 'Hi' } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
      { choices: [], usage: { prompt_tokens: 3, completion_tokens: 1 } },
      '[DONE]',
    ]), 'trace'));
    assert.deepEqual(events, [
      { type: 'text_delta', delta: 'Hi' },
      { type: 'message_complete', finish_reason: 'stop', usage: { inputTokens: 3, outputTokens: 1, totalTokens: 4 }, tool_calls: undefined },
    ]);
  });
});
