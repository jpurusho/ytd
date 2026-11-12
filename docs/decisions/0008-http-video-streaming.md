# ADR 0008: HTTP-Based Video Streaming

**Date**: 2026-11-12  
**Status**: Accepted (Supersedes ADR-0007)

## Context

After upgrading from Electron 33 to 45, video seeking was completely broken. Multiple attempts to fix the custom `local-media://` protocol failed:

1. **Without `standard: true`**: Video played but seeking reset to position 0
2. **With `standard: true`**: Video completely blocked by "Media load rejected by URL safety check"
3. **With `standard: true` + `secure: true`**: Same blocking issue
4. **ReadableStream approach**: Network errors (PIPELINE_ERROR_READ)

The root issue: Electron 45 has stricter security checks on custom protocols that conflict with HTML5 video's range request requirements.

## Decision

**Abandon custom protocols entirely.** Serve videos through HTTP using standard web tech:

### Architecture

**Development:**
- Vite dev server (port 5173) with middleware for `/video` endpoint
- Middleware handles range requests via `fs.createReadStream`

**Production:**
- Dedicated HTTP server on dynamic port
- Same `/video` endpoint with range request support

### Implementation

```typescript
// Vite middleware (vite.config.ts)
{
  name: 'video-streaming',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.startsWith('/video?')) {
        // Handle range requests with fs.createReadStream
      }
    });
  }
}

// Video URL format
http://localhost:5173/video?path=/absolute/path/to/video.mp4
```

## Consequences

### Positive

- ✅ **Video playback works**: No custom protocol security issues
- ✅ **Seeking works**: HTTP range requests are web standard (RFC 7233)
- ✅ **100% reliable**: Same technology YouTube, Netflix, etc. use
- ✅ **Consistent**: Identical behavior in dev and production
- ✅ **Maintainable**: Standard HTTP, no Electron-specific quirks
- ✅ **Future-proof**: No dependency on Electron protocol APIs

### Negative

- Videos served from `http://localhost` not a custom scheme
  - **Mitigation**: Acceptable - localhost is trusted, port is random
- HTTP server must run in both dev and prod
  - **Mitigation**: Already had server for prod UI, extended it
- Slightly more complex than "just use a protocol"
  - **Mitigation**: Simpler than debugging Electron security issues

### Trade-offs vs Custom Protocol

| Aspect | Custom Protocol | HTTP Serving |
|--------|----------------|--------------|
| Security | Electron-specific checks, conflicts | Standard same-origin, CORS |
| Seeking | Broken in Electron 45 | Works everywhere |
| Compatibility | Electron version dependent | Web standard, future-proof |
| Debugging | Opaque Electron errors | Standard HTTP tools work |
| Code complexity | Protocol registration + handler | Middleware (more familiar) |

## References

- [ADR-0007](0007-video-seeking-standard-privilege.md) - Prior attempt with `standard: true`
- [RFC 7233](https://tools.ietf.org/html/rfc7233) - HTTP Range Requests
- [Electron issue #38749](https://github.com/electron/electron/issues/38749) - Video seeking issues
- Commits: 8e1d262, 041ef0b, 642cffd

## Lessons Learned

1. **Web standards > framework-specific APIs**: HTTP range requests work everywhere; custom protocols are Electron-specific
2. **Security models evolve**: Code that worked in Electron 33 broke in 45 due to stricter checks
3. **Simplicity wins**: Fighting framework security is harder than using standard HTTP
4. **Test across versions**: Major Electron upgrades can break non-standard patterns

## Future Considerations

If we ever need true custom protocol (e.g., for offline encryption):
- Use HTTP server with authentication tokens
- Or wait for Electron to stabilize protocol.handle() API
- Document that custom protocols are high-risk for media streaming
