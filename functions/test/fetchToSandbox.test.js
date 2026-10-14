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

// Michael's v3 test (2026-10-13): a Census .xlsx was decoded as text, so the
// saved file was a corrupt ZIP. Files are kept byte for byte.
test('isBinaryResponse: files by their type, untyped bodies by whether they are UTF-8', () => {
  const { isBinaryResponse } = require('../lib/fetchToSandbox');
  const zip = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0xa1, 0xff, 0x00]);
  const utf8 = new TextEncoder().encode('state,movers\nTexas,77200\n');
  assert.equal(isBinaryResponse('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', zip), true);
  assert.equal(isBinaryResponse('application/pdf', utf8), true);
  assert.equal(isBinaryResponse('application/octet-stream', zip), true);
  assert.equal(isBinaryResponse('', zip), true);
  assert.equal(isBinaryResponse('application/octet-stream', utf8), false);
  assert.equal(isBinaryResponse('', utf8), false);
  assert.equal(isBinaryResponse('text/csv; charset=utf-8', utf8), false);
  assert.equal(isBinaryResponse('application/json', utf8), false);
  assert.equal(isBinaryResponse('application/xhtml+xml', utf8), false);
  assert.equal(isBinaryResponse('application/vnd.api+json', utf8), false);
});

test('isTextContentType matches the subtype, not a substring (openxmlformats contains "xml")', () => {
  const { isTextContentType } = require('../lib/fetchToSandbox');
  assert.equal(isTextContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), false);
  assert.equal(isTextContentType('application/vnd.ms-excel'), false);
  assert.equal(isTextContentType('image/svg+xml'), false);
  assert.equal(isTextContentType('text/html; charset=utf-8'), true);
  assert.equal(isTextContentType('application/json'), true);
  assert.equal(isTextContentType('application/geo+json'), true);
  assert.equal(isTextContentType('application/xml'), true);
  assert.equal(isTextContentType(''), false);
});

test('binaryFileExtension: the server filename, then the content type, then the URL, else .bin', () => {
  const { binaryFileExtension } = require('../lib/fetchToSandbox');
  const xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  assert.equal(binaryFileExtension('application/octet-stream', 'attachment; filename="State_to_State_2024.XLSX"', 'https://x.gov/dl?id=1'), '.xlsx');
  assert.equal(binaryFileExtension('application/octet-stream', "attachment; filename*=UTF-8''migration%20flows.xls", 'https://x.gov/dl'), '.xls');
  assert.equal(binaryFileExtension(xlsx, null, 'https://x.gov/download.aspx?id=1'), '.xlsx');
  assert.equal(binaryFileExtension('application/octet-stream', null, 'https://x.gov/files/flows.parquet'), '.parquet');
  assert.equal(binaryFileExtension('application/octet-stream', null, 'https://x.gov/download.aspx'), '.bin');
  assert.equal(binaryFileExtension('application/octet-stream', 'attachment; filename="bad%zz.zip"', 'https://x.gov/dl'), '.zip');
  assert.equal(binaryFileExtension(undefined, undefined, 'not a url'), '.bin');
});

test('saveFetchToSandbox writes a binary file byte for byte, with a note instead of a preview', async () => {
  const bytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
  const writes = [];
  const summary = await saveFetchToSandbox(
    { sessionKey: 's1', pathBase: '/data/fetch_call_x' },
    bytes.toString('base64'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    async (sessionKey, path, base64) => { writes.push({ path, bytes: Buffer.from(base64, 'base64') }); },
    '.xlsx',
  );
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, '/data/fetch_call_x.xlsx');
  assert.ok(writes[0].bytes.equals(bytes));
  assert.equal(summary.bytes, 256);
  assert.equal(summary.responseHash, crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.match(summary.preview, /binary \.xlsx file/);
  assert.equal(summary.previewTruncated, false);
});

test('runSandboxFetch saves a binary fetch under its own extension', async () => {
  const { runSandboxFetch } = require('../lib/fetchToSandbox');
  const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0xfe, 0x00]);
  const written = [];
  const sandbox = {
    claimSlot: async () => {},
    writeFile: async (uid, sessionKey, input) => { written.push(input); },
  };
  const result = await runSandboxFetch('u1', { sessionKey: 's1', pathBase: '/data/fetch_c2' }, sandbox, async () => ({
    toolCallId: 'c2', success: true, content: bytes.toString('base64'), metadata: { contentType: 'application/zip', binaryExtension: '.zip' },
  }));
  assert.equal(result.success, true);
  assert.equal(result.metadata.sandboxPath, '/data/fetch_c2.zip');
  assert.equal(result.metadata.bytes, bytes.length);
  assert.ok(Buffer.from(written[0].base64, 'base64').equals(bytes));
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
