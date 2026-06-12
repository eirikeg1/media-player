module.exports = function (api) {
  // Calling api.env() with no arguments keys the cache on the active env
  // (BABEL_ENV || NODE_ENV) — the same value the test-only plugin branch
  // below switches on.
  const env = api.env();

  const plugins = [
    [
      'module-resolver',
      {
        root: ['./src'],
        alias: {
          '@': './src',
        },
      },
    ],
  ];

  if (env === 'test') {
    // Jest's default VM cannot execute native dynamic import(); rewrite it
    // to a deferred require so code paths using import() run under tests.
    plugins.push('babel-plugin-dynamic-import-node');
  }

  // Must stay last per react-native-reanimated's docs.
  plugins.push('react-native-reanimated/plugin');

  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
    plugins,
  };
};
