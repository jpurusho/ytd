import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { app, BrowserWindow } from 'electron';

const MAX_LOG_SIZE = 2 * 1024 * 1024; // 2MB

export function syncLog(msg: string): void {
  const outputDir = getSetting('output_dir') || path.join(os.homedir(), 'Downloads');
  const logPath = path.join(outputDir, 'ytd-sync.log');
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(`[sync] ${msg}`);
  try {
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > MAX_LOG_SIZE) {
      const oldPath = logPath + '.old';
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      fs.renameSync(logPath, oldPath);
    }
    fs.appendFileSync(logPath, line);
  } catch {}
}
import { SyncDiscovery } from './sync-discovery';
import { SyncServer } from './sync-server';
import { SyncClient } from './sync-client';
import {
  initSyncTables, getInstanceId,
  createSyncSession, updateSyncSession, getSyncHistory, getSyncSession,
  createSyncTransfer, updateSyncTransfer, getSyncTransfers, clearSyncHistory,
} from './sync-database';
import { getLibraryItem, upsertLibraryItem, toRelativePath, resolveFilePath, getSetting, addPlaylistItem, createLocalPlaylist, getLocalPlaylists, getPlaylistItems, getLibraryStats } from '../database';
import type { PeerInfo, PeerManifest, PeerPlaylistDetail, SyncProgress, SyncSessionInfo, SyncTransferInfo } from './sync-types';

export interface SyncPreview {
  receive: { count: number; totalSize: number; playlists: string[] };
  send: { count: number; totalSize: number; playlists: string[] };
}

export class SyncManager {
  private discovery: SyncDiscovery;
  private server: SyncServer;
  private started = false;
  private activeAbort: AbortController | null = null;
  private activeSessionId: number | null = null;

  constructor() {
    initSyncTables();
    this.discovery = new SyncDiscovery(getInstanceId());
    this.server = new SyncServer();
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const port = await this.server.start();
    const stats = getLibraryStats();
    syncLog(`App started. Sync server on port ${port}. Library: ${stats.totalItems} items, ${stats.downloadedCount} downloaded. Device: ${os.hostname()}`);

    this.discovery.startAdvertising(port, {
      deviceName: os.hostname(),
      version: app.getVersion(),
      libraryCount: stats.totalItems,
    });

    this.discovery.startBrowsing();

    this.discovery.on('peer-found', (peer: PeerInfo) => {
      this.sendToRenderer('sync:peerFound', peer);
    });

    this.discovery.on('peer-lost', (peerId: string) => {
      this.sendToRenderer('sync:peerLost', peerId);
    });
  }

  stop(): void {
    this.discovery.stop();
    this.server.stop();
    this.started = false;
  }

  getPeers(): PeerInfo[] {
    return this.discovery.getPeers();
  }

  async getManifest(peer: PeerInfo): Promise<PeerManifest> {
    const client = new SyncClient(peer);
    return client.getManifest();
  }

  async getPlaylistDetail(peer: PeerInfo, playlistId: number): Promise<PeerPlaylistDetail> {
    const client = new SyncClient(peer);
    return client.getPlaylistDetail(playlistId);
  }

  async getSyncPreview(peer: PeerInfo): Promise<SyncPreview> {
    const client = new SyncClient(peer);
    const peerManifest = await client.getManifest();

    const peerPlaylists: PeerPlaylistDetail[] = [];
    for (const pl of peerManifest.playlists) {
      const detail = await client.getPlaylistDetail(pl.id);
      peerPlaylists.push(detail);
    }

    const { receiveList, sendList } = this.computeDiff(peerPlaylists);

    const receivePlaylists = [...new Set(receiveList.map(t => t.playlistName))];
    const sendPlaylists = [...new Set(sendList.map(t => t.playlistName))];

    return {
      receive: { count: receiveList.length, totalSize: receiveList.reduce((s, t) => s + t.fileSize, 0), playlists: receivePlaylists },
      send: { count: sendList.length, totalSize: sendList.reduce((s, t) => s + t.fileSize, 0), playlists: sendPlaylists },
    };
  }

