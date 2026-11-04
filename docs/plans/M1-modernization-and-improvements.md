# M1 — Modernization & Improvements Plan

**Status:** Draft (awaiting code analysis completion)
**Date:** 2026-11-03

## Context

ytd v1.7.10 is a full-featured YouTube downloader with solid architecture and functionality. However, multiple dependencies are outdated (major versions behind), and there are opportunities to improve robustness, UX, and maintainability using modern patterns.

## Current State Analysis

### Architecture (Strong Foundation)
- **Stack:** Electron 33, React 18, MUI 5, TypeScript 5, Vite 6, SQLite
- **Pattern:** Clean IPC separation (main ↔ preload ↔ renderer)
- **Services:** Modular (Auth, YouTube API, Download Engine, Queue Manager, Sync)
- **Features:** OAuth, download queue, pause/resume, local playlists, sync via Bonjour
- **Size:** ~10k LOC, 2 test files

### Strengths
✅ Well-structured with clear separation of concerns
✅ Comprehensive feature set (search, browse, playlists, sync)
✅ Theme system (6 themes)
✅ Download queue with pause/resume persistence
✅ Local network sync between devices
✅ Clean TypeScript interfaces

### Areas for Improvement

#### 1. Outdated Dependencies (High Priority)
Many packages are 2-4 major versions behind:
- React 18 → 19
- MUI 5 → 9 (huge jump!)
- Electron 33 → 45
- TypeScript 5 → 7
- Vite 6 → 8
- React Router 6 → 7
- Many supporting libraries

**Risk:** Security vulnerabilities, missing performance improvements, compatibility issues

#### 2. Code Quality Issues
- **37 console.log statements** — should use structured logging
- **20+ empty catch blocks** — silently swallow errors
- **Limited test coverage** — only 2 test files
- **Large components** — Playlists (573L), Library (474L), Browse (455L), Search (402L)
- **Polling pattern** — queue updates poll every 3s (should use events)

#### 3. Missing Modern Patterns
- No data fetching library (React Query/TanStack Query)
- No state management (Zustand/Jotai) — prop drilling everywhere
- No virtual scrolling for large lists
- No optimistic UI updates
- No React.memo optimization in large components
- No error boundaries on individual pages
- No debouncing on search (needs verification)

#### 4. UX Enhancements Needed
**Navigation & Keyboard**
- Keyboard shortcuts for power users
- Global search (Cmd+K style)
- Quick actions palette

**Bulk Operations**
- Multi-select videos → batch download
- Select all in playlist
- Batch add to playlist

**Download Experience**
- Speed limiting options
- Scheduled downloads (download at specific time)
- Bandwidth throttling
- Disk space warning before download
- Better progress visualization (ETA, speed graph)

**Search & Discovery**
- Search history with better UI
- Saved searches
- Recent videos section
- Recommended based on history

**Library Management**
- Smart playlists (auto-rules)
- Tags/labels for organization
- Advanced filters (duration, date, size)
- Export library metadata

**Settings & Preferences**
- Import/export settings
- Download presets (quality profiles)
- Auto-update toggle
- Network preferences

#### 5. Robustness Improvements
**Error Handling**
- User-friendly error messages
- Error recovery suggestions
- Automatic retry with exponential backoff
- Network status detection
- Graceful degradation when offline

**Download Reliability**
- Verify file integrity after download
- Detect corrupted downloads
- Auto-resume after app crash
- Handle disk full scenario
- Download history pruning (auto-delete old)

**Performance**
- Lazy load large lists
- Image lazy loading
- Virtual scrolling for 1000+ item lists
- Database query optimization
- Thumbnail caching strategy

#### 6. Developer Experience
- Increase test coverage (target 60%+)
- Add E2E tests with Playwright
- Structured logging framework (winston/pino)
- Error monitoring integration (Sentry ready)
- Performance monitoring
- Development mode indicators

## Code Analysis Findings (from Explore agent)

### Critical Issues
1. **20+ empty catch blocks** — silently suppress errors across codebase
2. **Extensive TypeScript `any` usage** — especially in database.ts (34 instances), ipc-handlers.ts (13 instances)
3. **37 console statements** — should use structured logging
4. **No error feedback to users** — errors logged but not shown in UI
5. **Hardcoded values scattered** — magic timeouts, URLs, localStorage keys

