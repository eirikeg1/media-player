module.exports = function (api) {
  api.cache.using(() => process.env.NODE_ENV);

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

  if (api.env('test')) {
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
