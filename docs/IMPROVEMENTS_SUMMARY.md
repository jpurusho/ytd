# ytd — Comprehensive Improvement Plan

**Generated:** 2026-11-03
**Current Version:** 1.7.10
**Project:** YouTube Downloader (Electron + React + TypeScript)

## Executive Summary

After comprehensive analysis of the ytd codebase (~10k LOC), I've identified significant opportunities for improvement across 6 key areas:

1. **Outdated Dependencies** — 20+ packages with major version updates available
2. **Code Quality Issues** — 20+ empty catch blocks, 47+ `any` types, 37 console.logs
3. **Missing Modern Patterns** — No state management, data fetching library, or optimizations
4. **UX Enhancements** — Keyboard shortcuts, bulk operations, smart features
5. **Robustness Gaps** — Limited error handling, no retry logic, minimal testing
6. **NEW: Transcription Feature** — User-requested video-to-text capability

**Estimated Timeline:** 8-10 weeks for complete modernization
**Priority Order:** Foundation & Safety → Modern Patterns → UX → Transcription → Polish

---

## Current State Assessment

### Strengths ✅
- Well-structured Electron architecture (main/preload/renderer separation)
- Comprehensive feature set (OAuth, playlists, downloads, sync)
- Clean TypeScript interfaces and types
- Modular service layer
- Theme system (6 themes)
- No technical debt markers (TODO/FIXME)

### Critical Issues ⚠️
1. **Empty Catch Blocks (20+)** — Silent error suppression
   - Sidebar.tsx:124,195 — Playlist operations
   - Dashboard.tsx:35 — Queue loading
   - download-engine.ts — Process management
   
2. **TypeScript `any` Overuse (47+)**
   - database.ts — 34 instances in row mappers
   - ipc-handlers.ts — 13 instances
   - Settings.tsx — toolStatus type

3. **Polling Instead of Events**
   - Dashboard polls queue every 3 seconds
   - Should use IPC events for real-time updates

4. **No User Error Feedback**
   - Errors logged to console but never shown in UI
   - Users have no idea when something fails

5. **Outdated Dependencies**
   - Electron 33 → 45 (security & performance)
   - React 18 → 19 (new features)
   - MUI 5 → 9 (massive update)
   - TypeScript 5 → 7

---

## Improvement Plan by Phase

### Phase 1: Foundation & Safety (1-2 weeks)

**Objectives:**
- Update all dependencies safely
- Fix critical error handling issues  
- Establish proper logging infrastructure
- Start testing foundation

**Tasks:**
1. **Dependency Updates** (Critical)
   ```bash
   # Research breaking changes first
   - MUI 5→6→7→8→9 (check migration guides)
   - React 18→19 (ref handling changes)
   - Electron 33→45 (IPC/protocol changes)
   - TypeScript 5→7 (type system improvements)
   ```

2. **Error Handling Overhaul**
   - Replace 20+ empty catch blocks with proper handling
   - Create centralized error service
   - Add error boundaries to all pages
   - Show user-friendly error dialogs

3. **Logging System**
   - Replace 37 console.log calls
   - Add winston or pino logger
   - Implement log levels and rotation
   - Log to file for debugging

4. **Testing Foundation**
   - Set up Vitest utilities
   - Add tests for auth flow
   - Add tests for download queue
   - Target 30% coverage

**Deliverables:**
- ✅ All deps updated, tests passing
- ✅ Zero empty catch blocks
- ✅ All errors shown to users
- ✅ Proper logging framework

---

### Phase 2: Modern Patterns (1-2 weeks)

**Objectives:**
- Eliminate prop drilling with state management
- Add proper data fetching patterns
- Optimize large components
- Event-driven architecture

**Tasks:**

1. **State Management (Zustand)**
   ```typescript
   // Centralize global state
   - useAuthStore → user, login, logout
   - useQueueStore → queue, downloads, progress
   - useSettingsStore → preferences, theme
   - usePlaylistStore → playlists, items
   ```

2. **Data Fetching (TanStack Query)**
   ```typescript
   // Better caching, loading states
   - useQuery(['playlists'])
   - useMutation(['addToPlaylist'])
   - Optimistic updates
   - Background refetching
   ```

