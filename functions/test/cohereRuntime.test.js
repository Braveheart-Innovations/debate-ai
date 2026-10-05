const assert = require('node:assert/strict');
const test = require('node:test');

const { getCohereRuntime } = require('../lib/providers/cohere/runtime');

const toolCall = { id: 'call_1', type: 'function', function: { name: 'execute_python', arguments: '{"code":"print(17 * 23)"}' } };

function assistantMessage(content) {
  const { body } = getCohereRuntime().buildRequest({
    model: 'command-a-reasoning-08-2025',
    messages: [
      { role: 'user', content: 'Use execute_python to compute 17 * 23.' },
      { role: 'assistant', content, tool_calls: [toolCall] },
      { role: 'tool', content: '391', tool_call_id: 'call_1' },
    ],
  }, 'key');
  return body.messages.find((message) => message.role === 'assistant');
}

// 2026-10-05, verified against the live API: content "" on a tool-call message
// makes Cohere end the next reply with finish_reason ERROR and no text; text
// content is rejected outright. Text alongside a call belongs in tool_plan.
test('a tool-call message with no text sends no content', () => {
  const message = assistantMessage('');
  assert.equal('content' in message, false);
  assert.equal('tool_plan' in message, false);
  assert.equal(message.tool_calls[0].id, 'call_1');
});

test('a tool-call message with text sends it as tool_plan', () => {
  const message = assistantMessage('Computing it now.');
  assert.equal('content' in message, false);
  assert.equal(message.tool_plan, 'Computing it now.');
});

test('plain assistant and tool messages are unchanged', () => {
  const { body } = getCohereRuntime().buildRequest({
    messages: [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ],
  }, 'key');
  assert.deepEqual(body.messages, [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }]);
});
