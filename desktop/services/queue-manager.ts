import { BrowserWindow } from 'electron';
import * as path from 'path';
import * as os from 'os';
import { DownloadEngine } from './download-engine';
import { fileIntegrityService } from './file-integrity';
import { retryManager, DEFAULT_RETRY_CONFIG } from './retry-manager';
import { diskSpaceService } from './disk-space';
import { logger } from './logger';
import {
  addToQueue, getQueue, getQueueItem, updateQueueItem, deleteQueueItem,
  getPendingQueueItems, getActiveQueueItems, addDownloadRecord, getSetting,
  clearFailedQueue, upsertLibraryItem, toRelativePath,
} from './database';
import type { QueueItem, DownloadRequest, DownloadProgress, DownloadRecord } from '../../shared/types';

export class QueueManager {
  private engine: DownloadEngine;
  private maxConcurrent: number = 3;

  constructor() {
    this.engine = new DownloadEngine();

    this.engine.setCallbacks({
      onProgress: (queueId, data) => this.handleProgress(queueId, data),
      onComplete: (queueId, filePath, fileSize) => this.handleComplete(queueId, filePath, fileSize),
      onError: (queueId, error) => this.handleError(queueId, error),
    });
  }

  add(request: DownloadRequest): QueueItem {
    const item = addToQueue(request);
    this.processNext();
    return item;
  }

  pause(queueId: number): void {
    const success = this.engine.pauseDownload(queueId);
    if (success) {
      updateQueueItem(queueId, { status: 'paused' });
      this.sendQueueUpdate();
    }
  }

  resume(queueId: number): void {
    const item = getQueueItem(queueId);
    if (!item) return;

    if (this.engine.isActive(queueId)) {
      const success = this.engine.resumeDownload(queueId);
      if (success) {
        updateQueueItem(queueId, { status: 'downloading' });
        this.sendQueueUpdate();
      }
    } else {
      updateQueueItem(queueId, { status: 'pending' });
      this.processNext();
    }
  }

  cancel(queueId: number): void {
    this.engine.cancelDownload(queueId);
    updateQueueItem(queueId, { status: 'cancelled' });
    this.sendQueueUpdate();
    this.processNext();
  }

  clearFailed(): void {
    clearFailedQueue();
    this.sendQueueUpdate();
  }

  retry(queueId: number): void {
    updateQueueItem(queueId, { status: 'pending', progress: 0, error: null, speed: null, eta: null });
    this.processNext();
  }

  getQueueItems(): QueueItem[] {
    return getQueue();
  }

  restoreOnStartup(): void {
    const active = getActiveQueueItems();
    for (const item of active) {
      updateQueueItem(item.id, { status: 'pending' });
    }

    const concurrentSetting = getSetting('max_concurrent');
    if (concurrentSetting) {
      this.maxConcurrent = parseInt(concurrentSetting, 10) || 3;
    }

    this.processNext();
  }

  private async processNext(): Promise<void> {
    const activeCount = this.engine.getActiveCount();
    if (activeCount >= this.maxConcurrent) return;

    const pending = getPendingQueueItems();
    const slotsAvailable = this.maxConcurrent - activeCount;

    // Filter pending items: only process those ready for retry
    const readyItems = pending.filter(item =>
      retryManager.isRetryReady(item.nextRetryAt)
    );

    for (let i = 0; i < Math.min(slotsAvailable, readyItems.length); i++) {
      const item = readyItems[i];

      // Check disk space before starting download
      const outputDir = getSetting('output_dir') || path.join(os.homedir(), 'Downloads');
      const estimatedSize = diskSpaceService.estimateDownloadSize(
        item.format || 'mp4',
        item.quality || 'best',
        300 // Assume 5 minutes if duration unknown
      );

      const spaceCheck = await diskSpaceService.hasEnoughSpace(outputDir, estimatedSize);

      if (!spaceCheck.hasSpace) {
        logger.error(`[QueueManager] Insufficient disk space for ${item.videoId}`, {
          available: diskSpaceService.formatBytes(spaceCheck.available),
          required: diskSpaceService.formatBytes(spaceCheck.required),
        });

        updateQueueItem(item.id, {
          status: 'failed',
          error: spaceCheck.message || 'Insufficient disk space',
        });

        this.sendToRenderer('download:error', {
          queueId: item.id,
          error: spaceCheck.message || 'Insufficient disk space',
        });

        continue; // Skip this item, try next
      }

      logger.info(`[QueueManager] Starting download for ${item.videoId}`, {
        retryCount: item.retryCount || 0,
        maxRetries: item.maxRetries || DEFAULT_RETRY_CONFIG.maxRetries,
        estimatedSize: diskSpaceService.formatBytes(estimatedSize),
        availableSpace: diskSpaceService.formatBytes(spaceCheck.available),
      });

      updateQueueItem(item.id, {
        status: 'downloading',
        started_at: new Date().toISOString(),
        error: null,
        nextRetryAt: null,
      });
      this.engine.startDownload({ ...item, status: 'downloading' });
    }

    this.sendQueueUpdate();
  }

