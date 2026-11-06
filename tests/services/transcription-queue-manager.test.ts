/**
 * Tests for TranscriptionQueueManager
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranscriptionQueueManager } from '../../desktop/services/transcription-queue-manager';

// Mock dependencies
vi.mock('../../desktop/services/audio-extraction', () => ({
  audioExtractionService: {
    extractAudio: vi.fn(),
    cancel: vi.fn(),
    cleanupTempAudio: vi.fn(),
    checkFfmpegAvailable: vi.fn(),
  },
}));

vi.mock('../../desktop/services/whisper-transcription', () => ({
  whisperService: {
    transcribe: vi.fn(),
    cancel: vi.fn(),
    checkLocalWhisperAvailable: vi.fn(),
    checkAPIKeyConfigured: vi.fn(),
  },
}));

vi.mock('../../desktop/services/database', () => ({
  createTranscript: vi.fn(() => 1),
  getTranscript: vi.fn(),
  updateTranscript: vi.fn(),
  getLibraryItem: vi.fn(),
  resolveFilePath: vi.fn((path: string) => path),
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}));

describe('TranscriptionQueueManager', () => {
  let manager: TranscriptionQueueManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new TranscriptionQueueManager();
  });

  it('should enqueue a transcription job', async () => {
    const { getLibraryItem } = await import('../../desktop/services/database');
    (getLibraryItem as any).mockReturnValue({
      videoId: 'test123',
      filePath: '/path/to/video.mp4',
    });

    const transcriptId = await manager.enqueue('test123', { model: 'base' });

    expect(transcriptId).toBe(1);
    expect(manager.getQueue()).toHaveLength(1);
  });

  it('should reject enqueue if video not found', async () => {
    const { getLibraryItem } = await import('../../desktop/services/database');
    (getLibraryItem as any).mockReturnValue(null);

    await expect(manager.enqueue('missing123')).rejects.toThrow();
  });

  it('should cancel a pending job', async () => {
    const { getLibraryItem } = await import('../../desktop/services/database');
    (getLibraryItem as any).mockReturnValue({
      videoId: 'test123',
      filePath: '/path/to/video.mp4',
    });

    await manager.enqueue('test123');
    const cancelled = manager.cancel('test123');

    expect(cancelled).toBe(true);
    expect(manager.getQueue()).toHaveLength(0);
  });

  it('should check availability of tools', async () => {
    const { audioExtractionService } = await import('../../desktop/services/audio-extraction');
    const { whisperService } = await import('../../desktop/services/whisper-transcription');

    (audioExtractionService.checkFfmpegAvailable as any).mockResolvedValue(true);
    (whisperService.checkLocalWhisperAvailable as any).mockResolvedValue(true);
    (whisperService.checkAPIKeyConfigured as any).mockReturnValue(false);

    const availability = await manager.checkAvailability();

    expect(availability).toEqual({
      ffmpeg: true,
      whisperLocal: true,
      whisperAPI: false,
    });
  });
});
