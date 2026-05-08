# ytd — Architecture Document

## Overview

ytd is a full-featured YouTube Downloader desktop application built with Electron, React, and TypeScript. It follows the same architecture as gsync (Google Drive Sync app) with a clear separation between main process services, IPC communication, and the React renderer.

## System Architecture

```mermaid
graph TB
    subgraph "Renderer Process (React)"
        UI[React UI + MUI]
        Pages[Pages: Dashboard, Search, Browse, Downloads, History, Settings]
        Components[Components: VideoCard, FormatSelector, DownloadProgress, Sidebar]
        ThemeCtx[Theme Context]
    end

    subgraph "Preload (contextBridge)"
        API[window.api]
    end

    subgraph "Main Process (Electron)"
        IPC[IPC Handlers]
        subgraph "Services"
            Auth[GoogleAuthService]
            YT[YouTubeApiService]
            DL[DownloadEngine]
            QM[QueueManager]
            DB[Database - SQLite]
            TP[ToolPaths]
        end
    end

    subgraph "External"
        Google[Google OAuth2 + YouTube API v3]
        YTDLP[yt-dlp binary]
        FFMPEG[ffmpeg binary]
    end

    UI --> Pages
    Pages --> Components
    UI --> ThemeCtx
    Pages --> API
    API -->|IPC invoke| IPC
    IPC --> Auth
    IPC --> YT
    IPC --> QM
    QM --> DL
    DL -->|subprocess| YTDLP
    DL -->|subprocess| FFMPEG
    Auth --> Google
    YT --> Google
    Auth --> DB
    QM --> DB
    TP --> YTDLP
    TP --> FFMPEG
```

## OAuth Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant Renderer
    participant Main
    participant Browser
    participant Google

    User->>Renderer: Click "Sign in with Google"
    Renderer->>Main: auth:login (IPC invoke)
    Main->>Main: Start local HTTP server (port 48620-48640)
    Main->>Browser: Open Google OAuth URL
    Browser->>Google: User authenticates + grants consent
    Google->>Browser: Redirect to localhost:PORT/callback?code=AUTH_CODE
    Browser->>Main: GET /callback?code=AUTH_CODE
    Main->>Google: Exchange code for tokens
    Google-->>Main: access_token + refresh_token
    Main->>Main: Save tokens to SQLite
    Main->>Google: Get user info
    Google-->>Main: email, name, picture
    Main->>Main: Save user info to SQLite
    Main-->>Renderer: Return UserInfo
    Renderer->>User: Show Dashboard
```

## Download Flow

```mermaid
sequenceDiagram
    participant User
    participant Renderer
    participant QueueManager
    participant DownloadEngine
    participant ytdlp as yt-dlp

    User->>Renderer: Select video + format + quality
    Renderer->>QueueManager: downloads:start (IPC)
    QueueManager->>QueueManager: INSERT into queue table (status: pending)
    QueueManager->>QueueManager: processNext() — check concurrency
    QueueManager->>DownloadEngine: startDownload(item)
    DownloadEngine->>ytdlp: spawn process with args
    
    loop Progress updates
        ytdlp-->>DownloadEngine: stdout: progress line
        DownloadEngine->>QueueManager: onProgress(queueId, data)
        QueueManager->>QueueManager: UPDATE queue table
        QueueManager->>Renderer: download:progress (IPC event)
        Renderer->>User: Update progress bar
    end

    ytdlp-->>DownloadEngine: exit code 0
    DownloadEngine->>QueueManager: onComplete(queueId, filePath, fileSize)
    QueueManager->>QueueManager: INSERT into downloads table
    QueueManager->>QueueManager: processNext() — start next in queue
    QueueManager->>Renderer: download:complete (IPC event)
```

## Pause/Resume Flow

```mermaid
stateDiagram-v2
    [*] --> Pending: addToQueue()
    Pending --> Downloading: processNext()
    Downloading --> Paused: SIGSTOP
    Paused --> Downloading: SIGCONT
    Downloading --> Completed: exit code 0
    Downloading --> Failed: exit code != 0
    Failed --> Pending: retry()
    Downloading --> Cancelled: SIGTERM
    Paused --> Cancelled: cancel()
    Pending --> Cancelled: cancel()

    note right of Paused
        On app restart:
        Downloading → Pending
        yt-dlp --continue resumes
        from .part file
    end note
