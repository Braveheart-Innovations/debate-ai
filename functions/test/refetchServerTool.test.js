const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const dns = require('node:dns');
const test = require('node:test');
const { dispatchServerTool, refetchServerTool } = require('../lib/tools');

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const realFetch = globalThis.fetch;
const realLookup = dns.promises.lookup;

function serve(body, headers, status = 200) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(body, { status, statusText: status === 200 ? 'OK' : 'Service Unavailable', headers });
  };
  return calls;
}

test.beforeEach(() => {
  dns.promises.lookup = async () => [{ address: '93.184.216.34', family: 4 }];
});
test.afterEach(() => {
  globalThis.fetch = realFetch;
  dns.promises.lookup = realLookup;
});

const args = { url: 'https://api.worldbank.org/v2/country/US/indicator/SP.POP.TOTL', query_params: { format: 'json' } };

test('a refetch keeps the bytes the loop would have saved, without touching a sandbox', async () => {
  const calls = serve('{ "page": 1,\n  "value": 331 }', { 'content-type': 'application/json' });
  const result = await refetchServerTool('u1', 'fetch_api', args, 'k');
  assert.equal(result.success, true);
  assert.equal(result.bytes.toString('utf8'), '{"page":1,"value":331}');
  assert.equal(calls[0], 'https://api.worldbank.org/v2/country/US/indicator/SP.POP.TOTL?format=json');

  // The run's path saves the same bytes, so a copy of them hashes the same.
  let written;
  const saved = await dispatchServerTool('u1', {
    toolName: 'fetch_api', toolCallId: 'call-1', args, sandboxTarget: { sessionKey: 'session_1', pathBase: '/data/fetch_call_1' },
  }, 'k', { claimSlot: async () => undefined, writeFile: async (_uid, _key, input) => { written = input; } });
  assert.equal(saved.metadata.responseHash, sha(result.bytes));
  assert.equal(written.path, '/data/fetch_call_1.json');
});

test('a binary file comes back byte for byte', async () => {
  const xlsx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0xfe, 0x00, 0x81]);
  serve(xlsx, { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const result = await refetchServerTool('u1', 'fetch_url', { url: 'https://www2.census.gov/x/table.xlsx' }, 'k');
  assert.equal(result.success, true);
  assert.deepEqual([...result.bytes], [...xlsx]);
});

test('a failed request says why', async () => {
  serve('down for maintenance', { 'content-type': 'text/plain' }, 503);
  const result = await refetchServerTool('u1', 'fetch_api', args, 'k');
  assert.equal(result.success, false);
  assert.match(result.error, /^HTTP 503: Service Unavailable/);
});
