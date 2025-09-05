#!/usr/bin/env python3
import argparse
import subprocess
import sys
from pathlib import Path
from typing import Optional, Tuple

import yt_dlp
from loguru import logger

# Configure logger
logger.remove()
logger.add(sys.stderr, level="INFO")
logger.add("ytd_{time}.log", rotation="10 MB", retention="1 week", level="DEBUG")


def parse_time(time_str: str) -> int:
    """
    Parse time string in various formats to seconds.

    Supports:
    - HH:MM:SS (hours:minutes:seconds)
    - MM:SS (minutes:seconds)
    - SS (seconds only)
    - Raw seconds as integer

    Args:
        time_str (str): Time string to parse

    Returns:
        int: Time in seconds

    Raises:
        ValueError: If time format is invalid
    """
    if not time_str:
        return 0

    time_str = time_str.strip()

    # Check if it's just a number (seconds)
    try:
        return int(float(time_str))
    except ValueError:
        pass

    # Parse HH:MM:SS, MM:SS formats
    parts = time_str.split(":")
    if len(parts) > 3:
        raise ValueError(f"Invalid time format: {time_str}. Use HH:MM:SS, MM:SS, or seconds")

    try:
        parts = [int(part) for part in parts]

        if len(parts) == 1:  # SS
            return parts[0]
        elif len(parts) == 2:  # MM:SS
            return parts[0] * 60 + parts[1]
        elif len(parts) == 3:  # HH:MM:SS
            return parts[0] * 3600 + parts[1] * 60 + parts[2]
    except ValueError:
        raise ValueError(f"Invalid time format: {time_str}. Use HH:MM:SS, MM:SS, or seconds")

    raise ValueError(f"Invalid time format: {time_str}")


def format_time(seconds: int) -> str:
    """Format seconds back to HH:MM:SS format for display."""
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def validate_time_range(start_time: int, end_time: Optional[int], duration: Optional[int]) -> Tuple[int, int]:
    """
    Validate and calculate the actual end time for the segment.

    Args:
        start_time (int): Start time in seconds
        end_time (Optional[int]): End time in seconds (if provided)
        duration (Optional[int]): Duration in seconds (if provided instead of end_time)

    Returns:
        Tuple[int, int]: Validated start and end times

    Raises:
        ValueError: If time parameters are invalid
    """
    if start_time < 0:
        raise ValueError("Start time cannot be negative")

    if end_time is not None and duration is not None:
        raise ValueError("Cannot specify both end time and duration")

    if end_time is None and duration is None:
        raise ValueError("Must specify either end time or duration")

    if duration is not None:
        if duration <= 0:
            raise ValueError("Duration must be positive")
        calculated_end_time = start_time + duration
    else:
        calculated_end_time = end_time
        if calculated_end_time <= start_time:
            raise ValueError("End time must be greater than start time")

    return start_time, calculated_end_time


def escape_filename(filename: str) -> str:
    """
    Escapes special characters in a filename to make it safe for use in file systems.
    Uses a regular expression for more comprehensive replacement.
    """
    if not filename:
        return "output"
    # Replace spaces and characters that are not alphanumeric,
    # underscore, hyphen, or dot
    filename = re.sub(r"[^\w\-\.]", "_", filename.strip())
    return filename


def get_video_info(url: str, cookies: Optional[str] = None) -> dict:
    """
    Get video information without downloading.

    Args:
        url (str): YouTube video URL
        cookies (Optional[str]): Path to cookies file

    Returns:
        dict: Video information
    """
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
    }
    if cookies:
        ydl_opts["cookiefile"] = cookies
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        return ydl.extract_info(url, download=False)


def ensure_output_folder(output_folder: Optional[str]) -> None:
    """Create output folder if it doesn't exist."""
    if output_folder and not Path(output_folder).exists():
        Path(output_folder).mkdir(parents=True)


def check_output_exists(final_output_path: str) -> bool:
    """Check if output file already exists."""
    if Path(final_output_path).exists():
        print(f"Output file already exists: {final_output_path}")
        print("Use a different output name or delete the existing file to re-process.")
        return True
    return False


