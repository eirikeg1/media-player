# Project Conventions

Actionable rules extracted from [architecture-decisions.md](./architecture-decisions.md). Reference this file when adding new features or reviewing code.

## Co-location Rule

Code used only within one domain belongs inside that feature's directory. Code used across domains stays in shared top-level directories (`types/`, `lib/`, `services/`, `hooks/`, `stores/`).

## Feature Prevention Rules

- **No cross-feature imports**: Features never import from other features' internal files. Use shared directories or barrel exports for cross-feature communication.
- **Data flows downward**: Repositories never import from stores. Stores call repositories, not the other way around.
- **Cross-store access**: Stores use `getState()` for cross-store reads (no subscription leaks).
- **Type purity**: Type files have no runtime dependencies.

## Store Boundaries

- Do **not** add new domain logic to `user-store.ts`. New domains get their own stores.
- **Split trigger**: When building "Continue Watching" or recommendations, extract `watch-history-store.ts` and `playback-store.ts`.

## Console.log Convention

All `console.log` statements must be wrapped in `if (__DEV__)` guards:

```typescript
if (__DEV__) {
  console.log('Debug info:', data);
}
```

When modifying any file, add guards to existing unguarded logs in that file.

## Feature Complexity Tiers

Choose the appropriate level of co-location based on complexity. Do **not** create empty directories — feature modules contain only what they need.

### Tier 1: Simple Feature

**When**: Feature is primarily UI display with data from shared stores/hooks.

```
features/my-feature/
├── components/
│   ├── my-component.tsx
│   └── another-component.tsx
└── index.ts
```

**Current examples**: Playlist, User.

### Tier 2: Medium Feature

**When**: Feature has its own data-fetching logic, filtering, or domain-specific state.

```
features/my-feature/
├── components/
├── hooks/
├── types/                    # Only if feature has domain-specific types
└── index.ts
```

**Current examples**: Live TV.

### Tier 3: Complex Feature

**When**: Feature has real-time state, error recovery, retry logic, multiple tightly-coupled concerns.

```
features/my-feature/
├── components/
├── hooks/
│   └── specialized/          # Only if multiple tightly-coupled hooks
├── services/
├── types/
├── utils/
├── constants.ts
└── index.ts
```

**Current examples**: Video playback.

## Barrel Export Rules

- **Use barrel exports** at feature boundaries: `features/*/index.ts`, `stores/video/index.ts`.
- **Do not** create barrel files for `types/`, `lib/`, `services/`, `db/`, `hooks/` — direct imports are clearer and avoid Metro module evaluation overhead.

## New Feature Checklist

1. Choose complexity tier (simple / medium / complex)
2. Create only the directories you need
3. Put domain-specific code inside the feature directory
4. Put shared code in top-level directories
5. Export public API via `index.ts` barrel file
