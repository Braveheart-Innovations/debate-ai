const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');

const {
  getAndroidPurchaseOwnershipDecision,
  getExpectedAndroidObfuscatedAccountId,
  sha256,
} = require('../lib/purchaseOwnership');

test('sha256 produces the same obfuscated account id used by the Android app', () => {
  const uid = 'test-user-123';
  const expected = crypto.createHash('sha256').update(uid).digest('hex');

  assert.equal(sha256(uid), expected);
  assert.equal(getExpectedAndroidObfuscatedAccountId(uid), expected);
});

test('Android ownership decision accepts matching Google account identifiers', () => {
  const uid = 'user-a';
  const decision = getAndroidPurchaseOwnershipDecision(uid, {
    obfuscatedExternalAccountId: getExpectedAndroidObfuscatedAccountId(uid),
  });

  assert.equal(decision.hasAccountIdentifier, true);
  assert.equal(decision.matchesCurrentUser, true);
});

test('Android ownership decision rejects mismatched Google account identifiers', () => {
  const decision = getAndroidPurchaseOwnershipDecision('user-a', {
    obfuscatedExternalAccountId: getExpectedAndroidObfuscatedAccountId('user-b'),
  });

  assert.equal(decision.hasAccountIdentifier, true);
  assert.equal(decision.matchesCurrentUser, false);
});

test('Android ownership decision marks missing account identifiers as unverified', () => {
  const decision = getAndroidPurchaseOwnershipDecision('user-a', {});

  assert.equal(decision.hasAccountIdentifier, false);
  assert.equal(decision.matchesCurrentUser, false);
});
