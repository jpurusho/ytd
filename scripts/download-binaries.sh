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

echo "Downloading yt-dlp..."
if [ "$PLATFORM" = "darwin" ]; then
  curl -L "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos" -o "$BIN_DIR/yt-dlp"
elif [ "$PLATFORM" = "linux" ]; then
  curl -L "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux" -o "$BIN_DIR/yt-dlp"
fi
chmod +x "$BIN_DIR/yt-dlp"
echo "  yt-dlp downloaded: $("$BIN_DIR/yt-dlp" --version)"

# ─── ffmpeg ──────────────────────────────────────────────────────────────────

echo "Downloading ffmpeg..."
if [ "$PLATFORM" = "darwin" ]; then
  # macOS static builds from evermeet.cx
  curl -L "https://evermeet.cx/ffmpeg/getrelease/zip" -o /tmp/ffmpeg.zip
  unzip -o /tmp/ffmpeg.zip -d "$BIN_DIR/"
  rm /tmp/ffmpeg.zip

  curl -L "https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip" -o /tmp/ffprobe.zip
  unzip -o /tmp/ffprobe.zip -d "$BIN_DIR/"
  rm /tmp/ffprobe.zip
elif [ "$PLATFORM" = "linux" ]; then
  # Linux static builds from johnvansickle.com
  FFMPEG_URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
  if [ "$ARCH" = "aarch64" ]; then
    FFMPEG_URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz"
  fi
  curl -L "$FFMPEG_URL" -o /tmp/ffmpeg.tar.xz
  tar xf /tmp/ffmpeg.tar.xz -C /tmp/
  cp /tmp/ffmpeg-*-static/ffmpeg "$BIN_DIR/"
  cp /tmp/ffmpeg-*-static/ffprobe "$BIN_DIR/"
  rm -rf /tmp/ffmpeg.tar.xz /tmp/ffmpeg-*-static
fi

chmod +x "$BIN_DIR/ffmpeg" "$BIN_DIR/ffprobe"
echo "  ffmpeg downloaded: $("$BIN_DIR/ffmpeg" -version 2>&1 | head -1)"

echo ""
echo "=== Done! Binaries saved to $BIN_DIR ==="
ls -la "$BIN_DIR"