  async startSync(peer: PeerInfo): Promise<number> {
    const client = new SyncClient(peer);
    const outputDir = getSetting('output_dir') || path.join(os.homedir(), 'Downloads');

    const peerManifest = await client.getManifest();
    const peerPlaylists: PeerPlaylistDetail[] = [];
    for (const pl of peerManifest.playlists) {
      const detail = await client.getPlaylistDetail(pl.id);
      peerPlaylists.push(detail);
    }

    const { receiveList, sendList } = this.computeDiff(peerPlaylists);

    const totalFiles = receiveList.length + sendList.length;
    const totalBytes = receiveList.reduce((s, t) => s + t.fileSize, 0) + sendList.reduce((s, t) => s + t.fileSize, 0);
    const playlistNames = [...new Set([...receiveList.map(t => t.playlistName), ...sendList.map(t => t.playlistName)])].join(', ');

    const sessionId = createSyncSession({
      peerDeviceName: peer.deviceName,
      peerAddress: `${peer.address}:${peer.port}`,
      direction: 'receive',
      playlistsSynced: playlistNames,
      totalFiles,
      totalBytes,
    });

    const transferIds: number[] = [];
    for (const t of receiveList) transferIds.push(createSyncTransfer(sessionId, t.videoId, t.title, t.fileSize));
    for (const t of sendList) transferIds.push(createSyncTransfer(sessionId, t.videoId, t.title, t.fileSize));

    this.activeSessionId = sessionId;
    this.activeAbort = new AbortController();

    this.processSync(client, sessionId, receiveList, sendList, transferIds, peerPlaylists, outputDir)
      .catch(err => {
        syncLog(`processSync FATAL: ${err.message}`);
        updateSyncSession(sessionId, { status: 'failed', error: err.message, completedAt: new Date().toISOString() });
        this.sendSessionUpdate(sessionId);
      });
    return sessionId;
  }

  pauseSync(sessionId: number): void {
    if (this.activeSessionId === sessionId && this.activeAbort) {
      this.activeAbort.abort();
      updateSyncSession(sessionId, { status: 'paused' });
      this.sendSessionUpdate(sessionId);
    }
  }

  async resumeSync(sessionId: number): Promise<void> {
    const session = getSyncSession(sessionId);
    if (!session || session.status !== 'paused') return;

    updateSyncSession(sessionId, { status: 'in_progress' });
    this.activeSessionId = sessionId;
    this.activeAbort = new AbortController();

    const allTransfers = getSyncTransfers(sessionId);
    const pending = allTransfers.filter(t => t.status === 'pending' || t.status === 'transferring');
    if (pending.length === 0) return;

    const [address, portStr] = session.peerAddress.split(':');
    const peer: PeerInfo = { instanceId: '', deviceName: session.peerDeviceName, address, port: parseInt(portStr, 10), version: '', libraryCount: 0 };
    const client = new SyncClient(peer);
    const outputDir = getSetting('output_dir') || path.join(os.homedir(), 'Downloads');

    // Re-fetch playlists for metadata
    let peerPlaylists: PeerPlaylistDetail[] = [];
    try {
      const manifest = await client.getManifest();
      for (const pl of manifest.playlists) {
        peerPlaylists.push(await client.getPlaylistDetail(pl.id));
      }
    } catch {}

    const receiveList = pending.map(t => ({ videoId: t.videoId, title: t.title, fileSize: t.fileSize, playlistName: '' }));

    this.processSync(client, sessionId, receiveList, [], pending.map(t => t.id), peerPlaylists, outputDir);
  }

  cancelSync(sessionId: number): void {
    if (this.activeSessionId === sessionId && this.activeAbort) {
      this.activeAbort.abort();
    }
    updateSyncSession(sessionId, { status: 'cancelled', completedAt: new Date().toISOString() });
    this.activeSessionId = null;
    this.sendSessionUpdate(sessionId);
  }

