# ADR 0007: Video Seeking Requires standard:true Privilege

**Date**: 2026-11-11  
**Status**: Accepted

## Context

Video seeking (scrubbing the timeline) has been failing intermittently in the Electron app. Multiple commits attempted fixes:

- 9101293: Added `standard: true` privilege (correctly identified as critical)
- 5315cb4: Added `secure: true` to fix media URL safety check
- 0de2b32: Removed `secure: true` due to mixed content blocking with dev server
- 7a3ce65: Removed BOTH `standard: true` AND `secure: true` assuming "too many privileges trigger security checks"

The last commit was the mistake—removing `standard: true` broke video seeking.

## Root Cause (from Electron issue #38749)

Chromium's media stack validates that **every Range response for a resource comes from the same origin** as the first one. The check:

```javascript
SecurityOrigin::AreSameOrigin(data_origin_.value(), origin)
```

For custom schemes **without** `standard: true`, each HTTP request generates a **fresh opaque origin**. This causes:

1. First request: `local-media://path/video.mp4` → Origin A
2. Range request (seeking): `local-media://path/video.mp4` → Origin B (different!)
3. Chromium rejects: `PIPELINE_ERROR_READ`
4. Result: `video.seekable.end()` returns `0`, seeking jumps back to 0

With `standard: true`, the scheme gets **stable tuple origin semantics** (like `http://` and `https://`), so all requests to the same URL share the same origin.

## Why secure:true Caused Problems

`secure: true` treats the custom protocol as HTTPS-equivalent, which:

- Enables mixed content blocking
- Prevents loading resources from `http://localhost:5173` (dev server)
- Breaks development workflow

The solution: Use `standard: true` (required for seeking) **without** `secure: true` (causes mixed content issues).

## Decision

Re-add `standard: true` to the `local-media://` protocol privileges:

```javascript
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-media',
    privileges: {
      standard: true,       // REQUIRED: Stable origin for range requests
      stream: true,         // Required for video/audio streaming
      supportFetchAPI: true,
      bypassCSP: true
      // secure: false (implicit) - avoid mixed content blocking
    }
  },
]);
```

## Consequences

### Positive

- **Video seeking works**: Stable origin allows Chromium to accept Range responses
- **Proper URL semantics**: Relative URLs resolve correctly, behaves like `http://`
- **Web storage enabled**: localStorage, sessionStorage, cookies available for the scheme
- **Dev server compatible**: No mixed content blocking from `http://localhost:5173`

### Negative

- The protocol is **not** treated as secure context:
  - Service Workers won't work on `local-media://` URLs
  - APIs requiring secure contexts unavailable
  - **Mitigation**: This is acceptable—video files are served via custom protocol, but the main app loads from `http://localhost` (dev) or local HTTP server (prod)

### Alternative Approaches Considered

1. **Local HTTP server for videos**: Would work but adds complexity (port management, CORS, shutdown lifecycle)
2. **file:// URLs directly**: Blocked by CORS and security policies in modern Chromium
3. **net.fetch() with pathToFileURL()**: Docs suggest this, but requires `file://` access which has its own restrictions

## References

- [Electron issue #38749](https://github.com/electron/electron/issues/38749) - "video files not seekable with protocol.handle"
- [Electron protocol API docs](https://www.electronjs.org/docs/latest/api/protocol)
- Chromium source: `SecurityOrigin::AreSameOrigin()` validation in media pipeline
- Working implementation by zoy-l (GitHub issue comment)

## Implementation Note

The current range request handling in `desktop/index.ts` (lines 227-306) is **already correct**:

- Returns status 206 for range requests
- Includes `Content-Range`, `Content-Length`, `Accept-Ranges: bytes` headers
- Uses `ReadableStream` from `fs.createReadStream` with `{start, end}` options

The **only** change needed is re-adding `standard: true` to line 172.
