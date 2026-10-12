const assert = require('node:assert/strict');
const test = require('node:test');

const { deleteSessionSandbox } = require('../lib/cloudPayloadStorage');

test('deleting a session destroys its sandbox (the session id is the sandbox key)', async () => {
  const calls = [];
  await deleteSessionSandbox('u1', 'session_1', async (uid, key) => { calls.push([uid, key]); });
  assert.deepEqual(calls, [['u1', 'session_1']]);
});

test('a sandbox that cannot be destroyed does not fail the session delete', async () => {
  const errors = console.error;
  console.error = () => {};
  try {
    await deleteSessionSandbox('u1', 'session_1', async () => { throw new Error('E2B down'); });
  } finally {
    console.error = errors;
  }
});
