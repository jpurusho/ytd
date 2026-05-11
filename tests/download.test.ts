import { describe, it, expect, beforeAll } from 'vitest';
import { execSync, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const TEST_VIDEOS = [
  { id: '-uW5-TaVXu4', url: 'https://www.youtube.com/watch?v=-uW5-TaVXu4', desc: 'video with dash in ID' },
  { id: '-QVoIxEpFkM', url: 'https://www.youtube.com/watch?v=-QVoIxEpFkM', desc: 'video requiring JS challenge' },
];

const BIN_DIR = path.join(__dirname, '..', 'bin', 'mac');
const ytDlpPath = path.join(BIN_DIR, 'yt-dlp');
const ffmpegPath = path.join(BIN_DIR, 'ffmpeg');
const ffprobePath = path.join(BIN_DIR, 'ffprobe');
const qjsPath = path.join(BIN_DIR, 'qjs');

// Also check system paths as fallback (for CI/dev where bin/mac may not exist yet)
function findBinary(name: string, bundledPath: string): string | null {
  if (fs.existsSync(bundledPath)) return bundledPath;
  try {
    return execSync(`which ${name}`, { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

describe('Binary availability', () => {
  it('yt-dlp binary exists and is executable', () => {
    const bin = findBinary('yt-dlp', ytDlpPath);
    expect(bin).not.toBeNull();
    const version = execSync(`"${bin}" --version`, { encoding: 'utf8' }).trim();
    expect(version).toMatch(/^\d{4}\.\d{2}\.\d{2}/);
  });

  it('ffmpeg binary exists and is executable', () => {
    const bin = findBinary('ffmpeg', ffmpegPath);
    expect(bin).not.toBeNull();
    const output = execSync(`"${bin}" -version`, { encoding: 'utf8' });
    expect(output).toContain('ffmpeg version');
  });

  it('ffprobe binary exists and is executable', () => {
    const bin = findBinary('ffprobe', ffprobePath);
    expect(bin).not.toBeNull();
    const output = execSync(`"${bin}" -version`, { encoding: 'utf8' });
    expect(output).toContain('ffprobe version');
  });

  it('quickjs (qjs) binary exists and is executable', () => {
    const bin = findBinary('qjs', qjsPath);
    expect(bin).not.toBeNull();
    const output = execSync(`"${bin}" --help 2>&1 || true`, { encoding: 'utf8' });
    expect(output.toLowerCase()).toMatch(/quickjs|usage|qjs/);
  });

  it('binaries are arm64 on macOS', () => {
    if (process.platform !== 'darwin') return;
    const bins = [ytDlpPath, ffmpegPath, ffprobePath, qjsPath].filter(fs.existsSync);
    for (const bin of bins) {
      const fileInfo = execSync(`file "${bin}"`, { encoding: 'utf8' });
      // yt-dlp_macos is universal (arm64 + x86_64), others should be arm64
      expect(fileInfo).toMatch(/arm64|universal/);
    }
  });
});

describe('yt-dlp JS runtime integration', () => {
  it('yt-dlp detects quickjs as JS runtime', () => {
    const bin = findBinary('yt-dlp', ytDlpPath);
    const qjs = findBinary('qjs', qjsPath);
    if (!bin || !qjs) return;

    const output = execSync(
      `"${bin}" --js-runtimes "quickjs:${qjs}" -v --no-download --print "%(id)s" "https://www.youtube.com/watch?v=dQw4w9WgXcQ" 2>&1`,
      { encoding: 'utf8', timeout: 30000 }
    );
    expect(output).toContain('quickjs');
  });

  it('yt-dlp solves JS challenges when only quickjs is available', () => {
    const bin = findBinary('yt-dlp', ytDlpPath);
    const qjs = findBinary('qjs', qjsPath);
    if (!bin || !qjs) return;

    // Run with minimal PATH so only quickjs is found (not deno/node)
    const output = execSync(
      `"${bin}" --js-runtimes "quickjs:${qjs}" -v --no-download --print "%(id)s" "https://www.youtube.com/watch?v=dQw4w9WgXcQ" 2>&1`,
      { encoding: 'utf8', timeout: 60000, env: { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' } }
    );
    expect(output).toContain('Solving JS challenges using quickjs');
    expect(output).toContain('dQw4w9WgXcQ');
  });
});

describe('YouTube format extraction', () => {
  let ytDlp: string | null;
  let qjs: string | null;
  let ffmpeg: string | null;

  beforeAll(() => {
    ytDlp = findBinary('yt-dlp', ytDlpPath);
    qjs = findBinary('qjs', qjsPath);
    ffmpeg = findBinary('ffmpeg', ffmpegPath);
  });

  for (const video of TEST_VIDEOS) {
    it(`extracts formats for ${video.desc} (${video.id})`, () => {
      if (!ytDlp || !qjs) return;

      const result = execSync(
        `"${ytDlp}" --js-runtimes "quickjs:${qjs}" --dump-json --no-download "${video.url}" 2>/dev/null`,
        { encoding: 'utf8', timeout: 60000 }
      );
      const info = JSON.parse(result);
      expect(info.id).toBe(video.id);
      expect(info.title).toBeTruthy();
      expect(info.formats).toBeDefined();
      expect(info.formats.length).toBeGreaterThan(0);
    });
  }

  it('format string with resolution fallback works', () => {
    if (!ytDlp || !qjs) return;

    const result = execSync(
      `"${ytDlp}" --js-runtimes "quickjs:${qjs}" -f "bestvideo[height<=1080]+bestaudio/bestvideo+bestaudio/best[height<=1080]/best" --no-download --print "%(format)s" "https://www.youtube.com/watch?v=-uW5-TaVXu4" 2>/dev/null`,
      { encoding: 'utf8', timeout: 60000 }
    );
    expect(result.trim()).toBeTruthy();
    expect(result.trim()).not.toContain('ERROR');
  });

  it('mp3 extraction format string works', () => {
    if (!ytDlp || !qjs) return;

    const result = execSync(
      `"${ytDlp}" --js-runtimes "quickjs:${qjs}" -x --audio-format mp3 --audio-quality 0 --no-download --print "%(format)s" "https://www.youtube.com/watch?v=-uW5-TaVXu4" 2>/dev/null`,
      { encoding: 'utf8', timeout: 60000 }
    );
    expect(result.trim()).toBeTruthy();
  });
});

describe('Download integration', () => {
  let ytDlp: string | null;
  let qjs: string | null;
  let ffmpeg: string | null;
  const tmpDir = path.join(__dirname, '..', 'tmp-test-downloads');

  beforeAll(() => {
    ytDlp = findBinary('yt-dlp', ytDlpPath);
    qjs = findBinary('qjs', qjsPath);
    ffmpeg = findBinary('ffmpeg', ffmpegPath);
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  });

  it('downloads a short segment (5 seconds) as mp4', () => {
    if (!ytDlp || !qjs || !ffmpeg) return;

    const ffmpegDir = path.dirname(ffmpeg!);
    const output = path.join(tmpDir, 'test-segment.%(ext)s');

    execSync(
      `"${ytDlp}" --js-runtimes "quickjs:${qjs}" ` +
      `-f "bestvideo[height<=480]+bestaudio/best[height<=480]/best" ` +
      `--merge-output-format mp4 ` +
      `--download-sections "*0:00-0:05" ` +
      `--force-overwrites --no-part ` +
      `--postprocessor-args "ffmpeg:-y" ` +
      `--ffmpeg-location "${ffmpegDir}" ` +
      `-o "${output}" ` +
      `"https://www.youtube.com/watch?v=-uW5-TaVXu4"`,
      { encoding: 'utf8', timeout: 120000 }
    );

    // Find the downloaded file
    const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('test-segment'));
    expect(files.length).toBeGreaterThan(0);

    const filePath = path.join(tmpDir, files[0]);
    const stat = fs.statSync(filePath);
    expect(stat.size).toBeGreaterThan(10000); // At least 10KB for 5s of video
  });

  it('downloads audio only as mp3', () => {
    if (!ytDlp || !qjs || !ffmpeg) return;

    const ffmpegDir = path.dirname(ffmpeg!);
    const output = path.join(tmpDir, 'test-audio.%(ext)s');

    execSync(
      `"${ytDlp}" --js-runtimes "quickjs:${qjs}" ` +
      `-x --audio-format mp3 --audio-quality 0 ` +
      `--download-sections "*0:00-0:05" ` +
      `--force-overwrites --no-part ` +
      `--postprocessor-args "ffmpeg:-y" ` +
      `--ffmpeg-location "${ffmpegDir}" ` +
      `-o "${output}" ` +
      `"https://www.youtube.com/watch?v=-uW5-TaVXu4"`,
      { encoding: 'utf8', timeout: 120000 }
    );

    const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('test-audio'));
    expect(files.length).toBeGreaterThan(0);

    const filePath = path.join(tmpDir, files[0]);
    const stat = fs.statSync(filePath);
    expect(stat.size).toBeGreaterThan(5000); // At least 5KB for 5s of audio
  });

  it('cleans up test downloads', () => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
    expect(fs.existsSync(tmpDir)).toBe(false);
  });
});
