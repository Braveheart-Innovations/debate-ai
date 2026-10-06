const assert = require('node:assert/strict');
const test = require('node:test');
const { isForcedToolChoice, shouldRetryUnforced } = require('../lib/toolChoiceFallback');

test('only forced choices are forced', () => {
  assert.equal(isForcedToolChoice('required'), true);
  assert.equal(isForcedToolChoice({ name: 'propose_team' }), true);
  assert.equal(isForcedToolChoice('auto'), false);
  assert.equal(isForcedToolChoice(undefined), false);
});

test('retries unforced only when a forced request is rejected for tool_choice', () => {
  const claude = '{"type":"error","error":{"type":"invalid_request_error","message":"tool_choice: type \\"tool\\" and \\"any\\" are not supported for this model."}}';
  const cohere = '{"message":"invalid request: tool_choice is not supported for this model"}';
  assert.equal(shouldRetryUnforced(400, claude, 'required'), true);
  assert.equal(shouldRetryUnforced(400, cohere, 'required'), true);
  assert.equal(shouldRetryUnforced(400, claude, 'auto'), false);
  assert.equal(shouldRetryUnforced(400, '{"message":"bad schema"}', 'required'), false);
  assert.equal(shouldRetryUnforced(429, claude, 'required'), false);
});
