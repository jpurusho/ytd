#!/bin/bash
# Local build and release to GitHub
# Usage: ./scripts/release.sh [version]
# Example: ./scripts/release.sh 1.0.0

set -e

unset GH_TOKEN

VERSION="${1:-$(node -p "require('./package.json').version")}"
TAG="v${VERSION}"
ZIP="release/ytd-${VERSION}-universal-mac.zip"
YML="release/latest-mac.yml"
BLOCKMAP="release/ytd-${VERSION}-universal-mac.zip.blockmap"

echo "=== ytd Release ${TAG} ==="
echo ""

# 1. Build
echo "[1/4] Building..."
npm run build

# 2. Package
echo "[2/4] Packaging macOS..."
npx electron-builder build --mac --publish never

# 3. Verify artifacts
echo "[3/4] Verifying artifacts..."
if [ ! -f "$ZIP" ]; then
  echo "ERROR: $ZIP not found"
  ls release/
  exit 1
fi
echo "  ZIP: $(du -h "$ZIP" | cut -f1)"
echo "  YML: $(du -h "$YML" | cut -f1)"

# 4. Upload to GitHub Release
echo "[4/4] Uploading to GitHub Release ${TAG}..."

gh release view "$TAG" --repo jpurusho/ytd > /dev/null 2>&1 || \
  gh release create "$TAG" \
    --repo jpurusho/ytd \
    --title "ytd ${TAG}" \
    --notes "## ytd ${TAG}

### macOS Install
1. Download the \`.zip\` file below
2. Extract it (double-click)
3. Move \`ytd.app\` to \`/Applications\`
4. Run once: \`xattr -rc /Applications/ytd.app\`
5. Open ytd and sign in with your Google account

### Auto-Update
If you have a previous version installed, the app will auto-update to this release."

for FILE in "$ZIP" "$YML" "$BLOCKMAP"; do
  if [ -f "$FILE" ]; then
    BASENAME=$(basename "$FILE")
    gh release delete-asset "$TAG" "$BASENAME" --repo jpurusho/ytd -y 2>/dev/null || true
    gh release upload "$TAG" "$FILE" --repo jpurusho/ytd
    echo "  Uploaded: $BASENAME"
  fi
done

echo ""
echo "=== Release ${TAG} published ==="
echo "https://github.com/jpurusho/ytd/releases/tag/${TAG}"
