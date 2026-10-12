const assert = require('node:assert/strict');
const test = require('node:test');

const { CONNECTOR_AUTH_CONFIG, connectorTakesKey } = require('../lib/dataConnectors');

test('a bearer connector takes a key even with no managed key (GitHub BYOK)', () => {
  assert.equal(connectorTakesKey(CONNECTOR_AUTH_CONFIG.github), true);
  assert.equal(connectorTakesKey({ authType: 'bearer' }), true);
});

test('param and header connectors take a key when they name where it goes', () => {
  assert.equal(connectorTakesKey(CONNECTOR_AUTH_CONFIG.fred), true);
  assert.equal(connectorTakesKey(CONNECTOR_AUTH_CONFIG.newsapi), true);
  assert.equal(connectorTakesKey({ authType: 'query_param' }), false);
});

test('keyless connectors never take a key', () => {
  assert.equal(connectorTakesKey(CONNECTOR_AUTH_CONFIG.world_bank), false);
});

test('every connector that authenticates takes a key', () => {
  for (const [id, config] of Object.entries(CONNECTOR_AUTH_CONFIG)) {
    if (config.authType !== 'none') assert.equal(connectorTakesKey(config), true, id);
  }
});
