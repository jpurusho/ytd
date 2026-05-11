import { spawn, ChildProcess, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { getYtDlpPath, getFfmpegPath } from './tool-paths';
import { getSetting } from './database';
import type { QueueItem, FormatInfo } from '../../shared/types';

export interface DownloadJob {
  queueId: number;
  process: ChildProcess;
  status: 'downloading' | 'paused';
}

interface ProgressData {
  progress: number;
  speed: string;
  eta: string;
  downloadedBytes: number;
  totalBytes: number;
}

const NON_DOWNLOADABLE_ERRORS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /Video unavailable/, message: 'This video is unavailable (deleted or private)' },
  { pattern: /Sign in to confirm your age/, message: 'Age-restricted video — requires authentication' },
  { pattern: /members.only/i, message: 'This is a members-only video' },
  { pattern: /This live event will begin/, message: 'This is an upcoming live stream, not yet available' },
  { pattern: /Premieres in/, message: 'This video has not premiered yet' },
  { pattern: /DRM/i, message: 'This video is DRM-protected and cannot be downloaded' },
  { pattern: /copyright/i, message: 'This video is blocked due to copyright' },
  { pattern: /geo.restricted|not available in your country/i, message: 'This video is geo-restricted in your region' },
  { pattern: /Private video/i, message: 'This is a private video' },
  { pattern: /This video has been removed/i, message: 'This video has been removed' },
  { pattern: /HTTP Error 403/i, message: 'Access denied — video may require authentication' },
  { pattern: /HTTP Error 404/i, message: 'Video not found' },
];

export class DownloadEngine {
  private activeJobs: Map<number, DownloadJob> = new Map();
  private onProgress: ((queueId: number, data: ProgressData) => void) | null = null;
  private onComplete: ((queueId: number, filePath: string, fileSize: number) => void) | null = null;
  private onError: ((queueId: number, error: string) => void) | null = null;

  setCallbacks(callbacks: {
    onProgress: (queueId: number, data: ProgressData) => void;
    onComplete: (queueId: number, filePath: string, fileSize: number) => void;
    onError: (queueId: number, error: string) => void;
  }): void {
    this.onProgress = callbacks.onProgress;
    this.onComplete = callbacks.onComplete;
    this.onError = callbacks.onError;
  }

  startDownload(item: QueueItem): void {
    const outputDir = getSetting('output_dir') || path.join(require('os').homedir(), 'Downloads');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const args = this.buildCommand(item, outputDir);
    const ytDlpPath = getYtDlpPath();

    console.log(`[download] Command: ${ytDlpPath} ${args.join(' ')}`);

    const proc = spawn(ytDlpPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    });

    const job: DownloadJob = { queueId: item.id, process: proc, status: 'downloading' };
    this.activeJobs.set(item.id, job);

    let stderrBuffer = '';
    let outputFilePath = '';

    proc.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        const trimmed = line.trim();

        // Parse progress from yt-dlp output
        const progressMatch = trimmed.match(/(\d+\.?\d*)%/);
        const speedMatch = trimmed.match(/at\s+(\S+)/);
        const etaMatch = trimmed.match(/ETA\s+(\S+)/);

        if (progressMatch) {
          const progress = parseFloat(progressMatch[1]);
          const speed = speedMatch?.[1] || '';
          const eta = etaMatch?.[1] || '';

          this.onProgress?.(item.id, {
            progress,
            speed,
            eta,
            downloadedBytes: 0,
            totalBytes: 0,
          });
        }

        // Detect output file path from various yt-dlp log patterns
        const destMatch = trimmed.match(/\[(?:download|Merger)\].*?Destination:\s*(.+)/);
        const mergeMatch = trimmed.match(/\[Merger\]\s*Merging formats into "(.+)"/);
        const extractMatch = trimmed.match(/\[ExtractAudio\]\s*Destination:\s*(.+)/);
        const postMatch = trimmed.match(/\[(?:ExtractAudio|ffmpeg)\].*?(?:Destination|Not converting):\s*(.+)/);

        if (mergeMatch) {
          outputFilePath = mergeMatch[1];
        } else if (extractMatch) {
          outputFilePath = extractMatch[1];
        } else if (postMatch) {
          outputFilePath = postMatch[1];
        } else if (destMatch) {
          outputFilePath = destMatch[1];
        }

        // Already downloaded detection
        if (trimmed.includes('has already been downloaded')) {
          const alreadyMatch = trimmed.match(/\[download\]\s*(.+?)\s*has already been downloaded/);
          if (alreadyMatch) outputFilePath = alreadyMatch[1];
        }
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderrBuffer += text;

