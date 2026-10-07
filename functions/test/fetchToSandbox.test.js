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