def parse_and_validate_times(
    start_time: Optional[str],
    end_time: Optional[str],
    duration: Optional[str],
) -> tuple[int, int]:
    """Parse and validate time parameters."""
    start_seconds = parse_time(start_time) if start_time else 0
    end_seconds = parse_time(end_time) if end_time else None
    duration_seconds = parse_time(duration) if duration else None
    start_seconds, end_seconds = validate_time_range(start_seconds, end_seconds, duration_seconds)
    print(
        f"Extracting segment: {format_time(start_seconds)} to "
        f"{format_time(end_seconds)} (duration: "
        f"{format_time(end_seconds - start_seconds)})"
    )
    return start_seconds, end_seconds


def check_segment_validity(
    url: str,
    cookies: Optional[str],
    end_seconds: int,
) -> None:
    """Check if the requested segment is valid for the video."""
    try:
        info = get_video_info(url, cookies)
        video_duration = info.get("duration", 0)
        if video_duration and end_seconds > video_duration:
            print(
                f"Warning: Requested end time "
                f"({format_time(end_seconds)}) exceeds video duration "
                f"({format_time(video_duration)}). "
                f"Will extract until end of video."
            )
    except Exception as e:
        print(f"Warning: Could not verify video duration: {e}")


def build_ffmpeg_command(
    downloaded_filename: str,
    final_output_path: str,
    video_codec: str,
    audio_codec: str,
    audio_bitrate: str,
    crf: int,
    preset: str,
    start_seconds: Optional[int],
    end_seconds: Optional[int],
) -> list[str]:
    """Build the FFmpeg command with all necessary parameters."""
    logger.debug(f"Building FFmpeg command for {downloaded_filename} -> {final_output_path}")
    cmd = [
        "ffmpeg",
        "-i",
        downloaded_filename,
    ]
    if start_seconds is not None:
        logger.debug(f"Adding start time: {start_seconds} seconds")
        cmd.extend(["-ss", str(start_seconds)])
    if end_seconds is not None and start_seconds is not None:
        segment_duration = end_seconds - start_seconds
        logger.debug(f"Adding segment duration: {segment_duration} seconds")
        cmd.extend(["-t", str(segment_duration)])
    cmd.extend(
        [
            "-c:v",
            video_codec,
            "-c:a",
            audio_codec,
            "-b:a",
            audio_bitrate,
            "-crf",
            str(crf),
            "-preset",
            preset,
            "-movflags",
            "+faststart",
            "-avoid_negative_ts",
            "make_zero",
            "-y",
            final_output_path,
        ]
    )
    logger.debug(
        f"FFmpeg encoding parameters: video={video_codec}, audio={audio_codec}, bitrate={audio_bitrate}, crf={crf}, preset={preset}"
    )
    return cmd


