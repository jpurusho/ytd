import { getDb, getSetting, setSetting } from '../database';
import { randomUUID } from 'crypto';
import type { SyncSessionInfo, SyncTransferInfo } from './sync-types';

export function initSyncTables(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      peer_device_name TEXT NOT NULL,
      peer_address TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('send', 'receive')),
      status TEXT NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress', 'completed', 'paused', 'failed', 'cancelled')),
      playlists_synced TEXT,
      total_files INTEGER DEFAULT 0,
      completed_files INTEGER DEFAULT 0,
      total_bytes INTEGER DEFAULT 0,
      transferred_bytes INTEGER DEFAULT 0,
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      video_id TEXT NOT NULL,
      title TEXT,
      file_size INTEGER DEFAULT 0,
      transferred_bytes INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'transferring', 'completed', 'failed', 'skipped')),
      started_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (session_id) REFERENCES sync_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sync_shared_playlists (
      playlist_id INTEGER PRIMARY KEY,
      shared_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (playlist_id) REFERENCES local_playlists(id) ON DELETE CASCADE
    );
  `);
}

export function getInstanceId(): string {
  let id = getSetting('sync_instance_id');
  if (!id) {
    id = randomUUID();
    setSetting('sync_instance_id', id);
  }
  return id;
}

export function createSyncSession(data: {
  peerDeviceName: string;
  peerAddress: string;
  direction: 'send' | 'receive';
  playlistsSynced: string;
  totalFiles: number;
  totalBytes: number;
}): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO sync_sessions (peer_device_name, peer_address, direction, playlists_synced, total_files, total_bytes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(data.peerDeviceName, data.peerAddress, data.direction, data.playlistsSynced, data.totalFiles, data.totalBytes);
  return result.lastInsertRowid as number;
}

export function updateSyncSession(id: number, updates: Partial<{
  status: string;
  completedFiles: number;
  transferredBytes: number;
  completedAt: string;
  error: string;
}>): void {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.completedFiles !== undefined) { fields.push('completed_files = ?'); values.push(updates.completedFiles); }
  if (updates.transferredBytes !== undefined) { fields.push('transferred_bytes = ?'); values.push(updates.transferredBytes); }
  if (updates.completedAt !== undefined) { fields.push('completed_at = ?'); values.push(updates.completedAt); }
  if (updates.error !== undefined) { fields.push('error = ?'); values.push(updates.error); }
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE sync_sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function getSyncSession(id: number): SyncSessionInfo | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM sync_sessions WHERE id = ?').get(id) as any;
  return row ? rowToSession(row) : null;
}

export function getSyncHistory(limit: number = 20): SyncSessionInfo[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM sync_sessions ORDER BY started_at DESC LIMIT ?').all(limit) as any[];
  return rows.map(rowToSession);
}

export function createSyncTransfer(sessionId: number, videoId: string, title: string, fileSize: number): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO sync_transfers (session_id, video_id, title, file_size) VALUES (?, ?, ?, ?)
  `).run(sessionId, videoId, title, fileSize);
  return result.lastInsertRowid as number;
}

export function updateSyncTransfer(id: number, updates: Partial<{
  status: string;
  transferredBytes: number;
  startedAt: string;
  completedAt: string;
}>): void {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.transferredBytes !== undefined) { fields.push('transferred_bytes = ?'); values.push(updates.transferredBytes); }
  if (updates.startedAt !== undefined) { fields.push('started_at = ?'); values.push(updates.startedAt); }
  if (updates.completedAt !== undefined) { fields.push('completed_at = ?'); values.push(updates.completedAt); }
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE sync_transfers SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function getSyncTransfers(sessionId: number): SyncTransferInfo[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM sync_transfers WHERE session_id = ? ORDER BY id ASC').all(sessionId) as any[];
  return rows.map(rowToTransfer);
}

export function addSharedPlaylist(playlistId: number): void {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO sync_shared_playlists (playlist_id) VALUES (?)').run(playlistId);
}

export function removeSharedPlaylist(playlistId: number): void {
  const db = getDb();
  db.prepare('DELETE FROM sync_shared_playlists WHERE playlist_id = ?').run(playlistId);
}

export function clearSyncHistory(): void {
  const db = getDb();
  db.exec('DELETE FROM sync_transfers');
  db.exec('DELETE FROM sync_sessions');
}

export function getSharedPlaylistIds(): number[] {
  const db = getDb();
  const rows = db.prepare('SELECT playlist_id FROM sync_shared_playlists').all() as any[];
  return rows.map(r => r.playlist_id);
}

function rowToSession(row: any): SyncSessionInfo {
  return {
    id: row.id,
    peerDeviceName: row.peer_device_name,
    peerAddress: row.peer_address,
    direction: row.direction,
    status: row.status,
    playlistsSynced: row.playlists_synced || '',
    totalFiles: row.total_files,
    completedFiles: row.completed_files,
    totalBytes: row.total_bytes,
    transferredBytes: row.transferred_bytes,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    error: row.error,
  };
}

function rowToTransfer(row: any): SyncTransferInfo {
  return {
    id: row.id,
    sessionId: row.session_id,
    videoId: row.video_id,
    title: row.title || '',
    fileSize: row.file_size,
    transferredBytes: row.transferred_bytes,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}