  getSyncHistoryList(limit?: number): SyncSessionInfo[] {
    return getSyncHistory(limit);
  }

  clearHistory(): void {
    clearSyncHistory();
  }

  getSyncSessionTransfers(sessionId: number): SyncTransferInfo[] {
    return getSyncTransfers(sessionId);
  }

  async getSyncPreviewDetailed(peer: PeerInfo): Promise<{ receive: any[]; send: any[] }> {
    const client = new SyncClient(peer);
    const peerManifest = await client.getManifest();
    const peerPlaylists: PeerPlaylistDetail[] = [];
    for (const pl of peerManifest.playlists) {
      peerPlaylists.push(await client.getPlaylistDetail(pl.id));
    }
    const { receiveList, sendList } = this.computeDiff(peerPlaylists);
    return { receive: receiveList, send: sendList };
  }

  private computeDiff(peerPlaylists: PeerPlaylistDetail[]): {
    receiveList: Array<{ videoId: string; title: string; fileSize: number; playlistName: string }>;
    sendList: Array<{ videoId: string; title: string; fileSize: number; filePath: string; playlistName: string; metadata: any }>;
  } {
    // RECEIVE: videos peer has that we don't
    const receiveList: Array<{ videoId: string; title: string; fileSize: number; playlistName: string }> = [];
    for (const pl of peerPlaylists) {
      syncLog(`Peer playlist "${pl.name}": ${pl.items.length} items`);
      for (const item of pl.items) {
        if (!item.hasFile || item.fileSize === 0) {
          syncLog(`  SKIP ${item.videoId} "${item.title}" — hasFile=${item.hasFile} fileSize=${item.fileSize}`);
          continue;
        }
        if (receiveList.some(t => t.videoId === item.videoId)) continue;
        const local = getLibraryItem(item.videoId);
        if (local && local.filePath && local.fileSize === item.fileSize && fs.existsSync(local.filePath)) {
          syncLog(`  SKIP ${item.videoId} — already have locally (${local.fileSize} bytes)`);
          continue;
        }
        syncLog(`  RECEIVE ${item.videoId} "${item.title}" (${item.fileSize} bytes)`);
        receiveList.push({ videoId: item.videoId, title: item.title, fileSize: item.fileSize, playlistName: pl.name });
      }
    }
    syncLog(`Total to receive: ${receiveList.length}`);

    // SEND: videos we have that peer doesn't
    const sendList: Array<{ videoId: string; title: string; fileSize: number; filePath: string; playlistName: string; metadata: any }> = [];
    const peerVideoIds = new Set<string>();
    for (const pl of peerPlaylists) {
      for (const item of pl.items) {
        if (item.hasFile) peerVideoIds.add(item.videoId);
      }
    }

    const localPlaylists = getLocalPlaylists();
    for (const lp of localPlaylists) {
      const items = getPlaylistItems(lp.id);
      for (const item of items) {
        const lib = getLibraryItem(item.videoId);
        if (!lib || !lib.filePath || lib.fileSize === 0) continue;
        if (!fs.existsSync(lib.filePath)) continue;
        if (peerVideoIds.has(item.videoId)) continue;
        if (sendList.some(t => t.videoId === item.videoId)) continue;
        sendList.push({
          videoId: item.videoId,
          title: lib.title,
          fileSize: lib.fileSize,
          filePath: lib.filePath,
          playlistName: lp.name,
          metadata: {
            channel: lib.channel, thumbnailUrl: lib.thumbnailUrl || '', url: lib.url,
            format: lib.format || 'mp4', resolution: lib.resolution || '',
            duration: lib.duration,
          },
        });
      }
    }

    return { receiveList, sendList };
  }

