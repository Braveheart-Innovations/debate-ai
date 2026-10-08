const assert = require('node:assert/strict');
const test = require('node:test');
const { dispatchServerTool, SERVER_TOOL_SECRETS } = require('../lib/tools');

test('an unknown tool comes back unsuccessful with its call id, never a throw', async () => {
  const result = await dispatchServerTool('u1', { toolName: 'nope', toolCallId: 'call-1', args: {} }, 'k');
  assert.deepEqual(result, { toolCallId: 'call-1', success: false, error: 'Unknown tool: nope' });
});

test('key-dependent tools fail cleanly when encryption is not configured', async () => {
  for (const toolName of ['fetch_api', 'web_search', 'salesforce_docs_lookup']) {
    const result = await dispatchServerTool('u1', { toolName, toolCallId: `call-${toolName}`, args: {} }, '');
    assert.equal(result.success, false, toolName);
    assert.equal(result.toolCallId, `call-${toolName}`);
    assert.equal(result.error, 'Encryption not configured');
  }
});

test('the shared secret list covers encryption, the sandbox, and every managed connector key', () => {
  assert.equal(SERVER_TOOL_SECRETS.length, 10);
  assert.equal(new Set(SERVER_TOOL_SECRETS.map((s) => s.name)).size, 10);
  assert.ok(SERVER_TOOL_SECRETS.some((s) => s.name === 'ENCRYPTION_KEY'));
  assert.ok(SERVER_TOOL_SECRETS.some((s) => s.name === 'E2B_API_KEY'));
});
