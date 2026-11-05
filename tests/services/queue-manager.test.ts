/**
 * Tests for QueueManager
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DownloadRequest } from '../../shared/types';

// Mock database functions
vi.mock('../../desktop/services/database', () => ({
  addToQueue: vi.fn((request: DownloadRequest) => ({
    id: 1,
    video_id: request.videoId,
    title: request.title,
    channel: request.channel,
    thumbnail_url: request.thumbnailUrl,
    url: request.url,
    format: request.format,
    quality: request.quality || '',
    resolution: request.resolution || '',
    start_time: request.startTime || '',
    end_time: request.endTime || '',
    priority: 0,
    status: 'pending',
    progress: 0,
    downloaded_bytes: 0,
    total_bytes: 0,
    speed: null,
    eta: null,
    error: null,
    temp_file_path: null,
    scheduled_at: null,
    started_at: null,
    completed_at: null,
    created_at: new Date().toISOString(),
  })),
  getQueue: vi.fn().mockReturnValue([]),
  getQueueItem: vi.fn(),
  updateQueueItem: vi.fn(),
  deleteQueueItem: vi.fn(),
  getPendingQueueItems: vi.fn().mockReturnValue([]),
  getActiveQueueItems: vi.fn().mockReturnValue([]),
  addDownloadRecord: vi.fn(),
  getSetting: vi.fn((key: string) => {
    if (key === 'max_concurrent') return '3';
    if (key === 'output_dir') return '/tmp/downloads';
    return null;
  }),
  clearFailedQueue: vi.fn(),
  upsertLibraryItem: vi.fn(),
  toRelativePath: vi.fn((path: string) => path),
}));

// Mock download engine
vi.mock('../../desktop/services/download-engine', () => ({
  DownloadEngine: vi.fn().mockImplementation(() => ({
    setCallbacks: vi.fn(),
    startDownload: vi.fn(),
    pauseDownload: vi.fn().mockReturnValue(true),
    resumeDownload: vi.fn().mockReturnValue(true),
    cancelDownload: vi.fn(),
    getActiveCount: vi.fn().mockReturnValue(0),
    isActive: vi.fn().mockReturnValue(false),
  })),
}));

describe('QueueManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be importable', async () => {
    const { QueueManager } = await import('../../desktop/services/queue-manager');
    expect(QueueManager).toBeDefined();
  });

  it('should create queue manager instance', async () => {
    const { QueueManager } = await import('../../desktop/services/queue-manager');
    const qm = new QueueManager();
    expect(qm).toBeDefined();
    expect(qm.add).toBeDefined();
    expect(qm.getQueueItems).toBeDefined();
  });

  it('should add item to queue', async () => {
    const { QueueManager } = await import('../../desktop/services/queue-manager');
    const qm = new QueueManager();

    const request: DownloadRequest = {
      videoId: 'test-id',
      title: 'Test Video',
      channel: 'Test Channel',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      url: 'https://youtube.com/watch?v=test',
      format: 'mp4',
      quality: '1080p',
    };

    const item = qm.add(request);

    expect(item).toBeDefined();
    expect(item.video_id).toBe('test-id');
    expect(item.status).toBe('pending');
  });

  it('should get queue items', async () => {
    const { QueueManager } = await import('../../desktop/services/queue-manager');
    const qm = new QueueManager();

    const items = qm.getQueueItems();

    expect(Array.isArray(items)).toBe(true);
  });
});
