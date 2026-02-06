# IPTV Playlist Architecture

## Overview

This document describes the architecture for managing IPTV playlists in the application. The design follows clean architecture principles with clear separation of concerns, making it easy to maintain and extend.

## Architecture Layers

### 1. Types Layer (`src/types/playlist.types.ts`)

Defines all TypeScript interfaces and types for playlist management:

- **Playlist**: Main entity representing an IPTV playlist
- **PlaylistCredentials**: Authentication credentials for protected playlists
- **ParsedPlaylist**: Parsed M3U data from iptv-playlist-parser
- **Channel**: Individual channel data
- **CreatePlaylistInput**: DTO for creating new playlists
- **UpdatePlaylistInput**: DTO for updating existing playlists
- **PlaylistStatus**: Enum for operation states

### 2. Service Layer (`src/services/playlist-service.ts`)

Contains business logic for playlist operations:

- **fetchPlaylistContent()**: Fetches M3U files from URLs with optional authentication
- **parsePlaylistContent()**: Parses M3U content using iptv-playlist-parser
- **fetchAndParsePlaylist()**: Combined fetch and parse operation
- **validateUrl()**: URL format validation
- **validateParsedData()**: Validates parsed playlist data
- **getChannelCount()**: Extracts channel count from parsed data
- **getChannelGroups()**: Extracts unique channel groups

### 3. Repository Layer (`src/db/playlist-repository.ts`)

Data access layer with abstract interface:

**Implementation**: SQLite via `SQLitePlaylistRepository`
- Persists playlists and channels to SQLite database
- Channel parsing delegated to `RustChannelService`
- Factory function `createPlaylistRepository()` with singleton export

**Interface Methods** (`IPlaylistRepository`):
- `getAll()`: Retrieve all playlists
- `getById(id)`: Get specific playlist
- `create(playlist)`: Create new playlist
- `update(id, updates)`: Update existing playlist
- `delete(id)`: Remove playlist
- `clear()`: Clear all playlists

### 4. State Management (`src/stores/playlist/playlist-store.ts`)

Zustand store for global playlist state:

**State**:
- `playlists`: Array of all playlists
- `activePlaylistId`: Currently selected playlist
- `isLoading`: Loading state for async operations
- `error`: Error messages from operations

**Actions**:
- `addPlaylist(input)`: Add and fetch new playlist
- `removePlaylist(id)`: Delete playlist
- `setActivePlaylist(id)`: Set active playlist
- `refreshPlaylist(id)`: Re-fetch and re-parse playlist
- `updatePlaylist(id, updates)`: Update playlist metadata
- `loadPlaylists()`: Load all playlists from repository

**Selectors**:
- `getActivePlaylist()`: Get current active playlist
- `getPlaylistById(id)`: Find playlist by ID

### 5. Utilities (`src/lib/playlist-utils.ts`)

Helper functions for playlist management:

- `generatePlaylistId()`: Create unique playlist IDs
- `formatDate()`: Format dates for display
- `getTimeElapsed()`: Calculate time since date
- `sanitizePlaylistName()`: Clean playlist names
- `extractDomain()`: Extract domain from URL
- `isValidUrl()`: URL validation

### 6. UI Components (`src/features/playlist/`)

React components for playlist UI:

**PlaylistManager** (`playlist-manager.tsx`)
- Main container component
- Manages form visibility
- Shows global loading and error states
- Displays playlist count

**PlaylistForm** (`playlist-form.tsx`)
- Form for adding new playlists
- Fields: name, URL, username (optional), password (optional)
- Validation and error handling
- Loading states during submission

**PlaylistList** (`playlist-list.tsx`)
- Displays all playlists
- Shows playlist details (channel count, last updated, authentication status)
- Actions: Activate, Refresh, Delete
- Empty state when no playlists

### 7. Hooks (`src/hooks/use-playlist-init.ts`)

Custom React hook for playlist initialization:

- `usePlaylistInit()`: Loads playlists on app startup
- Called in root layout to ensure playlists are available app-wide

## Data Flow

### Adding a Playlist

```
User Input (PlaylistForm)
  ↓
Zustand Store (addPlaylist action)
  ↓
Service Layer (fetchAndParsePlaylist)
  ↓
Repository Layer (create)
  ↓
State Update
  ↓
UI Re-render (PlaylistList)
```

### Refreshing a Playlist

```
User Action (Refresh button)
  ↓
Zustand Store (refreshPlaylist action)
  ↓
Service Layer (fetchAndParsePlaylist)
  ↓
Repository Layer (update)
  ↓
State Update
  ↓
UI Re-render
```

## Key Features

### 1. Multiple Playlist Support
- Users can add multiple M3U playlists
- Switch between playlists
- Each playlist tracked independently

### 2. Authentication Support
- Optional username/password credentials
- Embedded in URL for authenticated requests
- Credentials stored in SQLite database

### 3. Caching with Refresh
- Parsed data stored in SQLite
- Manual refresh to re-fetch and re-parse
- Last updated timestamp tracking

### 4. Error Handling
- Try-catch blocks in all async operations
- User-friendly error messages
- Global error state in Zustand store
- Per-form error states

### 5. Loading States
- Global loading indicator during operations
- Per-component loading states
- Disabled interactions during loading

## File Structure

```
src/
├── types/
│   └── playlist.types.ts              # Type definitions
├── services/
│   └── playlist-service.ts            # Business logic
├── stores/
│   └── playlist/
│       ├── playlist-store.ts          # Zustand state management
│       └── index.ts                   # Barrel export
├── db/
│   └── playlist-repository.ts         # Data access layer (SQLite)
├── lib/
│   └── playlist-utils.ts              # Utility functions
├── hooks/
│   └── use-playlist-init.ts           # Initialization hook
├── features/
│   └── playlist/
│       ├── playlist-manager.tsx       # Main container
│       ├── playlist-form.tsx          # Add playlist form
│       ├── playlist-list.tsx          # Display playlists
│       └── index.ts                   # Exports
└── app/
    ├── _layout.tsx                    # App initialization
    └── (tabs)/
        └── settings.tsx               # Playlist management UI
```

## Best Practices

1. **Separation of Concerns**: Each layer has a single responsibility
2. **Dependency Injection**: Repository abstraction allows easy swapping
3. **Type Safety**: Strong TypeScript types throughout
4. **Error Handling**: Comprehensive error handling at each layer
5. **User Feedback**: Loading states and error messages for better UX
6. **Testability**: Pure functions and clear interfaces make testing easier

## Future Enhancements

1. **Playlist Groups**: Organize playlists into categories
2. **EPG Support**: Electronic Program Guide integration
3. **Export/Import**: Export playlists to file, import from file
4. **Auto-refresh**: Automatic periodic playlist updates
5. **Offline Mode**: Cache channel data for offline viewing
6. **Statistics**: Track viewing history and preferences
