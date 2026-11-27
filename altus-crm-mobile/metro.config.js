const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite's web build resolves a .wasm module (even though our only use of it — the
// localStorage shim — is a no-op on web); Metro needs "wasm" registered as an asset extension
// or that resolution fails. See https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/#web-setup
config.resolver.assetExts.push('wasm');

module.exports = config;
