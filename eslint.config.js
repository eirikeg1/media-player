// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // `bin` is registered as a metro asset extension (metro.config.js) for the
    // recommendation model, so requiring it there is an asset import — which
    // the shared rule allows, it just does not know about this extension.
    files: ['src/services/recommendation-model.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': ['warn', { allow: ['\\.bin$'] }],
    },
  },
]);
