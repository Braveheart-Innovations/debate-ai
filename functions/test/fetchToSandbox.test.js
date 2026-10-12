const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const {
  MAX_SANDBOX_FETCH_BYTES,
  SANDBOX_FETCH_PREVIEW_CHARS,
  extensionForResponse,
  parseSandboxFetchTarget,
  saveFetchToSandbox,
} = require('../lib/fetchToSandbox');

test('the sandbox fetch limit is 25 MB', () => {
  assert.equal(MAX_SANDBOX_FETCH_BYTES, 25 * 1024 * 1024);
});

test('parseSandboxFetchTarget accepts a session key and a /data path base only', () => {
  assert.deepEqual(
    parseSandboxFetchTarget({ sessionKey: 'session_1791174072325', pathBase: '/data/fetch_call_abc' }),
    { sessionKey: 'session_1791174072325', pathBase: '/data/fetch_call_abc' },
  );
  assert.equal(parseSandboxFetchTarget(undefined), null);
  assert.equal(parseSandboxFetchTarget({ sessionKey: 'ok', pathBase: '/output/x' }), null);
  assert.equal(parseSandboxFetchTarget({ sessionKey: 'ok', pathBase: '/data/../etc/passwd' }), null);
  assert.equal(parseSandboxFetchTarget({ sessionKey: 'ok', pathBase: '/data/a.json' }), null);
  assert.equal(parseSandboxFetchTarget({ sessionKey: '../x', pathBase: '/data/a' }), null);
});

test('extensionForResponse follows the content type, then the body', () => {
  assert.equal(extensionForResponse('application/json; charset=utf-8', '{}'), '.json');
  assert.equal(extensionForResponse('text/xml', '<x/>'), '.xml');
  assert.equal(extensionForResponse('text/csv', 'a,b'), '.csv');
  assert.equal(extensionForResponse('text/html', '<html>'), '.html');
  // PubMed EFetch: XML saved as .xml, not .json (2026-10-04).
  assert.equal(extensionForResponse(undefined, '<?xml version="1.0"?><PubmedArticleSet>'), '.xml');
  assert.equal(extensionForResponse('', '[1,2]'), '.json');
  assert.equal(extensionForResponse('text/plain', 'hello'), '.txt');
});

test('saveFetchToSandbox writes the whole body and returns only a preview', async () => {
  const body = `<?xml version="1.0"?>${'x'.repeat(5000)}`;
  const writes = [];
  const summary = await saveFetchToSandbox(
    { sessionKey: 's1', pathBase: '/data/fetch_call_1' },
    body,
    'text/xml',
    async (sessionKey, path, base64) => { writes.push({ sessionKey, path, text: Buffer.from(base64, 'base64').toString('utf8') }); },
  );
  assert.deepEqual(writes, [{ sessionKey: 's1', path: '/data/fetch_call_1.xml', text: body }]);
  assert.equal(summary.path, '/data/fetch_call_1.xml');
  assert.equal(summary.bytes, Buffer.byteLength(body));
  assert.equal(summary.responseHash, crypto.createHash('sha256').update(body).digest('hex'));
  assert.equal(summary.preview, body.slice(0, SANDBOX_FETCH_PREVIEW_CHARS));
  assert.equal(summary.previewTruncated, true);
});

test('saveFetchToSandbox surfaces a failed write', async () => {
  await assert.rejects(
    saveFetchToSandbox({ sessionKey: 's1', pathBase: '/data/f' }, '{}', 'application/json', async () => { throw new Error('sandbox gone'); }),
    /sandbox gone/,
  );
});

test('runSandboxFetch claims the sandbox slot first: a refusal downloads nothing and tells the model not to retry (F5)', async () => {
  const { runSandboxFetch } = require('../lib/fetchToSandbox');
  const { SandboxLimitError } = require('../lib/sandbox/service');
  let fetched = 0;
  const refused = {
    claimSlot: async () => { throw new SandboxLimitError(3, 4 * 60_000, 15 * 60_000); },
    writeFile: async () => { throw new Error('never written'); },
  };
  const result = await runSandboxFetch('u1', { sessionKey: 's1', pathBase: '/data/fetch_c1' }, refused, async () => {
    fetched += 1;
    return { toolCallId: 'c1', success: true, content: '{}' };
  });
  assert.equal(fetched, 0);
  assert.equal(result.success, false);
  assert.match(result.error, /You already have 3 Analyze sessions using Python right now/);
  assert.match(result.error, /Nothing ran\. Don't retry Python, file, or data-fetch tools in this turn/);
});

test('runSandboxFetch with a slot fetches, then saves the body into the sandbox', async () => {
  const { runSandboxFetch } = require('../lib/fetchToSandbox');
  const calls = [];
  const sandbox = {
    claimSlot: async (uid, sessionKey) => { calls.push(['claim', uid, sessionKey]); },
    writeFile: async (uid, sessionKey, input) => { calls.push(['write', uid, sessionKey, input.path]); },
  };
  const result = await runSandboxFetch('u1', { sessionKey: 's1', pathBase: '/data/fetch_c1' }, sandbox, async () => ({
    toolCallId: 'c1', success: true, content: '{"a":1}', metadata: { contentType: 'application/json' },
  }));
  assert.equal(result.success, true);
  assert.equal(result.metadata.sandboxPath, '/data/fetch_c1.json');
  assert.deepEqual(calls, [['claim', 'u1', 's1'], ['write', 'u1', 's1', '/data/fetch_c1.json']]);
});
