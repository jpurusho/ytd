import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

const isDev = !app.isPackaged;

function findInPath(binary: string): string | null {
  try {
    const result = execSync(`which ${binary}`, { encoding: 'utf-8' }).trim();
    if (result && fs.existsSync(result)) return result;
  } catch {}
  return null;
}

export function getYtDlpPath(): string {
  if (!isDev) {
    const bundled = path.join(process.resourcesPath, 'bin', 'yt-dlp');
    if (fs.existsSync(bundled)) return bundled;
  }

  const systemPath = findInPath('yt-dlp');
  if (systemPath) return systemPath;

  const commonPaths = [
    '/opt/homebrew/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
  ];
  for (const p of commonPaths) {
    if (fs.existsSync(p)) return p;
  }

  return 'yt-dlp';
}

export function getFfmpegPath(): string {
  if (!isDev) {
    const bundled = path.join(process.resourcesPath, 'bin', 'ffmpeg');
    if (fs.existsSync(bundled)) return bundled;
  }

  const systemPath = findInPath('ffmpeg');
  if (systemPath) return systemPath;

  const commonPaths = [
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
  ];
  for (const p of commonPaths) {
    if (fs.existsSync(p)) return p;
  }

  return 'ffmpeg';
}

export function checkToolsInstalled(): { ytDlp: { installed: boolean; path: string; version?: string }; ffmpeg: { installed: boolean; path: string; version?: string } } {
  const ytDlpPath = getYtDlpPath();
  const ffmpegPath = getFfmpegPath();

  let ytDlpVersion: string | undefined;
  let ffmpegVersion: string | undefined;

  try {
    ytDlpVersion = execSync(`"${ytDlpPath}" --version`, { encoding: 'utf-8' }).trim();
  } catch {}

  try {
    const output = execSync(`"${ffmpegPath}" -version`, { encoding: 'utf-8' });
    const match = output.match(/ffmpeg version (\S+)/);
    ffmpegVersion = match?.[1];
  } catch {}

  return {
    ytDlp: { installed: !!ytDlpVersion, path: ytDlpPath, version: ytDlpVersion },
    ffmpeg: { installed: !!ffmpegVersion, path: ffmpegPath, version: ffmpegVersion },
  };
}