  private handleProgress(queueId: number, data: { progress: number; speed: string; eta: string; downloadedBytes: number; totalBytes: number }): void {
    updateQueueItem(queueId, {
      progress: data.progress,
      speed: data.speed,
      eta: data.eta,
      downloaded_bytes: data.downloadedBytes,
      total_bytes: data.totalBytes,
    });

    const progressEvent: DownloadProgress = {
      queueId,
      progress: data.progress,
      speed: data.speed,
      eta: data.eta,
      downloadedBytes: data.downloadedBytes,
      totalBytes: data.totalBytes,
      status: 'downloading',
    };

    this.sendToRenderer('download:progress', progressEvent);
  }

  private async handleComplete(queueId: number, filePath: string, fileSize: number): Promise<void> {
    const item = getQueueItem(queueId);
    if (!item) return;

    // Verify file integrity before marking as complete
    logger.info(`[QueueManager] Verifying file integrity for ${item.videoId}`);
    const integrityResult = await fileIntegrityService.verifyFile(filePath, fileSize * 0.9); // Allow 10% variance

    if (!integrityResult.valid) {
      logger.error(`[QueueManager] File integrity check failed for ${item.videoId}`, {
        error: integrityResult.error,
        fileSize: integrityResult.fileSize,
      });

      // Mark as failed instead of completed
      updateQueueItem(queueId, {
        status: 'failed',
        error: `File integrity check failed: ${integrityResult.error}`,
      });

      this.sendToRenderer('download:error', {
        queueId,
        error: `File corrupted: ${integrityResult.error}`,
      });
      this.sendQueueUpdate();
      this.processNext();
      return;
    }

    // File is valid, proceed with completion
    updateQueueItem(queueId, {
      status: 'completed',
      progress: 100,
      completed_at: new Date().toISOString(),
      temp_file_path: filePath,
    });

    const record = addDownloadRecord(item, filePath, integrityResult.fileSize);

    upsertLibraryItem({
      videoId: item.videoId,
      title: item.title,
      channel: item.channel,
      thumbnailUrl: item.thumbnailUrl,
      url: item.url,
      format: item.format,
      quality: item.quality,
      resolution: item.resolution,
      filePath: toRelativePath(filePath),
      fileSize: integrityResult.fileSize,
      downloadedAt: new Date().toISOString(),
    });

    // Store hash for future verification
    fileIntegrityService.storeHash(item.videoId, integrityResult.hash);

    this.sendToRenderer('download:complete', record);
    this.sendQueueUpdate();
    this.processNext();
  }

  private handleError(queueId: number, error: string): void {
    const item = getQueueItem(queueId);
    if (!item) return;

    const retryCount = (item.retryCount || 0) + 1;
    const maxRetries = item.maxRetries || DEFAULT_RETRY_CONFIG.maxRetries;

    // Check if we should retry
    if (retryManager.shouldRetry(retryCount - 1, maxRetries, error)) {
      const nextRetryTime = retryManager.getNextRetryTime(retryCount - 1);
      const delay = retryManager.formatDelay(
        retryManager.calculateDelay(retryCount - 1)
      );

      logger.info(`[QueueManager] Scheduling retry ${retryCount}/${maxRetries} for ${item.videoId} in ${delay}`);

      updateQueueItem(queueId, {
        status: 'pending',
        error: `${error} (will retry in ${delay})`,
        retryCount,
        nextRetryAt: nextRetryTime.toISOString(),
        progress: 0,
        speed: null,
        eta: null,
      });

      this.sendToRenderer('download:error', {
        queueId,
        error: `${error} - Retry ${retryCount}/${maxRetries} in ${delay}`,
      });

      // Schedule retry check
      setTimeout(() => {
        logger.info(`[QueueManager] Retry time reached for ${item.videoId}, attempting retry ${retryCount}`);
        this.processNext();
      }, retryManager.calculateDelay(retryCount - 1));

    } else {
      // Max retries reached or permanent error
      logger.error(`[QueueManager] Download failed permanently for ${item.videoId}`, {
        error,
        retryCount,
        maxRetries,
      });

      updateQueueItem(queueId, {
        status: 'failed',
        error: `${error} (${retryCount - 1} retries exhausted)`,
        retryCount,
      });

      this.sendToRenderer('download:error', {
        queueId,
        error: `${error} - Failed after ${retryCount - 1} retries`,
      });
    }

    this.sendQueueUpdate();
    this.processNext();
  }

  private sendQueueUpdate(): void {
    const queue = getQueue();
    this.sendToRenderer('queue:updated', queue);
  }

  private sendToRenderer(channel: string, data: any): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    }
  }
}
