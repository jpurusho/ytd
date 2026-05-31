import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import type { PeerInfo, PeerManifest, PeerPlaylistDetail } from './sync-types';

export class SyncClient {
  private address: string;
  private port: number;

  constructor(peer: PeerInfo) {
    this.address = peer.address;
    this.port = peer.port;
  }

  async getManifest(): Promise<PeerManifest> {
    return this.fetchJson('/manifest');
  }

  async getPlaylistDetail(playlistId: number): Promise<PeerPlaylistDetail> {
    return this.fetchJson(`/playlist/${playlistId}`);
  }

  async downloadFile(
    videoId: string,
    destPath: string,
    options?: {
      onProgress?: (downloadedBytes: number, totalBytes: number) => void;
      signal?: AbortSignal;
      resumeFrom?: number;
    }
  ): Promise<void> {
    const partialPath = destPath + '.partial';
    const resumeFrom = options?.resumeFrom || 0;

    return new Promise((resolve, reject) => {
      if (options?.signal?.aborted) {
        reject(new Error('Aborted'));
        return;
      }

      const headers: Record<string, string> = {};
      if (resumeFrom > 0) {
        headers['Range'] = `bytes=${resumeFrom}-`;
      }

      const req = http.get({
        hostname: this.address,
        port: this.port,
        path: `/file/${encodeURIComponent(videoId)}`,
        headers,
      }, (res) => {
        if (res.statusCode !== 200 && res.statusCode !== 206) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const totalFromHeader = res.headers['content-length'];
        const contentRange = res.headers['content-range'];
        let totalBytes = 0;

        if (contentRange) {
          const match = contentRange.match(/\/(\d+)/);
          if (match) totalBytes = parseInt(match[1], 10);
        } else if (totalFromHeader) {
          totalBytes = parseInt(totalFromHeader, 10) + resumeFrom;
        }

        const dir = path.dirname(partialPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const writeStream = fs.createWriteStream(partialPath, {
          flags: resumeFrom > 0 ? 'a' : 'w',
        });

        let downloaded = resumeFrom;

        res.on('data', (chunk: Buffer) => {
          if (options?.signal?.aborted) {
            res.destroy();
            writeStream.close();
            reject(new Error('Aborted'));
            return;
          }
          downloaded += chunk.length;
          writeStream.write(chunk);
          options?.onProgress?.(downloaded, totalBytes);
        });

        res.on('end', () => {
          writeStream.close(() => {
            if (options?.signal?.aborted) {
              reject(new Error('Aborted'));
              return;
            }
            // Rename .partial to final
            try {
              if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
              fs.renameSync(partialPath, destPath);
              resolve();
            } catch (err) {
              reject(err);
            }
          });
        });

        res.on('error', (err) => {
          writeStream.close();
          reject(err);
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (options?.signal) {
        options.signal.addEventListener('abort', () => {
          req.destroy();
        }, { once: true });
      }
    });
  }

  async uploadFile(
    filePath: string,
    metadata: {
      videoId: string; title: string; channel: string; thumbnailUrl: string;
      url: string; format: string; resolution: string; fileSize: number;
      duration: number; playlistName: string;
    },
    options?: { onProgress?: (uploaded: number, total: number) => void; signal?: AbortSignal }
  ): Promise<{ status: string }> {
    return new Promise((resolve, reject) => {
      if (options?.signal?.aborted) { reject(new Error('Aborted')); return; }

      const stat = fs.statSync(filePath);
      const totalBytes = stat.size;

      const req = http.request({
        hostname: this.address,
        port: this.port,
        path: '/upload',
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(totalBytes),
          'X-Video-Id': metadata.videoId,
          'X-Title': encodeURIComponent(metadata.title),
          'X-Channel': encodeURIComponent(metadata.channel),
          'X-Thumbnail-Url': metadata.thumbnailUrl,
          'X-Url': metadata.url,
          'X-Format': metadata.format,
          'X-Resolution': metadata.resolution,
          'X-File-Size': String(metadata.fileSize),
          'X-Duration': String(metadata.duration),
          'X-Playlist-Name': encodeURIComponent(metadata.playlistName),
        },
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try { resolve(JSON.parse(data)); } catch { resolve({ status: 'ok' }); }
          } else {
            reject(new Error(`Upload failed: HTTP ${res.statusCode}`));
          }
        });
      });

      req.on('error', reject);
      if (options?.signal) {
        options.signal.addEventListener('abort', () => { req.destroy(); }, { once: true });
      }

      const readStream = fs.createReadStream(filePath);
      let uploaded = 0;
      readStream.on('data', (chunk) => {
        uploaded += (chunk as Buffer).length;
        options?.onProgress?.(uploaded, totalBytes);
      });
      readStream.pipe(req);
    });
  }

  private fetchJson<T>(urlPath: string): Promise<T> {
    return new Promise((resolve, reject) => {
      http.get({
        hostname: this.address,
        port: this.port,
        path: urlPath,
      }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(new Error('Invalid JSON response'));
          }
        });
        res.on('error', reject);
      }).on('error', reject);
    });
  }
}
