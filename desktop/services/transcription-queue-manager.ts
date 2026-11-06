/**
 * Transcription Queue Manager
 * Orchestrates audio extraction and Whisper transcription
 */
import { BrowserWindow } from 'electron';
import * as path from 'path';
import { audioExtractionService } from './audio-extraction';
import { whisperService } from './whisper-transcription';
import { logger } from './logger';
import {
  createTranscript,
  getTranscript,
  updateTranscript,
  getLibraryItem,
  resolveFilePath,
} from './database';
import type { TranscriptOptions } from '../../shared/types';

export interface TranscriptionJob {
  transcriptId: number;
  videoId: string;
  videoPath: string;
  options: TranscriptOptions;
  status: 'pending' | 'extracting' | 'transcribing' | 'completed' | 'failed';
  progress: number;
  error?: string;
}

export class TranscriptionQueueManager {
  private queue: TranscriptionJob[] = [];
  private activeJob: TranscriptionJob | null = null;
  private maxConcurrent: number = 1; // Transcription is CPU-intensive, run one at a time

  /**
   * Add a video to the transcription queue
   */
  async enqueue(videoId: string, options: TranscriptOptions = {}): Promise<number> {
    // Check if video exists in library
    const libraryItem = getLibraryItem(videoId);
    if (!libraryItem || !libraryItem.filePath) {
      throw new Error(`Video not found in library or file path missing: ${videoId}`);
    }

    const videoPath = resolveFilePath(libraryItem.filePath);

    // Check if transcript already exists and is completed
    const existing = getTranscript(videoId);
    if (existing && existing.status === 'completed') {
      logger.info(`[TranscriptionQueue] Transcript already exists for ${videoId}`);
      return existing.id;
    }

    // Create transcript record in database
    const transcriptId = createTranscript(videoId, options);

    // Create job
    const job: TranscriptionJob = {
      transcriptId,
      videoId,
      videoPath,
      options,
      status: 'pending',
      progress: 0,
    };

    this.queue.push(job);
    logger.info(`[TranscriptionQueue] Enqueued transcription for ${videoId}`, {
      transcriptId,
      queueLength: this.queue.length,
    });

    this.sendQueueUpdate();
    this.processNext();

    return transcriptId;
  }

  /**
   * Cancel a transcription job
   */
  cancel(videoId: string): boolean {
    // Cancel if it's the active job
    if (this.activeJob && this.activeJob.videoId === videoId) {
      audioExtractionService.cancel(videoId);
      whisperService.cancel(videoId);

      updateTranscript(this.activeJob.transcriptId, {
        status: 'failed',
        error: 'Cancelled by user',
      });

      logger.info(`[TranscriptionQueue] Cancelled active transcription for ${videoId}`);
      this.activeJob = null;
      this.sendQueueUpdate();
      this.processNext();
      return true;
    }

    // Remove from queue if pending
    const index = this.queue.findIndex(j => j.videoId === videoId);
    if (index !== -1) {
      const job = this.queue[index];
      this.queue.splice(index, 1);

      updateTranscript(job.transcriptId, {
        status: 'failed',
        error: 'Cancelled by user',
      });

      logger.info(`[TranscriptionQueue] Removed pending transcription for ${videoId}`);
      this.sendQueueUpdate();
      return true;
    }

    return false;
  }

  /**
   * Get current queue status
   */
  getQueue(): TranscriptionJob[] {
    const result = [...this.queue];
    if (this.activeJob) {
      result.unshift(this.activeJob);
    }
    return result;
  }

