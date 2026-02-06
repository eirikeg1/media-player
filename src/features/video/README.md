# Video Feature

The video player is the most complex feature module, using an **orchestrator pattern** to manage playback, network state, error handling, and UI controls independently.

## Directory Structure

```
features/video/
├── components/
│   ├── loading-progress.tsx       # Buffering/loading UI overlay
│   ├── video-controls.tsx         # Play/pause, seek, fullscreen controls
│   ├── video-player.tsx           # Main player component
│   └── video-states.tsx           # State-dependent UI (error, loading, etc.)
├── hooks/
│   ├── use-video-player.ts        # Top-level hook consumed by screens
│   └── specialized/
│       ├── use-video-orchestrator.ts   # Central hub coordinating all hooks
│       ├── use-video-player-state.ts   # Player state tracking (playing, paused, buffering)
│       ├── use-video-controls.ts       # Play/pause/seek actions
│       ├── use-video-network.ts        # Network connectivity monitoring
│       ├── use-video-error-handling.ts  # Error detection, categorization, recovery
│       └── index.ts
├── services/
│   ├── video-state-service.ts     # Pure utility functions for player interaction
│   ├── video-error-service.ts     # Error classification and message generation
│   ├── video-retry-service.ts     # Retry logic and backoff strategies
│   └── index.ts
├── types/
│   └── video-error.types.ts       # Error type definitions
├── utils/
│   └── network-utils.ts           # Network-related utilities
└── constants.ts                   # Timeouts, retry counts, config values
```

## Data Flow

```
Components (video-player.tsx, video-controls.tsx)
  ↓
useVideoPlayerLogic (top-level hook)
  ↓
useVideoOrchestrator (the brain — coordinates all specialized hooks)
  ↓
┌─────────────────────────────────────────────────────────┐
│  useVideoPlayerState   — tracks player state            │
│  useVideoControls      — play/pause/seek actions        │
│  useVideoNetwork       — network connectivity           │
│  useVideoErrorHandling — error detection & recovery     │
└─────────────────────────────────────────────────────────┘
  ↓
Services (pure utility classes — no state)
  ↓
Stores (src/stores/video/)
```

## Hook Responsibilities

| Hook | Purpose |
|------|---------|
| `useVideoPlayerLogic` | Top-level API consumed by screens. Wraps the orchestrator. |
| `useVideoOrchestrator` | Central coordinator. Wires specialized hooks together and manages their interactions. |
| `useVideoPlayerState` | Subscribes to expo-video player events to track playback state (playing, paused, buffering, ended). |
| `useVideoControls` | Exposes play, pause, seek, and fullscreen actions. Delegates to `VideoStateService`. |
| `useVideoNetwork` | Monitors network connectivity. Triggers error/recovery flows on connection changes. |
| `useVideoErrorHandling` | Detects errors from player events, classifies them via `VideoErrorService`, and manages retry logic via `VideoRetryService`. |

## Services Layer

Services are **pure utility classes** with static methods — no React state, no side effects.

| Service | Purpose |
|---------|---------|
| `VideoStateService` | Direct interaction with the expo-video player instance (play, pause, seek, replace source). |
| `VideoErrorService` | Classifies errors into categories (network, format, auth, unknown) and generates user-facing messages. |
| `VideoRetryService` | Manages retry attempts with backoff strategies. |

## Related Stores

Video state is managed in `src/stores/video/` and split into sub-stores to prevent unnecessary re-renders:

- `player-store.ts` — Core playback state
- `ui-store.ts` — UI visibility (controls shown/hidden, fullscreen)
- `network-store.ts` — Network status
- `error-store.ts` — Error state and retry counts
