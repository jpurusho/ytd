import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Integration tests that simulate the PACKAGED APP environment:
 * - Only bundled binaries from bin/mac/ (no system fallbacks)
 * - Minimal PATH (no /opt/homebrew/bin, no deno, no node)
 * - Explicit --js-runtimes pointing to bundled qjs
 *
 * This ensures what works here will work on a fresh Mac with no dev tools.
 *
 * Tests are split into:
 * - "Binary/toolchain" tests: always pass in CI, verify packaging is correct
 * - "YouTube download" tests: may fail in CI due to bot detection on data center IPs,
 *   marked with allowFailure handling. These MUST pass locally before release.
 */

const TEST_VIDEOS = [
  { id: '-uW5-TaVXu4', url: 'https://www.youtube.com/watch?v=-uW5-TaVXu4', desc: 'video with dash in ID' },
  { id: '-QVoIxEpFkM', url: 'https://www.youtube.com/watch?v=-QVoIxEpFkM', desc: 'video requiring JS challenge' },
];

const BIN_DIR = path.join(__dirname, '..', 'bin', 'mac');
const ytDlpPath = path.join(BIN_DIR, 'yt-dlp');
const ffmpegPath = path.join(BIN_DIR, 'ffmpeg');
const ffprobePath = path.join(BIN_DIR, 'ffprobe');
const qjsPath = path.join(BIN_DIR, 'qjs');

// Minimal PATH that a packaged .app gets when launched from Finder
const PACKAGED_ENV = {
  HOME: process.env.HOME || '',
  TMPDIR: process.env.TMPDIR || '/tmp',
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
};

const isCI = process.env.CI === 'true';

function requireBinaries() {
  if (!fs.existsSync(BIN_DIR)) {
    throw new Error(`bin/mac/ not found. Run "npm run download-bins" first.`);
  }
}

/**
 * YouTube blocks data center IPs (GitHub Actions) with "Sign in to confirm you're not a bot".
 * This helper runs a yt-dlp command and distinguishes between:
 * - Bot detection (expected in CI, skip test)
 * - Actual failures (test should fail)
 */
function runYtDlp(args: string, opts?: { timeout?: number }): string {
  try {
    return execSync(args, {
      encoding: 'utf8',
      timeout: opts?.timeout || 60000,
      env: PACKAGED_ENV,
    });
  } catch (err: any) {
    const output = (err.stdout || '') + (err.stderr || '') + (err.message || '');
    const isBotBlock = output.includes('Sign in to confirm') ||
      output.includes('not a bot') ||
      output.includes('Video unavailable') ||
      // Empty output with exit code 1 in CI = YouTube silently rejected
      (isCI && !err.stdout && !err.stderr);
    if (isBotBlock && isCI) {
      throw new Error('YOUTUBE_BOT_BLOCK');
    }
    throw err;
  }
}

// ─── Binary availability (MUST pass in CI) ──────────────────────────────────

describe('Binary availability (bundled only)', () => {
  beforeAll(requireBinaries);

  it('yt-dlp binary exists and is executable', () => {
    expect(fs.existsSync(ytDlpPath)).toBe(true);
    const version = execSync(`"${ytDlpPath}" --version`, {
      encoding: 'utf8',
      env: PACKAGED_ENV,
    }).trim();
    expect(version).toMatch(/^\d{4}\.\d{2}\.\d{2}/);
  });

  it('ffmpeg binary exists and is executable', () => {
    expect(fs.existsSync(ffmpegPath)).toBe(true);
    const output = execSync(`"${ffmpegPath}" -version`, {
      encoding: 'utf8',
      env: PACKAGED_ENV,
    });
    expect(output).toContain('ffmpeg version');
  });

  it('ffprobe binary exists and is executable', () => {
    expect(fs.existsSync(ffprobePath)).toBe(true);
    const output = execSync(`"${ffprobePath}" -version`, {
      encoding: 'utf8',
      env: PACKAGED_ENV,
    });
    expect(output).toContain('ffprobe version');
  });

  it('quickjs (qjs) binary exists and is executable', () => {
    expect(fs.existsSync(qjsPath)).toBe(true);
    const output = execSync(`"${qjsPath}" --help 2>&1 || true`, {
      encoding: 'utf8',
      env: PACKAGED_ENV,
    });
    expect(output.toLowerCase()).toMatch(/quickjs|usage|qjs/);
  });

  it('binaries are arm64 on macOS', () => {
    if (process.platform !== 'darwin') return;
    for (const bin of [ytDlpPath, ffmpegPath, ffprobePath, qjsPath]) {
      const fileInfo = execSync(`file "${bin}"`, { encoding: 'utf8' });
      expect(fileInfo).toMatch(/arm64|universal/);
    }
  });

  it('yt-dlp recognizes quickjs runtime with minimal PATH', () => {
    // This doesn't hit YouTube — just verifies yt-dlp can load qjs
    const output = execSync(
      `"${ytDlpPath}" --js-runtimes "quickjs:${qjsPath}" --version 2>&1`,
      { encoding: 'utf8', env: PACKAGED_ENV }
    );
    expect(output.trim()).toMatch(/^\d{4}\.\d{2}\.\d{2}/);
  });

  it('yt-dlp lists quickjs in available runtimes', () => {
    const output = execSync(
      `"${ytDlpPath}" --js-runtimes "quickjs:${qjsPath}" -v --help 2>&1 | head -20`,
      { encoding: 'utf8', env: PACKAGED_ENV }
    );
    expect(output).toContain('quickjs');
  });
});