  /**
   * Process the next job in the queue
   */
  private async processNext(): Promise<void> {
    // Already processing something
    if (this.activeJob) {
      return;
    }

    // Queue is empty
    if (this.queue.length === 0) {
      return;
    }

    // Get next job
    const job = this.queue.shift()!;
    this.activeJob = job;

    logger.info(`[TranscriptionQueue] Starting transcription for ${job.videoId}`, {
      transcriptId: job.transcriptId,
      method: job.options.method,
      model: job.options.model,
    });

    updateTranscript(job.transcriptId, {
      status: 'processing',
      progress: 0,
    });

    this.sendQueueUpdate();

    try {
      // Step 1: Extract audio from video
      job.status = 'extracting';
      job.progress = 0;
      this.sendJobProgress(job);

      const audioPath = await audioExtractionService.extractAudio(
        job.videoId,
        { videoPath: job.videoPath },
        (progress) => {
          job.progress = progress.percent * 0.3; // Audio extraction is 30% of total progress
          updateTranscript(job.transcriptId, { progress: job.progress });
          this.sendJobProgress(job);
        }
      );

      logger.info(`[TranscriptionQueue] Audio extracted for ${job.videoId}`, { audioPath });

      // Step 2: Transcribe audio with Whisper
      job.status = 'transcribing';
      job.progress = 30;
      this.sendJobProgress(job);

      const result = await whisperService.transcribe(
        job.videoId,
        audioPath,
        job.options,
        (progress) => {
          job.progress = 30 + (progress.percent * 0.7); // Transcription is 70% of total progress
          updateTranscript(job.transcriptId, { progress: job.progress });
          this.sendJobProgress(job);
        }
      );

      logger.info(`[TranscriptionQueue] Transcription completed for ${job.videoId}`, {
        textLength: result.text.length,
        segmentCount: result.segments.length,
        language: result.language,
      });

      // Step 3: Save to database
      const wordCount = result.text.split(/\s+/).filter(w => w.length > 0).length;

      updateTranscript(job.transcriptId, {
        status: 'completed',
        progress: 100,
        transcriptText: result.text,
        transcriptJson: JSON.stringify(result.segments),
        language: result.language,
        wordCount,
        durationSeconds: Math.ceil(result.duration),
        completedAt: new Date().toISOString(),
      });

      // Step 4: Clean up temp audio file
      audioExtractionService.cleanupTempAudio(audioPath);

      job.status = 'completed';
      job.progress = 100;
      this.sendTranscriptComplete(job);

      logger.info(`[TranscriptionQueue] Job completed for ${job.videoId}`);

    } catch (error) {
      const err = error as Error;
      logger.error(`[TranscriptionQueue] Job failed for ${job.videoId}`, { error: err });

      updateTranscript(job.transcriptId, {
        status: 'failed',
        error: err.message,
      });

      job.status = 'failed';
      job.error = err.message;
      this.sendTranscriptError(job);
    } finally {
      this.activeJob = null;
      this.sendQueueUpdate();
      this.processNext(); // Process next job in queue
    }
  }

  /**
   * Send job progress to renderer
   */
  private sendJobProgress(job: TranscriptionJob): void {
    this.sendToRenderer('transcript:progress', {
      videoId: job.videoId,
      transcriptId: job.transcriptId,
      status: job.status,
      progress: job.progress,
    });
  }

  /**
   * Send completion event to renderer
   */
  private sendTranscriptComplete(job: TranscriptionJob): void {
    const transcript = getTranscript(job.videoId);
    this.sendToRenderer('transcript:complete', {
      videoId: job.videoId,
      transcript,
    });
  }

  /**
   * Send error event to renderer
   */
  private sendTranscriptError(job: TranscriptionJob): void {
    this.sendToRenderer('transcript:error', {
      videoId: job.videoId,
      transcriptId: job.transcriptId,
      error: job.error,
    });
  }

  /**
   * Send queue update to renderer
   */
  private sendQueueUpdate(): void {
    const queue = this.getQueue();
    this.sendToRenderer('transcription:queue-updated', queue);
  }

  /**
   * Send event to all renderer windows
   */
  private sendToRenderer(channel: string, data: any): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    }
  }

  /**
   * Check if transcription tools are available
   */
  async checkAvailability(): Promise<{
    ffmpeg: boolean;
    whisperLocal: boolean;
    whisperAPI: boolean;
  }> {
    const [ffmpeg, whisperLocal] = await Promise.all([
      audioExtractionService.checkFfmpegAvailable(),
      whisperService.checkLocalWhisperAvailable(),
    ]);

    return {
      ffmpeg,
      whisperLocal,
      whisperAPI: whisperService.checkAPIKeyConfigured(),
    };
  }
}

// Singleton instance
export const transcriptionQueueManager = new TranscriptionQueueManager();