      // yt-dlp sometimes logs destination on stderr
      const stderrDest = text.match(/\[ExtractAudio\]\s*Destination:\s*(.+)/);
      if (stderrDest) outputFilePath = stderrDest[1].trim();
    });

    proc.on('close', (code) => {
      this.activeJobs.delete(item.id);

      if (code === 0) {
        // If we didn't capture the path, try to find the file in output dir
        if (!outputFilePath || !fs.existsSync(outputFilePath)) {
          const outputDir = getSetting('output_dir') || path.join(require('os').homedir(), 'Downloads');
          const ext = item.format === 'mp3' ? '.mp3' : `.${item.format}`;
          try {
            const files = fs.readdirSync(outputDir)
              .filter((f: string) => f.endsWith(ext))
              .map((f: string) => ({ name: f, time: fs.statSync(path.join(outputDir, f)).mtimeMs }))
              .sort((a: any, b: any) => b.time - a.time);
            if (files.length > 0) {
              outputFilePath = path.join(outputDir, files[0].name);
            }
          } catch {}
        }

        let fileSize = 0;
        if (outputFilePath && fs.existsSync(outputFilePath)) {
          fileSize = fs.statSync(outputFilePath).size;
        }
        this.onComplete?.(item.id, outputFilePath, fileSize);
      } else {
        console.error(`[download] yt-dlp exited with code ${code} for queue ${item.id}:\n${stderrBuffer}`);
        const errorMsg = this.classifyError(stderrBuffer);
        this.onError?.(item.id, errorMsg);
      }
    });

    proc.on('error', (err) => {
      this.activeJobs.delete(item.id);
      this.onError?.(item.id, `Failed to start yt-dlp: ${err.message}`);
    });
  }

  /**
   * Get all child PIDs of a process on macOS/Linux using pgrep.
   * Returns the parent PID plus all descendant PIDs.
   */
  private getProcessTree(pid: number): number[] {
    const pids = [pid];
    try {
      // pgrep -P finds direct children; we recurse to find entire tree
      const output = execSync(`pgrep -P ${pid}`, { encoding: 'utf8', timeout: 3000 });
      const children = output.trim().split('\n').map(Number).filter(n => n > 0);
      for (const child of children) {
        pids.push(...this.getProcessTree(child));
      }
    } catch {
      // pgrep returns exit code 1 if no children found — that's fine
    }
    return pids;
  }

  /**
   * Send a signal to a process and all its children.
   * Uses the system `kill` command which is more reliable than Node's process.kill
   * on macOS, especially for process groups and SIGSTOP/SIGCONT.
   */
  private signalTree(pid: number, signal: string): boolean {
    const pids = this.getProcessTree(pid);
    try {
      // Use system kill command — more reliable than Node's process.kill for SIGSTOP
      execSync(`kill -${signal} ${pids.join(' ')}`, { timeout: 3000 });
      return true;
    } catch {
      // Fallback: try each individually
      let success = false;
      for (const p of pids) {
        try {
          execSync(`kill -${signal} ${p}`, { timeout: 2000 });
          success = true;
        } catch {}
      }
      return success;
    }
  }

  pauseDownload(queueId: number): boolean {
    const job = this.activeJobs.get(queueId);
    if (!job || job.status !== 'downloading') return false;

    const pid = job.process.pid;
    if (!pid) return false;

    const success = this.signalTree(pid, 'STOP');
    if (success) {
      job.status = 'paused';
    }
    return success;
  }

  resumeDownload(queueId: number): boolean {
    const job = this.activeJobs.get(queueId);
    if (!job || job.status !== 'paused') return false;

    const pid = job.process.pid;
    if (!pid) return false;

    const success = this.signalTree(pid, 'CONT');
    if (success) {
      job.status = 'downloading';
    }
    return success;
  }

  cancelDownload(queueId: number): void {
    const job = this.activeJobs.get(queueId);
    if (!job) return;

    const pid = job.process.pid;
    if (!pid) {
      this.activeJobs.delete(queueId);
      return;
    }

    // If paused, resume first so the process can respond to TERM
    if (job.status === 'paused') {
      this.signalTree(pid, 'CONT');
    }

    // Kill entire process tree with SIGTERM, then SIGKILL as fallback
    const killed = this.signalTree(pid, 'TERM');
    if (!killed) {
      try { job.process.kill('SIGKILL'); } catch {}
    }

    // Give a moment then force-kill any stragglers
    setTimeout(() => {
      try {
        const remaining = this.getProcessTree(pid);
        if (remaining.length > 0) {
          execSync(`kill -9 ${remaining.join(' ')}`, { timeout: 2000 });
        }
      } catch {}
    }, 500);

    this.activeJobs.delete(queueId);
  }

  isActive(queueId: number): boolean {
    return this.activeJobs.has(queueId);
  }

  getActiveCount(): number {
    return this.activeJobs.size;
  }

  private buildCommand(item: QueueItem, outputDir: string): string[] {
    const isSegment = !!(item.startTime || item.endTime);

    // For segment downloads, use a unique filename that includes the time range
    // to avoid ffmpeg "file already exists" errors (exit code 183).
    // --force-overwrites tells yt-dlp to overwrite, but ffmpeg subprocess also needs -y.
    // --no-part prevents .part temp files that cause conflicts on retry.
    let outputTemplate: string;
    if (isSegment) {
      const startTag = (item.startTime || '0').replace(/:/g, '.');
      const endTag = (item.endTime || 'end').replace(/:/g, '.');
      outputTemplate = path.join(outputDir, `%(title)s [${startTag}-${endTag}].%(ext)s`);
    } else {
      outputTemplate = path.join(outputDir, '%(title)s.%(ext)s');
    }

    const args: string[] = [
      '--newline',
      '--no-colors',
      '--merge-output-format', item.format === 'mp3' ? 'mp4' : item.format,
      // Segment downloads: --force-overwrites so ffmpeg can overwrite intermediates,
      // --no-part avoids .part file conflicts. Full downloads: resume safely.
      ...(isSegment ? ['--force-overwrites', '--no-part'] : ['--continue', '--no-overwrites']),
      '-o', outputTemplate,
    ];

    // Resolution/quality selection
    if (item.format === 'mp3') {
      args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
    } else if (item.resolution) {
      args.push('-f', `bestvideo[height<=${item.resolution}]+bestaudio/best[height<=${item.resolution}]`);
    } else {
      args.push('-f', 'bestvideo+bestaudio/best');
    }

    // Time range segment extraction
    if (isSegment) {
      const start = item.startTime || '0';
      const end = item.endTime || 'inf';
      args.push('--download-sections', `*${start}-${end}`);
      // Pass -y to ffmpeg so it overwrites without prompting
      args.push('--postprocessor-args', 'ffmpeg:-y');
    }

    // Tell yt-dlp where ffmpeg is
    const ffmpegPath = getFfmpegPath();
    const ffmpegDir = path.dirname(ffmpegPath);
    args.push('--ffmpeg-location', ffmpegDir);

    // Browser cookies for authenticated downloads
    const useCookies = getSetting('use_browser_cookies');
    const cookieBrowser = getSetting('cookie_browser') || 'chrome';
    if (useCookies === 'true') {
      args.push('--cookies-from-browser', cookieBrowser);
    }

    args.push(item.url);
    return args;
  }

  private classifyError(stderr: string): string {
    for (const { pattern, message } of NON_DOWNLOADABLE_ERRORS) {
      if (pattern.test(stderr)) return message;
    }
    if (/ffmpeg exited with code/i.test(stderr)) {
      return 'ffmpeg failed while processing the video. If downloading a segment, try a slightly different start/end time, or retry the download.';
    }
    // Return last meaningful line from stderr
    const lines = stderr.trim().split('\n').filter(l => l.trim());
    const lastLine = lines[lines.length - 1] || 'Unknown error';
    return lastLine.replace(/^ERROR:\s*/i, '');
  }
}