  private async processSync(
    client: SyncClient,
    sessionId: number,
    receiveList: Array<{ videoId: string; title: string; fileSize: number; playlistName: string }>,
    sendList: Array<{ videoId: string; title: string; fileSize: number; filePath?: string; playlistName: string; metadata?: any }>,
    transferIds: number[],
    peerPlaylists: PeerPlaylistDetail[],
    outputDir: string
  ): Promise<void> {
    let completedFiles = 0;
    let totalTransferred = 0;
    const totalFiles = receiveList.length + sendList.length;
    const totalBytes = [...receiveList, ...sendList].reduce((s, t) => s + t.fileSize, 0);
    const startTime = Date.now();

    // Phase 1: RECEIVE files from peer
    for (let i = 0; i < receiveList.length; i++) {
      if (this.activeAbort?.signal.aborted) break;
      const transfer = receiveList[i];
      const transferId = transferIds[i];

      const peerItem = peerPlaylists.flatMap(p => p.items).find(v => v.videoId === transfer.videoId);
      const ext = peerItem?.format || 'mp4';
      const destPath = path.join(outputDir, `${transfer.title.replace(/[<>:"/\\|?*]/g, '_')}.${ext}`);
      const partialPath = destPath + '.partial';

      let resumeFrom = 0;
      if (fs.existsSync(partialPath)) resumeFrom = fs.statSync(partialPath).size;

      updateSyncTransfer(transferId, { status: 'transferring', startedAt: new Date().toISOString() });
      syncLog(`Downloading ${transfer.videoId} → ${destPath} (resume=${resumeFrom})`);

      try {
        await client.downloadFile(transfer.videoId, destPath, {
          signal: this.activeAbort?.signal,
          resumeFrom,
          onProgress: (downloaded, total) => {
            this.emitProgress(sessionId, transfer, downloaded, total, completedFiles, totalFiles, totalTransferred, totalBytes, startTime);
          },
        });

        totalTransferred += transfer.fileSize;
        completedFiles++;
        updateSyncTransfer(transferId, { status: 'completed', transferredBytes: transfer.fileSize, completedAt: new Date().toISOString() });

        upsertLibraryItem({
          videoId: transfer.videoId,
          title: transfer.title,
          channel: peerItem?.channel || '',
          thumbnailUrl: peerItem?.thumbnailUrl || '',
          url: peerItem?.url || `https://www.youtube.com/watch?v=${transfer.videoId}`,
          format: ext,
          resolution: peerItem?.resolution || '',
          filePath: toRelativePath(destPath),
          fileSize: transfer.fileSize,
          duration: peerItem?.duration || 0,
          downloadedAt: new Date().toISOString(),
        });

        // Add to local playlist
        if (transfer.playlistName) {
          let lp = getLocalPlaylists().find(p => p.name === transfer.playlistName);
          if (!lp) lp = createLocalPlaylist(transfer.playlistName);
          addPlaylistItem(lp.id, {
            videoId: transfer.videoId,
            title: transfer.title,
            channel: peerItem?.channel || '',
            thumbnailUrl: peerItem?.thumbnailUrl || '',
            duration: peerItem?.duration || 0,
          });
        }

        updateSyncSession(sessionId, { completedFiles, transferredBytes: totalTransferred });
      } catch (err: any) {
        if (err.message === 'Aborted') break;
        const errMsg = err.message || 'Unknown error';
        updateSyncTransfer(transferId, { status: 'failed', completedAt: new Date().toISOString() });
        updateSyncSession(sessionId, { error: `Failed: ${transfer.title} — ${errMsg}` });
        syncLog(`FAILED ${transfer.videoId} "${transfer.title}": ${errMsg}`);
      }
    }

    // Phase 2: SEND files to peer
    for (let i = 0; i < sendList.length; i++) {
      if (this.activeAbort?.signal.aborted) break;
      const transfer = sendList[i];
      const transferId = transferIds[receiveList.length + i];

      if (!transfer.filePath || !transfer.metadata) continue;

      updateSyncTransfer(transferId, { status: 'transferring', startedAt: new Date().toISOString() });

      try {
        const result = await client.uploadFile(transfer.filePath, {
          videoId: transfer.videoId,
          title: transfer.title,
          channel: transfer.metadata.channel,
          thumbnailUrl: transfer.metadata.thumbnailUrl,
          url: transfer.metadata.url,
          format: transfer.metadata.format,
          resolution: transfer.metadata.resolution,
          fileSize: transfer.fileSize,
          duration: transfer.metadata.duration,
          playlistName: transfer.playlistName,
        }, {
          signal: this.activeAbort?.signal,
          onProgress: (uploaded, total) => {
            this.emitProgress(sessionId, transfer, uploaded, total, completedFiles, totalFiles, totalTransferred, totalBytes, startTime);
          },
        });

        totalTransferred += transfer.fileSize;
        completedFiles++;
        updateSyncTransfer(transferId, { status: result.status === 'exists' ? 'skipped' : 'completed', transferredBytes: transfer.fileSize, completedAt: new Date().toISOString() });
        updateSyncSession(sessionId, { completedFiles, transferredBytes: totalTransferred });
      } catch (err: any) {
        if (err.message === 'Aborted') break;
        updateSyncTransfer(transferId, { status: 'failed', completedAt: new Date().toISOString() });
        syncLog(`Send FAILED ${transfer.videoId}: ${err.message}`);
      }
    }

    if (!this.activeAbort?.signal.aborted) {
      const finalStatus = completedFiles === 0 && totalFiles > 0 ? 'failed' : 'completed';
      const errorMsg = finalStatus === 'failed' ? `All ${totalFiles} transfers failed. Check that sender is running and files exist.` : undefined;
      updateSyncSession(sessionId, { status: finalStatus, completedFiles, transferredBytes: totalTransferred, completedAt: new Date().toISOString(), ...(errorMsg ? { error: errorMsg } : {}) });
      this.emitCompleted(sessionId, completedFiles, totalFiles, totalTransferred, totalBytes);
    }

    this.activeSessionId = null;
    this.sendSessionUpdate(sessionId);
  }

