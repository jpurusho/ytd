import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { app } from 'electron';
import { getLibraryItems, getLibraryItem, resolveFilePath, getPlaylistItems, getLocalPlaylists, getLocalPlaylist, getLibraryStats } from '../database';
import { getSharedPlaylistIds, getInstanceId } from './sync-database';
import type { PeerInfo, PeerManifest, PeerPlaylistDetail, PeerVideoInfo } from './sync-types';

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

    if (method !== 'GET') {
      res.writeHead(405);
      res.end();
      return;
    }

    try {
      if (url === '/info') return this.handleInfo(res);
      if (url === '/manifest') return this.handleManifest(res);
      if (url.startsWith('/playlist/')) return this.handlePlaylist(url, res);
      if (url.startsWith('/file/')) return this.handleFile(url, req, res);
      res.writeHead(404);
      res.end('Not found');
    } catch (err: any) {
      console.error('[sync-server] Error:', err.message);
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
    const sharedIds = getSharedPlaylistIds();
    const allPlaylists = getLocalPlaylists();
    const stats = getLibraryStats();

    const playlists = allPlaylists
      .filter(pl => sharedIds.includes(pl.id))
      .map(pl => {
        const items = getPlaylistItems(pl.id);
        let totalSize = 0;
        for (const item of items) {
          const lib = getLibraryItem(item.videoId);
          if (lib && lib.fileSize > 0) totalSize += lib.fileSize;
        }
        return { id: pl.id, name: pl.name, itemCount: items.length, totalSize };
      });

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

    const sharedIds = getSharedPlaylistIds();
    if (!sharedIds.includes(playlistId)) {
      res.writeHead(403);
      res.end('Playlist not shared');
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
      res.writeHead(404);
      res.end('File not found');
      return;
    }

    const filePath = lib.filePath;
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('File not found on disk');
      return;
    }

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
}