// ─── YouTube integration (may be blocked in CI) ─────────────────────────────

describe('yt-dlp JS runtime integration', () => {
  beforeAll(requireBinaries);

  it('yt-dlp uses bundled quickjs with no system JS runtimes available', () => {
    try {
      const output = runYtDlp(
        `"${ytDlpPath}" --js-runtimes "quickjs:${qjsPath}" -v --no-download --print "%(id)s" "https://www.youtube.com/watch?v=dQw4w9WgXcQ" 2>&1`,
        { timeout: 60000 }
      );
      expect(output).toContain('Solving JS challenges using quickjs');
      expect(output).toContain('dQw4w9WgXcQ');
    } catch (err: any) {
      if (err.message === 'YOUTUBE_BOT_BLOCK') {
        console.log('⚠️  Skipped: YouTube blocked CI IP (bot detection)');
        return;
      }
      throw err;
    }
  });

  it('yt-dlp finds bundled ffmpeg via --ffmpeg-location', () => {
    try {
      const output = runYtDlp(
        `"${ytDlpPath}" --js-runtimes "quickjs:${qjsPath}" --ffmpeg-location "${BIN_DIR}" -v --no-download --print "%(id)s" "https://www.youtube.com/watch?v=dQw4w9WgXcQ" 2>&1`,
        { timeout: 60000 }
      );
      expect(output).toContain('dQw4w9WgXcQ');
      expect(output).not.toContain('ffmpeg not found');
    } catch (err: any) {
      if (err.message === 'YOUTUBE_BOT_BLOCK') {
        console.log('⚠️  Skipped: YouTube blocked CI IP (bot detection)');
        return;
      }
      throw err;
    }
  });
});

describe('YouTube format extraction (packaged env)', () => {
  beforeAll(requireBinaries);

  for (const video of TEST_VIDEOS) {
    it(`extracts formats for ${video.desc} (${video.id})`, () => {
      try {
        const result = runYtDlp(
          `"${ytDlpPath}" --js-runtimes "quickjs:${qjsPath}" --ffmpeg-location "${BIN_DIR}" --dump-json --no-download "${video.url}"`,
          { timeout: 60000 }
        );
        // stdout may contain debug lines before JSON; extract the JSON object
        const jsonStart = result.indexOf('{');
        if (jsonStart === -1) throw new Error(`No JSON in output: ${result.slice(0, 200)}`);
        const info = JSON.parse(result.slice(jsonStart));
        expect(info.id).toBe(video.id);
        expect(info.title).toBeTruthy();
        expect(info.formats).toBeDefined();
        expect(info.formats.length).toBeGreaterThan(0);
      } catch (err: any) {
        if (err.message === 'YOUTUBE_BOT_BLOCK') {
          console.log('⚠️  Skipped: YouTube blocked CI IP (bot detection)');
          return;
        }
        throw err;
      }
    });
  }

  it('format string with resolution fallback works', () => {
    try {
      const result = runYtDlp(
        `"${ytDlpPath}" --js-runtimes "quickjs:${qjsPath}" --ffmpeg-location "${BIN_DIR}" ` +
        `-f "bestvideo[height<=1080]+bestaudio/bestvideo+bestaudio/best[height<=1080]/best" ` +
        `--no-download --print "%(format)s" "https://www.youtube.com/watch?v=-uW5-TaVXu4" 2>&1`,
        { timeout: 60000 }
      );
      expect(result.trim()).toBeTruthy();
      expect(result.trim()).not.toContain('ERROR');
    } catch (err: any) {
      if (err.message === 'YOUTUBE_BOT_BLOCK') {
        console.log('⚠️  Skipped: YouTube blocked CI IP (bot detection)');
        return;
      }
      throw err;
    }
  });

  it('mp3 extraction format string works', () => {
    try {
      const result = runYtDlp(
        `"${ytDlpPath}" --js-runtimes "quickjs:${qjsPath}" --ffmpeg-location "${BIN_DIR}" ` +
        `-x --audio-format mp3 --audio-quality 0 ` +
        `--no-download --print "%(format)s" "https://www.youtube.com/watch?v=-uW5-TaVXu4" 2>&1`,
        { timeout: 60000 }
      );
      expect(result.trim()).toBeTruthy();
    } catch (err: any) {
      if (err.message === 'YOUTUBE_BOT_BLOCK') {
        console.log('⚠️  Skipped: YouTube blocked CI IP (bot detection)');
        return;
      }
      throw err;
    }
  });
});

