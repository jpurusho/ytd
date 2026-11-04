# 0002 — Video Transcription Feature

**Status:** Proposed
**Date:** 2026-11-03

## Context

Users want to consume video content in multiple formats: watching (video), listening (audio-only), or reading (text transcript). Adding transcription capabilities would:

1. Make content accessible to deaf/hard-of-hearing users
2. Enable content consumption in sound-sensitive environments
3. Allow full-text search across video library
4. Support language learning (see what's said)
5. Enable quick scanning of video content without watching

YouTube provides auto-generated captions via API, but they're not always available (livestreams, private videos, videos downloaded from other platforms).

## Decision

Implement local-first video transcription using OpenAI Whisper (local or cloud).

**Architecture choice:** Hybrid approach with user preference
- **Default:** Local Whisper.cpp for privacy and cost
- **Optional:** OpenAI API for speed and accuracy on long content
- **Fallback:** YouTube auto-captions when available

**Why Whisper?**
- State-of-art accuracy (human-level for English)
- Multiple model sizes (tiny to large)
- Timestamp support built-in
- Multi-language support (99 languages)
- Can run locally (privacy)
- OpenAI API option ($0.006/min)

**Why not YouTube captions?**
- Not always available
- Can't modify/improve them
- Doesn't work for non-YouTube content
- No control over quality

**Why not Google Speech-to-Text / Azure / AWS?**
- More expensive
- Harder setup (multiple APIs)
- Whisper's accuracy is comparable or better for most content

## Implementation Details

### Whisper Integration Options

**Option A: Whisper.cpp (Node.js bindings)**
```bash
npm install whisper-node
# Requires bundled whisper.cpp binary (~50MB)
```
- Pros: Pure JS, fast, cross-platform
- Cons: Requires native build, larger bundle

**Option B: Python Whisper subprocess** (Recommended for MVP)
```bash
pip install openai-whisper
# User installs Python dependency
```
- Pros: Official implementation, proven, easy to test
- Cons: Requires Python runtime (most devs have it)

**Option C: Whisper API only**
- Pros: No local setup, always fast, always accurate
- Cons: Costs money, requires internet, privacy concerns

**Decision: Start with Option B (Python subprocess), add Option A (whisper.cpp) in v2**

### Database Schema

```sql
CREATE TABLE transcripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'json',
  language TEXT,
  transcript_text TEXT,     -- Plain text for search
  transcript_json TEXT,     -- JSON with timestamps
  word_count INTEGER,
  duration_seconds INTEGER,
  method TEXT,              -- 'whisper-local', 'whisper-api', 'youtube'
  model TEXT,               -- 'tiny', 'base', 'small', 'medium', 'large'
  status TEXT DEFAULT 'pending',  -- 'pending', 'processing', 'completed', 'failed'
  error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (video_id) REFERENCES downloads(video_id) ON DELETE CASCADE
);

CREATE INDEX idx_transcripts_video_id ON transcripts(video_id);
CREATE INDEX idx_transcripts_status ON transcripts(status);

-- Full-text search
CREATE VIRTUAL TABLE transcripts_fts USING fts5(
  video_id UNINDEXED,
  transcript_text,
  content=transcripts,
  content_rowid=id
);
```

### Processing Pipeline

```
1. User clicks "Transcribe" on video
2. Check if video file exists locally
3. Extract audio: ffmpeg -i video.mp4 -vn -ar 16000 -ac 1 audio.wav
4. Check settings for transcription method
5. If local: spawn whisper process
   If API: POST to OpenAI Whisper API
6. Parse output → JSON with timestamps
7. Save to database (transcript_json + transcript_text)
8. Update FTS index
9. Notify UI of completion
```

### API Design

**IPC Handlers:**
```typescript
// Start transcription
'transcripts:start' → (videoId: string, options?: TranscriptOptions) → Promise<number>

// Get transcript
'transcripts:get' → (videoId: string) → Promise<Transcript | null>

// Search transcripts
'transcripts:search' → (query: string) → Promise<TranscriptSearchResult[]>

// Export transcript
'transcripts:export' → (videoId: string, format: 'txt'|'srt'|'vtt') → Promise<string>

// Cancel transcription
'transcripts:cancel' → (videoId: string) → Promise<void>

// Events (main → renderer)
'transcript:progress' → (videoId: string, progress: number)
'transcript:complete' → (videoId: string, transcript: Transcript)
'transcript:error' → (videoId: string, error: string)
```

### UI Components

1. **TranscriptButton** — on VideoCard, triggers transcription
2. **TranscriptPanel** — sidebar showing transcript during playback
3. **TranscriptViewer** — full-screen transcript view
4. **TranscriptSearch** — search bar with results
5. **TranscriptProgress** — progress indicator during processing
6. **Settings/Transcription** — preferences panel

### File Storage

Store audio files temporarily:
```
~/Downloads/ytd-temp/
  ├── audio-{videoId}.wav     (deleted after transcription)
  ├── transcript-{videoId}.json (kept)
  └── transcript-{videoId}.srt  (if exported)
```

Or store in app data directory for persistence.

## Consequences

### Positive
- ✅ Users can search across all video content (game-changer)
- ✅ Accessibility greatly improved
- ✅ Content consumption flexibility
- ✅ Competitive differentiator (most downloaders don't have this)
- ✅ Foundation for future AI features (summarization, Q&A)

### Negative
- ⚠️ Adds complexity (new service, queue, UI)
- ⚠️ CPU intensive (may slow down machine during transcription)
- ⚠️ Storage cost (~5-10KB per minute of video for transcript)
- ⚠️ Requires Python or larger app bundle (whisper.cpp)
- ⚠️ Transcription errors for poor audio quality or accents

### Mitigations
- Process transcriptions in background at low priority
- Allow user to disable auto-transcription
- Show estimated time before starting long transcriptions
- Provide quality selector (tiny=fast, large=accurate)
- Cache transcripts, don't regenerate

## Technical Risks

**Risk: Whisper requires GPU for fast processing**
- Mitigation: Use CPU mode by default, detect GPU availability, offer cloud API fallback

**Risk: Python dependency might not be available**
- Mitigation: Check for Python on startup, show setup instructions, offer whisper.cpp alternative

**Risk: Transcription queue conflicts with download queue**
- Mitigation: Separate queue, separate concurrency limit, lower priority

**Risk: Large model files (1-3GB)**
- Mitigation: Start with tiny model (75MB), let user download larger models on demand

## Alternatives Considered

**1. YouTube captions only**
- Rejected: Not always available, limited control

**2. Assembly AI**
- Rejected: Costs more, requires account setup

**3. Rev.ai**
- Rejected: Expensive ($1.25/min), human transcription overkill

**4. Vosk (offline)**
- Rejected: Lower accuracy than Whisper, less maintained

## Open Questions

1. Should we bundle Whisper models or download on first use?
   - **Decision:** Download on first use to keep app size small

2. What's the default model size?
   - **Decision:** Base model (balanced speed/accuracy)

3. Auto-transcribe new downloads?
   - **Decision:** Off by default, opt-in via settings

4. Keep audio files after transcription?
   - **Decision:** Delete by default, option to keep in settings

## References

- [OpenAI Whisper](https://github.com/openai/whisper)
- [Whisper.cpp](https://github.com/ggerganov/whisper.cpp)
- [whisper-node](https://github.com/ariym/whisper-node)
- [OpenAI Whisper API](https://platform.openai.com/docs/guides/speech-to-text)
