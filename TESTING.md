# Testing Guide

## Overview

The app is tested at four levels. The guiding principle: **mock only at the
native boundary, run real logic everywhere else.** Instead of stubbing every
dependency, two high-fidelity fakes stand in for the native modules, so
repository SQL, service logic, and store behavior are exercised for real.

| Level | What runs | Command |
|---|---|---|
| JS unit + integration | Jest (`jest-expo`) against native-boundary fakes | `npm test` |
| Component / hook | React Native Testing Library | `npm test` (same suite) |
| Rust backend | `cargo test` in `native/rust-backend` | `npm run test:rust` |
| End-to-end | Maestro flows on a device/emulator | `npm run test:e2e` |

Quality gates for every change: `npm test`, `npm run typecheck`,
`npm run lint` (and `npm run test:rust` when the submodule changes).

## Architecture

```
stores (zustand)  ─┐
services           ├─ run REAL in tests
repositories (db/) ─┘
───────────────────────── native boundary ─────────────────────────
expo-sqlite        → fake backed by real SQLite (better-sqlite3)
expo-m3u-parser    → in-memory fake of the Rust Database/SportsDatabase
expo-crypto        → Node crypto
```

The fakes are wired automatically through the root `__mocks__/` directory —
no `jest.mock()` calls needed in test files. Implementations live in
`src/test/fakes/`:

- **`expo-sqlite-fake.ts`** — every `openDatabaseAsync()` returns a fresh
  in-memory SQLite database, so migrations and repository SQL (UPSERTs,
  window functions, partial indexes) genuinely execute.
- **`m3u-database-fake.ts`** — mirrors the Rust backend's `Database` /
  `SportsDatabase` API over plain arrays. It parses **real M3U and XMLTV
  text**, and "downloads" from URLs registered via `__registerRemoteM3u(url,
  content)` / `__registerRemoteXmltv(url, content)`, so playlist/EPG sync
  paths run end to end. `Database.open(path)` returns one shared instance per
  path, matching production connection sharing.

## Writing a test

```ts
import { resetTestDatabases, resetStores } from '@/test/helpers';
import { makeRustChannel, makePlaylistMetadata } from '@/test/factories';
import { BASIC_M3U, BASIC_M3U_COUNTS } from '@/test/fixtures';
import { __registerRemoteM3u } from '@/test/fakes/m3u-database-fake';

beforeEach(async () => {
  await resetTestDatabases();          // fresh migrated DB + empty Rust fake
  resetStores(useUserStore);           // reset any zustand stores you touch
});
```

- **Helpers** (`src/test/helpers/`): `resetTestDatabases()` gives each test a
  clean, fully-migrated database; `resetStores(...)` restores zustand initial
  state.
- **Factories** (`src/test/factories/`): typed builders (`makeChannel`,
  `makeRustChannel`, `makePlaylistMetadata`, …) that return complete realistic
  objects; pass a partial override for what the test cares about.
- **Fixtures** (`src/test/fixtures/`): hand-curated realistic data —
  `BASIC_M3U` (16 channels: live groups, movies, two series, one
  adult-flagged entry) and `BASIC_XMLTV` (matching guide data). Treat them as
  a stable contract: extend, don't mutate.
- Drive stores via `useStore.getState().action(...)` — no rendering needed.
- Assert **behavior and outcomes**, not mock call counts: the layers under
  test are real.
- Place tests in `__tests__/` folders next to the code under test.
- `console.log` is silenced in tests; run with `KEEP_TEST_LOGS=1` to see it.

## Component tests

Use `@testing-library/react-native` (`render`, `screen`, `fireEvent`,
`renderHook`). Prefer presentational components; for native-heavy modules
(expo-video, google-cast, reanimated) add a per-file `jest.mock` rather than
global setup.

RNTL v14 gotchas (see `src/components/ui/**/__tests__/` for working patterns):

- The API is **fully async**: `render`, `renderHook`, `fireEvent.*`, `act`,
  `rerender`, and `unmount` all return Promises — `await` every call.
- `toHaveAccessibilityState` and `UNSAFE_getAllByType` are gone; use
  `toBeDisabled()` / `toHaveStyle()` instead.
- Don't assert on `jest.getTimerCount()` (React's scheduler owns fake timers
  too); spy on `setInterval`/`clearInterval` and track the specific id.

## Rust backend

`native/rust-backend` is a separate git repo (submodule). Its tests live with
each crate (`cargo test --workspace`); `cargo fmt` and `cargo clippy` must be
clean. Remember that changes there are committed and pushed in the submodule
repo first, then the pointer is bumped here.

## End-to-end (Maestro)

Flows live in `.maestro/` and cover the core journeys against stable testIDs
in the screens:

| Flow | Journey |
|---|---|
| `00-first-run-create-profile.yaml` | clears state, creates the "E2E" profile, lands on tabs |
| `01-smoke-launch.yaml` | relaunch with existing state, tab bar visible |
| `02-tab-navigation.yaml` | taps Home / Live / Videos / Sports / Settings |
| `03-add-playlist.yaml` | Settings → Playlist Management → add + import a playlist |
| `04-start-playback.yaml` | Live tab → first channel → "Watch Now" → player |

The flows build on each other and run in that order (`.maestro/config.yaml`
pins it via `executionOrder`).

**Setup**

1. Install the [Maestro CLI](https://docs.maestro.dev):
   `curl -fsSL "https://get.maestro.mobile.dev" | bash`
2. Connect a device/emulator and build + install the dev app:
   `npm run android` (or `npm run ios`). The flows target the dev appId
   `com.anonymous.mediaplayer.dev`.

**Running**

```bash
npm run test:e2e                            # all flows, in order
maestro test .maestro/03-add-playlist.yaml  # a single flow
```

`03-add-playlist.yaml` reads `PLAYLIST_URL` (default: iptv-org's Norway
playlist — small and quick to import). Point it at the full index as an
import stress test:

```bash
maestro test -e PLAYLIST_URL=https://iptv-org.github.io/iptv/index.m3u .maestro/
```

**Caveat:** the flows were written against the screen code (testIDs, visible
labels) but have **not yet been verified on a device** — expect to tweak
selectors/timeouts on the first real run; each flow's header comments note the
assumptions most likely to need adjusting.
