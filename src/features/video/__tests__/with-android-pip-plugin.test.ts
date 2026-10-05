/**
 * The local Android picture-in-picture config plugin, run against a fixture
 * manifest: a prebuild is the only other way to see what it writes, and a
 * mistake here is a black PiP window on a recreated activity.
 */
import type { AndroidConfig } from 'expo/config-plugins';

import { applyPictureInPictureToManifest } from '../../../../plugins/with-android-pip';

/** The MainActivity attributes Expo's own prebuild template produces. */
const TEMPLATE_CONFIG_CHANGES = 'keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode';

function makeManifest(
  activityAttributes: Record<string, string> = { 'android:configChanges': TEMPLATE_CONFIG_CHANGES }
): AndroidConfig.Manifest.AndroidManifest {
  return {
    manifest: {
      $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
      queries: [],
      application: [
        {
          $: { 'android:name': '.MainApplication' },
          activity: [
            { $: { 'android:name': '.MainActivity', ...activityAttributes } },
            { $: { 'android:name': 'com.facebook.react.devsupport.DevSettingsActivity' } },
          ],
        },
      ],
    },
  };
}

const mainActivity = (manifest: AndroidConfig.Manifest.AndroidManifest) =>
  manifest.manifest.application![0].activity![0].$;

describe('with-android-pip', () => {
  it('declares picture-in-picture support on MainActivity', () => {
    const activity = mainActivity(applyPictureInPictureToManifest(makeManifest()));

    expect(activity['android:supportsPictureInPicture']).toBe('true');
  });

  it('adds the configChanges the transition needs, keeping the template’s', () => {
    const activity = mainActivity(applyPictureInPictureToManifest(makeManifest()));

    // Recreating the activity on a resize would restart the app (the playback
    // session is in memory only), so both resize-related changes are required.
    expect(activity['android:configChanges']?.split('|')).toEqual([
      ...TEMPLATE_CONFIG_CHANGES.split('|'),
      'smallestScreenSize',
    ]);
  });

  it('adds every missing configChange when the template declares none', () => {
    const activity = mainActivity(applyPictureInPictureToManifest(makeManifest({})));

    expect(activity['android:configChanges']).toBe('smallestScreenSize|screenLayout');
  });

  it('is idempotent: a second prebuild changes nothing', () => {
    const once = applyPictureInPictureToManifest(makeManifest());
    const twice = applyPictureInPictureToManifest(applyPictureInPictureToManifest(makeManifest()));

    expect(mainActivity(twice)).toEqual(mainActivity(once));
  });

  it('throws when the manifest has no MainActivity', () => {
    const manifest = makeManifest();
    manifest.manifest.application![0].activity = [];

    expect(() => applyPictureInPictureToManifest(manifest)).toThrow(/MainActivity/);
  });

  it('leaves the application element alone (no iOS-style background audio)', () => {
    const manifest = applyPictureInPictureToManifest(makeManifest());

    expect(manifest.manifest.application![0].$).toEqual({ 'android:name': '.MainApplication' });
    expect(manifest.manifest['uses-permission']).toBeUndefined();
  });
});
