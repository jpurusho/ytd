# ytd — YouTube Downloader Desktop App

## Quick Reference

- **Dev:** `npm run dev` (starts Vite + Electron concurrently)
- **Build:** `npm run build` (TS compile + Vite bundle)
- **Package:** `npm run dist` (creates macOS .zip)
- **Test:** `npm test`
- **Release:** `./scripts/release.sh 1.0.0` (build + upload to GitHub)
- **Download binaries:** `npm run download-bins` (fetches yt-dlp + ffmpeg for packaging)

## Architecture

Electron + React + MUI + TypeScript + SQLite. Same pattern as `~/experimental/gdrive` (gsync).

- `desktop/` — Main process (services, IPC handlers, preload)
- `frontend/` — React renderer (pages, components, theme)
- `shared/types.ts` — Shared TypeScript interfaces
- `docs/` — Architecture documentation with Mermaid diagrams
- `scripts/` — Build, release, and binary download scripts
- `bin/` — Bundled yt-dlp + ffmpeg binaries (gitignored, fetched at build time)

## Key Patterns

- IPC: `ipcMain.handle('channel', handler)` ↔ `ipcRenderer.invoke('channel', args)`
- Events (main→renderer): `webContents.send('channel', data)` ↔ `ipcRenderer.on('channel', handler)`
- Services are class-based with clear single responsibility
- Database operations are synchronous (better-sqlite3)
- OAuth uses local HTTP callback server on ports 48620-48640
- Custom `local-media://` protocol for secure local file playback with range support
- YouTube embed iframe for preview before downloading

## Features

- Google OAuth (youtube scope — full read/write for playlist sync)
- YouTube search, playlist browsing, subscription browsing
- Video preview via embedded YouTube player
- Download with format/quality/resolution selection
- Time range slider for segment extraction
- Pause/resume/cancel downloads (SIGSTOP/SIGCONT + yt-dlp --continue)
- Persistent download queue (SQLite, survives restarts)
- Local playlists with two-way YouTube sync
- Download history with sorting, filtering, bulk delete
- Built-in media player (audio + video) with seek
- WebM → MP4 conversion via ffmpeg
- File existence detection (dimmed rows for missing files)
- 6 themes via React Context + localStorage
- Update checking via GitHub Releases API
- Private/unavailable video detection with friendly errors

## Environment Setup

1. Copy `.env.example` to `.env` with Google Cloud Console credentials
2. Enable YouTube Data API v3 in the Google Cloud project
3. Add `http://localhost:48620/callback` through `http://localhost:48640/callback` as authorized redirect URIs
4. For dev mode, have `yt-dlp` and `ffmpeg` installed via Homebrew

## Conventions

- TypeScript strict mode everywhere
- MUI components for UI (no custom CSS frameworks)
- Theme system via React Context + localStorage
- All DB tables use `snake_case`; TypeScript interfaces use `camelCase`
- Format selectors show actual available resolutions (probed via yt-dlp --dump-json)
- Timestamps stored as UTC in SQLite, displayed in local timezone in UI
- Private/deleted videos shown as dimmed cards with "Unavailable" chip