3. **Component Optimization**
   - Add React.memo to VideoCard, PlaylistItem
   - Implement virtual scrolling (react-window)
   - Break down large pages (Playlists 573L → components)
   - Debounce search input

4. **Event System**
   - Replace 3s polling with IPC events
   - Add event bus for loose coupling
   - Real-time queue updates
   - Progress streaming

**Deliverables:**
- ✅ No prop drilling (Zustand stores)
- ✅ Fast data fetching (TanStack Query)
- ✅ Smooth scrolling (1000+ items)
- ✅ Event-driven updates

---

### Phase 3: UX Improvements (2-3 weeks)

**Objectives:**
- Add power-user features
- Improve discoverability
- Better feedback mechanisms
- Bulk operations

**Features:**

1. **Keyboard Navigation**
   - ⌘K — Command palette
   - ⌘F — Global search
   - Space — Play/pause video
   - ←/→ — Seek 5s
   - ⌘D — Download selected
   - ⌘N — New playlist

2. **Bulk Operations**
   - Multi-select with Shift+Click
   - Select all checkbox
   - Bulk download to queue
   - Bulk add to playlist
   - Bulk transcribe

3. **Smart Features**
   - Download presets (1080p MP4, Audio-only, etc.)
   - Scheduled downloads (off-peak hours)
   - Smart playlists (rules-based)
   - Video recommendations

4. **Better Feedback**
   - Toast notifications (3s auto-dismiss)
   - Loading skeletons (not just spinners)
   - Empty states with CTAs
   - Progress visualization

**Deliverables:**
- ✅ Keyboard shortcuts documented
- ✅ Command palette working
- ✅ Bulk operations available
- ✅ Toast system implemented

---

### Phase 3.5: Transcription Feature (2-3 weeks) 🎯 NEW

**Objectives:**
- Enable reading video content as text
- Support audio-only playback
- Make content searchable
- Improve accessibility

**Architecture:**
```
Video → Extract Audio → Whisper → Transcript → Display/Search
        (ffmpeg)       (local/API)  (DB+FTS)   (UI)
```

**Implementation:**

1. **Backend Services**
   ```typescript
   // New services
   TranscriptionService
   - extractAudio(videoPath) → audioPath
   - transcribe(audioPath, model) → transcript
   - parseTimestamps(output) → segments[]
   
   TranscriptQueue
   - add(videoId, options)
   - process(maxConcurrent: 1)
   - cancel(videoId)
   ```

2. **Database Schema**
   ```sql
   CREATE TABLE transcripts (
     id INTEGER PRIMARY KEY,
     video_id TEXT,
     transcript_text TEXT,      -- Plain text
     transcript_json TEXT,      -- With timestamps
     method TEXT,               -- whisper-local | api
     language TEXT,
     status TEXT,
     created_at TEXT
   );
   
   -- Full-text search
   CREATE VIRTUAL TABLE transcripts_fts 
   USING fts5(video_id, transcript_text);
   ```

3. **UI Components**
   - **TranscriptPanel** — Sidebar during playback
   - **TranscriptSearch** — Search across all transcripts
   - **TranscriptExport** — Download as TXT/SRT/VTT
   - **Settings** — Auto-transcribe, method, language

4. **Features**
   - ✅ Click transcript line → seek video
   - ✅ Highlight current line during playback
   - ✅ Full-text search across library
   - ✅ Export in multiple formats
   - ✅ Speaker diarization (optional)
   - ✅ Bulk transcription

**Technology Stack:**
- **Primary:** OpenAI Whisper (Python subprocess)
- **Alternative:** Whisper.cpp (Node bindings, v2)
- **Fallback:** OpenAI API (paid, fast)
- **Models:** tiny (fast) → base → medium → large (accurate)

**User Flow:**
```
1. Download video
2. Click "Transcribe" button
3. Select model (tiny=fast, large=accurate)
4. Process in background
5. View transcript in sidebar
6. Search across all transcripts
7. Export as needed
```

