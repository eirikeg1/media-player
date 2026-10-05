module.exports = function (api) {
  // The release-only plugin below switches on NODE_ENV, so the config cache is
  // keyed on it: a cached config must not outlive a change of env.
  const isProduction = api.cache.using(() => process.env.NODE_ENV === 'production');

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

  if (isProduction) {
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
