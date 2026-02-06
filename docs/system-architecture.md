# System Architecture

This document provides a high-level overview of the IPTV Mobile architecture. The project follows clean architecture principles, emphasizing separation of concerns, modularity, and testability.

## 1. High-Level Overview

The application is structured into three primary layers:

- **Presentation Layer (UI):** Expo Router for navigation and React components styled with Tailwind (NativeWind).
- **Application Layer (Logic):** Zustand for state management and specialized services for business logic.
- **Infrastructure Layer (Data):** Repositories for data persistence (SQLite) and external network services.

```mermaid
graph TD
    subgraph "Presentation Layer (UI)"
        Screens["Screens (src/app)"]
        Components["Components (src/components, src/features)"]
    end

    subgraph "Application Layer (State & Logic)"
        Stores["Zustand Stores (src/stores)"]
        Hooks["Custom Hooks (src/hooks)"]
        Services["Services (src/services)"]
    end

    subgraph "Infrastructure Layer (Data)"
        Repo["Repositories (src/db)"]
        SQLite[("SQLite DB")]
        API["External APIs / M3U"]
    end

    Screens --> Components
    Components --> Hooks
    Components --> Stores
    Hooks --> Stores
    Stores --> Services
    Stores --> Repo
    Services --> API
    Repo --> SQLite
```

## 2. Navigation & Routing (Expo Router)

The app uses file-based routing with a tab-based primary interface and modals for secondary interactions.

- **Main Tabs:** Playlists (Index), Live TV, and Settings.
- **Root Routes:** Full-screen Video Player and User Selection.

```mermaid
graph TD
    Root["Root Layout (_layout.tsx)"]
    
    subgraph "Main App (Tabs)"
        Live["Live TV (/(tabs)/live)"]
        Playlists["Playlists (/(tabs)/index)"]
        Settings["Settings (/(tabs)/settings)"]
    end

    subgraph "Modals & Fullscreen"
        Player["Video Player (/video-player)"]
        UserSel["User Select (/user-select)"]
        Modal["Generic Modal (/modal)"]
    end

    Root --> Playlists
    Root --> Live
    Root --> Settings
    
    Live -- "Select Channel" --> Player
    Playlists -- "Manage" --> Modal
    Settings -- "Switch User" --> UserSel
```

## 3. Video Player Module

The Video Player is the most complex module, utilizing an **Orchestrator Pattern** to manage playback, network state, error handling, and UI controls independently.

- **Orchestrator:** `useVideoOrchestrator` acts as the central hub.
- **Specialized Hooks:** Logic is split into network, error, state, and control hooks.
- **Service Layer:** `VideoStateService` provides pure utility functions for player interaction.

```mermaid
graph TD
    subgraph "Video UI"
        Screen["VideoPlayer Screen"]
        UI_Controls["VideoControls Component"]
    end

    subgraph "The Brain"
        Orchestrator["useVideoOrchestrator"]
    end

    subgraph "Specialized Hooks"
        H_Net["useVideoNetwork"]
        H_Err["useVideoErrorHandling"]
        H_State["useVideoPlayerState"]
        H_Ctrl["useVideoControls"]
    end

    subgraph "Core Logic"
        Service["VideoStateService"]
        ExpoVideo["expo-video Player"]
    end

    Screen --> Orchestrator
    Orchestrator --> H_Net
    Orchestrator --> H_Err
    Orchestrator --> H_State
    Orchestrator --> H_Ctrl
    
    H_State --> Service
    Service --> ExpoVideo
    H_Ctrl --> Service
    
    UI_Controls -.-> H_Ctrl
```

## 4. State Management (Zustand)

State is decentralized into domain-specific stores located in `src/stores/`:

- **Playlist Store:** Manages M3U content, parsing status, and list of available playlists.
- **User Store:** Manages user profiles and global preferences.
- **Video Store:** Split into sub-stores (Player, UI, Network, Error) to prevent unnecessary re-renders in the playback UI.

## 5. Domain Documentation

For deeper dives into specific domains, refer to:
- [Playlist Architecture](./playlist-architecture.md)
- [Playlist Usage](./playlist-usage.md)
