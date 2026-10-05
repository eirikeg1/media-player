const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

/**
 * Configuration changes `MainActivity` has to handle itself for a
 * picture-in-picture transition.
 *
 * Entering (and leaving) PiP resizes the activity, which changes the smallest
 * screen width and the screen layout. Anything not listed in `configChanges` is
 * an activity *recreation* — and the playback session lives in memory only, so a
 * recreation would restart the app under the PiP window instead of keeping the
 * stream playing in it.
 */
const PIP_CONFIG_CHANGES = ['smallestScreenSize', 'screenLayout'];

/**
 * Add `changes` to an `android:configChanges` value, keeping what is already
 * there (Expo's template declares orientation, screenSize, uiMode…) and its
 * order.
 *
 * @param {string | undefined} current
 * @param {string[]} changes
 * @returns {string}
 */
function mergeConfigChanges(current, changes) {
  const declared = current ? current.split('|').filter(Boolean) : [];
  const missing = changes.filter((change) => !declared.includes(change));
  return [...declared, ...missing].join('|');
}

/**
 * Declare picture-in-picture support on `MainActivity`.
 *
 * Exported on its own so the manifest mutation can be unit-tested without
 * running a prebuild — see `src/features/video/__tests__/with-android-pip-plugin.test.ts`.
 *
 * @param {import('@expo/config-plugins').AndroidConfig.Manifest.AndroidManifest} manifest
 * @returns {import('@expo/config-plugins').AndroidConfig.Manifest.AndroidManifest}
 */
function applyPictureInPictureToManifest(manifest) {
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
  activity.$['android:supportsPictureInPicture'] = 'true';
  activity.$['android:configChanges'] = mergeConfigChanges(
    activity.$['android:configChanges'],
    PIP_CONFIG_CHANGES
  );
  return manifest;
}

/**
 * Android-only picture-in-picture support for the video player.
 *
 * This is what expo-video's own `supportsPictureInPicture` option would do on
 * Android — but that option also adds the `audio` background mode on iOS, which
 * keeps the stream (and with it the panel's single connection) alive whenever the
 * app leaves the foreground. See the plugins list in `app.config.ts`.
 *
 * The `VideoView` still has to opt in with `allowsPictureInPicture` (and
 * `startsPictureInPictureAutomatically` for the Home-press transition) — the
 * manifest only makes it possible; see `src/features/video/components/video-player.tsx`.
 *
 * @type {import('@expo/config-plugins').ConfigPlugin}
 */
const withAndroidPictureInPicture = (config) =>
  withAndroidManifest(config, (androidConfig) => {
    applyPictureInPictureToManifest(androidConfig.modResults);
    return androidConfig;
  });

module.exports = withAndroidPictureInPicture;
module.exports.applyPictureInPictureToManifest = applyPictureInPictureToManifest;
