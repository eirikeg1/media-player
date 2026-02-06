# Android Development

This project uses custom native modules (Rust FFI via `expo-m3u-parser`), so **Expo Go will not work**. You must use a development build.

## Quick Start

### 1. Build & Install (USB required)

Connect your phone via USB and run:

```bash
npx expo run:android --device
```

This compiles the native Kotlin/Rust code and installs the development client on your phone.

### 2. Develop Wirelessly (No USB needed)

After the app is installed, disconnect USB and run:

```bash
npx expo start --dev-client
```

On your phone:
1. Open the installed app (not Expo Go)
2. It will show a developer menu with connection options
3. Enter your computer's IP address or scan the QR code

## When to Rebuild

You only need to run `npx expo run:android --device` again when:
- Adding/removing native modules
- Updating native code (Rust, Kotlin, Java)
- Changing app configuration in `app.json`

For JavaScript/TypeScript changes, just reload the app (shake device or press `r` in terminal).

## Rebuilding the Rust Backend

When Rust code changes, rebuild the native libraries before running `expo run:android`:

```bash
cd native/rust-backend
./build-android.sh build
```

Prerequisites:
- Android NDK with `ANDROID_NDK_HOME` set
- `cargo-ndk` installed (`cargo install cargo-ndk`)
- Rust Android targets installed (`rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`)

To regenerate Kotlin bindings after changing the FFI interface:

```bash
./build-android.sh bindings
```

Or do both at once:

```bash
./build-android.sh all
```

## Troubleshooting

### "Cannot find native module 'M3uParser'"
You're running in Expo Go or the native build is outdated. Rebuild with `npx expo run:android --device`.

### Phone can't connect wirelessly
1. Phone and computer must be on the same WiFi network
2. Allow port 8081 through your firewall
3. In the app's dev menu, manually enter `http://<your-ip>:8081`

Find your IP:
```bash
hostname -I | awk '{print $1}'
```
