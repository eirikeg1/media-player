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

  if (process.env.NODE_ENV === 'production') {
    // The app logs verbosely through startup, imports and playback — some of it
    // with playlist URLs. Strip that from release builds, keeping the levels
    // that report real problems.
    plugins.push(['transform-remove-console', { exclude: ['error', 'warn'] }]);
  }

  // Must stay last per react-native-reanimated's docs.
  plugins.push('react-native-reanimated/plugin');

  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
    plugins,
  };
};
