# ADR 0012: Code Signing Workaround for Auto-Updates

Date: 2026-11-13

## Context

macOS requires apps to be code-signed and notarized for:
1. **Auto-updates**: electron-updater's Squirrel.Mac framework verifies code signatures
2. **Gatekeeper trust**: Unsigned apps get quarantined and require `xattr -rc` after every download

**Observed behavior:**
- Users downloading from GitHub releases must run `sudo xattr -rc /Applications/ytd.app` 
- electron-updater fails with `SQRLCodeSignatureErrorDomain` error code -1
- Apps like Google Drive don't need `xattr -rc` because they're properly signed

**Why we're not signed:**
- Code signing requires an Apple Developer account ($99/year)
- This is a personal project without commercial distribution needs

## Decision

Implement a **graceful fallback** when code signature verification fails:

```typescript
autoUpdater.once('error', (error) => {
  const isCodeSignError = error?.message?.includes('SQRLCodeSignatureErrorDomain');

  if (isCodeSignError) {
    // Return special response to open browser download
    resolve({
      success: false,
      requiresManualDownload: true,
      downloadUrl: `https://github.com/.../ytd-${version}-arm64-mac.zip`,
      message: 'Automatic update requires code signing. Opening download page...'
    });
  }
});
```

**Frontend behavior:**
- When `requiresManualDownload: true`, open download URL in browser
- User downloads and replaces app manually (still needs `xattr -rc`)

## Consequences

**Positive:**
- Auto-update check still works (shows available version)
- Download button opens browser for manual download instead of silently failing
- No crash or confusing error messages
- No Apple Developer account required

**Negative:**
- Not truly "automatic" updates - requires manual download and `xattr -rc`
- Users must know to run `xattr -rc` or drag-drop to /Applications won't work
- Less polished experience compared to signed apps

## Future Options

If/when ready to invest in proper code signing:

1. **Join Apple Developer Program** ($99/year)
2. **Generate signing certificate** in Apple Developer portal
3. **Update electron-builder.yml:**
   ```yaml
   mac:
     identity: "Developer ID Application: Your Name (TEAM_ID)"
     hardenedRuntime: true
     entitlements: "build/entitlements.mac.plist"
     entitlementsInherit: "build/entitlements.mac.plist"
   ```
4. **Notarize builds** with `electron-notarize`
5. **Remove this workaround** - electron-updater will work natively

**Benefits of signing:**
- True automatic updates
- No `xattr -rc` required
- Users can trust the app immediately
- Distributed via Mac App Store (optional)
