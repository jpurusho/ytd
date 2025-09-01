# YouTube Video Downloader (ytd.py)

A powerful Python script for downloading YouTube videos and converting them to MP4 format with optional segment extraction capabilities.

## Features

- Download full YouTube videos or specific segments
- High-quality video conversion using FFmpeg
- Flexible time format support (HH:MM:SS, MM:SS, or seconds)
- Customizable video/audio codecs and quality settings
- Automatic file organization with custom output folders
- Progress monitoring during conversion
- Smart duplicate detection to avoid re-downloading existing files
- Support for authenticated downloads via cookies

## Prerequisites

Before using ytd.py, you'll need to install several dependencies. You can either install them manually or use the provided setup script.

### Required Dependencies

- **Python 3.8+** - Programming language runtime
- **uv** - Fast Python package installer
- **FFmpeg** - Video processing toolkit
- **Homebrew** (macOS) - Package manager for macOS

### Quick Setup

Run the setup script to automatically install all dependencies:

```bash
chmod +x setup.sh
./setup.sh
```

### Manual Installation

#### 1. Install Homebrew (macOS only)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

#### 2. Install FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
```

**Windows:**
Download from [FFmpeg official site](https://ffmpeg.org/download.html) and add to PATH.

#### 3. Install uv (Python package manager)

**macOS/Linux:**
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

**Windows:**
```bash
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

#### 4. Install Python Dependencies

```bash
uv add yt-dlp
```

## Installation

1. Clone or download the script files:
   ```bash
   git clone <your-repo-url>
   cd youtube-downloader
   ```

2. Make the script executable:
   ```bash
   chmod +x ytd.py
   ```

3. Run the setup (if not done already):
   ```bash
   ./setup.sh
   ```

## Usage

### Basic Syntax

```bash
uv run ytd.py <YouTube_URL> [OPTIONS]
```

### Examples

#### Download Full Video
```bash
uv run ytd.py "https://youtube.com/watch?v=VIDEO_ID" -o "my_video"
```

#### Download with Custom Output Folder
```bash
uv run ytd.py "https://youtube.com/watch?v=VIDEO_ID" -of ~/Downloads -o "video_name"
```

#### Extract 30-Second Clip Starting at 1:30
```bash
uv run ytd.py "https://youtube.com/watch?v=VIDEO_ID" -o "clip" --start 1:30 --duration 30
```

#### Extract Segment from 2:15 to 5:45
```bash
uv run ytd.py "https://youtube.com/watch?v=VIDEO_ID" -o "segment" --start 2:15 --end 5:45
```

#### High Quality Download with Custom Settings
```bash
uv run ytd.py "https://youtube.com/watch?v=VIDEO_ID" -o "hq_video" -crf 18 -preset slower
```

### Command-Line Options

#### Basic Options
- `url` - YouTube video URL (required)
- `-o, --output` - Output filename without extension (default: "output")
- `-of, --output-folder` - Output directory (default: current directory)

#### Segment Extraction
- `--start` - Start time (HH:MM:SS, MM:SS, or seconds)
- `--end` - End time (HH:MM:SS, MM:SS, or seconds)
- `-d, --duration` - Duration from start time (alternative to --end)

#### Encoding Options
- `-vc, --video-codec` - Video codec (default: libx264)
- `-ac, --audio-codec` - Audio codec (default: aac)
- `-ab, --audio-bitrate` - Audio bitrate (default: 192k)
- `-crf, --crf` - Video quality (0-51, lower = better, default: 23)
- `-preset, --preset` - Encoding speed preset (default: slow)
- `--cookies` - Path to cookies.txt file for authenticated downloads

### Time Format Examples

The script supports multiple time formats:

- `90` - 90 seconds
- `5:30` - 5 minutes, 30 seconds
- `1:30:15` - 1 hour, 30 minutes, 15 seconds

### Encoding Presets

Available FFmpeg presets (speed vs compression trade-off):
- `ultrafast` - Fastest encoding, largest file size
- `superfast`
- `veryfast`
- `faster`
- `fast`
- `medium`
- `slow` (default) - Good balance
- `slower`
- `veryslow` - Slowest encoding, smallest file size

## File Organization

The script creates temporary files during processing:

1. **Download phase**: `{filename}.original.mp4` (temporary)
2. **Conversion phase**: Processes and outputs to your specified location
3. **Cleanup**: Automatically removes temporary files

## Troubleshooting

### Common Issues

#### "FFmpeg not found"
- Ensure FFmpeg is installed and accessible in your system PATH
- Try running `ffmpeg -version` to verify installation

#### "Downloaded file not found"
- Check your internet connection
- Verify the YouTube URL is correct and accessible
- Some videos may require cookies for authentication

#### "Output file already exists"
- The script prevents overwriting existing files
- Use a different output name or delete the existing file

### Video Access Issues

For private or age-restricted videos:

1. Export cookies from your browser using a browser extension
2. Save cookies to a text file (cookies.txt format)
3. Use the `--cookies` option:
   ```bash
   uv run ytd.py "URL" --cookies /path/to/cookies.txt -o "video_name"
   ```

### Performance Tips

- Use `faster` or `fast` preset for quicker processing
- Higher CRF values (25-28) for smaller file sizes
- Lower CRF values (18-20) for better quality

## Technical Details

### Video Processing Pipeline

1. **URL Validation** - Verifies YouTube URL accessibility
2. **Time Parsing** - Converts time formats to seconds
3. **Download** - Uses yt-dlp to fetch best quality streams
4. **Segment Extraction** - (Optional) Cuts specific time ranges
5. **Encoding** - Converts to MP4 with specified quality settings
6. **Cleanup** - Removes temporary files

### Quality Settings

- **CRF 18-20**: High quality (larger files)
- **CRF 23**: Default (good balance)
- **CRF 28-32**: Lower quality (smaller files)

### Supported Input Formats

- YouTube video URLs
- YouTube playlist URLs (downloads first video)
- YouTube Music URLs
- Various YouTube URL formats (shortened, embedded, etc.)

## Contributing

To contribute to this project:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is for educational and personal use only. Respect YouTube's Terms of Service and copyright laws when downloading content.

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Ensure all dependencies are properly installed
3. Verify your Python and FFmpeg versions
4. Check that the YouTube URL is accessible

For technical support, please create an issue with:
- Your operating system
- Python version (`python --version`)
- FFmpeg version (`ffmpeg -version`)
- Complete error message
- The command you were trying to run