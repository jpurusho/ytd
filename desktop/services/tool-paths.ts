import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const isDev = !app.isPackaged;

function findInPath(binary: string): string | null {
  try {
    const result = execSync(`which ${binary}`, { encoding: 'utf-8' }).trim();
    if (result && fs.existsSync(result)) return result;
  } catch {}
  return null;
}

const platformBinDir = process.platform === 'darwin' ? 'mac' : 'linux';

export function getYtDlpPath(): string {
  if (!isDev) {
    const bundled = path.join(process.resourcesPath, 'bin', 'yt-dlp');
    if (fs.existsSync(bundled)) return bundled;
  }

  const devBundled = path.join(app.getAppPath(), 'bin', platformBinDir, 'yt-dlp');
  if (fs.existsSync(devBundled)) return devBundled;

  const systemPath = findInPath('yt-dlp');
  if (systemPath) return systemPath;

  for (const p of ['/opt/homebrew/bin/yt-dlp', '/usr/local/bin/yt-dlp']) {
    if (fs.existsSync(p)) return p;
  }

  return 'yt-dlp';
}

export function getFfmpegPath(): string {
  if (!isDev) {
    const bundled = path.join(process.resourcesPath, 'bin', 'ffmpeg');
    if (fs.existsSync(bundled)) return bundled;
  }

  const devBundled = path.join(app.getAppPath(), 'bin', platformBinDir, 'ffmpeg');
  if (fs.existsSync(devBundled)) return devBundled;

  const systemPath = findInPath('ffmpeg');
  if (systemPath) return systemPath;

  for (const p of ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']) {
    if (fs.existsSync(p)) return p;
  }

  return 'ffmpeg';
}

type ToolStatus = { installed: boolean; path: string; version?: string };
type ToolsResult = { ytDlp: ToolStatus; ffmpeg: ToolStatus };

let toolsCache: ToolsResult | null = null;

export async function checkToolsInstalled(): Promise<ToolsResult> {
  if (toolsCache) return toolsCache;

  const ytDlpPath = getYtDlpPath();
  const ffmpegPath = getFfmpegPath();

  const [ytDlpVersion, ffmpegVersion] = await Promise.all([
    execAsync(`"${ytDlpPath}" --version`).then(({ stdout }) => stdout.trim()).catch(() => undefined),
    execAsync(`"${ffmpegPath}" -version`).then(({ stdout }) => stdout.match(/ffmpeg version (\S+)/)?.[1]).catch(() => undefined),
  ]);

  toolsCache = {
    ytDlp: { installed: !!ytDlpVersion, path: ytDlpPath, version: ytDlpVersion },
    ffmpeg: { installed: !!ffmpegVersion, path: ffmpegPath, version: ffmpegVersion },
  };
  return toolsCache;
}
