import { ConfigContext, ExpoConfig } from "expo/config";

const IS_DEV = process.env.APP_VARIANT === "development";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_DEV ? "Media Player dev" : "Media Player",
  slug: "media-player",
  version: "1.0.0",
  icon: "./assets/images/app-icon.png",
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
      backgroundColor: "#8524A6",
      foregroundImage: "./assets/images/app-icon.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: IS_DEV
      ? "com.anonymous.mediaplayer.dev"
      : "com.anonymous.mediaplayer",
  },
  web: {
    output: "static" as const,
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 400,
        resizeMode: "contain",
      },
    ],
    "expo-video",
    "react-native-google-cast",
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