describe('Download integration (packaged env)', () => {
  const tmpDir = path.join(__dirname, '..', 'tmp-test-downloads');

  beforeAll(() => {
    requireBinaries();
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  });

  it('downloads a short segment (5 seconds) as mp4', () => {
    const output = path.join(tmpDir, 'test-segment.%(ext)s');

    try {
      runYtDlp(
        `"${ytDlpPath}" --js-runtimes "quickjs:${qjsPath}" --ffmpeg-location "${BIN_DIR}" ` +
        `-f "bestvideo[height<=480]+bestaudio/best[height<=480]/best" ` +
        `--merge-output-format mp4 ` +
        `--download-sections "*0:00-0:05" ` +
        `--force-overwrites --no-part ` +
        `--postprocessor-args "ffmpeg:-y" ` +
        `-o "${output}" ` +
        `"https://www.youtube.com/watch?v=-uW5-TaVXu4"`,
        { timeout: 120000 }
      );
    } catch (err: any) {
      if (err.message === 'YOUTUBE_BOT_BLOCK') {
        console.log('⚠️  Skipped: YouTube blocked CI IP (bot detection)');
        return;
      }
      throw err;
    }

    const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('test-segment'));
    expect(files.length).toBeGreaterThan(0);

    const filePath = path.join(tmpDir, files[0]);
    const stat = fs.statSync(filePath);
    expect(stat.size).toBeGreaterThan(10000);
  });

  it('downloads audio only as mp3', () => {
    const output = path.join(tmpDir, 'test-audio.%(ext)s');

    try {
      runYtDlp(
        `"${ytDlpPath}" --js-runtimes "quickjs:${qjsPath}" --ffmpeg-location "${BIN_DIR}" ` +
        `-x --audio-format mp3 --audio-quality 0 ` +
        `--download-sections "*0:00-0:05" ` +
        `--force-overwrites --no-part ` +
        `--postprocessor-args "ffmpeg:-y" ` +
        `-o "${output}" ` +
        `"https://www.youtube.com/watch?v=-uW5-TaVXu4"`,
        { timeout: 120000 }
      );
    } catch (err: any) {
      if (err.message === 'YOUTUBE_BOT_BLOCK') {
        console.log('⚠️  Skipped: YouTube blocked CI IP (bot detection)');
        return;
      }
      throw err;
    }

    const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('test-audio'));
    expect(files.length).toBeGreaterThan(0);

    const filePath = path.join(tmpDir, files[0]);
    const stat = fs.statSync(filePath);
    expect(stat.size).toBeGreaterThan(5000);
  });

  it('downloads video with dash-prefixed ID', () => {
    const output = path.join(tmpDir, 'test-dash-id.%(ext)s');

    try {
      runYtDlp(
        `"${ytDlpPath}" --js-runtimes "quickjs:${qjsPath}" --ffmpeg-location "${BIN_DIR}" ` +
        `-f "bestvideo[height<=480]+bestaudio/best[height<=480]/best" ` +
        `--merge-output-format mp4 ` +
        `--download-sections "*0:00-0:05" ` +
        `--force-overwrites --no-part ` +
        `--postprocessor-args "ffmpeg:-y" ` +
        `-o "${output}" ` +
        `"https://www.youtube.com/watch?v=-QVoIxEpFkM"`,
        { timeout: 120000 }
      );
    } catch (err: any) {
      if (err.message === 'YOUTUBE_BOT_BLOCK') {
        console.log('⚠️  Skipped: YouTube blocked CI IP (bot detection)');
        return;
      }
      throw err;
    }

    const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('test-dash-id'));
    expect(files.length).toBeGreaterThan(0);

    const filePath = path.join(tmpDir, files[0]);
    const stat = fs.statSync(filePath);
    expect(stat.size).toBeGreaterThan(10000);
  });

  it('cleans up test downloads', () => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
    expect(fs.existsSync(tmpDir)).toBe(false);
  });
});
