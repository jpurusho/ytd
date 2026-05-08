import { BrowserWindow } from 'electron';
import { DownloadEngine } from './download-engine';
import {
  addToQueue, getQueue, getQueueItem, updateQueueItem, deleteQueueItem,
  getPendingQueueItems, getActiveQueueItems, addDownloadRecord, getSetting,
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

  private processNext(): void {
    const activeCount = this.engine.getActiveCount();
    if (activeCount >= this.maxConcurrent) return;

    const pending = getPendingQueueItems();
    const slotsAvailable = this.maxConcurrent - activeCount;

    for (let i = 0; i < Math.min(slotsAvailable, pending.length); i++) {
      const item = pending[i];
      updateQueueItem(item.id, {
        status: 'downloading',
        started_at: new Date().toISOString(),
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

  private handleComplete(queueId: number, filePath: string, fileSize: number): void {
    const item = getQueueItem(queueId);
    if (!item) return;

    updateQueueItem(queueId, {
      status: 'completed',
      progress: 100,
      completed_at: new Date().toISOString(),
      temp_file_path: filePath,
    });

    const record = addDownloadRecord(item, filePath, fileSize);
    this.sendToRenderer('download:complete', record);
    this.sendQueueUpdate();
    this.processNext();
  }

  private handleError(queueId: number, error: string): void {
    updateQueueItem(queueId, {
      status: 'failed',
      error,
    });

    this.sendToRenderer('download:error', { queueId, error });
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
