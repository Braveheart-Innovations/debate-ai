const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Silence deep import warning by aliasing to the package export
config.resolver = config.resolver || {};
config.resolver.extraNodeModules = Object.assign(
  {},
  config.resolver.extraNodeModules || {},
  {
    'event-target-shim/index': require.resolve('event-target-shim'),
  }
);

module.exports = config;
