const assert = require('node:assert/strict');
const test = require('node:test');

const { fetchApiArgsError, parseHeadersArg, parseQueryParamsArg } = require('../lib/fetchArgs');

test('query_params: an object, or a JSON string of one, gives the same parameters', () => {
  const expected = { ok: true, values: { series_id: 'CPIAUCSL', file_type: 'json' } };
  assert.deepEqual(parseQueryParamsArg({ series_id: 'CPIAUCSL', file_type: 'json' }), expected);
  assert.deepEqual(parseQueryParamsArg('{"series_id": "CPIAUCSL", "file_type": "json"}'), expected);
});

test('query_params: missing or empty means none', () => {
  for (const value of [undefined, null, '', '   ', {}]) {
    assert.deepEqual(parseQueryParamsArg(value), { ok: true, values: {} });
  }
});

test('query_params: numbers and booleans become text, a list is comma-joined, null values are skipped', () => {
  assert.deepEqual(
    parseQueryParamsArg({ limit: 10, adjusted: true, ids: ['a', 'b', 3], skip: null }),
    { ok: true, values: { limit: '10', adjusted: 'true', ids: 'a,b,3' } },
  );
});

test('query_params: anything else is an error that names the argument and shows the shape', () => {
  const cases = [
    ['series_id=CPIAUCSL', "got a string that isn't a JSON object"],
    ['["a", "b"]', "got a string that isn't a JSON object"],
    [['a', 'b'], 'got an array'],
    [42, 'got a number'],
  ];
  for (const [value, got] of cases) {
    const parsed = parseQueryParamsArg(value);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /^query_params must be an object of key-value pairs, e\.g\. \{"series_id": "CPIAUCSL"\}/);
    assert.ok(parsed.error.includes(got), parsed.error);
  }
  const nested = parseQueryParamsArg({ filter: { year: 2024 } });
  assert.equal(nested.ok, false);
  assert.equal(nested.error, 'query_params.filter must be a string, number, boolean, or a list of them; got an object.');
});

test('headers: a JSON string works, numbers become text, cloud-metadata headers are dropped', () => {
  assert.deepEqual(
    parseHeadersArg('{"Accept": "text/csv", "X-Page": 2, "Metadata-Flavor": "Google"}'),
    { ok: true, values: { Accept: 'text/csv', 'X-Page': '2' } },
  );
  assert.equal(parseHeadersArg('not json').ok, false);
});

test('fetchApiArgsError reports the first bad argument, or null', () => {
  assert.equal(fetchApiArgsError({ query_params: { a: '1' }, headers: '{"Accept": "text/csv"}' }), null);
  assert.match(fetchApiArgsError({ query_params: 'a=1' }), /^query_params must be/);
  assert.match(fetchApiArgsError({ headers: ['Accept'] }), /^headers must be/);
});