def run_ffmpeg_with_timeout(ffmpeg_command: list[str], timeout_minutes: int = 30) -> int:
    """
    Run FFmpeg with timeout protection and progress monitoring.

    Args:
        ffmpeg_command: FFmpeg command as list of strings
        timeout_minutes: Maximum time to wait for FFmpeg to complete

    Returns:
        Return code from FFmpeg process
    """
    import select
    import signal
    import time

    start_time = time.time()
    timeout_seconds = timeout_minutes * 60

    logger.debug(f"Executing FFmpeg command: {' '.join(ffmpeg_command)}")

    process = subprocess.Popen(
        ffmpeg_command,
        stderr=subprocess.PIPE,
        stdout=subprocess.PIPE,
        universal_newlines=True,
        preexec_fn=None if sys.platform == "win32" else lambda: signal.signal(signal.SIGPIPE, signal.SIG_DFL),
    )

    logger.info(f"FFmpeg process started (PID: {process.pid}), timeout: {timeout_minutes} minutes")

    try:
        while True:
            current_time = time.time()
            elapsed_time = current_time - start_time

            # Check for timeout
            if elapsed_time > timeout_seconds:
                logger.error(f"FFmpeg process timed out after {timeout_minutes} minutes")
                process.terminate()
                time.sleep(2)  # Give it a chance to terminate gracefully
                if process.poll() is None:
                    logger.error("Force killing FFmpeg process...")
                    process.kill()
                return -1

            # Check if process has finished
            poll_result = process.poll()
            if poll_result is not None:
                logger.info(f"FFmpeg completed with return code: {poll_result}")
                logger.debug(f"Total conversion time: {elapsed_time:.2f} seconds")
                return poll_result

            # Read output with timeout
            if sys.platform != "win32":
                # Use select on Unix-like systems
                ready, _, _ = select.select([process.stderr], [], [], 1.0)
                if ready:
                    output = process.stderr.readline()
                    if output and ("time=" in output or "fps=" in output):
                        # Clean up the progress line
                        clean_output = output.strip()
                        logger.info(f"Progress: {clean_output}")
            else:
                # Windows doesn't support select on pipes, use blocking read with shorter timeout
                try:
                    output = process.stderr.readline()
                    if output and ("time=" in output or "fps=" in output):
                        clean_output = output.strip()
                        logger.info(f"Progress: {clean_output}")
                    elif not output and process.poll() is not None:
                        break
                except Exception:
                    # Handle any read errors
                    time.sleep(0.1)
                    continue

            # Small sleep to prevent excessive CPU usage
            time.sleep(0.1)

    except KeyboardInterrupt:
        logger.warning("\nInterrupted by user. Terminating FFmpeg...")
        process.terminate()
        time.sleep(2)
        if process.poll() is None:
            logger.debug("Process didn't terminate gracefully, killing it")
            process.kill()
        return -1
    except Exception as e:
        logger.error(f"Error during FFmpeg execution: {e}")
        logger.exception("Detailed exception info:")
        process.terminate()
        return -1


def cleanup_temp_file(downloaded_filename: str, verbose: bool = False) -> None:
    """Clean up temporary file with robust error handling."""
    temp_file = Path(downloaded_filename)

    logger.debug(f"Attempting to clean up temporary file: {downloaded_filename}")
    logger.debug(f"File exists: {temp_file.exists()}")
    if temp_file.exists():
        logger.debug(f"File size: {temp_file.stat().st_size} bytes")

    if not temp_file.exists():
        logger.info(f"Temporary file already removed: {downloaded_filename}")
        return

    try:
        # Wait a moment for any file locks to release
        import time

        time.sleep(0.5)
        logger.debug("Waited 0.5 seconds for potential file locks to release")

        # Try to delete the file
        temp_file.unlink()
        logger.info(f"Deleted temporary file: '{downloaded_filename}'")

        # Verify deletion
        if temp_file.exists():
            logger.warning(f"File still exists after deletion attempt: {downloaded_filename}")
            logger.debug(f"File permissions: {oct(temp_file.stat().st_mode)}")
        else:
            logger.debug("File successfully removed and verified")

    except PermissionError as pe:
        logger.error(f"Permission denied when deleting temporary file: {downloaded_filename}")
        logger.error("You may need to delete it manually.")
        logger.debug(f"PermissionError details: {pe}")
    except FileNotFoundError:
        logger.info(f"Temporary file already removed: {downloaded_filename}")
    except Exception as e:
        logger.error(f"Could not delete temporary file '{downloaded_filename}': {e}")
        logger.error(f"Error type: {type(e).__name__}")
        logger.exception("Full exception details:")


