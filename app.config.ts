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
        image: "./assets/icons/play_3.png",
        imageWidth: 400,
        resizeMode: "contain",
      },
    ],
    "expo-video",
    "react-native-google-cast",
    [
      "expo-build-properties",
      {
        android: {
          usesCleartextTraffic: true,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
