# IPTV Playlist Architecture

## Overview

This document describes the architecture for managing IPTV playlists in the application. The design follows clean architecture principles with clear separation of concerns, making it easy to maintain and extend (e.g., migrating to SQLite in the future).

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

**Current Implementation**: In-Memory Storage
- Uses JavaScript Map for quick development and testing
- Same interface as future SQLite implementation

**Future Implementation**: SQLite
- Commented placeholder code is ready for SQLite migration
- Supports encrypted credential storage
- No changes needed to upper layers when migrating

**Interface Methods**:
- `getAll()`: Retrieve all playlists
- `getById(id)`: Get specific playlist
- `create(playlist)`: Create new playlist
- `update(id, updates)`: Update existing playlist
- `delete(id)`: Remove playlist
- `clear()`: Clear all playlists

### 4. State Management (`src/states/playlist-store.ts`)

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

### 6. UI Components (`src/components/domain/playlist/`)

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
- Credentials stored securely (encrypted in SQLite future implementation)

### 3. Caching with Refresh
- Parsed data stored in memory
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

## Migration to SQLite

When ready to migrate to SQLite:

1. **Install Dependencies**:
   ```bash
   npm install expo-sqlite
   npm install expo-secure-store  # for credential encryption
   ```

2. **Implement SQLite Repository**:
   - Uncomment `SQLitePlaylistRepository` in `playlist-repository.ts`
   - Implement all interface methods
   - Add database schema and migrations
   - Implement credential encryption using SecureStore

3. **Update Factory Function**:
   ```typescript
   export function createPlaylistRepository(): IPlaylistRepository {
     // Check if SQLite is available
     if (Platform.OS !== 'web') {
       return new SQLitePlaylistRepository();
     }
     return new InMemoryPlaylistRepository();
   }
   ```

4. **Database Schema**:
   ```sql
   CREATE TABLE playlists (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     url TEXT NOT NULL,
     credentials_encrypted TEXT,
     parsed_data TEXT,
     channel_count INTEGER,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     last_fetched_at INTEGER
   );
   ```

5. **No Other Changes Required**:
   - Service layer remains unchanged
   - Zustand store remains unchanged
   - UI components remain unchanged
   - Only repository implementation changes

## File Structure

```
src/
├── types/
│   └── playlist.types.ts              # Type definitions
├── services/
│   └── playlist-service.ts            # Business logic
├── states/
│   └── playlist-store.ts              # Zustand state management
├── db/
│   └── playlist-repository.ts         # Data access layer
├── lib/
│   └── playlist-utils.ts              # Utility functions
├── hooks/
│   └── use-playlist-init.ts           # Initialization hook
├── components/
│   └── domain/
│       └── playlist/
│           ├── playlist-manager.tsx   # Main container
│           ├── playlist-form.tsx      # Add playlist form
│           ├── playlist-list.tsx      # Display playlists
│           └── index.ts               # Exports
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

1. **SQLite Storage**: Persistent storage with encrypted credentials
2. **Playlist Groups**: Organize playlists into categories
3. **Channel Favorites**: Mark favorite channels across playlists
4. **EPG Support**: Electronic Program Guide integration
5. **Search**: Search channels across playlists
6. **Filters**: Filter channels by group, language, country
7. **Export/Import**: Export playlists to file, import from file
8. **Auto-refresh**: Automatic periodic playlist updates
9. **Offline Mode**: Cache channel data for offline viewing
10. **Statistics**: Track viewing history and preferences