### Specific Problem Areas
- **Sidebar.tsx:124,195** — Empty catches when adding to playlists
- **Dashboard.tsx:27** — Polling queue every 3000ms (should be event-driven)
- **Database.ts** — Heavy use of `as any` casts in row mappers
- **YouTube URLs** — Constructed in 10+ places, should be utility function
- **Loading states** — Missing in several async operations (Browse page)
- **Error handling** — Inconsistent patterns, duplicate code

### Positive Findings
✅ No TODO/FIXME comments (clean codebase)
✅ Well-structured component hierarchy
✅ Consistent file organization

## NEW FEATURE: Video Transcription

**User Request:** Add ability to transcribe downloaded videos to audio + text for reading, listening, or watching.

### Implementation Strategy

**Architecture:**
```
Video Download → Extract Audio (ffmpeg) → Transcribe (Whisper) → Save Transcript
                                                                ↓
                                                    Display in UI with Search
```

**Technology Options:**

1. **Local Transcription (Privacy-focused, Free)**
   - Use Whisper.cpp or Whisper Python locally
   - Pros: Free, private, offline capable
   - Cons: CPU intensive, slower, requires model download (~1-3GB)

2. **Cloud Transcription (Fast, Accurate)**
   - OpenAI Whisper API ($0.006/min)
   - AssemblyAI ($0.00025/sec)
   - Pros: Fast, accurate, speaker diarization available
   - Cons: Requires API key, costs money, privacy concerns

3. **Hybrid Approach** (Recommended)
   - Default: Local Whisper for short videos (<30 min)
   - Option: Cloud API for long videos or higher accuracy
   - User preference in settings

**Features to Implement:**
- ✅ Audio extraction from video (ffmpeg -vn)
- ✅ Transcript generation with timestamps
- ✅ Speaker diarization (who said what)
- ✅ Save transcript formats: TXT, SRT, VTT, JSON
- ✅ Display transcript alongside video player
- ✅ Highlight current line during playback
- ✅ Click transcript to jump to timestamp
- ✅ Search within transcripts
- ✅ Export transcripts
- ✅ Bulk transcription for playlists
- ✅ Progress indication for long transcriptions
- ✅ Background processing queue

**Database Schema Addition:**
```sql
CREATE TABLE transcripts (
  id INTEGER PRIMARY KEY,
  video_id TEXT NOT NULL,
  format TEXT NOT NULL,  -- 'txt', 'srt', 'vtt', 'json'
  language TEXT,
  transcript_text TEXT,  -- Full text for search
  transcript_data TEXT,  -- JSON with timestamps
  word_count INTEGER,
  duration_seconds INTEGER,
  transcription_method TEXT,  -- 'local-whisper', 'openai', 'assemblyai'
  created_at TEXT,
  FOREIGN KEY (video_id) REFERENCES downloads(video_id)
);

CREATE INDEX idx_transcripts_video_id ON transcripts(video_id);
CREATE VIRTUAL TABLE transcripts_fts USING fts5(video_id, transcript_text);
```

**UI Components:**
- TranscriptPanel (sidebar during video playback)
- TranscriptSearch (search across all transcripts)
- TranscriptExport (download as SRT/VTT/TXT)
- TranscriptionProgress (status during processing)
- Settings for transcription preferences

**Settings:**
- Enable/disable auto-transcription
- Transcription method (local/cloud/ask)
- Default language
- Speaker diarization on/off
- Export format preference

## Proposed Improvements (Prioritized)

### Phase 1: Foundation & Safety (1-2 weeks)
**Goal:** Update dependencies, fix critical issues, improve error handling

1. **Dependency Updates**
   - ⚠️ Research MUI 5→9 migration (breaking changes likely)
   - Update React 18→19 (minor breaking changes)
   - Update Electron 33→45 (check API changes)
   - Update TypeScript, Vite, other supporting libraries
   - Test thoroughly after each major update

2. **Error Handling Overhaul**
   - Replace empty catch blocks with proper error handling
   - Add error boundaries to all major pages
   - Create user-friendly error messages
   - Add error reporting infrastructure

3. **Logging Infrastructure**
   - Replace console.log with structured logger
   - Add log levels (debug, info, warn, error)
   - Implement log rotation
   - Add performance timing logs

4. **Testing Foundation**
   - Set up testing utilities
   - Add tests for critical paths (auth, downloads, queue)
   - Target 30% coverage initially

### Phase 2: Modern Patterns (1-2 weeks)
**Goal:** Adopt modern React patterns for better maintainability

1. **State Management**
   - Add Zustand for global state (user, queue, settings)
   - Eliminate prop drilling
   - Centralize side effects

2. **Data Fetching**
   - Integrate TanStack Query
   - Add optimistic updates
   - Implement proper loading/error states
   - Cache YouTube API responses

