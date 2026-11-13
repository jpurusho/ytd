#!/bin/bash
# Check for updates to ytd dependencies

set -e

PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
if [ "$PLATFORM" = "darwin" ]; then
  BIN_DIR="bin/mac"
else
  BIN_DIR="bin/linux"
fi

echo "=== Checking ytd dependencies ==="
echo ""

# yt-dlp
if [ -f "$BIN_DIR/yt-dlp" ]; then
  CURRENT=$("$BIN_DIR/yt-dlp" --version 2>/dev/null || echo "unknown")
  LATEST=$(curl -s https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
  echo "📦 yt-dlp:"
  echo "   Current: $CURRENT"
  echo "   Latest:  $LATEST"
  if [ "$CURRENT" != "$LATEST" ]; then
    echo "   ⚠️  Update available!"
  else
    echo "   ✅ Up to date"
  fi
else
  echo "📦 yt-dlp: ❌ Not installed"
fi
echo ""

# ffmpeg
if [ -f "$BIN_DIR/ffmpeg" ]; then
  FFMPEG_VER=$("$BIN_DIR/ffmpeg" -version 2>/dev/null | head -1 | awk '{print $3}')
  echo "📦 ffmpeg:"
  echo "   Current: $FFMPEG_VER"
  echo "   ✅ Installed"
else
  echo "📦 ffmpeg: ❌ Not installed"
fi
echo ""

# whisper (Homebrew on macOS)
if [ "$PLATFORM" = "darwin" ]; then
  if command -v whisper &> /dev/null; then
    WHISPER_VER=$(pip show openai-whisper 2>/dev/null | grep "Version:" | awk '{print $2}')
    echo "📦 openai-whisper:"
    echo "   Current: $WHISPER_VER"

    # Check if update available via brew
    BREW_OUTDATED=$(brew outdated 2>/dev/null | grep openai-whisper || echo "")
    if [ -n "$BREW_OUTDATED" ]; then
      echo "   ⚠️  Update available via: brew upgrade openai-whisper"
    else
      echo "   ✅ Up to date"
    fi
  else
    echo "📦 openai-whisper: ❌ Not installed"
    echo "   Install with: brew install openai-whisper"
  fi
fi
echo ""

echo "=== Update commands ==="
echo "To update all: ./scripts/download-binaries.sh && brew upgrade openai-whisper"
