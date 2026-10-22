const assert = require('node:assert/strict');
const { test } = require('node:test');
const { HttpsError } = require('firebase-functions/v2/https');
const { refusalOf, SIGN_IN_AGAIN } = require('../lib/streamRefusal');

test('a missing or expired sign-in streams as unauthenticated, asking the user to sign in again', () => {
  assert.deepEqual(refusalOf(new HttpsError('unauthenticated', 'Invalid or expired auth token')), { message: SIGN_IN_AGAIN, code: 'unauthenticated' });
});

test('another refusal keeps its own code and message', () => {
  assert.deepEqual(refusalOf(new HttpsError('invalid-argument', 'Messages are required')), { message: 'Messages are required', code: 'invalid-argument' });
});

test('anything else is not a refusal (the handler reports it as the model\'s failure)', () => {
  assert.equal(refusalOf(new Error('fetch failed')), undefined);
  assert.equal(refusalOf({ status: 401, message: 'nope' }), undefined);
  assert.equal(refusalOf('boom'), undefined);
});
