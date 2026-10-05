import "dotenv/config";
import { ConfigContext, ExpoConfig } from "expo/config";

const IS_DEV = process.env.APP_VARIANT === "development";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_DEV ? "Media Player dev" : "Media Player",
  slug: "media-player",
  version: "1.0.0",
  icon: "./assets/icons/play_2.png",
  scheme: "mediaplayer",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    infoPlist: {
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
      },
    },
    bundleIdentifier: IS_DEV
      ? "com.anonymous.mediaplayer.dev"
      : "com.anonymous.mediaplayer",
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#f0dff6",
      foregroundImage: "./assets/icons/play_2.png",
      monochromeImage: "./assets/icons/play_2.png",
    },
    edgeToEdgeEnabled: true,
    // Predictive back stays OFF on React Native 0.81. With it on, back only
    // reaches JS through a callback `ReactActivity` registers — and that
    // callback is disabled, and never re-enabled, the first time a back press
    // falls through to the system (leaving the app from a root screen). The
    // activity survives that, so from then on every back press bypasses
    // navigation entirely and backgrounds the app, whatever screen is open.
    // Fixed on React Native main (`invokeDefaultOnBackPressed` re-enables the
    // callback) but not in 0.81/0.82; turn this on only after upgrading past
    // that fix. The app is ready for it otherwise: dismissible surfaces are
    // routes or `Modal`s and the player decides about its session from the
    // route's `beforeRemove`.
    predictiveBackGestureEnabled: false,
    package: IS_DEV
      ? "com.anonymous.mediaplayer.dev"
      : "com.anonymous.mediaplayer",
  },
  web: {
    output: "static" as const,
    favicon: "./assets/icons/play_2.png",
  },
  plugins: [
    "expo-router",
    // Adds the iOS `processing` background mode and the BGTaskScheduler
    // identifier the module schedules under — required for the sports
    // background refresh task (see src/background/).
    "expo-background-task",
    [
      "expo-splash-screen",
      {
        // First frame of the AnimatedSplashLoader (three discs in the play
        // triangle) so the native cold-start splash is visually identical to
        // where the JS animation begins — it looks like the animation is on
        // screen from the very first pixel.
        image: "./assets/icons/splash-circles.png",
        imageWidth: 200,
        resizeMode: "contain",
        // Base colour of the animated wave (SPLASH_WAVE_BASE) so the cold-start
        // native splash blends into the JS shader with no colour pop.
        backgroundColor: "#13214A",
      },
    ],
    // expo-video is configured with neither `supportsPictureInPicture` nor
    // `supportsBackgroundPlayback`: both add the `audio` background mode on
    // iOS, and playback is meant to *stop* when the app leaves the foreground —
    // the panel allows a single connection, which a backgrounded stream would
    // keep holding. Android PiP is enabled instead by the local plugin below,
    // which does the Android half of `supportsPictureInPicture` and nothing on
    // iOS.
    "expo-video",
    // Android picture-in-picture: `android:supportsPictureInPicture` plus the
    // `configChanges` the transition needs on MainActivity. The `VideoView`
    // props alone are silently ignored without it (and it needs a prebuild).
    "./plugins/with-android-pip",
    [
      "react-native-google-cast",
      {
        // Pin the version so Gradle resolves the artifact directly from
        // google() instead of scanning every repo (incl. jitpack) for the
        // latest "+" version, which fails the build on any jitpack hiccup.
        androidPlayServicesCastFrameworkVersion: "22.3.1",
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          usesCleartextTraffic: true,
        },
      },
    ],
  ],
  extra: {},
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
