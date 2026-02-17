# Mobile Media Player

This is a basic app to watch movies and tv streams. Currently supports m3u playlists.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Run a development build

   ```bash
   npm run android        # Android dev build
   npm run ios            # iOS dev build
   ```

3. Run a release build

   ```bash
   npm run android:release
   npm run ios:release
   ```

Development and release builds use separate application IDs, so both can be installed on the same device simultaneously. The dev build appears as **"Media Player dev"** on the device.

### How variant switching works

A helper script (`scripts/expo-run.sh`) tracks which build variant was last prebuilt via a marker file (e.g. `android/.app-variant`). When you switch between dev and release, it automatically runs `npx expo prebuild --clean` to apply the correct app name and package ID. Same-variant rebuilds skip prebuild entirely for faster builds.

## Documentation

- [System Architecture](docs/SYSTEM_ARCHITECTURE.md) - Overview of the app's structure and data flow.
- [Playlist Architecture](docs/PLAYLIST_ARCHITECTURE.md) - Detailed view of how playlists are managed.
- [Playlist Usage](docs/PLAYLIST_USAGE.md) - How to use the playlist features.
- [Icon Reference](docs/ICON_REFERENCE.md) - Guide for using icons in the app.

# Attribution
App icon is from [Play button icons created by Azland Studio - Flaticon<](https://www.flaticon.com/free-icons/play-button)