3. **Component Optimization**
   - Add React.memo to large list items
   - Implement virtual scrolling (react-window)
   - Add debouncing to search input
   - Break down large page components

4. **Event System**
   - Replace polling with event-driven updates
   - Use IPC events properly for real-time updates
   - Add event bus for decoupled communication

### Phase 3: UX Improvements (2-3 weeks)
**Goal:** Enhance user experience with power features

1. **Keyboard Navigation**
   - Implement keyboard shortcuts
   - Add command palette (Cmd+K)
   - Focus management improvements

2. **Bulk Operations**
   - Multi-select with checkboxes
   - Bulk download queue
   - Batch playlist operations

3. **Smart Features**
   - Download presets (quality profiles)
   - Scheduled downloads
   - Smart playlists with rules
   - Video recommendations

4. **Better Feedback**
   - Toast notifications for actions
   - Progress indicators everywhere
   - Loading skeletons
   - Empty states with actions

### Phase 3.5: Transcription Feature (2-3 weeks)
**Goal:** Add video transcription capabilities

1. **Backend Infrastructure**
   - Add Whisper integration (local or cloud)
   - Implement audio extraction pipeline
   - Create transcription queue
   - Add transcript database schema

2. **Transcript Processing**
   - Audio extraction service
   - Transcription service (Whisper wrapper)
   - Format converters (TXT, SRT, VTT, JSON)
   - Background job processing

3. **UI Components**
   - Transcript viewer panel
   - Synced highlighting during playback
   - Click-to-seek functionality
   - Search within transcripts
   - Export options

4. **Settings & Preferences**
   - Auto-transcribe toggle
   - Method selection (local/cloud)
   - Language preference
   - Speaker diarization option

5. **Integration**
   - Add "Transcribe" button to video cards
   - Bulk transcription for playlists
   - Progress tracking in downloads page
   - Search across all transcripts

### Phase 4: Robustness (1 week)
**Goal:** Make the app bulletproof

1. **Download Reliability**
   - File integrity verification
   - Auto-retry with backoff
   - Resume after crash
   - Disk space checking

2. **Network Resilience**
   - Offline mode detection
   - Queue when offline
   - Bandwidth management
   - Connection quality indicator

3. **Data Integrity**
   - Database backup/restore
   - Settings export/import
   - Migration system for schema changes

### Phase 5: Polish (1 week)
**Goal:** Final touches and optimization

1. **Performance**
   - Optimize large list rendering
   - Reduce bundle size
   - Lazy load routes
   - Optimize thumbnail loading

2. **Accessibility**
   - Keyboard navigation audit
   - Screen reader support
   - Color contrast fixes
   - Focus indicators

3. **Documentation**
   - User guide
   - Keyboard shortcuts reference
   - Troubleshooting guide
   - Development setup guide

## Success Metrics

**Code Quality:**
- ✅ All dependencies on latest stable versions
- ✅ Zero empty catch blocks
- ✅ <5 uses of TypeScript `any` (down from 47+)
- ✅ >60% test coverage
- ✅ No console.log in production
- ✅ Error boundaries on all pages
- ✅ Centralized error handling with user feedback

**Performance:**
- ✅ <500ms initial load time
- ✅ Virtual scrolling for 1000+ item lists
- ✅ <100ms search response time

**Features:**
- ✅ Keyboard shortcuts for all major actions
- ✅ Graceful offline handling
- ✅ Transcription working for videos
- ✅ Bulk operations available
- ✅ Command palette functional

**User Experience:**
- ✅ All errors displayed to user with recovery suggestions
- ✅ Loading states on all async operations
- ✅ Toast notifications for all actions
- ✅ Transcript search working across library

## Risks & Mitigations

**Risk: MUI 5→9 breaking changes**
- Mitigation: Research migration guide first, may need to stay on v6/7/8 interim versions

**Risk: Electron API changes 33→45**
- Mitigation: Review changelog, test IPC, file protocol, and window management

**Risk: React 19 breaking changes**
- Mitigation: Moderate impact expected, mainly around refs and context

**Risk: Time estimates**
- Mitigation: Work in phases, each phase independently shippable

## Notes

- Keep spec updated as decisions are made
- Write ADRs for non-obvious choices
- Test on real YouTube content throughout
- Maintain backward compatibility for user data

---

**Next Steps:**
1. Wait for code analysis completion
2. Validate MUI 9 migration path
3. Create detailed task breakdown
4. Begin Phase 1 dependency updates
