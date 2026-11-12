import { ipcMain, dialog, shell, app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as fs from 'fs';
import { GoogleAuthService } from './services/google-auth';
import { YouTubeApiService } from './services/youtube-api';
import { QueueManager } from './services/queue-manager';
import { getAvailableFormats } from './services/download-engine';
import { checkToolsInstalled } from './services/tool-paths';
import type { SearchOptions } from '../shared/types';
import {
  getDataDir, setDataDir, getSetting, setSetting,
  getDownloadHistory, deleteDownloadRecords, clearDownloadHistory, getStats,
  updateDownloadFilePath,
  createLocalPlaylist, getLocalPlaylists, getLocalPlaylist, updateLocalPlaylist, deleteLocalPlaylist,
  addPlaylistItem, removePlaylistItem, getPlaylistItems, reorderPlaylistItem,
  getLibraryItems, getLibraryItem, deleteLibraryItems, getRecentLibraryItems, getLibraryStats,
  upsertLibraryItem, toRelativePath,
} from './services/database';
import { SyncManager } from './services/sync/sync-manager';
import { transcriptionQueueManager } from './services/transcription-queue-manager';
import { claudeAnalysisService } from './services/claude-analysis';
import type { DownloadRequest, LocalPlaylistVideoItem, TranscriptOptions } from '../shared/types';
import type { IncomingMessage } from 'http';
import {
  getTranscript,
  searchTranscripts,
  getAllTranscripts,
  deleteTranscript,
} from './services/database';

// GitHub release types
let authService: GoogleAuthService;
let youtubeService: YouTubeApiService | null = null;
let queueManager: QueueManager;
let syncManager: SyncManager;

function getYouTubeService(): YouTubeApiService {
  if (!youtubeService) {
    youtubeService = new YouTubeApiService(authService.getOAuth2Client());
  }
  return youtubeService;
}

export function registerIpcHandlers(): void {
  authService = new GoogleAuthService();
  queueManager = new QueueManager();
  queueManager.restoreOnStartup();

  // ─── Auth ───────────────────────────────────────────────────────────────────

  ipcMain.handle('auth:hasCredentials', () => {
    return authService.hasCredentials();
  });

  ipcMain.handle('auth:setCredentials', (_event, clientId: string, clientSecret: string) => {
    authService.setCredentials(clientId, clientSecret);
  });

  ipcMain.handle('auth:login', async () => {
    const user = await authService.login();
    youtubeService = null;
    return user;
  });

  ipcMain.handle('auth:logout', async () => {
    await authService.logout();
    youtubeService = null;
  });

  ipcMain.handle('auth:getUser', async () => {
    return authService.getCurrentUser();
  });

  ipcMain.handle('auth:isLoggedIn', () => {
    return authService.isLoggedIn();
  });

  // ─── YouTube API ────────────────────────────────────────────────────────────

  ipcMain.handle('youtube:search', async (_event, query: string, maxResults?: number, options?: SearchOptions) => {
    return getYouTubeService().search(query, maxResults, options);
  });

  ipcMain.handle('youtube:getPlaylists', async () => {
    return getYouTubeService().getPlaylists();
  });

  ipcMain.handle('youtube:getPlaylistItems', async (_event, playlistId: string, maxResults?: number) => {
    return getYouTubeService().getPlaylistItems(playlistId, maxResults);
  });

  ipcMain.handle('youtube:getSubscriptions', async (_event, maxResults?: number) => {
    return getYouTubeService().getSubscriptions(maxResults);
  });

  ipcMain.handle('youtube:getChannelVideos', async (_event, channelId: string, maxResults?: number, pageToken?: string) => {
    return getYouTubeService().getChannelVideos(channelId, maxResults, pageToken);
  });

  ipcMain.handle('youtube:getVideoInfo', async (_event, videoId: string) => {
    return getYouTubeService().getVideoInfo(videoId);
  });

  ipcMain.handle('youtube:unlikeVideo', async (_event, videoId: string) => {
    return getYouTubeService().unlikeVideo(videoId);
  });

  ipcMain.handle('youtube:testWatchLaterApi', async () => {
    const oauth = authService.getOAuth2Client();
    const token = (await oauth.getAccessToken()).token;

    console.log('[testWatchLaterApi] Access token:', token ? 'EXISTS' : 'MISSING');

    // Test direct API call
    const https = require('https');

    return new Promise((resolve, reject) => {
      const url = 'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=WL&maxResults=5';

      https.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        }
      }, (res: IncomingMessage) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          console.log('[testWatchLaterApi] Response status:', res.statusCode);
          console.log('[testWatchLaterApi] Response body:', data);
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        });
      }).on('error', (err: Error) => {
        console.error('[testWatchLaterApi] Error:', err);
        reject(err);
      });
    });
  });

  ipcMain.handle('youtube:searchChannels', async (_event, query: string, maxResults?: number) => {
    return getYouTubeService().searchChannels(query, maxResults);
  });

  ipcMain.handle('youtube:getFormats', async (_event, url: string) => {
    return getAvailableFormats(url);
  });

  // ─── Downloads ──────────────────────────────────────────────────────────────

  ipcMain.handle('downloads:start', (_event, request: DownloadRequest) => {
    return queueManager.add(request);
  });

  ipcMain.handle('downloads:cancel', (_event, queueId: number) => {
    queueManager.cancel(queueId);
  });

  ipcMain.handle('downloads:pause', (_event, queueId: number) => {
    queueManager.pause(queueId);
  });

  ipcMain.handle('downloads:resume', (_event, queueId: number) => {
    queueManager.resume(queueId);
  });

  ipcMain.handle('downloads:retry', (_event, queueId: number) => {
    queueManager.retry(queueId);
  });

  ipcMain.handle('downloads:getQueue', () => {
    return queueManager.getQueueItems();
  });

  ipcMain.handle('downloads:getHistory', (_event, limit?: number) => {
    return getDownloadHistory(limit);
  });

  ipcMain.handle('downloads:deleteHistory', (_event, ids: number[]) => {
    deleteDownloadRecords(ids);
  });

  ipcMain.handle('downloads:clearHistory', () => {
    clearDownloadHistory();
  });

  ipcMain.handle('downloads:getStats', () => {
    return getStats();
  });

  ipcMain.handle('downloads:clearFailed', () => {
    queueManager.clearFailed();
  });

  ipcMain.handle('downloads:rescanFolder', async (_event, folderPath: string) => {
    const MEDIA_EXTS = new Set(['.mp4', '.webm', '.mkv', '.mp3', '.m4a', '.ogg', '.wav', '.mov', '.avi']);

    const files: string[] = [];
    try {
      for (const entry of fs.readdirSync(folderPath)) {
        if (MEDIA_EXTS.has(path.extname(entry).toLowerCase())) {
          files.push(path.join(folderPath, entry));
        }
      }
    } catch {
      return { updated: 0, stillMissing: 0, error: 'Could not read folder' };
    }

    function normalise(s: string): string {
      return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Rescan library items (primary source of truth)
    const libraryItems = getLibraryItems({ limit: 100000 });
    let updated = 0;
    let stillMissing = 0;

    for (const item of libraryItems) {
      if (item.filePath && fs.existsSync(item.filePath)) continue;

      const titleNorm = normalise(item.title);
      const match = files.find((f) => {
        const base = normalise(path.basename(f, path.extname(f)));
        return base === titleNorm || base.startsWith(titleNorm.slice(0, 30));
      });

      if (match) {
        upsertLibraryItem({
          videoId: item.videoId,
          title: item.title,
          url: item.url || `https://www.youtube.com/watch?v=${item.videoId}`,
          filePath: toRelativePath(match),
          fileSize: fs.statSync(match).size,
        });
        updated++;
      } else if (item.fileSize > 0) {
        stillMissing++;
      }
    }

    // Also update old downloads table for backward compat
    const history = getDownloadHistory(100000);
    for (const record of history) {
      if (record.filePath && fs.existsSync(record.filePath)) continue;
      const titleNorm = normalise(record.title);
      const match = files.find((f) => {
        const base = normalise(path.basename(f, path.extname(f)));
        return base === titleNorm || base.startsWith(titleNorm.slice(0, 30));
      });
      if (match) updateDownloadFilePath(record.id, match);
    }

    return { updated, stillMissing };
  });

  // ─── Library ─────────────────────────────────────────────────────────────────

  ipcMain.handle('library:getAll', (_event, opts?: { search?: string; sortBy?: string; order?: 'asc' | 'desc' }) => {
    return getLibraryItems(opts);
  });

  ipcMain.handle('library:get', (_event, videoId: string) => {
    return getLibraryItem(videoId);
  });

  ipcMain.handle('library:delete', (_event, videoIds: string[], deleteFiles?: boolean) => {
    deleteLibraryItems(videoIds, deleteFiles);
  });

  ipcMain.handle('library:getRecent', (_event, limit: number) => {
    return getRecentLibraryItems(limit);
  });

  ipcMain.handle('library:getStats', () => {
    return getLibraryStats();
  });

  // ─── Transcripts ─────────────────────────────────────────────────────────────

  ipcMain.handle('transcripts:start', async (_event, videoId: string, options?: TranscriptOptions) => {
    return transcriptionQueueManager.enqueue(videoId, options);
  });

  ipcMain.handle('transcripts:cancel', (_event, videoId: string) => {
    return transcriptionQueueManager.cancel(videoId);
  });

  ipcMain.handle('transcripts:get', (_event, videoId: string) => {
    return getTranscript(videoId);
  });

  ipcMain.handle('transcripts:getAll', (_event, status?: string) => {
    return getAllTranscripts(status);
  });

  ipcMain.handle('transcripts:search', (_event, query: string, limit?: number) => {
    return searchTranscripts(query, limit);
  });

  ipcMain.handle('transcripts:delete', (_event, videoId: string) => {
    deleteTranscript(videoId);
  });

  ipcMain.handle('transcripts:getQueue', () => {
    return transcriptionQueueManager.getQueue();
  });

  ipcMain.handle('transcripts:checkAvailability', () => {
    return transcriptionQueueManager.checkAvailability();
  });

  ipcMain.handle('transcripts:export', async (_event, videoId: string, format: 'txt' | 'srt' | 'vtt') => {
    const transcript = getTranscript(videoId);
    if (!transcript || transcript.status !== 'completed') {
      throw new Error('Transcript not found or not completed');
    }

    const segments = JSON.parse(transcript.transcriptJson) as Array<{start: number; end: number; text: string}>;

    if (format === 'txt') {
      return transcript.transcriptText;
    } else if (format === 'srt') {
      return segments.map((seg, i) => {
        const startTime = formatSrtTime(seg.start);
        const endTime = formatSrtTime(seg.end);
        return `${i + 1}\n${startTime} --> ${endTime}\n${seg.text}\n`;
      }).join('\n');
    } else if (format === 'vtt') {
      const body = segments.map((seg) => {
        const startTime = formatVttTime(seg.start);
        const endTime = formatVttTime(seg.end);
        return `${startTime} --> ${endTime}\n${seg.text}\n`;
      }).join('\n');
      return `WEBVTT\n\n${body}`;
    }

    throw new Error(`Unsupported export format: ${format}`);
  });

  // ─── Claude Analysis ──────────────────────────────────────────────────────

  ipcMain.handle('claude:isAvailable', async () => {
    return claudeAnalysisService.isAvailable();
  });

  ipcMain.handle('claude:summarize', async (_event, videoId: string) => {
    const transcript = getTranscript(videoId);
    if (!transcript || transcript.status !== 'completed') {
      throw new Error('Transcript not found or not completed');
    }

    const libraryItem = getLibraryItem(videoId);
    const videoTitle = libraryItem?.title || 'Untitled Video';

    return claudeAnalysisService.summarize(transcript.transcriptText, videoTitle);
  });

  ipcMain.handle('claude:generateChapters', async (_event, videoId: string) => {
    const transcript = getTranscript(videoId);
    if (!transcript || transcript.status !== 'completed') {
      throw new Error('Transcript not found or not completed');
    }

    const libraryItem = getLibraryItem(videoId);
    const videoTitle = libraryItem?.title || 'Untitled Video';

    const segments = JSON.parse(transcript.transcriptJson) as Array<{start: number; end: number; text: string}>;

    return claudeAnalysisService.generateChapters(transcript.transcriptText, segments, videoTitle);
  });

  ipcMain.handle('claude:askQuestion', async (_event, videoId: string, question: string) => {
    const transcript = getTranscript(videoId);
    if (!transcript || transcript.status !== 'completed') {
      throw new Error('Transcript not found or not completed');
    }

    const libraryItem = getLibraryItem(videoId);
    const videoTitle = libraryItem?.title || 'Untitled Video';

    return claudeAnalysisService.askQuestion(transcript.transcriptText, question, videoTitle);
  });

  ipcMain.handle('claude:extractTopics', async (_event, videoId: string) => {
    const transcript = getTranscript(videoId);
    if (!transcript || transcript.status !== 'completed') {
      throw new Error('Transcript not found or not completed');
    }

    const libraryItem = getLibraryItem(videoId);
    const videoTitle = libraryItem?.title || 'Untitled Video';

    return claudeAnalysisService.extractTopics(transcript.transcriptText, videoTitle);
  });

  // ─── Sync ──────────────────────────────────────────────────────────────────

  syncManager = new SyncManager();
  syncManager.start();

  ipcMain.handle('sync:start', () => syncManager.start());
  ipcMain.handle('sync:stop', () => syncManager.stop());
  ipcMain.handle('sync:getPeers', () => syncManager.getPeers());
  ipcMain.handle('sync:getSyncPreview', (_event, peer: any) => syncManager.getSyncPreview(peer));
  ipcMain.handle('sync:startSync', (_event, peer: any) => syncManager.startSync(peer));
  ipcMain.handle('sync:pauseSync', (_event, sessionId: number) => syncManager.pauseSync(sessionId));
  ipcMain.handle('sync:resumeSync', (_event, sessionId: number) => syncManager.resumeSync(sessionId));
  ipcMain.handle('sync:cancelSync', (_event, sessionId: number) => syncManager.cancelSync(sessionId));
  ipcMain.handle('sync:getHistory', (_event, limit?: number) => syncManager.getSyncHistoryList(limit));
  ipcMain.handle('sync:clearHistory', () => syncManager.clearHistory());

  // ─── App ────────────────────────────────────────────────────────────────────

  ipcMain.handle('app:openExternal', (_event, url: string) => {
    shell.openExternal(url);
  });

  ipcMain.handle('app:selectDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:getPlatform', () => {
    return process.platform;
  });

  ipcMain.handle('app:getDataDir', () => {
    return getDataDir();
  });

  ipcMain.handle('app:setDataDir', (_event, dir: string) => {
    setDataDir(dir);
  });

  ipcMain.handle('app:getSetting', (_event, key: string) => {
    return getSetting(key);
  });

  ipcMain.handle('app:setSetting', (_event, key: string, value: string) => {
    setSetting(key, value);
  });

  ipcMain.handle('app:checkTools', () => {
    return checkToolsInstalled();
  });

  // ─── Auto-Update (electron-updater) ────────────────────────────────────────
  // Uses latest-mac.yml from GitHub releases (no API calls, no rate limits)

  // Configure autoUpdater
  autoUpdater.autoDownload = false; // Manual control over download
  autoUpdater.autoInstallOnAppQuit = true;

  // Disable auto-update checks on startup in development
  if (!app.isPackaged) {
    autoUpdater.forceDevUpdateConfig = false;
  }

  ipcMain.handle('app:checkForUpdates', async () => {
    const currentVersion = app.getVersion();

    try {
      const result = await autoUpdater.checkForUpdates();

      if (!result) {
        return { status: 'error', message: 'Unable to check for updates' };
      }

      const latestVersion = result.updateInfo.version;
      const isNewer = latestVersion.localeCompare(currentVersion, undefined, { numeric: true }) > 0;

      if (isNewer) {
        // Store update info for downloadUpdate handler
        (global as any).pendingUpdateInfo = result.updateInfo;

        return {
          status: 'available',
          version: latestVersion,
          // Return a placeholder URL - actual download is handled by electron-updater
          url: `https://github.com/jpurusho/ytd/releases/download/v${latestVersion}/ytd-${latestVersion}-arm64-mac.zip`
        };
      }

      return { status: 'up-to-date', version: currentVersion };
    } catch (err: unknown) {
      const error = err as Error;
      // Provide helpful error messages for common issues
      let message = error.message;
      if (message.includes('ENOTFOUND') || message.includes('net::')) {
        message = 'Cannot reach update server. Check your internet connection.';
      }
      return { status: 'error', message };
    }
  });

  ipcMain.handle('app:downloadUpdate', async () => {
    try {
      // Set up progress reporting
      autoUpdater.on('download-progress', (progressObj) => {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send('app:downloadProgress', {
              downloaded: progressObj.transferred,
              total: progressObj.total,
              percent: Math.round(progressObj.percent),
            });
          }
        }
      });

      // Download the update
      await autoUpdater.downloadUpdate();

      // Get download path (electron-updater manages this internally)
      const updateCachePath = path.join(app.getPath('userData'), 'pending-update');

      return {
        success: true,
        path: updateCachePath,
        message: 'Update downloaded. Restart the app to install.'
      };
    } catch (err: unknown) {
      const error = err as Error;
      throw new Error(`Update download failed: ${error.message}`);
    }
  });

  // ─── Video Playback ───────────────────────────────────────────────────────

  ipcMain.handle('app:getVideoFileUrl', (_event, filePath: string) => {
    const fs = require('fs');
    if (!fs.existsSync(filePath)) {
      return { error: 'File not found. It may have been moved or deleted.' };
    }
    // Use HTTP server for video streaming
    // Dev: Vite on 5173, Prod: HTTP server on dynamic port
    const isDev = !require('electron').app.isPackaged;
    const port = isDev ? '5173' : require('./index').getProdServerPort();
    return { url: `http://localhost:${port}/video?path=${encodeURIComponent(filePath)}` };
  });

  ipcMain.handle('app:fileExists', (_event, filePath: string) => {
    const fs = require('fs');
    return fs.existsSync(filePath);
  });

  ipcMain.handle('app:openInSystemPlayer', (_event, filePath: string) => {
    shell.openPath(filePath);
  });

  ipcMain.handle('app:showInFinder', (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle('app:convertToMp4', async (_event, filePath: string) => {
    const fs = require('fs');
    const path = require('path');
    const { spawn } = require('child_process');
    const { getFfmpegPath } = require('./services/tool-paths');

    if (!fs.existsSync(filePath)) {
      return { error: 'Source file not found' };
    }

    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));
    const outputPath = path.join(dir, `${baseName}.mp4`);

    if (fs.existsSync(outputPath)) {
      return { success: true, outputPath, message: 'MP4 version already exists' };
    }

    const ffmpegPath = getFfmpegPath();

    return new Promise((resolve) => {
      const proc = spawn(ffmpegPath, [
        '-i', filePath,
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-crf', '18',
        '-preset', 'medium',
        '-y',
        outputPath,
      ]);

      let stderr = '';
      proc.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

      proc.on('close', (code: number) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve({ success: true, outputPath });
        } else {
          resolve({ error: stderr.split('\n').pop() || 'Conversion failed' });
        }
      });

      proc.on('error', (err: Error) => {
        resolve({ error: `Failed to start ffmpeg: ${err.message}` });
      });
    });
  });

  // ─── Local Playlists ──────────────────────────────────────────────────────

  ipcMain.handle('playlists:create', (_event, name: string, description?: string) => {
    return createLocalPlaylist(name, description || '');
  });

  ipcMain.handle('playlists:getAll', () => {
    return getLocalPlaylists();
  });

  ipcMain.handle('playlists:get', (_event, id: number) => {
    return getLocalPlaylist(id);
  });

  ipcMain.handle('playlists:update', (_event, id: number, updates: { name?: string; description?: string }) => {
    return updateLocalPlaylist(id, updates);
  });

  ipcMain.handle('playlists:delete', (_event, id: number) => {
    deleteLocalPlaylist(id);
  });

  ipcMain.handle('playlists:addItem', (_event, playlistId: number, item: LocalPlaylistVideoItem) => {
    return addPlaylistItem(playlistId, item);
  });

  ipcMain.handle('playlists:removeItem', (_event, playlistId: number, videoId: string) => {
    removePlaylistItem(playlistId, videoId);
  });

  ipcMain.handle('playlists:getItems', (_event, playlistId: number) => {
    return getPlaylistItems(playlistId);
  });

  ipcMain.handle('playlists:reorderItem', (_event, playlistId: number, videoId: string, newPosition: number) => {
    reorderPlaylistItem(playlistId, videoId, newPosition);
  });

  ipcMain.handle('playlists:syncToYouTube', async (_event, playlistId: number) => {
    const playlist = getLocalPlaylist(playlistId);
    if (!playlist) throw new Error('Playlist not found');

    const ytService = getYouTubeService();
    const localItems = getPlaylistItems(playlistId);

    let ytPlaylistId = playlist.youtubePlaylistId;

    // Create YouTube playlist if not linked yet
    if (!ytPlaylistId) {
      ytPlaylistId = await ytService.createPlaylist(playlist.name, playlist.description);
      updateLocalPlaylist(playlistId, { youtubePlaylistId: ytPlaylistId });
    }

    // Get current YouTube playlist items
    const ytItems = await ytService.getPlaylistItemsWithIds(ytPlaylistId);
    const ytVideoIds = new Set(ytItems.map(i => i.videoId));
    const localVideoIds = new Set(localItems.map(i => i.videoId));

    // Add videos that are local but not on YouTube
    for (const item of localItems) {
      if (!ytVideoIds.has(item.videoId)) {
        await ytService.addVideoToPlaylist(ytPlaylistId, item.videoId);
      }
    }

    // Pull videos from YouTube that aren't local
    for (const ytItem of ytItems) {
      if (!localVideoIds.has(ytItem.videoId)) {
        try {
          const info = await ytService.getVideoInfo(ytItem.videoId);
          addPlaylistItem(playlistId, {
            videoId: info.id,
            title: info.title,
            channel: info.channel,
            thumbnailUrl: info.thumbnail,
            duration: info.duration,
          });
        } catch {
          // Video may be unavailable, skip
        }
      }
    }

    updateLocalPlaylist(playlistId, { lastSyncedAt: new Date().toISOString() });
    return { success: true, youtubePlaylistId: ytPlaylistId };
  });

  ipcMain.handle('playlists:pullFromYouTube', async (_event, youtubePlaylistId: string, localPlaylistId?: number) => {
    const ytService = getYouTubeService();
    const items = await ytService.getPlaylistItems(youtubePlaylistId, 200);

    console.log(`[pullFromYouTube] Playlist ${youtubePlaylistId}: fetched ${items.length} items from YouTube`);

    let targetId = localPlaylistId;
    if (!targetId) {
      // Get playlist info to use as name
      const playlists = await ytService.getPlaylists();
      const ytPlaylist = playlists.find(p => p.id === youtubePlaylistId);
      const name = ytPlaylist?.title || 'Imported Playlist';
      const created = createLocalPlaylist(name);
      targetId = created.id;
      updateLocalPlaylist(targetId, { youtubePlaylistId });
    }

    for (const item of items) {
      addPlaylistItem(targetId, {
        videoId: item.videoId,
        title: item.title,
        channel: item.channel,
        thumbnailUrl: item.thumbnail,
        duration: item.duration,
      });
    }

    updateLocalPlaylist(targetId, { lastSyncedAt: new Date().toISOString() });
    return getLocalPlaylist(targetId);
  });
}

// Helper functions for transcript export formats
function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function formatVttTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}