  private emitProgress(sessionId: number, transfer: { videoId: string; title: string; fileSize: number }, current: number, total: number, completedFiles: number, totalFiles: number, totalTransferred: number, totalBytes: number, startTime: number): void {
    const elapsed = (Date.now() - startTime) / 1000;
    const bytesTotal = totalTransferred + current;
    const speed = elapsed > 0 ? bytesTotal / elapsed : 0;
    const remaining = speed > 0 ? (totalBytes - bytesTotal) / speed : 0;

    const progress: SyncProgress = {
      sessionId,
      currentVideoId: transfer.videoId,
      currentTitle: transfer.title,
      fileProgress: total > 0 ? Math.round((current / total) * 100) : 0,
      speed: this.formatSpeed(speed),
      eta: this.formatEta(remaining),
      downloadedBytes: current,
      totalFileBytes: total,
      completedFiles,
      totalFiles,
      totalTransferredBytes: bytesTotal,
      totalSessionBytes: totalBytes,
      status: 'transferring',
    };
    this.sendToRenderer('sync:progress', progress);
  }

  private emitCompleted(sessionId: number, completedFiles: number, totalFiles: number, totalTransferred: number, totalBytes: number): void {
    this.sendToRenderer('sync:progress', {
      sessionId, currentVideoId: '', currentTitle: '', fileProgress: 100,
      speed: '', eta: '', downloadedBytes: 0, totalFileBytes: 0,
      completedFiles, totalFiles, totalTransferredBytes: totalTransferred,
      totalSessionBytes: totalBytes, status: 'completed',
    } as SyncProgress);
  }

  private formatSpeed(bytesPerSec: number): string {
    if (bytesPerSec >= 1_048_576) return `${(bytesPerSec / 1_048_576).toFixed(1)} MB/s`;
    if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
    return `${Math.round(bytesPerSec)} B/s`;
  }

  private formatEta(seconds: number): string {
    if (!isFinite(seconds) || seconds <= 0) return '--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  private sendToRenderer(channel: string, data: any): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, data);
    }
  }

  private sendSessionUpdate(sessionId: number): void {
    const session = getSyncSession(sessionId);
    if (session) this.sendToRenderer('sync:sessionUpdate', session);
  }
}
