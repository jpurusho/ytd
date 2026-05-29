import { ipcMain, dialog, shell, app, BrowserWindow } from 'electron';
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
  upsertLibraryItem,
} from './services/database';
import type { DownloadRequest, LocalPlaylistVideoItem } from '../shared/types';

let authService: GoogleAuthService;
let youtubeService: YouTubeApiService | null = null;
let queueManager: QueueManager;

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

  ipcMain.handle('youtube:getChannelVideos', async (_event, channelId: string, maxResults?: number) => {
    return getYouTubeService().getChannelVideos(channelId, maxResults);
  });

  ipcMain.handle('youtube:getVideoInfo', async (_event, videoId: string) => {
    return getYouTubeService().getVideoInfo(videoId);
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

    // Collect all media files in the folder (one level deep)
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

    // Normalise a string the same way yt-dlp does: collapse special chars to spaces/underscores
    function normalise(s: string): string {
      return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    const history = getDownloadHistory(100000);
    let updated = 0;
    let stillMissing = 0;

    for (const record of history) {
      if (record.filePath && fs.existsSync(record.filePath)) continue; // already fine

      // Try to find a file whose basename matches the record title
      const titleNorm = normalise(record.title);
      const match = files.find((f) => {
        const base = normalise(path.basename(f, path.extname(f)));
        return base === titleNorm || base.startsWith(titleNorm.slice(0, 30));
      });

      if (match) {
        updateDownloadFilePath(record.id, match);
        updated++;
      } else {
        stillMissing++;
      }
    }

    return { updated, stillMissing };
  });

  // ─── Library ─────────────────────────────────────────────────────────────────

  ipcMain.handle('library:getAll', (_event, opts?: any) => {
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

  // Persist update cache to disk so it survives app restarts
  const updateCachePath = path.join(app.getPath('userData'), 'update-cache.json');
  let lastETag: string | null = null;
  let cachedRelease: any = null;
  try {
    const cached = JSON.parse(fs.readFileSync(updateCachePath, 'utf8'));
    lastETag = cached.etag || null;
    cachedRelease = cached.release || null;
  } catch {}

  function saveUpdateCache() {
    try {
      fs.writeFileSync(updateCachePath, JSON.stringify({ etag: lastETag, release: cachedRelease }));
    } catch {}
  }

  ipcMain.handle('app:checkForUpdates', async () => {
    const currentVersion = app.getVersion();

    try {
      const https = require('https');

      const release: any = await new Promise((resolve, reject) => {
        const headers: Record<string, string> = { 'User-Agent': 'ytd-updater' };
        if (lastETag) headers['If-None-Match'] = lastETag;

        https.get({
          hostname: 'api.github.com',
          path: '/repos/jpurusho/ytd/releases/latest',
          headers,
        }, (res: any) => {
          let data = '';
          res.on('data', (chunk: string) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode === 200) {
              lastETag = res.headers['etag'] || null;
              cachedRelease = JSON.parse(data);
              saveUpdateCache();
              resolve(cachedRelease);
            } else if (res.statusCode === 304) {
              resolve(cachedRelease);
            } else if (res.statusCode === 404) {
              reject(new Error('No releases found.'));
            } else if (res.statusCode === 403 || res.statusCode === 429) {
              if (cachedRelease) resolve(cachedRelease);
              else reject(new Error('GitHub API rate limit. Try again later.'));
            } else {
              reject(new Error(`Update check failed (HTTP ${res.statusCode}).`));
            }
          });
        }).on('error', (err: any) => {
          if (cachedRelease) resolve(cachedRelease);
          else reject(new Error(`Cannot reach GitHub: ${err.message}`));
        });
      });

      const latestVersion = release.tag_name?.replace(/^v/, '') || '';
      const zipAsset = (release.assets || []).find((a: any) => a.name?.endsWith('.zip'));
      const downloadUrl = zipAsset?.browser_download_url || release.html_url || '';

      if (!latestVersion) return { status: 'error', message: 'Could not determine latest version' };

      const isNewer = latestVersion.localeCompare(currentVersion, undefined, { numeric: true }) > 0;
      if (isNewer) {
        return { status: 'available', version: latestVersion, url: downloadUrl };
      }
      return { status: 'up-to-date', version: currentVersion };
    } catch (err: any) {
      return { status: 'error', message: err.message };
    }
  });

  ipcMain.handle('app:downloadUpdate', async (_event, downloadUrl: string) => {
    const https = require('https');
    const os = require('os');
    const dir = path.join(os.homedir(), 'Downloads');
    const fileName = downloadUrl.split('/').pop() || 'ytd-update.zip';
    const destPath = path.join(dir, fileName);

    return new Promise((resolve, reject) => {
      const follow = (url: string) => {
        https.get(url, { headers: { 'User-Agent': 'ytd-updater' } }, (res: any) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            return follow(res.headers.location);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          let downloaded = 0;
          const file = fs.createWriteStream(destPath);

          res.on('data', (chunk: Buffer) => {
            downloaded += chunk.length;
            for (const win of BrowserWindow.getAllWindows()) {
              if (!win.isDestroyed()) {
                win.webContents.send('app:downloadProgress', {
                  downloaded,
                  total: totalBytes,
                  percent: totalBytes ? Math.round((downloaded / totalBytes) * 100) : 0,
                });
              }
            }
          });

          res.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve({ success: true, path: destPath, size: downloaded });
          });
          file.on('error', (err: any) => {
            fs.unlinkSync(destPath);
            reject(err);
          });
        }).on('error', reject);
      };
      follow(downloadUrl);
    });
  });

  // ─── Video Playback ───────────────────────────────────────────────────────

  ipcMain.handle('app:getVideoFileUrl', (_event, filePath: string) => {
    const fs = require('fs');
    if (!fs.existsSync(filePath)) {
      return { error: 'File not found. It may have been moved or deleted.' };
    }
    const encoded = encodeURIComponent(filePath);
    return { url: `local-media://${encoded}` };
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
        duration: 0,
      });
    }

    updateLocalPlaylist(targetId, { lastSyncedAt: new Date().toISOString() });
    return getLocalPlaylist(targetId);
  });
}