**Deliverables:**
- ✅ Whisper integration working
- ✅ Audio extraction pipeline
- ✅ Transcript viewer with sync
- ✅ Full-text search functional
- ✅ Export to SRT/VTT/TXT

---

### Phase 4: Robustness (1 week)

**Objectives:**
- Bulletproof download reliability
- Network resilience
- Data integrity guarantees

**Tasks:**

1. **Download Reliability**
   - File integrity verification (checksums)
   - Auto-retry with exponential backoff
   - Resume after crash (--continue flag)
   - Disk space check before download
   - Corrupted file detection

2. **Network Resilience**
   - Offline mode detection
   - Queue downloads when offline
   - Bandwidth management (throttling)
   - Connection quality indicator
   - Graceful API failure handling

3. **Data Integrity**
   - Database backup on changes
   - Settings export/import
   - Migration system for schema changes
   - Corrupt DB recovery

**Deliverables:**
- ✅ Downloads never fail silently
- ✅ Offline mode works gracefully
- ✅ All data exportable

---

### Phase 5: Polish (1 week)

**Objectives:**
- Performance optimization
- Accessibility improvements
- Documentation

**Tasks:**

1. **Performance**
   - Bundle size analysis
   - Code splitting by route
   - Lazy load images
   - Optimize thumbnail caching
   - Database query optimization

2. **Accessibility**
   - Keyboard nav audit (WCAG 2.1)
   - Screen reader testing
   - Color contrast fixes (AAA rating)
   - Focus indicators
   - ARIA labels

3. **Documentation**
   - User guide (getting started)
   - Keyboard shortcuts reference
   - Troubleshooting guide
   - Development setup (CONTRIBUTING.md)

**Deliverables:**
- ✅ <500ms load time
- ✅ WCAG 2.1 AA compliant
- ✅ Full documentation

---

## Technical Debt Paydown

### High Priority
| Issue | Count | Fix |
|-------|-------|-----|
| Empty catch blocks | 20+ | Add proper error handling |
| TypeScript `any` | 47+ | Add proper types |
| console.log | 37 | Replace with logger |
| Polling (3s interval) | 1 | Use IPC events |
| No error feedback | Many | Add toast notifications |

### Medium Priority
| Issue | Count | Fix |
|-------|-------|-----|
| Hardcoded timeouts | 10+ | Move to config |
| Hardcoded URLs | 8+ | Create URL builder utility |
| localStorage keys | 6+ | Centralize constants |
| Large components | 4 | Break into smaller pieces |
| Duplicate code | Many | Extract utilities |

---

## Dependency Upgrade Plan

### Major Updates Required

| Package | Current | Latest | Breaking Changes |
|---------|---------|--------|------------------|
| @mui/material | 5.16.7 | 9.5.0 | YES (massive) |
| @mui/icons-material | 5.16.7 | 9.5.0 | YES (massive) |
| electron | 33.2.0 | 45.2.2 | Moderate |
| react | 18.3.1 | 19.3.1 | Minor |
| react-dom | 18.3.1 | 19.3.1 | Minor |
| react-router-dom | 6.28.0 | 7.18.5 | Moderate |
| typescript | 5.7.0 | 7.0.2 | Moderate |
| vite | 6.0.0 | 8.3.5 | Minor |
| vitest | 4.1.2 | 5.1.0 | Minor |

### Migration Strategy

