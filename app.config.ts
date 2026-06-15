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
    "expo-video",
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