def download_and_convert_video(
    url: str,
    output_name: str,
    output_folder: Optional[str] = None,
    video_codec: str = "libx264",
    audio_codec: str = "aac",
    audio_bitrate: str = "192k",
    crf: int = 23,
    preset: str = "slow",
    cookies: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    duration: Optional[str] = None,
) -> None:
    """
    Downloads a YouTube video (or segment) and converts it to a specified format using FFmpeg.
    """
    logger.info(f"Processing video from URL: {url}")
    logger.debug(f"Output parameters: name={output_name}, folder={output_folder}")
    logger.debug(
        f"Encoding parameters: video_codec={video_codec}, audio_codec={audio_codec}, "
        f"audio_bitrate={audio_bitrate}, crf={crf}, preset={preset}"
    )
    logger.debug(f"Time parameters: start={start_time}, end={end_time}, duration={duration}")

    # Parse and validate time parameters if provided
    start_seconds = None
    end_seconds = None
    if start_time is not None or end_time is not None or duration is not None:
        try:
            logger.debug("Parsing and validating time parameters")
            start_seconds, end_seconds = parse_and_validate_times(
                start_time, end_time, duration
            )
            logger.debug(f"Parsed time parameters: start_seconds={start_seconds}, end_seconds={end_seconds}")
            check_segment_validity(url, cookies, end_seconds)
        except ValueError as e:
            logger.error(f"Error parsing time parameters: {e}")
            sys.exit(1)

    sanitized_output_name = f"{escape_filename(output_name)}.original"
    output_template = f"{sanitized_output_name}.%(ext)s"
    logger.debug(f"Sanitized output name: {sanitized_output_name}")
    logger.debug(f"Output template for yt-dlp: {output_template}")

    # Define downloaded_filename here so it's available throughout the function
    downloaded_filename = f"{sanitized_output_name}.mp4"
    logger.debug(f"Expected downloaded filename: {downloaded_filename}")

    ydl_opts = {
        "format": "bestvideo+bestaudio/best",
        "outtmpl": output_template,
        "merge_output_format": "mp4",
    }
    if cookies:
        logger.debug(f"Using cookies file: {cookies}")
        ydl_opts["cookiefile"] = cookies

    # Prepare final output path first
    final_output_path = (
        f"{output_folder + '/' if output_folder else ''}"
        f"{escape_filename(output_name)}.mp4"
    )
    logger.debug(f"Final output path: {final_output_path}")

    # Create output folder if it doesn't exist
    ensure_output_folder(output_folder)

    # Check if final output already exists
    if check_output_exists(final_output_path):
        return

    try:
        # Download the video
        if Path(downloaded_filename).exists():
            logger.info(f"Using existing temporary file: {downloaded_filename}")
            file_size = Path(downloaded_filename).stat().st_size
            logger.debug(f"Existing file size: {file_size} bytes")
        else:
            logger.info(f"Downloading video from: {url}")
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                logger.debug("Starting download with yt-dlp")
                info = ydl.extract_info(url, download=True)
                logger.debug(f"Downloaded video title: {info.get('title', 'Unknown')}")

            if not Path(downloaded_filename).exists():
                logger.error("Downloaded file not found")
                logger.debug(f"Expected file at: {downloaded_filename}")
                sys.exit(1)

            file_size = Path(downloaded_filename).stat().st_size
            logger.info(f"Downloaded file: {downloaded_filename} ({file_size} bytes)")

        logger.info(f"Converting '{downloaded_filename}' to '{final_output_path}'...")
        ffmpeg_command = build_ffmpeg_command(
            downloaded_filename,
            final_output_path,
            video_codec,
            audio_codec,
            audio_bitrate,
            crf,
            preset,
            start_seconds,
            end_seconds,
        )

        # Execute FFmpeg with timeout protection
        return_code = run_ffmpeg_with_timeout(ffmpeg_command)
        if return_code != 0:
            logger.error(f"FFmpeg failed with return code {return_code}")
            logger.debug("FFmpeg may have encountered an error with the input file or parameters")
            sys.exit(1)

        logger.info(f"Conversion completed: '{final_output_path}'")

        # Verify output file exists
        if Path(final_output_path).exists():
            output_size = Path(final_output_path).stat().st_size
            logger.debug(f"Output file size: {output_size} bytes")
            if output_size == 0:
                logger.warning("Warning: Output file has zero size")
        else:
            logger.error("Error: Output file not created despite successful return code")

        # Clean up original file with more robust error handling
        cleanup_temp_file(downloaded_filename, verbose=True)

    except FileNotFoundError as fnf:
        logger.error("FFmpeg not found. Please ensure FFmpeg is installed and in your system's PATH.")
        logger.debug(f"FileNotFoundError details: {fnf}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Error during download or conversion: {e}")
        logger.exception("Detailed exception information:")
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=("Download YouTube videos and convert them to MP4 format, with optional segment extraction."),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Time format examples:
  --start 1:30:15      (1 hour, 30 minutes, 15 seconds)
  --start 5:30         (5 minutes, 30 seconds)
  --start 90           (90 seconds)
  --duration 30        (30 seconds from start)
  --duration 2:30      (2 minutes, 30 seconds from start)

