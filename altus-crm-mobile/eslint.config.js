// Standalone flat config for this Expo project — kept independent of the parent Next.js repo's
// eslint.config.mjs, which explicitly ignores this whole directory (two unrelated lint setups
// nested in one checkout).
const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
]);
