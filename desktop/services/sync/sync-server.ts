import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { app } from 'electron';
import { getLibraryItem, resolveFilePath, getPlaylistItems, getLocalPlaylists, getLocalPlaylist, getLibraryStats, getSetting, upsertLibraryItem, toRelativePath, addPlaylistItem, createLocalPlaylist } from '../database';
import { getInstanceId } from './sync-database';
import type { PeerInfo, PeerManifest, PeerPlaylistDetail } from './sync-types';

const MAX_LOG_SIZE = 2 * 1024 * 1024; // 2MB

function serverLog(msg: string): void {
  const outputDir = getSetting('output_dir') || path.join(os.homedir(), 'Downloads');
  const logPath = path.join(outputDir, 'ytd-sync.log');
  const line = `[${new Date().toISOString()}] [server] ${msg}\n`;
  console.log(`[sync-server] ${msg}`);
  try {
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > MAX_LOG_SIZE) {
      const oldPath = logPath + '.old';
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      fs.renameSync(logPath, oldPath);
    }
    fs.appendFileSync(logPath, line);
  } catch {}
}

export class SyncServer {
  private server: http.Server | null = null;
  private port = 0;

  async start(): Promise<number> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.listen(0, '0.0.0.0', () => {
        const addr = this.server!.address() as { port: number };
        this.port = addr.port;
        console.log(`[sync-server] Listening on port ${this.port}`);
        resolve(this.port);
      });
    });
  }

  getPort(): number {
    return this.port;
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url || '/';
    const method = req.method || 'GET';

    res.setHeader('Access-Control-Allow-Origin', '*');

    if (method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (method === 'GET' && url === '/info') return this.handleInfo(res);
      if (method === 'GET' && url === '/manifest') { serverLog(`${req.socket.remoteAddress} → GET /manifest`); return this.handleManifest(res); }
      if (method === 'GET' && url.startsWith('/playlist/')) { serverLog(`${req.socket.remoteAddress} → GET ${url}`); return this.handlePlaylist(url, res); }
      if (method === 'GET' && url.startsWith('/file/')) { serverLog(`${req.socket.remoteAddress} → GET ${url}`); return this.handleFile(url, req, res); }
      if (method === 'POST' && url === '/upload') { serverLog(`${req.socket.remoteAddress} → POST /upload`); return this.handleUpload(req, res); }
      res.writeHead(404);
      res.end('Not found');
    } catch (err: any) {
      serverLog(`ERROR: ${err.message}`);
      res.writeHead(500);
      res.end('Internal error');
    }
  }

  private handleInfo(res: http.ServerResponse): void {
    const stats = getLibraryStats();
    const info: PeerInfo = {
      instanceId: getInstanceId(),
      deviceName: os.hostname(),
      address: '',
      port: this.port,
      version: app.getVersion(),
      libraryCount: stats.totalItems,
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(info));
  }

  private handleManifest(res: http.ServerResponse): void {
    const allPlaylists = getLocalPlaylists();
    const stats = getLibraryStats();

    const playlists = allPlaylists
      .map(pl => {
        const items = getPlaylistItems(pl.id);
        let totalSize = 0;
        let hasAnyFile = false;
        for (const item of items) {
          const lib = getLibraryItem(item.videoId);
          if (lib && lib.filePath && lib.fileSize > 0 && fs.existsSync(lib.filePath)) {
            totalSize += lib.fileSize;
            hasAnyFile = true;
          }
        }
        if (!hasAnyFile) return null;
        return { id: pl.id, name: pl.name, itemCount: items.length, totalSize };
      })
      .filter(Boolean) as Array<{ id: number; name: string; itemCount: number; totalSize: number }>;

    const manifest: PeerManifest = {
      peer: {
        instanceId: getInstanceId(),
        deviceName: os.hostname(),
        address: '',
        port: this.port,
        version: app.getVersion(),
        libraryCount: stats.totalItems,
      },
      playlists,
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(manifest));
  }

  private handlePlaylist(url: string, res: http.ServerResponse): void {
    const idStr = url.replace('/playlist/', '');
    const playlistId = parseInt(idStr, 10);
    if (isNaN(playlistId)) {
      res.writeHead(400);
      res.end('Invalid playlist ID');
      return;
    }

    const playlist = getLocalPlaylist(playlistId);
    if (!playlist) {
      res.writeHead(404);
      res.end('Playlist not found');
      return;
    }

    const items = getPlaylistItems(playlistId);
    const detail: PeerPlaylistDetail = {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      items: items.map(item => {
        const lib = getLibraryItem(item.videoId);
        const filePath = lib?.filePath;
        const hasFile = !!filePath && fs.existsSync(filePath);
        return {
          videoId: item.videoId,
          title: lib?.title || item.title,
          channel: lib?.channel || item.channel,
          thumbnailUrl: lib?.thumbnailUrl || item.thumbnailUrl,
          url: lib?.url || `https://www.youtube.com/watch?v=${item.videoId}`,
          format: lib?.format || '',
          resolution: lib?.resolution || '',
          fileSize: lib?.fileSize || 0,
          duration: lib?.duration || item.duration,
          hasFile,
        };
      }),
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(detail));
  }

  private handleFile(url: string, req: http.IncomingMessage, res: http.ServerResponse): void {
    const videoId = decodeURIComponent(url.replace('/file/', ''));
    const lib = getLibraryItem(videoId);
    if (!lib || !lib.filePath) {
      serverLog(`FILE 404: ${videoId} — no library entry or filePath`);
      res.writeHead(404);
      res.end('File not found');
      return;
    }

    const filePath = lib.filePath;
    if (!fs.existsSync(filePath)) {
      serverLog(`FILE 404: ${videoId} — path doesn't exist: ${filePath}`);
      res.writeHead(404);
      res.end('File not found on disk');
      return;
    }

    serverLog(`FILE 200: ${videoId} → ${filePath} (${lib.fileSize} bytes)`);

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const rangeHeader = req.headers['range'];

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        res.writeHead(206, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(chunkSize),
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }
    }

    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(fileSize),
      'Accept-Ranges': 'bytes',
      'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`,
    });
    fs.createReadStream(filePath).pipe(res);
  }

  private handleUpload(req: http.IncomingMessage, res: http.ServerResponse): void {
    const videoId = req.headers['x-video-id'] as string;
    const title = decodeURIComponent(req.headers['x-title'] as string || '');
    const channel = decodeURIComponent(req.headers['x-channel'] as string || '');
    const thumbnailUrl = req.headers['x-thumbnail-url'] as string || '';
    const url = req.headers['x-url'] as string || '';
    const format = req.headers['x-format'] as string || 'mp4';
    const resolution = req.headers['x-resolution'] as string || '';
    const fileSize = parseInt(req.headers['x-file-size'] as string || '0', 10);
    const duration = parseInt(req.headers['x-duration'] as string || '0', 10);
    const playlistName = decodeURIComponent(req.headers['x-playlist-name'] as string || '');

    if (!videoId || !title) {
      res.writeHead(400);
      res.end('Missing videoId or title');
      return;
    }

    const existing = getLibraryItem(videoId);
    if (existing && existing.filePath && existing.fileSize === fileSize && fs.existsSync(existing.filePath)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'exists' }));
      return;
    }

    const outputDir = getSetting('output_dir') || path.join(os.homedir(), 'Downloads');
    const safeName = title.replace(/[<>:"/\\|?*]/g, '_');
    const destPath = path.join(outputDir, `${safeName}.${format}`);
    const partialPath = destPath + '.partial';

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const writeStream = fs.createWriteStream(partialPath);

    req.pipe(writeStream);

    req.on('end', () => {
      writeStream.close(() => {
        try {
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
          fs.renameSync(partialPath, destPath);

          upsertLibraryItem({
            videoId, title, channel, thumbnailUrl, url,
            format, resolution,
            filePath: toRelativePath(destPath),
            fileSize, duration,
            downloadedAt: new Date().toISOString(),
          });

          if (playlistName) {
            const localPlaylists = getLocalPlaylists();
            let lp = localPlaylists.find(p => p.name === playlistName);
            if (!lp) lp = createLocalPlaylist(playlistName);
            addPlaylistItem(lp.id, { videoId, title, channel, thumbnailUrl, duration });
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
        } catch (err: any) {
          res.writeHead(500);
          res.end(err.message);
        }
      });
    });

    req.on('error', (err) => {
      writeStream.close();
      try { fs.unlinkSync(partialPath); } catch {}
      res.writeHead(500);
      res.end(err.message);
    });
  }
}