Examples:
  # Download full video
  python ytd.py "https://youtube.com/watch?v=..." -o "my_video"

  # Extract 30 seconds starting from 1:30
  python ytd.py "https://youtube.com/watch?v=..." -o "segment" --start 1:30 --duration 30

  # Extract from 1:00 to 3:45
  python ytd.py "https://youtube.com/watch?v=..." -o "clip" --start 1:00 --end 3:45
        """,
    )

    parser.add_argument("url", help="The YouTube video URL to download.")
    parser.add_argument(
        "-o",
        "--output",
        default="output",
        help="The desired output filename (without extension). Defaults to 'output'.",
    )
    parser.add_argument(
        "-of",
        "--output-folder",
        help="The folder to save the output file. Defaults to the current directory.",
    )

    # Segment extraction options
    segment_group = parser.add_argument_group("segment extraction")
    segment_group.add_argument(
        "--start",
        help="Start time for segment extraction (HH:MM:SS, MM:SS, or seconds)",
    )
    segment_group.add_argument(
        "--end", help="End time for segment extraction (HH:MM:SS, MM:SS, or seconds)"
    )
    segment_group.add_argument(
        "--duration",
        "-d",
        help=(
            "Duration from start time (HH:MM:SS, MM:SS, or seconds). "
            "Alternative to --end"
        ),
    )

    # Encoding options
    encoding_group = parser.add_argument_group("encoding options")
    encoding_group.add_argument(
        "-vc",
        "--video-codec",
        default="libx264",
        help="The video codec to use. Defaults to 'libx264'.",
    )
    encoding_group.add_argument(
        "-ac",
        "--audio-codec",
        default="aac",
        help="The audio codec to use. Defaults to 'aac'.",
    )
    encoding_group.add_argument(
        "-ab",
        "--audio-bitrate",
        default="192k",
        help="The audio bitrate. Defaults to '192k'.",
    )
    encoding_group.add_argument(
        "-crf",
        "--crf",
        type=int,
        default=23,
        help="The Constant Rate Factor (0-51, lower is better). Defaults to 23.",
    )
    encoding_group.add_argument(
        "-preset",
        "--preset",
        default="slow",
        choices=[
            "ultrafast",
            "superfast",
            "veryfast",
            "faster",
            "fast",
            "medium",
            "slow",
            "slower",
            "veryslow",
        ],
        help="The encoding preset. Defaults to 'slow'.",
    )
    encoding_group.add_argument(
        "--cookies", help="Path to cookies.txt file for authenticated downloads."
    )

    args = parser.parse_args()

    # Validate segment arguments
    if args.end and args.duration:
        logger.error("Cannot specify both --end and --duration")
        sys.exit(1)

    if (args.start or args.end or args.duration) and not args.start:
        logger.error("--start time is required when using segment extraction")
        sys.exit(1)

    download_and_convert_video(
        url=args.url,
        output_name=args.output,
        output_folder=args.output_folder,
        video_codec=args.video_codec,
        audio_codec=args.audio_codec,
        audio_bitrate=args.audio_bitrate,
        crf=args.crf,
        preset=args.preset,
        cookies=args.cookies,
        start_time=args.start,
        end_time=args.end,
        duration=args.duration,
    )


if __name__ == "__main__":
    # Log script invocation details
    logger.info("Starting YouTube download and conversion script")
    logger.debug(f"Python version: {sys.version}")
    logger.debug(f"Operating system: {sys.platform}")
    logger.debug(f"Command line arguments: {sys.argv[1:]}")

    try:
        main()
        logger.info("Script completed successfully")
    except Exception as e:
        logger.error(f"Unhandled exception: {e}")
        logger.exception("Script failed with exception:")
        sys.exit(1)
