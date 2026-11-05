/**
 * Audio extraction service using ffmpeg
 * Extracts audio from video files for transcription
 */
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { logger } from './logger';

export interface AudioExtractionOptions {
  videoPath: string;
  outputPath?: string;
  sampleRate?: number; // Whisper works best with 16000 Hz
  channels?: number; // Mono (1) is enough for transcription
  format?: 'wav' | 'mp3';
}

export interface AudioExtractionProgress {
  percent: number;
  timeProcessed: number;
  totalDuration: number;
}

export class AudioExtractionService {
  private activeExtractions: Map<string, any> = new Map();

  /**
   * Extract audio from video file
   * Returns the path to the extracted audio file
   */
  async extractAudio(
    videoId: string,
    options: AudioExtractionOptions,
    onProgress?: (progress: AudioExtractionProgress) => void
  ): Promise<string> {
    const {
      videoPath,
      outputPath,
      sampleRate = 16000,
      channels = 1,
      format = 'wav'
    } = options;

    // Validate input file exists
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    // Generate output path if not provided
    const finalOutputPath = outputPath || this.generateTempAudioPath(videoId, format);

    // Ensure output directory exists
    const outputDir = path.dirname(finalOutputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    logger.info(`[AudioExtraction] Starting extraction for ${videoId}`, {
      videoPath,
      outputPath: finalOutputPath,
      sampleRate,
      channels,
      format,
    });

    return new Promise((resolve, reject) => {
      // ffmpeg command: extract audio, convert to mono, resample
      const args = [
        '-i', videoPath,
        '-vn', // No video
        '-acodec', format === 'wav' ? 'pcm_s16le' : 'libmp3lame',
        '-ar', String(sampleRate), // Sample rate
        '-ac', String(channels), // Audio channels (1 = mono)
        '-y', // Overwrite output file
        finalOutputPath
      ];

      logger.debug(`[AudioExtraction] ffmpeg command: ffmpeg ${args.join(' ')}`);

      const ffmpeg = spawn('ffmpeg', args);
      this.activeExtractions.set(videoId, ffmpeg);

      let stderrData = '';
      let duration: number | null = null;

      ffmpeg.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        stderrData += text;

        // Parse duration from ffmpeg output
        if (!duration) {
          const durationMatch = text.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
          if (durationMatch) {
            const hours = parseInt(durationMatch[1], 10);
            const minutes = parseInt(durationMatch[2], 10);
            const seconds = parseFloat(durationMatch[3]);
            duration = hours * 3600 + minutes * 60 + seconds;
          }
        }

        // Parse progress
        if (onProgress && duration) {
          const timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
          if (timeMatch) {
            const hours = parseInt(timeMatch[1], 10);
            const minutes = parseInt(timeMatch[2], 10);
            const seconds = parseFloat(timeMatch[3]);
            const currentTime = hours * 3600 + minutes * 60 + seconds;
            const percent = Math.min((currentTime / duration) * 100, 100);

            onProgress({
              percent,
              timeProcessed: currentTime,
              totalDuration: duration,
            });
          }
        }
      });

      ffmpeg.on('close', (code: number) => {
        this.activeExtractions.delete(videoId);

        if (code === 0) {
          logger.info(`[AudioExtraction] Completed extraction for ${videoId}`, {
            outputPath: finalOutputPath,
            fileSize: fs.statSync(finalOutputPath).size,
          });
          resolve(finalOutputPath);
        } else {
          const error = new Error(`ffmpeg exited with code ${code}\\n${stderrData}`);
          logger.error(`[AudioExtraction] Failed extraction for ${videoId}`, {
            code,
            stderr: stderrData,
          });
          reject(error);
        }
      });

      ffmpeg.on('error', (error: Error) => {
        this.activeExtractions.delete(videoId);
        logger.error(`[AudioExtraction] Error spawning ffmpeg for ${videoId}`, { error });
        reject(new Error(`Failed to start ffmpeg: ${error.message}`));
      });
    });
  }

  /**
   * Cancel an active audio extraction
   */
  cancel(videoId: string): boolean {
    const process = this.activeExtractions.get(videoId);
    if (process) {
      process.kill('SIGTERM');
      this.activeExtractions.delete(videoId);
      logger.info(`[AudioExtraction] Cancelled extraction for ${videoId}`);
      return true;
    }
    return false;
  }

  /**
   * Check if audio extraction is active for a video
   */
  isExtracting(videoId: string): boolean {
    return this.activeExtractions.has(videoId);
  }

  /**
   * Generate temporary audio file path
   */
  private generateTempAudioPath(videoId: string, format: string): string {
    const tempDir = path.join(os.tmpdir(), 'ytd-audio');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    return path.join(tempDir, `audio-${videoId}.${format}`);
  }

  /**
   * Clean up temporary audio file
   */
  cleanupTempAudio(audioPath: string): void {
    try {
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
        logger.debug(`[AudioExtraction] Cleaned up temp audio: ${audioPath}`);
      }
    } catch (error) {
      logger.warn(`[AudioExtraction] Failed to cleanup temp audio: ${audioPath}`, { error });
    }
  }

  /**
   * Check if ffmpeg is available
   */
  async checkFfmpegAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const ffmpeg = spawn('ffmpeg', ['-version']);
      ffmpeg.on('close', (code: number) => {
        resolve(code === 0);
      });
      ffmpeg.on('error', () => {
        resolve(false);
      });
    });
  }
}

// Singleton instance
export const audioExtractionService = new AudioExtractionService();
