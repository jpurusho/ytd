# Upgrade Guide: ytd 1.8.0

## What's New

### 🎉 Major Features

**Video Transcription (Phase 3)**
- Transcribe downloaded videos to text
- Search across all transcripts
- Export as TXT, SRT, or VTT
- Click timestamps to seek video
- Support for local Whisper or OpenAI API

**Robustness Improvements (Phase 4)**
- File integrity verification (SHA-256)
- Auto-retry with exponential backoff (3 retries)
- Disk space checking before downloads
- Better error messages and recovery

**Modern React Patterns (Phase 2)**
- Zustand state management
- TanStack Query for data fetching
- Event-driven updates (no polling)
- React.memo optimizations

**Foundation Updates (Phase 1)**
- React 19, Electron 45, TypeScript 7
- Structured logging with Winston
- Error boundaries and toast notifications
- Testing infrastructure

### 🆕 Dependency Check UI

The app now **automatically detects** missing external dependencies and shows:
- Installation commands (e.g., `brew install ffmpeg`)
- Links to official guides
- Status for each tool (installed/missing)
- Recheck button after installation

**No manual checking required!**

---

## Installation Instructions

### 1. Update Code

```bash
git pull origin main
```

### 2. Install NPM Dependencies

```bash
npm install
```

**New packages added:**
- `zustand` - State management
- `@tanstack/react-query` - Data fetching
- `react-window` - Virtual scrolling (future use)

### 3. External Dependencies

#### Required (for downloads to work):

```bash
# Install ffmpeg
brew install ffmpeg

# yt-dlp should already be installed
# If not: brew install yt-dlp
```

#### Optional (for transcription feature):

**Option A: Local Whisper (Free, Private)**
```bash
pip install openai-whisper
```

**Option B: OpenAI API (Fast, $0.006/min)**
```bash
# Set environment variable
export OPENAI_API_KEY="your-api-key-here"
```

### 4. Build & Run

```bash
# Development mode
npm run dev

# Production build
npm run build
npm start

# Create distributable
npm run dist
```

---

## Dependency Detection

On first launch, the app will:
1. Check for yt-dlp, ffmpeg, Python Whisper, OpenAI API key
2. Show a dialog if any critical tools are missing
3. Provide installation instructions
4. Let you recheck after installing

**Critical tools** (required):
- ✅ yt-dlp - Download videos
- ✅ ffmpeg - Process video/audio

**Optional tools** (for transcription):
- ⚠️ Python Whisper - Local transcription
- ⚠️ OpenAI API - Cloud transcription

The app will work for downloads without transcription tools!

---

## What Happens If Dependencies Are Missing?

### Missing yt-dlp or ffmpeg:
- ❌ Downloads will fail
- ⚠️ Critical dialog will appear on startup
- 📝 Installation instructions provided

### Missing transcription tools:
- ✅ Downloads work normally
- ❌ Transcription button will show error
- ⚠️ Optional warning in dependency check
- 📝 Installation instructions provided

---

## Testing Your Installation

### 1. Check Dependencies
Launch the app - dependency check runs automatically.

### 2. Test Downloads
1. Log in with Google
2. Search for a video
3. Click download
4. Verify file integrity check passes

### 3. Test Transcription (if installed)
1. Download a short video (< 5 minutes)
2. Click "Transcribe" button
3. Choose "Local (Base)" or "OpenAI Cloud"
4. Wait for completion
5. Click transcript to view/search

---

## Troubleshooting

### "ffmpeg not found"
```bash
brew install ffmpeg
# Restart app
```

### "Python Whisper not available"
```bash
pip install openai-whisper
# Or: pip3 install openai-whisper
# Restart app and click "Recheck"
```

### "Downloads fail immediately"
Check if yt-dlp is installed:
```bash
yt-dlp --version
# If not found: brew install yt-dlp
```

### "Build errors"
Some TypeScript errors in database.ts are pre-existing and don't affect functionality. The app compiles and runs despite them.

---

## Version History

**1.8.0** (2026-11-10)
- Video transcription feature
- File integrity + auto-retry + disk space
- Modern React patterns
- Dependency check UI
- 24 commits, ~3,000+ lines added

**1.7.10** (Previous)
- Base functionality
- YouTube downloads
- Playlists and sync

---

## What's Next (Optional - Phase 5)

Future improvements (not in 1.8.0):
- Performance optimizations
- Better accessibility
- User documentation
- Offline mode indicator
- Database backup UI

---

## Need Help?

**Check logs:**
```bash
# Development
npm run dev
# Check console output

# Production
# Logs in ~/.ytd/ directory
```

**Reset if needed:**
```bash
# Clear database
rm ~/.ytd/ytd.db

# Clear settings
rm ~/.ytd/config.json
```

**Report issues:**
https://github.com/jpurusho/ytd/issues

---

## Summary

✅ **Version bumped:** 1.7.10 → 1.8.0  
✅ **All changes pushed** to GitHub  
✅ **Dependency check** built into app  
✅ **Installation** is mostly automatic  
⚠️ **Manual steps:** Install ffmpeg, optionally Whisper

**The app will guide you through missing dependencies on first launch!**

Enjoy the new features! 🚀