```

## Database Schema

```mermaid
erDiagram
    auth_tokens {
        int id PK
        text access_token
        text refresh_token
        text token_type
        int expiry_date
        text scope
        text updated_at
    }

    user_info {
        int id PK
        text email
        text name
        text picture
        text updated_at
    }

    queue {
        int id PK
        text video_id
        text title
        text channel
        text thumbnail_url
        text url
        text format
        text quality
        text resolution
        text start_time
        text end_time
        int priority
        text status
        real progress
        int downloaded_bytes
        int total_bytes
        text speed
        text eta
        text error
        text temp_file_path
        text scheduled_at
        text started_at
        text completed_at
        text created_at
    }

    downloads {
        int id PK
        text video_id
        text title
        text channel
        text channel_id
        text thumbnail_url
        text url
        text format
        text quality
        text resolution
        text file_path
        int file_size
        int duration
        text start_time
        text end_time
        text status
        text error
        text downloaded_at
    }

    app_settings {
        text key PK
        text value
        text updated_at
    }

    local_playlists {
        int id PK
        text name
        text description
        text youtube_playlist_id
        text last_synced_at
        text created_at
        text updated_at
    }

    local_playlist_items {
        int id PK
        int playlist_id FK
        text video_id
        text title
        text channel
        text thumbnail_url
        int duration
        int position
        text added_at
    }

    local_playlists ||--o{ local_playlist_items : contains
```

## Project Structure

```
ytd/
├── desktop/                    # Electron main process (TypeScript → CommonJS)
│   ├── index.ts                # App entry, window, menu
│   ├── preload.ts              # contextBridge (renderer ↔ main)
│   ├── ipc-handlers.ts         # All IPC channel registration
│   └── services/
│       ├── google-auth.ts      # OAuth2 via system browser
│       ├── embedded-config.ts  # Load build-time OAuth creds
│       ├── youtube-api.ts      # YouTube Data API v3
│       ├── download-engine.ts  # yt-dlp subprocess management
│       ├── queue-manager.ts    # Download queue + concurrency
│       ├── tool-paths.ts       # Resolve bundled binary paths
│       └── database.ts         # SQLite schema + CRUD
├── frontend/                   # React renderer (TypeScript → Vite ESM)
│   ├── App.tsx                 # Auth routing
│   ├── pages/                  # Route-level components
│   ├── components/             # Reusable UI components
│   └── theme/                  # Multi-theme system
├── shared/types.ts             # Shared TypeScript interfaces
├── bin/                        # Bundled binaries (build-time)
├── scripts/                    # Build & release scripts
└── tests/                      # Vitest unit tests
```

## Key Design Decisions

1. **yt-dlp as subprocess** — Node.js spawns yt-dlp binary; no Python runtime needed
2. **Bundled binaries** — yt-dlp + ffmpeg ship inside the app (extraResources)
3. **SQLite queue persistence** — Queue survives app restarts; --continue flag resumes
4. **Event-driven progress** — Main pushes progress to renderer via webContents.send
5. **YouTube API for browsing, yt-dlp for downloading** — Official API for metadata, unofficial for streams
6. **Multi-user via OAuth** — Each user signs in with their own Google/YouTube Premium account
7. **Modular services** — Each concern (auth, API, download, queue, DB) is an independent class

## IPC Channel Map

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `auth:*` | invoke | OAuth login/logout/status |
| `youtube:*` | invoke | YouTube API queries |
| `downloads:start/cancel/pause/resume/retry` | invoke | Queue management |
| `downloads:getQueue/getHistory` | invoke | Read state |
| `playlists:*` | invoke | Local playlist CRUD + YouTube sync |
| `app:getVideoFileUrl` | invoke | Serve local media via custom protocol |
| `app:convertToMp4` | invoke | ffmpeg WebM→MP4 conversion |
| `download:progress` | event (main→renderer) | Real-time progress |
| `download:complete` | event (main→renderer) | Download finished |
| `download:error` | event (main→renderer) | Download failed |
| `queue:updated` | event (main→renderer) | Queue state changed |
| `app:*` | invoke | Settings, paths, platform |

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Electron 33 |
| UI Framework | React 18 |
| UI Components | Material UI 5 |
| Build | Vite 6 |
| Language | TypeScript 5 |
| Database | SQLite (better-sqlite3) |
| Google APIs | googleapis + google-auth-library |
| Video Download | yt-dlp (bundled binary) |
| Video Processing | ffmpeg (bundled binary) |
| Testing | Vitest |
| Packaging | electron-builder |
