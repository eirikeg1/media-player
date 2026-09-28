# Video Feature

Playback is owned by an app-wide **session**, not by the video screen. The
session (`src/stores/video/playback-session-store.ts`) creates and releases the
one `expo-video` player, so backing out of the screen minimizes playback into the
mini player bar instead of stopping it. The screen presents and controls that
player through an **orchestrator** hook that wires up loading, errors, controls
and gestures.

## Directory Structure

```
features/video/
├── components/
│   ├── playback-session-host.tsx  # Always mounted: timeline, errors, history
│   ├── mini-player-bar.tsx        # The minimized session (and the cast bar)
│   ├── loading-progress.tsx       # Buffering/loading UI overlay
│   ├── video-player.tsx           # The screen's player tree
│   ├── video-controls.tsx         # Play/pause, seek, resync, cast, match score
│   ├── video-gesture-layer.tsx    # Gesture surface (brightness/volume/seek)
│   ├── gesture-indicator-overlay.tsx
│   ├── video-seek-bar.tsx
│   └── video-states.tsx           # Casting and error overlays
├── hooks/
│   ├── use-video-player.ts        # Top-level hook consumed by the screen
│   ├── use-cast-playback.ts       # Chromecast loading and remote controls
│   └── specialized/
│       ├── use-video-orchestrator.ts   # Central hub coordinating all hooks
│       ├── use-video-player-state.ts   # Loading overlay + play/pause commands
│       ├── use-video-controls.ts       # Controls visibility
│       ├── use-video-network.ts        # Refcounted connectivity subscription
│       ├── use-video-error-handling.ts  # The session's error + retry budget
│       ├── use-video-gestures.ts       # Pan/tap gesture definitions
│       ├── use-viewing-history.ts      # Progress and resume bookkeeping
│       └── index.ts
├── types/
│   └── video-error.types.ts       # Error classification and retry backoff
├── utils/
│   ├── network-utils.ts           # NetInfo → NetworkState
│   └── xtream-url.ts              # Xtream URL parsing (HLS variants for cast)
└── constants.ts                   # Timeouts, colours, layout, config values
```

## Who owns what

| Concern | Lives in | Why |
|---------|----------|-----|
| The native player, what it plays, its error | `PlaybackSession` | Outlives the screen: the mini bar keeps playing, and a stream that fails while minimized has to be shown there. |
| The player's timeline (`currentTime`, `duration`, `isPlaying`) | `PlaybackSessionHost` → `usePlaybackTimeStore` | One subscription for the whole app; consumers select the field they show. |
| Viewing history and resume positions | `PlaybackSessionHost` | Progress must keep recording after the screen unmounts. |
| Loading overlay, controls, gestures, retry budget | The screen's orchestrator | Screen-lifetime state; reset per stream. |

## Data Flow

```
Components (video-player.tsx, video-controls.tsx)
  ↓
useVideoPlayerLogic (top-level hook)
  ↓
useVideoOrchestrator (the brain — coordinates all specialized hooks)
  ↓
┌─────────────────────────────────────────────────────────┐
│  useVideoPlayerState   — loading overlay + commands     │
│  useVideoControls      — controls visibility            │
│  useVideoNetwork       — network connectivity           │
│  useVideoErrorHandling — the session's error + retries  │
└─────────────────────────────────────────────────────────┘
  ↓
Stores (src/stores/video/)
```

## Related Stores

Video state is managed in `src/stores/video/` and split into sub-stores to
prevent unnecessary re-renders:

- `playback-session-store.ts` — the session: player, stream, error, teardown
- `playback-time-store.ts` — the session player's published timeline
- `queue-store.ts` — next/previous queue, handed over by the launching screen
- `player-store.ts` — whether the receiver (cast) is playing instead
- `ui-store.ts` — controls visibility
- `retry-store.ts` — retry attempts and backoff
- `gesture-store.ts` — the active gesture and its indicator values
- `cast-mini-player-store.ts` — the cast mini bar

## Constraints worth knowing

- **The panel allows one connection.** A player must be unloaded
  (`replaceAsync(null)`) and the panel given `CONNECTION_RELEASE_DELAY_MS`
  before the next stream opens its own — `startSession` waits for that
  regardless of whether a session object still exists.
- **Every source goes through `buildVideoSource`.** Many streams are
  header-gated; a bare URL loses the channel's User-Agent/Referer.
- **Android allows one attached `VideoView` per player.** The session tracks
  `screenViewAttached` so the mini bar and the screen never attach at once.
- **System brightness is never requested.** Asking for `WRITE_SETTINGS` opens a
  system screen, which backgrounds the app and kills playback; the gesture falls
  back to app-window brightness.
