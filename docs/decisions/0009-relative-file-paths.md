# ADR 0009: Store Relative File Paths in Database

Date: 2026-11-13

## Context

Video files are downloaded to a user-configurable directory (default: `~/Downloads/ytd`, now `~/ytd`). The database needs to track where these files are stored. Two options:

1. Store absolute paths (e.g., `/Users/jpurshot/ytd/video.mp4`)
2. Store relative paths (e.g., `video.mp4`)

Users may want to relocate their entire video library to a different location (different drive, folder reorganization, etc.).

## Decision

Store **relative paths** (just filenames) in the database. The `output_dir` setting determines the base directory, and IPC handlers construct absolute paths on-demand:

```typescript
if (!path.isAbsolute(filePath)) {
  const outputDir = getSetting('output_dir');
  filePath = path.join(outputDir, filePath);
}
```

## Consequences

**Positive:**
- Users can relocate their entire library by just updating one setting
- No need to update hundreds of database records
- Works with Settings → "Browse" button for easy relocation
- Simpler database migrations when changing storage locations

**Negative:**
- IPC handlers must handle path resolution for all file operations
- Risk of bugs if handlers forget to check `path.isAbsolute()`
- Cannot have videos in multiple directories (all must be in `output_dir`)

**Mitigations:**
- Created `getOutputDir()` helper function for consistency
- All file-related IPC handlers updated to resolve relative paths
- Rescan feature available if files get scattered across locations
