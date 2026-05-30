import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { app, BrowserWindow } from 'electron';
import { SyncDiscovery } from './sync-discovery';
import { SyncServer } from './sync-server';
import { SyncClient } from './sync-client';
import {
  initSyncTables, getInstanceId, getSharedPlaylistIds,
  addSharedPlaylist, removeSharedPlaylist,
  createSyncSession, updateSyncSession, getSyncHistory, getSyncSession,
  createSyncTransfer, updateSyncTransfer, getSyncTransfers,
} from './sync-database';
import { getLibraryItem, upsertLibraryItem, toRelativePath, getSetting, addPlaylistItem, createLocalPlaylist, getLocalPlaylists, getLibraryStats } from '../database';
import type { PeerInfo, PeerManifest, PeerPlaylistDetail, SyncProgress, SyncSessionInfo, SyncTransferInfo } from './sync-types';

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

  async startSync(peer: PeerInfo, playlistIds: number[]): Promise<number> {
    const client = new SyncClient(peer);
    const outputDir = getSetting('output_dir') || path.join(os.homedir(), 'Downloads');

    // Fetch details for all selected playlists
    const playlists: PeerPlaylistDetail[] = [];
    for (const id of playlistIds) {
      const detail = await client.getPlaylistDetail(id);
      playlists.push(detail);
    }

    // Build transfer list (skip already-synced files)
    const transfers: Array<{ videoId: string; title: string; fileSize: number; playlistName: string }> = [];
    for (const pl of playlists) {
      for (const item of pl.items) {
        if (!item.hasFile || item.fileSize === 0) continue;
        const local = getLibraryItem(item.videoId);
        if (local && local.filePath && local.fileSize === item.fileSize) continue;
        // Check if already in transfer list (shared across playlists)
        if (transfers.some(t => t.videoId === item.videoId)) continue;
        transfers.push({ videoId: item.videoId, title: item.title, fileSize: item.fileSize, playlistName: pl.name });
      }
    }

    const totalBytes = transfers.reduce((sum, t) => sum + t.fileSize, 0);
    const playlistNames = playlists.map(p => p.name).join(', ');

    const sessionId = createSyncSession({
      peerDeviceName: peer.deviceName,
      peerAddress: `${peer.address}:${peer.port}`,
      direction: 'receive',
      playlistsSynced: playlistNames,
      totalFiles: transfers.length,
      totalBytes,
    });

    // Create transfer records
    const transferIds: number[] = [];
    for (const t of transfers) {
      const id = createSyncTransfer(sessionId, t.videoId, t.title, t.fileSize);
      transferIds.push(id);
    }

    this.activeSessionId = sessionId;
    this.activeAbort = new AbortController();

    // Process transfers
    this.processTransfers(client, sessionId, transfers, transferIds, playlists, outputDir);

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

    // Get remaining transfers
    const allTransfers = getSyncTransfers(sessionId);
    const pending = allTransfers.filter(t => t.status === 'pending' || t.status === 'transferring');
    if (pending.length === 0) return;

    const [address, portStr] = session.peerAddress.split(':');
    const peer: PeerInfo = { instanceId: '', deviceName: session.peerDeviceName, address, port: parseInt(portStr, 10), version: '', libraryCount: 0 };
    const client = new SyncClient(peer);
    const outputDir = getSetting('output_dir') || path.join(os.homedir(), 'Downloads');

    const transfers = pending.map(t => ({ videoId: t.videoId, title: t.title, fileSize: t.fileSize, playlistName: '' }));
    const transferIds = pending.map(t => t.id);

    this.processTransfers(client, sessionId, transfers, transferIds, [], outputDir);
  }

  cancelSync(sessionId: number): void {
    if (this.activeSessionId === sessionId && this.activeAbort) {
      this.activeAbort.abort();
    }
    updateSyncSession(sessionId, { status: 'cancelled', completedAt: new Date().toISOString() });
    // Clean up .partial files
    const transfers = getSyncTransfers(sessionId);
    const outputDir = getSetting('output_dir') || path.join(os.homedir(), 'Downloads');
    for (const t of transfers) {
      if (t.status === 'pending' || t.status === 'transferring') {
        const partialPath = path.join(outputDir, `${t.videoId}.partial`);
        try { if (fs.existsSync(partialPath)) fs.unlinkSync(partialPath); } catch {}
      }
    }
    this.activeSessionId = null;
    this.sendSessionUpdate(sessionId);
  }

  sharePlaylist(playlistId: number): void {
    addSharedPlaylist(playlistId);
  }

  unsharePlaylist(playlistId: number): void {
    removeSharedPlaylist(playlistId);
  }

  getSharedPlaylists(): number[] {
    return getSharedPlaylistIds();
  }

  getSyncHistoryList(limit?: number): SyncSessionInfo[] {
    return getSyncHistory(limit);
  }

  getSyncSessionTransfers(sessionId: number): SyncTransferInfo[] {
    return getSyncTransfers(sessionId);
  }

  private async processTransfers(
    client: SyncClient,
    sessionId: number,
    transfers: Array<{ videoId: string; title: string; fileSize: number; playlistName: string }>,
    transferIds: number[],
    playlists: PeerPlaylistDetail[],
    outputDir: string
  ): Promise<void> {
    let completedFiles = 0;
    let totalTransferred = 0;
    const startTime = Date.now();

    for (let i = 0; i < transfers.length; i++) {
      if (this.activeAbort?.signal.aborted) break;

      const transfer = transfers[i];
      const transferId = transferIds[i];
      const ext = this.guessExtension(transfer);
      const destPath = path.join(outputDir, `${transfer.title.replace(/[<>:"/\\|?*]/g, '_')}.${ext}`);
      const partialPath = destPath + '.partial';

      // Check for resume
      let resumeFrom = 0;
      if (fs.existsSync(partialPath)) {
        resumeFrom = fs.statSync(partialPath).size;
      }

      updateSyncTransfer(transferId, { status: 'transferring', startedAt: new Date().toISOString() });

      try {
        await client.downloadFile(transfer.videoId, destPath, {
          signal: this.activeAbort?.signal,
          resumeFrom,
          onProgress: (downloaded, total) => {
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = totalTransferred + downloaded - resumeFrom > 0
              ? (totalTransferred + downloaded - resumeFrom) / elapsed : 0;
            const remaining = (transfers.reduce((s, t) => s + t.fileSize, 0) - totalTransferred - downloaded) / (speed || 1);

            const progress: SyncProgress = {
              sessionId,
              currentVideoId: transfer.videoId,
              currentTitle: transfer.title,
              fileProgress: total > 0 ? Math.round((downloaded / total) * 100) : 0,
              speed: this.formatSpeed(speed),
              eta: this.formatEta(remaining),
              downloadedBytes: downloaded,
              totalFileBytes: total,
              completedFiles,
              totalFiles: transfers.length,
              totalTransferredBytes: totalTransferred + downloaded,
              totalSessionBytes: transfers.reduce((s, t) => s + t.fileSize, 0),
              status: 'transferring',
            };
            this.sendToRenderer('sync:progress', progress);
          },
        });

        // File downloaded successfully
        totalTransferred += transfer.fileSize;
        completedFiles++;

        updateSyncTransfer(transferId, {
          status: 'completed',
          transferredBytes: transfer.fileSize,
          completedAt: new Date().toISOString(),
        });

        // Upsert into library
        const manifest = playlists.flatMap(p => p.items).find(v => v.videoId === transfer.videoId);
        upsertLibraryItem({
          videoId: transfer.videoId,
          title: transfer.title,
          channel: manifest?.channel || '',
          thumbnailUrl: manifest?.thumbnailUrl || '',
          url: manifest?.url || `https://www.youtube.com/watch?v=${transfer.videoId}`,
          format: manifest?.format || ext,
          resolution: manifest?.resolution || '',
          filePath: toRelativePath(destPath),
          fileSize: transfer.fileSize,
          duration: manifest?.duration || 0,
          downloadedAt: new Date().toISOString(),
        });

        // Add to local playlists
        for (const pl of playlists) {
          if (pl.items.some(item => item.videoId === transfer.videoId)) {
            let localPlaylist = getLocalPlaylists().find(lp => lp.name === pl.name);
            if (!localPlaylist) {
              localPlaylist = createLocalPlaylist(pl.name, pl.description);
            }
            addPlaylistItem(localPlaylist.id, {
              videoId: transfer.videoId,
              title: transfer.title,
              channel: manifest?.channel || '',
              thumbnailUrl: manifest?.thumbnailUrl || '',
              duration: manifest?.duration || 0,
            });
          }
        }

        updateSyncSession(sessionId, { completedFiles, transferredBytes: totalTransferred });

      } catch (err: any) {
        if (err.message === 'Aborted') {
          updateSyncTransfer(transferId, { transferredBytes: resumeFrom });
          break;
        }
        updateSyncTransfer(transferId, { status: 'failed', completedAt: new Date().toISOString() });
        console.error(`[sync] Transfer failed for ${transfer.videoId}:`, err.message);
      }
    }

    // Finalize session
    if (!this.activeAbort?.signal.aborted) {
      updateSyncSession(sessionId, {
        status: 'completed',
        completedFiles,
        transferredBytes: totalTransferred,
        completedAt: new Date().toISOString(),
      });
      this.sendToRenderer('sync:progress', {
        sessionId, currentVideoId: '', currentTitle: '', fileProgress: 100,
        speed: '', eta: '', downloadedBytes: 0, totalFileBytes: 0,
        completedFiles, totalFiles: transfers.length,
        totalTransferredBytes: totalTransferred,
        totalSessionBytes: transfers.reduce((s, t) => s + t.fileSize, 0),
        status: 'completed',
      } as SyncProgress);
    }

    this.activeSessionId = null;
    this.sendSessionUpdate(sessionId);
  }

  private guessExtension(transfer: { videoId: string; title: string }): string {
    const lib = getLibraryItem(transfer.videoId);
    if (lib?.format) return lib.format;
    return 'mp4';
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
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    }
  }

  private sendSessionUpdate(sessionId: number): void {
    const session = getSyncSession(sessionId);
    if (session) this.sendToRenderer('sync:sessionUpdate', session);
  }
}