1. **Test current state thoroughly** (establish baseline)
2. **Update one major package at a time**
3. **Test after each update** (don't batch)
4. **Keep migration notes** (ADRs for major changes)
5. **MUI 5→9 is the biggest risk** (review breaking changes first)

**Recommended Order:**
1. TypeScript 5→7 (least risky)
2. React 18→19 (moderate impact)
3. Vite, Vitest, other tools
4. React Router 6→7
5. Electron 33→45 (test IPC thoroughly)
6. MUI 5→6→7→8→9 (staged, most risky)

---

## Success Metrics

### Code Quality
- ✅ Zero empty catch blocks (was 20+)
- ✅ <5 uses of `any` (was 47+)
- ✅ Zero console.log (was 37)
- ✅ >60% test coverage (was ~10%)
- ✅ All dependencies current

### Performance
- ✅ <500ms initial load
- ✅ <100ms search response
- ✅ 60fps scrolling (1000+ items)
- ✅ Virtual scrolling working

### Features
- ✅ Transcription functional
- ✅ Keyboard shortcuts complete
- ✅ Bulk operations available
- ✅ Command palette working
- ✅ Full-text search operational

### User Experience
- ✅ All errors shown to user
- ✅ Toast notifications on all actions
- ✅ Loading states everywhere
- ✅ Graceful offline handling
- ✅ WCAG 2.1 AA compliance

---

## Risk Assessment

### High Risk
- **MUI 5→9 migration** — Huge version jump, many breaking changes
  - *Mitigation:* Stage through intermediate versions, test thoroughly
  
- **Whisper dependency** — Requires Python or large bundle
  - *Mitigation:* Offer cloud API fallback, clear setup docs

### Medium Risk
- **Electron 33→45** — IPC/protocol changes possible
  - *Mitigation:* Review changelog, test file access & OAuth

- **State management refactor** — Large architectural change
  - *Mitigation:* Do incrementally, page by page

### Low Risk
- React 18→19 — Mostly backward compatible
- TypeScript 5→7 — Mostly new features
- Adding tests — No production impact

---

## Cost-Benefit Analysis

### Development Time Investment
- **Phase 1-2:** 2-4 weeks (Foundation + Patterns)
- **Phase 3-3.5:** 4-6 weeks (UX + Transcription)
- **Phase 4-5:** 2 weeks (Robustness + Polish)
- **Total:** 8-12 weeks

### Benefits
**Immediate:**
- 🎯 **Transcription** — Unique feature, competitive advantage
- 🛡️ **Stability** — Proper error handling, no silent failures
- 🔒 **Security** — Updated dependencies (CVE fixes)

**Short-term:**
- ⚡ **Performance** — Faster loads, smoother scrolling
- 🎨 **UX** — Keyboard shortcuts, bulk operations
- 🔍 **Discoverability** — Search transcripts, command palette

**Long-term:**
- 📈 **Maintainability** — Modern patterns, less tech debt
- 🧪 **Testability** — Good coverage, catch regressions
- 🚀 **Future features** — Solid foundation for AI/ML features

---

## Next Steps

### Immediate (This Week)
1. ✅ Review this plan with stakeholder
2. ✅ Commit current state (baseline)
3. 🔄 Research MUI 5→9 migration path
4. 🔄 Set up testing infrastructure
5. 🔄 Create Phase 1 task breakdown

### Short-term (Next 2 Weeks)
1. Begin dependency updates
2. Fix critical empty catch blocks
3. Add error boundaries
4. Replace console.logs with logger
5. Add auth/download tests

### Medium-term (Month 2-3)
1. Implement state management
2. Add TanStack Query
3. Build transcription feature
4. Add keyboard shortcuts
5. Implement bulk operations

---

## Questions for Review

1. **MUI 9 migration** — Should we stay on MUI 5/6 or commit to 9?
2. **Transcription default** — Local Whisper (setup required) or API-only (paid)?
3. **Testing target** — 60% coverage realistic? Or aim for 40%?
4. **Phase priority** — Any phases to skip/defer?
5. **Timeline** — 8-12 weeks acceptable? Need faster?

---

## Appendix: Key File Locations

**Configuration:**
- `/docs/plans/M1-modernization-and-improvements.md` — Detailed plan
- `/docs/decisions/0002-video-transcription-feature.md` — Transcription ADR
- `/.claude/settings.json` — Auto-permissions for speed

**Areas Needing Work:**
- `/frontend/pages/Playlists.tsx` — 573 lines, needs breaking down
- `/frontend/pages/Library.tsx` — 474 lines, needs refactor
- `/desktop/services/database.ts` — 34 `any` types to fix
- `/desktop/ipc-handlers.ts` — 13 `any` types to fix

**Well-Structured (Reference):**
- `/desktop/services/queue-manager.ts` — Good pattern
- `/frontend/App.tsx` — Clean auth routing
- `/shared/types.ts` — Comprehensive interfaces
