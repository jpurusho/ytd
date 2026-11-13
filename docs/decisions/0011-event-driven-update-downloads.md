# ADR 0011: Event-Driven Update Downloads with electron-updater

Date: 2026-11-13

## Context

After switching from custom GitHub API update checking to electron-updater (ADR 0003), the download handler was incorrectly implemented. It called `autoUpdater.downloadUpdate()` and immediately returned a fake success response before the download actually finished:

```typescript
// WRONG: Returns immediately
await autoUpdater.downloadUpdate();
return { success: true, path: fakePath };
```

This caused the UI to show "Update downloaded!" while the download was still in progress.

## Decision

Use electron-updater's **event-driven API** to properly wait for download completion:

```typescript
ipcMain.handle('app:downloadUpdate', async () => {
  return new Promise((resolve, reject) => {
    // Set up event listeners FIRST
    autoUpdater.once('update-downloaded', (info) => {
      resolve({ success: true, version: info.version });
    });

    autoUpdater.once('error', (error) => {
      reject(new Error(`Update download failed: ${error.message}`));
    });

    // Then start download
    autoUpdater.downloadUpdate();
  });
});
```

## Consequences

**Positive:**
- UI accurately reflects download state
- Proper error handling when downloads fail
- Returns actual version number from electron-updater
- Follows electron-updater's recommended event-driven pattern

**Negative:**
- Slightly more complex than the naive approach
- Must manage event listener lifecycle (using `once` to avoid memory leaks)

**Related:**
- Progress reporting already uses events: `autoUpdater.on('download-progress')`
- Follows same pattern as other async electron-updater operations
