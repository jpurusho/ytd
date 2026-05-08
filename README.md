# ytd — YouTube Downloader

A full-featured YouTube downloader desktop app for macOS. Browse your playlists and subscriptions, search videos, preview before downloading, and manage a local media library — all with a clean native interface.

## Features

- **Google OAuth** — Sign in with your YouTube/Google account
- **Search** — Find videos with fuzzy search, see thumbnails and metadata
- **Browse** — View your playlists, subscriptions, and channel uploads
- **Preview** — Inline YouTube player to watch before downloading
- **Download** — Multiple simultaneous downloads with progress tracking
- **Format Selection** — MP4, WebM, MP3 (audio), with resolution picker showing available qualities
- **Time Range** — Visual slider to download specific segments of a video
- **Pause/Resume** — Pause downloads, resume on restart (persistent queue)
- **Local Playlists** — Create and manage playlists, sync two-way with YouTube
- **History** — Sortable download history with file status, bulk delete
- **Local Player** — Built-in media player with seek support
- **Convert** — Convert WebM to MP4 for ProPresenter/other tools
- **Themes** — 6 themes (Midnight, YouTube, Ocean, Sunset, GitHub Dark, Light)
- **Auto-Update** — Checks GitHub Releases for new versions
- **Zero Dependencies** — yt-dlp and ffmpeg bundled in packaged builds

## Install (macOS)

1. Download the `.zip` from [Releases](https://github.com/jpurusho/ytd/releases)
2. Extract (double-click)
3. Move `ytd.app` to `/Applications`
4. Run: `xattr -rc /Applications/ytd.app`
5. Open ytd and sign in with Google

## Development

### Prerequisites

- Node.js 20+
- `yt-dlp` and `ffmpeg` installed via Homebrew: `brew install yt-dlp ffmpeg`
- Google Cloud project with YouTube Data API v3 enabled

### Setup

```bash
git clone git@github.com:jpurusho/ytd.git
cd ytd
cp .env.example .env
# Edit .env with your Google OAuth Client ID and Secret
npm install
npm run dev
```

### Google Cloud Console

1. Create or use an existing project in [Google Cloud Console](https://console.cloud.google.com)
2. Enable **YouTube Data API v3**
3. Create OAuth 2.0 credentials (Desktop app type)
4. Add authorized redirect URIs: `http://localhost:48620/callback` through `http://localhost:48640/callback`
5. Copy Client ID and Secret to `.env`

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (Vite + Electron) |
| `npm run build` | Compile TypeScript + bundle React |
| `npm run dist` | Package macOS .zip |
| `npm test` | Run tests |
| `npm run download-bins` | Fetch yt-dlp + ffmpeg for packaging |

## Build & Release

### Local release

```bash
./scripts/release.sh 1.0.0
```

### CI/CD

Push a version tag to trigger automated build + GitHub Release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Requires repo secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture with Mermaid diagrams.

**Stack:** Electron 33 · React 18 · MUI 5 · TypeScript 5 · Vite 6 · SQLite · yt-dlp · ffmpeg

```
ytd/
├── desktop/        # Electron main process (services, IPC)
├── frontend/       # React renderer (pages, components, themes)
├── shared/         # TypeScript interfaces
├── scripts/        # Build and release scripts
├── docs/           # Architecture documentation
└── resources/      # App icons
```

## License

MIT
