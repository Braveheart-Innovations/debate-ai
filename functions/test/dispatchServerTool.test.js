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
  assert.equal(SERVER_TOOL_SECRETS.length, 11);
  assert.equal(new Set(SERVER_TOOL_SECRETS.map((s) => s.name)).size, 11);
  assert.ok(SERVER_TOOL_SECRETS.some((s) => s.name === 'ENCRYPTION_KEY'));
  assert.ok(SERVER_TOOL_SECRETS.some((s) => s.name === 'E2B_API_KEY'));
  assert.ok(SERVER_TOOL_SECRETS.some((s) => s.name === 'UN_POPULATION_API_TOKEN'));
});

test('fetch_api with malformed query_params fails with the reason, before any sandbox or network work', async () => {
  const result = await dispatchServerTool('u1', { toolName: 'fetch_api', toolCallId: 'call-q', args: { url: 'https://api.stlouisfed.org/fred/series/observations', query_params: 'series_id=CPIAUCSL' } }, 'k');
  assert.equal(result.success, false);
  assert.equal(result.toolCallId, 'call-q');
  assert.match(result.error, /^query_params must be an object of key-value pairs/);
});

test('a Salesforce Help article is never read raw: fetch_url and fetch_api say so and point to salesforce_docs_lookup', async () => {
  const url = 'https://help.salesforce.com/s/articleView?id=xcloud.overview_storage.htm&type=5';
  for (const toolName of ['fetch_url', 'fetch_api']) {
    const result = await dispatchServerTool('u1', { toolName, toolCallId: `call-${toolName}`, args: { url } }, 'k');
    assert.equal(result.success, false, toolName);
    assert.equal(result.toolCallId, `call-${toolName}`);
    assert.match(result.error, /^Not read: .*Use salesforce_docs_lookup/, toolName);
  }
});

test('fetch_api with no sandbox target is refused (nothing returns a body inline)', async () => {
  const result = await dispatchServerTool('u1', { toolName: 'fetch_api', toolCallId: 'call-f', args: { url: 'https://api.worldbank.org/v2/country' } }, 'k');
  assert.equal(result.success, false);
  assert.equal(result.toolCallId, 'call-f');
  assert.match(result.error, /sandbox/);
});

test('the UN Population connector sends the managed Data Portal token as a bearer header (F4)', () => {
  const { CONNECTOR_AUTH_CONFIG } = require('../lib/dataConnectors');
  const config = CONNECTOR_AUTH_CONFIG.un_population;
  assert.equal(config.authType, 'bearer');
  assert.equal(typeof config.getManagedKey, 'function');
});