export async function getAvailableFormats(url: string): Promise<FormatInfo[]> {
  const ytDlpPath = getYtDlpPath();

  return new Promise((resolve, reject) => {
    const proc = spawn(ytDlpPath, ['--dump-json', '--no-download', url], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || 'Failed to get video formats'));
        return;
      }

      try {
        const info = JSON.parse(stdout);
        const formats: FormatInfo[] = (info.formats || [])
          .filter((f: any) => f.vcodec !== 'none' || f.acodec !== 'none')
          .map((f: any) => ({
            formatId: f.format_id || '',
            ext: f.ext || '',
            resolution: f.resolution || (f.height ? `${f.height}p` : 'audio'),
            fps: f.fps || 0,
            vcodec: f.vcodec || 'none',
            acodec: f.acodec || 'none',
            filesize: f.filesize || f.filesize_approx || null,
            qualityLabel: f.format_note || f.resolution || '',
          }));

        // Deduplicate by resolution and return unique options
        const seen = new Set<string>();
        const unique = formats.filter((f: FormatInfo) => {
          const key = `${f.resolution}-${f.ext}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        resolve(unique);
      } catch (err) {
        reject(new Error('Failed to parse video format information'));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to run yt-dlp: ${err.message}`));
    });

    setTimeout(() => {
      proc.kill();
      reject(new Error('Format detection timed out'));
    }, 30000);
  });
}
