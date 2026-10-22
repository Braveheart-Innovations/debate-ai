const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { ClaudeRuntime } = require('../lib/providers/claude/runtime');
const { OpenAIRuntime } = require('../lib/providers/openai/runtime');

function sse(events) {
  const payload = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(payload)); c.close(); } });
}

async function collect(gen) {
  const out = [];
  for await (const event of gen) out.push(event);
  return out;
}

// A reply that thought, said a line, wrote a progress update, then called two tools,
// as Sonnet 5.5 streams it with the display omitted (empty thinking, a signature).
const thinkingReply = [
  { type: 'message_start', message: { usage: { input_tokens: 100 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'SIG-ONE' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Checking the ' } },
  { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'flows.' } },
  { type: 'content_block_stop', index: 1 },
  { type: 'content_block_start', index: 2, content_block: { type: 'thinking', thinking: '', signature: '' } },
  { type: 'content_block_delta', index: 2, delta: { type: 'signature_delta', signature: 'SIG-TWO' } },
  { type: 'content_block_stop', index: 2 },
  { type: 'content_block_start', index: 3, content_block: { type: 'tool_use', id: 'a', name: 'execute_python', input: {}, caller: { type: 'direct' } } },
  { type: 'content_block_delta', index: 3, delta: { type: 'input_json_delta', partial_json: '{"code":"1"}' } },
  { type: 'content_block_stop', index: 3 },
  { type: 'content_block_start', index: 4, content_block: { type: 'redacted_thinking', data: 'REDACTED' } },
  { type: 'content_block_stop', index: 4 },
  { type: 'content_block_start', index: 5, content_block: { type: 'tool_use', id: 'b', name: 'read_file', input: {}, caller: { type: 'direct' } } },
  { type: 'content_block_delta', index: 5, delta: { type: 'input_json_delta', partial_json: '{"path":"/data/a.csv"}' } },
  { type: 'content_block_stop', index: 5 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 50 } },
];

const tools = [
  { name: 'execute_python', description: 'd', parameters: { type: 'object', properties: {} } },
  { name: 'read_file', description: 'd', parameters: { type: 'object', properties: {} } },
];

/** The canonical assistant message the Analyze loop stores and sends back. */
async function replyMessage(events) {
  const out = await collect(new ClaudeRuntime().streamParse(sse(events), 't'));
  const complete = out.at(-1);
  const text = out.filter((e) => e.type === 'text_delta').map((e) => e.delta).join('');
  return { role: 'assistant', content: text, tool_calls: complete.tool_calls };
}

function nextRound(assistant, model = 'claude-sonnet-5-5') {
  return new ClaudeRuntime().buildRequest({
    model,
    messages: [
      { role: 'user', content: 'Audit the flows.' },
      assistant,
      { role: 'tool', tool_call_id: 'a', content: 'one' },
      { role: 'tool', tool_call_id: 'b', content: 'two' },
    ],
    tools,
    promptCache: true,
  }, 'k');
}

describe('Claude thinking goes back with tool results', () => {
  it('streamParse keeps each block around the calls, in order, with the tool_use fields', async () => {
    const assistant = await replyMessage(thinkingReply);
    assert.equal(assistant.content, 'Checking the flows.');
    const [a, b] = assistant.tool_calls;
    assert.deepEqual(a.extra_content.claude, {
      before: [
        { type: 'thinking', thinking: '', signature: 'SIG-ONE' },
        { type: 'text', text: 'Checking the flows.' },
        { type: 'thinking', thinking: '', signature: 'SIG-TWO' },
      ],
      fields: { caller: { type: 'direct' } },
    });
    assert.deepEqual(b.extra_content.claude, {
      before: [{ type: 'redacted_thinking', data: 'REDACTED' }],
      fields: { caller: { type: 'direct' } },
    });
  });

  it('the next round sends the reply back exactly as it streamed', async () => {
    const body = nextRound(await replyMessage(thinkingReply)).body;
    assert.deepEqual(body.messages[1], {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: '', signature: 'SIG-ONE' },
        { type: 'text', text: 'Checking the flows.' },
        { type: 'thinking', thinking: '', signature: 'SIG-TWO' },
        { caller: { type: 'direct' }, type: 'tool_use', id: 'a', name: 'execute_python', input: { code: '1' } },
        { type: 'redacted_thinking', data: 'REDACTED' },
        { caller: { type: 'direct' }, type: 'tool_use', id: 'b', name: 'read_file', input: { path: '/data/a.csv' } },
      ],
    });
    // The tool results still follow as one user message, with the cache breakpoint.
    assert.equal(body.messages[2].role, 'user');
    assert.deepEqual(body.messages[2].content.map((block) => block.tool_use_id), ['a', 'b']);
  });

  it('a reply that did not think goes back as before, with nothing kept', async () => {
    const plain = thinkingReply.filter((e) => ![0, 2, 4].includes(e.index));
    const assistant = await replyMessage(plain);
    assert.equal(assistant.tool_calls[0].extra_content, undefined);
    assert.deepEqual(nextRound(assistant).body.messages[1].content, [
      { type: 'text', text: 'Checking the flows.' },
      { type: 'tool_use', id: 'a', name: 'execute_python', input: { code: '1' } },
      { type: 'tool_use', id: 'b', name: 'read_file', input: { path: '/data/a.csv' } },
    ]);
  });

  it('a reply whose text the app changed goes back without its thinking', async () => {
    const assistant = await replyMessage(thinkingReply);
    const content = nextRound({ ...assistant, content: 'I need org evidence.' }).body.messages[1].content;
    assert.deepEqual(content.map((block) => block.type), ['text', 'tool_use', 'tool_use']);
    assert.equal(content[0].text, 'I need org evidence.');
  });

  it('a reply where only some calls kept their blocks goes back without its thinking', async () => {
    const assistant = await replyMessage(thinkingReply);
    const [a, b] = assistant.tool_calls;
    const partial = { ...assistant, tool_calls: [a, { ...b, extra_content: undefined }] };
    assert.deepEqual(nextRound(partial).body.messages[1].content.map((block) => block.type), ['text', 'tool_use', 'tool_use']);
  });

  it('blocks after the last call stay at the end', async () => {
    const trailing = [
      ...thinkingReply.slice(0, -1),
      { type: 'content_block_start', index: 6, content_block: { type: 'thinking', thinking: '', signature: '' } },
      { type: 'content_block_delta', index: 6, delta: { type: 'signature_delta', signature: 'SIG-END' } },
      { type: 'content_block_stop', index: 6 },
      thinkingReply.at(-1),
    ];
    const content = nextRound(await replyMessage(trailing)).body.messages[1].content;
    assert.deepEqual(content.at(-1), { type: 'thinking', thinking: '', signature: 'SIG-END' });
    assert.equal(content.at(-2).id, 'b');
  });

  it('other providers never see the blocks', async () => {
    const assistant = await replyMessage(thinkingReply);
    const body = new OpenAIRuntime().buildRequest({
      model: 'gpt-5.1-chat-latest',
      messages: [{ role: 'user', content: 'Audit the flows.' }, assistant, { role: 'tool', tool_call_id: 'a', content: 'one' }, { role: 'tool', tool_call_id: 'b', content: 'two' }],
      tools,
    }, 'k').body;
    assert.equal(JSON.stringify(body).includes('SIG-ONE'), false);
  });
});

describe('the thinking binding beta', () => {
  it('models that think by default send adaptive thinking with drop_block, and the beta header', () => {
    for (const model of ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-1', 'claude-opus-5', 'claude-sonnet-5', 'claude-fable-5']) {
      const built = new ClaudeRuntime().buildRequest({ model, messages: [{ role: 'user', content: 'Hi' }] }, 'k');
      assert.deepEqual(built.body.thinking, { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } }, model);
      assert.equal(built.headers['anthropic-beta'], 'thinking-binding-controls-2026-08-01', model);
    }
  });

  it('models that think only when asked (or not at all) are unchanged', () => {
    for (const model of ['claude-opus-4-8', 'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-sonnet-4-5-20250929']) {
      const built = new ClaudeRuntime().buildRequest({ model, messages: [{ role: 'user', content: 'Hi' }] }, 'k');
      assert.equal(built.body.thinking, undefined, model);
      assert.equal(built.headers['anthropic-beta'], undefined, model);
    }
  });
});
