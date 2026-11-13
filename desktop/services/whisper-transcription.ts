/**
 * Whisper transcription service
 * Supports both local Python Whisper and OpenAI API
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import { logger } from './logger';
import type { TranscriptSegment, TranscriptOptions } from '../../shared/types';

export interface TranscriptionResult {
  text: string;
  segments: TranscriptSegment[];
  language: string;
  duration: number;
}

export interface TranscriptionProgress {
  percent: number;
  message: string;
}

export class WhisperTranscriptionService {
  private activeTranscriptions: Map<string, any> = new Map();

  /**
   * Get enhanced PATH with Homebrew directories
   * Standard practice: extend PATH to include common installation locations
   */
  private getEnhancedEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    const brewPaths = [
      '/opt/homebrew/bin',  // Apple Silicon Homebrew
      '/usr/local/bin',     // Intel Mac Homebrew
    ];

    // Add Homebrew paths to PATH if not already present
    const currentPath = env.PATH || '';
    const pathsToAdd = brewPaths.filter(p => !currentPath.includes(p));

    if (pathsToAdd.length > 0) {
      env.PATH = `${pathsToAdd.join(':')}:${currentPath}`;
    }

    return env;
  }

  /**
   * Check if whisper CLI is available
   */
  private async findWhisperPath(): Promise<string | null> {
    const env = this.getEnhancedEnv();

    const pathAvailable = await new Promise<boolean>((resolve) => {
      const check = spawn('which', ['whisper'], { env });
      check.on('close', (code: number) => resolve(code === 0));
      check.on('error', () => resolve(false));
    });

    return pathAvailable ? 'whisper' : null;
  }

  /**
   * Transcribe audio file using Whisper
   */
  async transcribe(
    videoId: string,
    audioPath: string,
    options: TranscriptOptions = {},
    onProgress?: (progress: TranscriptionProgress) => void
  ): Promise<TranscriptionResult> {
    const { method = 'whisper-local', model = 'base', language } = options;

    logger.info(`[Whisper] Starting transcription for ${videoId}`, {
      audioPath,
      method,
      model,
      language,
    });

    if (method === 'whisper-api') {
      return this.transcribeWithAPI(audioPath, model, language, onProgress);
    } else {
      return this.transcribeWithLocal(videoId, audioPath, model, language, onProgress);
    }
  }

  /**
   * Transcribe using local Whisper (CLI or Python module)
   */
  private async transcribeWithLocal(
    videoId: string,
    audioPath: string,
    model: string,
    language: string | undefined,
    onProgress?: (progress: TranscriptionProgress) => void
  ): Promise<TranscriptionResult> {
    // Validate audio file exists
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    // Find whisper binary (checks Homebrew paths + PATH)
    const whisperPath = await this.findWhisperPath();

    return new Promise((resolve, reject) => {
      let command: string;
      let args: string[];

      if (whisperPath) {
        // Use whisper CLI (brew install or in PATH)
        command = whisperPath;
        args = [
          audioPath,
          '--model', model,
          '--output_format', 'json',
          '--output_dir', '/tmp',
          '--fp16', 'False', // Use FP32 for CPU compatibility
        ];
        logger.debug(`[Whisper] Using CLI: ${command} ${args.join(' ')}`);
      } else {
        // Use Python module (pip install)
        command = 'python3';
        args = [
          '-m', 'whisper',
          audioPath,
          '--model', model,
          '--output_format', 'json',
          '--output_dir', '/tmp',
          '--fp16', 'False',
        ];
        logger.debug(`[Whisper] Using Python module: python3 ${args.join(' ')}`);
      }

      if (language) {
        args.push('--language', language);
      }

      const whisperProcess = spawn(command, args, { env: this.getEnhancedEnv() });
      this.activeTranscriptions.set(videoId, whisperProcess);

      let stdoutData = '';
      let stderrData = '';

      whisperProcess.stdout.on('data', (data: Buffer) => {
        stdoutData += data.toString();
      });

      whisperProcess.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        stderrData += text;

        // Parse progress from stderr
        if (onProgress) {
          // Whisper outputs progress like: "100%|██████████| 1234/1234 [00:05<00:00, 245.67it/s]"
          const progressMatch = text.match(/(\d+)%/);
          if (progressMatch) {
            const percent = parseInt(progressMatch[1], 10);
            onProgress({
              percent,
              message: `Processing (${percent}%)`,
            });
          }
        }
      });

      whisperProcess.on('close', (code: number) => {
        this.activeTranscriptions.delete(videoId);

        if (code === 0) {
          try {
            // Read the generated JSON file
            const baseName = audioPath.replace(/\.[^/.]+$/, ''); // Remove extension
            const jsonPath = `/tmp/${baseName.split('/').pop()}.json`;

            if (!fs.existsSync(jsonPath)) {
              throw new Error(`Whisper output file not found: ${jsonPath}`);
            }

            const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
            const whisperOutput = JSON.parse(jsonContent);

            // Clean up JSON file
            fs.unlinkSync(jsonPath);

            const result: TranscriptionResult = {
              text: whisperOutput.text || '',
              segments: (whisperOutput.segments || []).map((seg: any) => ({
                start: seg.start,
                end: seg.end,
                text: seg.text.trim(),
              })),
              language: whisperOutput.language || language || 'en',
              duration: whisperOutput.segments?.[whisperOutput.segments.length - 1]?.end || 0,
            };

            logger.info(`[Whisper] Completed transcription for ${videoId}`, {
              textLength: result.text.length,
              segmentCount: result.segments.length,
              language: result.language,
              duration: result.duration,
            });

            resolve(result);
          } catch (error) {
            const err = error as Error;
            logger.error(`[Whisper] Failed to parse output for ${videoId}`, { error: err });
            reject(new Error(`Failed to parse Whisper output: ${err.message}`));
          }
        } else {
          const error = new Error(`Python/Whisper exited with code ${code}\\n${stderrData}`);
          logger.error(`[Whisper] Failed transcription for ${videoId}`, {
            code,
            stderr: stderrData,
          });
          reject(error);
        }
      });

      whisperProcess.on('error', (error: Error) => {
        this.activeTranscriptions.delete(videoId);
        logger.error(`[Whisper] Error spawning Whisper for ${videoId}`, { error });
        reject(new Error(`Failed to start Whisper: ${error.message}`));
      });
    });
  }

  /**
   * Transcribe using OpenAI Whisper API
   */
  private async transcribeWithAPI(
    audioPath: string,
    model: string,
    language: string | undefined,
    onProgress?: (progress: TranscriptionProgress) => void
  ): Promise<TranscriptionResult> {
    // Check for API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable not set');
    }

    onProgress?.({ percent: 0, message: 'Uploading to OpenAI...' });

    try {
      // Read audio file
      const audioBuffer = fs.readFileSync(audioPath);

      // Create form data
      const formData = new FormData();
      const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
      formData.append('file', audioBlob, 'audio.wav');
      formData.append('model', 'whisper-1'); // OpenAI only has one model
      formData.append('response_format', 'verbose_json'); // Get segments
      if (language) {
        formData.append('language', language);
      }

      onProgress?.({ percent: 50, message: 'Processing...' });

      // Call OpenAI API
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
      }

      const result = await response.json() as any;

      onProgress?.({ percent: 100, message: 'Complete' });

      logger.info(`[Whisper API] Completed transcription`, {
        textLength: result.text?.length,
        segmentCount: result.segments?.length,
        language: result.language,
        duration: result.duration,
      });

      return {
        text: result.text || '',
        segments: (result.segments || []).map((seg: any) => ({
          start: seg.start,
          end: seg.end,
          text: seg.text.trim(),
        })),
        language: result.language || language || 'en',
        duration: result.duration || 0,
      };
    } catch (error) {
      const err = error as Error;
      logger.error(`[Whisper API] Transcription failed`, { error: err });
      throw new Error(`OpenAI API transcription failed: ${err.message}`);
    }
  }

  /**
   * Cancel an active transcription
   */
  cancel(videoId: string): boolean {
    const process = this.activeTranscriptions.get(videoId);
    if (process) {
      process.kill('SIGTERM');
      this.activeTranscriptions.delete(videoId);
      logger.info(`[Whisper] Cancelled transcription for ${videoId}`);
      return true;
    }
    return false;
  }

  /**
   * Check if transcription is active for a video
   */
  isTranscribing(videoId: string): boolean {
    return this.activeTranscriptions.has(videoId);
  }

  /**
   * Check if Python and Whisper are available
   */
  async checkLocalWhisperAvailable(): Promise<boolean> {
    const env = this.getEnhancedEnv();

    // Check if whisper CLI is available (brew install)
    const cliAvailable = await new Promise<boolean>((resolve) => {
      const whisperCmd = spawn('which', ['whisper'], { env });
      whisperCmd.on('close', (code: number) => resolve(code === 0));
      whisperCmd.on('error', () => resolve(false));
    });

    if (cliAvailable) {
      logger.debug('[Whisper] Found whisper CLI (brew install)');
      return true;
    }

    // Fall back to Python module check (pip install)
    return new Promise((resolve) => {
      const python = spawn('python3', ['-c', 'import whisper; print("OK")'], { env });
      let stdout = '';

      python.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      python.on('close', (code: number) => {
        const available = code === 0 && stdout.includes('OK');
        if (available) {
          logger.debug('[Whisper] Found whisper Python module (pip install)');
        }
        resolve(available);
      });

      python.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Check if OpenAI API key is configured
   */
  checkAPIKeyConfigured(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }
}

// Singleton instance
export const whisperService = new WhisperTranscriptionService();
