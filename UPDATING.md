# 🔄 Dependency Update Guide

## Quick Check

Run this to see versions:
```bash
cd ~/experimental/ytd
bin/mac/yt-dlp --version
bin/mac/ffmpeg -version | head -1
whisper --version 2>&1 | head -1
```

---

## When to Update

**Update yt-dlp if:**
- Downloads fail with "Access denied" errors
- YouTube changes their API (happens frequently)
- Version is >90 days old (yt-dlp warns you)

**Update ffmpeg if:**
- Transcoding fails
- New video formats aren't supported

**Update whisper if:**
- Transcription accuracy degrades
- New models are available

---

## How to Update

### **Option 1: Quick Update Script** (Recommended)
```bash
cd ~/experimental/ytd
./scripts/download-binaries.sh  # Updates yt-dlp + ffmpeg
brew upgrade openai-whisper     # Updates whisper
```

### **Option 2: Individual Updates**

**yt-dlp** (updates most frequently):
```bash
cd ~/experimental/ytd
curl -L "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos" \
  -o bin/mac/yt-dlp
chmod +x bin/mac/yt-dlp
bin/mac/yt-dlp --version
```

**whisper** (via Homebrew):
```bash
brew upgrade openai-whisper
# or reinstall:
brew uninstall openai-whisper && brew install openai-whisper
```

**ffmpeg** (bundled with yt-dlp script):
```bash
cd ~/experimental/ytd
./scripts/download-binaries.sh
```

---

## Check for Updates

Run the checker script:
```bash
cd ~/experimental/ytd
./scripts/check-updates.sh
```

---

## Troubleshooting

**yt-dlp says "Update available":**
- This is normal - yt-dlp updates weekly
- Only update if downloads are failing
- Run: `./scripts/download-binaries.sh`

**Whisper not found:**
```bash
# Reinstall via Homebrew:
brew install openai-whisper

# Or via pip:
pip3 install --upgrade openai-whisper
```

**ffmpeg errors:**
```bash
# Re-download:
cd ~/experimental/ytd
rm bin/mac/ffmpeg bin/mac/ffprobe
./scripts/download-binaries.sh
```

---

## Auto-Update (Future Feature)

Coming soon: Automatic update checks on app startup with notification.
