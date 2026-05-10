#!/bin/bash
set -e

echo "=== Downloading bundled binaries for ytd ==="

PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

if [ "$PLATFORM" = "darwin" ]; then
  BIN_DIR="bin/mac"
elif [ "$PLATFORM" = "linux" ]; then
  BIN_DIR="bin/linux"
else
  echo "Unsupported platform: $PLATFORM"
  exit 1
fi

mkdir -p "$BIN_DIR"

# ─── yt-dlp ─────────────────────────────────────────────────────────────────
# yt-dlp_macos is a universal binary (works on both x64 and arm64)

echo "Downloading yt-dlp..."
if [ "$PLATFORM" = "darwin" ]; then
  curl -L --fail "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos" -o "$BIN_DIR/yt-dlp"
elif [ "$PLATFORM" = "linux" ]; then
  curl -L --fail "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux" -o "$BIN_DIR/yt-dlp"
fi
chmod +x "$BIN_DIR/yt-dlp"
echo "  yt-dlp: $("$BIN_DIR/yt-dlp" --version)"

# ─── ffmpeg ──────────────────────────────────────────────────────────────────
# For macOS: download arm64 build for Apple Silicon (works natively)
# The CI runner is x64 but we target arm64 for the universal app

echo "Downloading ffmpeg..."
if [ "$PLATFORM" = "darwin" ]; then
  # Use osxexperts.net arm64 builds (Apple Silicon native)
  FFMPEG_URL="https://www.osxexperts.net/ffmpeg7arm.zip"
  FFPROBE_URL="https://www.osxexperts.net/ffprobe7arm.zip"

  # Try arm64 builds first
  if curl -L --fail "$FFMPEG_URL" -o /tmp/ffmpeg.zip 2>/dev/null; then
    unzip -o /tmp/ffmpeg.zip -d "$BIN_DIR/"
    rm /tmp/ffmpeg.zip
  elif curl -L --fail "https://evermeet.cx/ffmpeg/getrelease/zip" -o /tmp/ffmpeg.zip 2>/dev/null; then
    unzip -o /tmp/ffmpeg.zip -d "$BIN_DIR/"
    rm /tmp/ffmpeg.zip
  else
    echo "ERROR: Could not download ffmpeg"
    exit 1
  fi

  if curl -L --fail "$FFPROBE_URL" -o /tmp/ffprobe.zip 2>/dev/null; then
    unzip -o /tmp/ffprobe.zip -d "$BIN_DIR/"
    rm /tmp/ffprobe.zip
  elif curl -L --fail "https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip" -o /tmp/ffprobe.zip 2>/dev/null; then
    unzip -o /tmp/ffprobe.zip -d "$BIN_DIR/"
    rm /tmp/ffprobe.zip
  fi

elif [ "$PLATFORM" = "linux" ]; then
  FFMPEG_URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
  if [ "$ARCH" = "aarch64" ]; then
    FFMPEG_URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz"
  fi
  curl -L --fail "$FFMPEG_URL" -o /tmp/ffmpeg.tar.xz
  tar xf /tmp/ffmpeg.tar.xz -C /tmp/
  cp /tmp/ffmpeg-*-static/ffmpeg "$BIN_DIR/"
  cp /tmp/ffmpeg-*-static/ffprobe "$BIN_DIR/"
  rm -rf /tmp/ffmpeg.tar.xz /tmp/ffmpeg-*-static
fi

chmod +x "$BIN_DIR/ffmpeg" 2>/dev/null || true
chmod +x "$BIN_DIR/ffprobe" 2>/dev/null || true

echo "  ffmpeg: $("$BIN_DIR/ffmpeg" -version 2>&1 | head -1 || echo 'installed')"
echo "  arch: $(file "$BIN_DIR/ffmpeg" 2>/dev/null | grep -o 'arm64\|x86_64' || echo 'unknown')"

echo ""
echo "=== Done! Binaries saved to $BIN_DIR ==="
ls -la "$BIN_DIR"
