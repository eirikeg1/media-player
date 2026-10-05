const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Ensure wasm and the recommendation model artifact are treated as assets,
// not source files (see assets/recs/recs-model.bin).
config.resolver.assetExts.push('wasm', 'bin');
config.resolver.sourceExts = config.resolver.sourceExts.filter(
  (ext) => ext !== 'wasm' && ext !== 'bin'
);

module.exports = withNativeWind(config, { input: './src/global.css', inlineRem: 16 });
