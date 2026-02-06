# Architecture Decisions — Resolved

> Produced by a follow-up discussion between Software Architect, React Native & Performance Specialist, and Devil's Advocate. All open questions from the original proposal have been debated and resolved with consensus.

## Table of Contents

1. [Resolved Decisions](#1-resolved-decisions)
2. [Prioritized Action Plan](#2-prioritized-action-plan)
3. [Folder Structure (Updated)](#3-folder-structure-updated)
4. [Feature Complexity Guide](#4-feature-complexity-guide)
5. [Conventions to Document](#5-conventions-to-document)

---

## 1. Resolved Decisions

### Decision 1: Rename `components/domain/` → `features/` — YES, do it

**Consensus: All three agree.** The devil's advocate was initially opposed but conceded after examining the evidence.

**Rationale**: The video domain already contains `hooks/`, `services/`, `types/`, `utils/`, and `constants.ts` inside `components/domain/video/`. Stores import types from `components/domain/video/types/` — the directory name is a structural lie, not just a cosmetic issue. As new features (EPG, VOD) are added with their own hooks and types, this mismatch would multiply.

**Conditions (from devil's advocate)**:
- Do it in a single commit per move step using `git mv`
- Do it *after* the live hooks move (so the rename is more meaningful)
- Run `npm run typecheck` after each commit

**Cost**: ~16 import path changes across app screens and stores. Manageable in a single PR.

### Decision 2: Do NOT rename `states/` → `stores/` — SKIP

**Consensus: All three agree.** The architect conceded after the other two opposed.

**Rationale**: Unlike `components/domain/`, the `states/` directory name is not misleading — it contains state. The rename is a community-convention preference, not a structural fix. It affects ~19 files of import churn for zero functional benefit. The existing developers know what `states/` means.

**Exception**: If the store directory structure changes for other reasons (e.g., flattening subdirectories), the rename could be bundled at that time since imports are already changing.

### Decision 3: Move 5 live-only hooks + promote `usePlaylistChannels` — YES

**Consensus: All three agree.** The devil's advocate was initially opposed but conceded once the cross-domain issue was resolved.

**The plan**:
1. Move `usePlaylistChannels` → `src/hooks/use-playlist-channels.ts` (shared hooks directory). It's cross-domain (used by live + playlist), not live-specific. Update 4 import sites.
2. Move 5 live-only hooks (`useFavoriteChannels`, `useFavoriteGroups`, `useGroups`, `usePaginatedChannels`, `usePlaylistData`) → `features/live/hooks/`. Update imports in `live.tsx` (sole consumer).
3. Delete `useChannelFiltering` — confirmed dead code (zero imports).

**Why this works**: The cross-domain complication was the devil's advocate's primary objection. Promoting `usePlaylistChannels` to shared hooks resolves it cleanly — no orphan files, no cross-feature imports, no prevention-rule violations.

### Decision 4: UserStore — Don't split now, hard boundary on expansion

**Consensus: All three agree (was never disputed after initial analysis).**

**Evidence**: Of 22-23 actions, only 6 call `set()`. The rest are pure repository pass-throughs that cause zero re-renders. The actual reactive state surface is small: `{ users, currentUser, isLoading, error }`.

**Rules**:
- **Do NOT** add new domain concerns (EPG preferences, VOD favorites, sports team following) to UserStore. New domains get their own stores.
- **Split trigger**: Building "Continue Watching" or recommendations — extract `watch-history-store.ts` and `playback-store.ts` at that point.
- **Optional future cleanup**: The 14 non-`set()` actions could eventually move out of the store into direct repository calls or a service pattern. Lower priority than structural reorg.

### Decision 5: Video pattern — Template for complex features, NOT universal

**Consensus: All three agree (was never disputed after initial analysis).**

**The graduated guide**:
| Feature Complexity | Pattern | Example |
|-------------------|---------|---------|
| **Simple** | Components only (maybe + index.ts) | Playlist, User, Home |
| **Medium** | Components + hooks + types | VOD browsing, Sports schedule |
| **Complex** | Components + hooks + services + types + utils (orchestrator pattern) | Video playback, EPG guide |

**Rule**: Feature modules contain what they need — no empty scaffolding. Don't create empty `hooks/`, `services/`, `types/` directories. If a feature only has components, that's fine.

### Decision 6: Performance optimizations — Fix bugs, defer everything else

**Consensus: All three agree.**

**Fix NOW (Tier 1 bugs)**:
| Bug | Location | Fix |
|-----|----------|-----|
| `JSON.stringify` in useEffect deps | `use-groups.ts`, `use-paginated-channels.ts` (3 occurrences) | `useRef` + shallow comparison, or stabilize with `useMemo` |
| `JSON.stringify(channel)` in route params | `live.tsx` | Pass channel ID, look up on receiving screen |
| Dead `useChannelFiltering` hook | `hooks/live/use-channel-filtering.ts` | Delete |
| Dead `InMemoryPlaylistRepository` | `playlist-repository.ts` | Delete class + factory |

**SKIP (no measured need)**:
| Proposal | Why Skip |
|----------|----------|
| Zustand `shallow` comparisons | Already using individual property selectors — `shallow` only helps multi-property object selectors, which aren't used |
| Selector factories | DX improvement, not performance. Current inline selectors are fine at this scale |
| React Query | Adds ~30KB dependency, requires QueryProvider, rewrites all data hooks. Current pattern works. Revisit only if cross-screen caching or background refetching is needed |
| Error boundaries | No evidence of unhandled render crashes. Current try-catch error handling is adequate |

### Decision 7: Console.log cleanup — Incremental, not a sweep

**Consensus: All three agree.**

- **Document the convention now**: All new `console.log` statements must use `__DEV__` guards
- **Clean up incrementally**: Add guards when touching a file for any other reason
- **Don't do a dedicated sweep**: The ROI doesn't justify ~20+ file changes and git blame noise
- The logs are in action handlers (store CRUD, form submissions), not render loops or hot paths — the performance impact is minimal

---

## 2. Prioritized Action Plan

### Priority 1 — Do Immediately (Bugs & Dead Code)
Each can be its own small PR. Zero risk.

| Step | Change | Files |
|------|--------|-------|
| 1.1 | Fix `JSON.stringify` in useEffect/useCallback deps | 2 files |
| 1.2 | Fix `JSON.stringify(channel)` in route params → pass channel ID | 2-3 files |
| 1.3 | Delete dead `useChannelFiltering` hook | 1 file |
| 1.4 | Delete dead `InMemoryPlaylistRepository` class | 1 file |
| 1.5 | Audit for other dead code (`SimpleChannelGrid`, `StickyTopBar`, unused `PlaylistService` methods) | 2-3 files |

### Priority 2 — Do Before Next Feature (Structural + Documentation)
One focused PR, ideally done before starting EPG/VOD development.

| Step | Change | Files | Order |
|------|--------|-------|-------|
| 2.1 | Document architecture conventions (pattern guide, co-location rules, console.log convention) | 1-2 doc files | First |
| 2.2 | Promote `usePlaylistChannels` to shared `hooks/use-playlist-channels.ts` | 5 files | Second |
| 2.3 | Move 5 live-only hooks → `components/domain/live/hooks/` (or `features/live/hooks/` if doing 2.4 simultaneously) | 6 files | Third |
| 2.4 | Rename `components/domain/` → `features/`, restructure video .tsx files into `features/video/components/` | ~16 import updates | Fourth |

> Steps 2.2-2.4 can be one PR with 3 commits, or separate PRs. Each commit must pass typecheck.

### Priority 3 — Do When Building New Features (Defer)

| Change | Trigger |
|--------|---------|
| Split UserStore → user + watch-history + playback stores | Building "Continue Watching" or recommendations |
| Extract watch-history-repository from UserRepository | Same trigger as above |
| Create `features/epg/` with components, hooks, types | Building EPG Guide |
| Create `features/vod/` with movies/ and series/ sub-modules | Building VOD Library |
| New Zustand stores per domain (epg-store, vod-store) | Building respective features |

### Skip Entirely

| Proposal | Why |
|----------|-----|
| `states/` → `stores/` rename | Cosmetic — both names are accurate |
| Pre-creating feature scaffolding | YAGNI |
| Barrel exports for types/lib/services | Circular dependency risk in Metro |
| React Query, Zustand shallow, selector factories | No measured need |
| Error boundaries | No evidence of unhandled render crashes |
| Dedicated console.log cleanup sweep | Incremental approach is sufficient |

---

## 3. Folder Structure (Updated)

This reflects the resolved decisions — `features/` replaces `components/domain/`, but `states/` is NOT renamed.

```
src/
├── app/                                    # Expo Router screens (UNCHANGED)
│   ├── _layout.tsx
│   ├── index.tsx
│   ├── modal.tsx
│   ├── user-select.tsx
│   ├── video-player.tsx
│   └── (tabs)/
│       ├── _layout.tsx
│       ├── index.tsx
│       ├── live.tsx
│       └── settings.tsx
│
├── components/
│   └── ui/                                 # Reusable UI primitives (UNCHANGED)
│       ├── containers/
│       ├── controls/
│       └── display/
│
├── features/                               # Domain modules (replaces components/domain/)
│   ├── live/
│   │   ├── components/                     # From components/domain/live/
│   │   ├── hooks/                          # From hooks/live/ (minus usePlaylistChannels)
│   │   └── index.ts
│   ├── playlist/
│   │   ├── components/                     # From components/domain/playlist/
│   │   └── index.ts
│   ├── user/
│   │   ├── components/                     # From components/domain/user/
│   │   └── index.ts
│   ├── video/                              # Preserved structure (was components/domain/video/)
│   │   ├── components/                     # Video .tsx files moved into components/
│   │   ├── hooks/
│   │   │   ├── use-video-player.ts
│   │   │   └── specialized/
│   │   ├── services/
│   │   ├── types/
│   │   ├── utils/
│   │   ├── constants.ts
│   │   └── index.ts
│   └── home/
│       └── components/                     # From general-placeholder-components/
│
├── states/                                 # Zustand stores (NOT renamed)
│   ├── index.ts
│   ├── playlist/
│   │   ├── playlist-store.ts
│   │   └── index.ts
│   ├── user/
│   │   ├── user-store.ts
│   │   └── index.ts
│   └── video/
│       ├── player-store.ts
│       ├── ui-store.ts
│       ├── error-store.ts
│       ├── network-store.ts
│       └── index.ts
│
├── services/                               # Shared cross-domain services (UNCHANGED)
├── types/                                  # Shared type definitions (UNCHANGED)
├── db/                                     # Database layer (UNCHANGED)
├── lib/                                    # Shared utilities (UNCHANGED)
│
├── hooks/                                  # Shared app-level hooks
│   ├── use-color-scheme.ts
│   ├── use-color-scheme.web.ts
│   ├── use-playlist-channels.ts            # Promoted from hooks/live/
│   ├── use-playlist-init.ts
│   └── use-theme-color.ts
│
├── constants/
│   └── selection-theme.ts
└── global.css
```

---

## 4. Feature Complexity Guide

When building a new feature, choose the appropriate level of co-location based on complexity:

### Tier 1: Simple Feature
**When**: Feature is primarily UI display with data from shared stores/hooks.
**Structure**: `components/` only.
**Current examples**: Playlist management, User settings, Home preview.

```
features/my-feature/
├── components/
│   ├── my-component.tsx
│   └── another-component.tsx
└── index.ts
```

### Tier 2: Medium Feature
**When**: Feature has its own data-fetching logic, filtering, or domain-specific state.
**Structure**: `components/` + `hooks/` + optionally `types/`.
**Planned examples**: VOD browsing, Sports schedule.

```
features/my-feature/
├── components/
├── hooks/
├── types/                    # Only if feature has domain-specific types
└── index.ts
```

### Tier 3: Complex Feature
**When**: Feature has real-time state, error recovery, retry logic, multiple tightly-coupled concerns.
**Structure**: Full co-location — `components/` + `hooks/` (possibly with `specialized/`) + `services/` + `types/` + `utils/`.
**Current example**: Video playback. Planned: EPG guide.

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

**Rule**: Don't create empty directories. If your feature doesn't need services, don't create a `services/` directory. Feature modules contain what they need, nothing more.

---

## 5. Conventions to Document

These should be written into a project pattern guide (e.g., `CLAUDE.md` or a `docs/conventions.md`):

1. **Co-location rule**: Code used only within one domain belongs inside that feature's directory. Code used across domains stays in shared top-level directories (`types/`, `lib/`, `services/`, `hooks/`).

2. **Feature prevention rules**:
   - Features never import from other features' internal files
   - Use shared directories or barrel exports for cross-feature communication
   - Stores use `getState()` for cross-store access (no subscription leaks)
   - Repositories never import from stores (data flows downward)
   - Type files have no runtime dependencies

3. **Store boundaries**: Do not add new domain logic to `user-store.ts`. New domains get their own stores. Split UserStore when a feature needs reactive state for watch history, playback positions, or preferences.

4. **Console.log convention**: All `console.log` statements must be wrapped in `if (__DEV__)` guards. When modifying any file, add guards to existing unguarded logs in that file.

5. **New feature checklist**: Choose complexity tier (simple/medium/complex), create only the directories you need, put domain-specific code inside the feature, put shared code in top-level directories.

6. **Barrel exports**: Only at feature boundaries (`features/*/index.ts`, `states/video/index.ts`). No barrel files for `types/`, `lib/`, `services/`, `db/`, `hooks/` — direct imports are clearer and avoid Metro module evaluation overhead.

---

## Appendix: Discussion Process

### How Consensus Was Reached

The original proposal left 4 open questions for the project owner to decide. A follow-up discussion resolved all of them:

| Original Open Question | Resolution | How Consensus Was Reached |
|----------------------|-----------|--------------------------|
| "Is a structural reorg worth doing now?" | **Yes** — rename `components/domain/` → `features/` | Devil's advocate conceded after verifying that `components/domain/video/` contains services, types, utils, and hooks — the name is genuinely misleading, not cosmetic |
| "Should live hooks move?" | **Yes** — move 5 live-only hooks, promote `usePlaylistChannels` to shared | Devil's advocate conceded once the cross-domain issue was resolved by promoting `usePlaylistChannels` to shared hooks |
| "Is the UserStore a problem?" | **Not yet** — don't split now, hard boundary on expansion | All three agreed from their initial analyses — 14 of 22 actions never call `set()`, re-render risk is near zero |
| "Should the video pattern be the template?" | **For complex features only** — graduated 3-tier guide | All three agreed from their initial analyses — the video domain's complexity justifies co-location, but simpler features shouldn't be forced into that depth |

### Additional Resolutions (Not in Original Open Questions)

| Topic | Resolution |
|-------|-----------|
| `states/` → `stores/` rename | **Skip** — architect conceded after react-expert and devil's advocate both opposed (cosmetic, ~19 files of churn) |
| Performance optimizations (shallow, factories, React Query) | **Skip all** — fix JSON.stringify bugs only, defer everything else until measured |
| Console.log `__DEV__` guards | **Incremental** — document convention, clean up when touching files, don't do a sweep |
