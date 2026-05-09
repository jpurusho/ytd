import Database from 'better-sqlite3';
import { app } from 'electron';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import type { AuthTokens, UserInfo, QueueItem, DownloadRecord, DownloadRequest } from '../../shared/types';

let db: Database.Database;

const CONFIG_DIR = path.join(os.homedir(), '.ytd');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

interface AppConfig {
  dataDir?: string;
}

function loadConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveConfig(config: AppConfig): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('Failed to save config:', err);
  }
}

export function getDataDir(): string {
  const config = loadConfig();
  return config.dataDir || app.getPath('userData');
}

export function setDataDir(dir: string): void {
  const config = loadConfig();
  config.dataDir = dir;
  saveConfig(config);
}

function getDbPath(): string {
  return path.join(getDataDir(), 'ytd.db');
}

export function initDatabase(): void {
  const dbPath = getDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_type TEXT,
      expiry_date INTEGER,
      scope TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_info (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      email TEXT NOT NULL,
      name TEXT,
      picture TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id TEXT NOT NULL,
      title TEXT NOT NULL,
      channel TEXT,
      channel_id TEXT,
      thumbnail_url TEXT,
      url TEXT NOT NULL,
      format TEXT NOT NULL DEFAULT 'mp4',
      quality TEXT DEFAULT 'best',
      resolution TEXT,
      file_path TEXT,
      file_size INTEGER DEFAULT 0,
      duration INTEGER DEFAULT 0,
      start_time TEXT,
      end_time TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      error TEXT,
      downloaded_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id TEXT NOT NULL,
      title TEXT NOT NULL,
      channel TEXT,
      thumbnail_url TEXT,
      url TEXT NOT NULL,
      format TEXT NOT NULL DEFAULT 'mp4',
      quality TEXT DEFAULT 'best',
      resolution TEXT,
      start_time TEXT,
      end_time TEXT,
      priority INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      progress REAL DEFAULT 0,
      downloaded_bytes INTEGER DEFAULT 0,
      total_bytes INTEGER DEFAULT 0,
      speed TEXT,
      eta TEXT,
      error TEXT,
      temp_file_path TEXT,
      scheduled_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS local_playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      youtube_playlist_id TEXT,
      last_synced_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS local_playlist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      video_id TEXT NOT NULL,
      title TEXT NOT NULL,
      channel TEXT,
      thumbnail_url TEXT,
      duration INTEGER DEFAULT 0,
      published_at TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      added_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (playlist_id) REFERENCES local_playlists(id) ON DELETE CASCADE,
      UNIQUE(playlist_id, video_id)
    );
  `);

  // Migration: add published_at if missing
  const playlistItemCols = db.pragma('table_info(local_playlist_items)') as any[];
  const playlistItemColNames = new Set(playlistItemCols.map((c: any) => c.name));
  if (!playlistItemColNames.has('published_at')) {
    db.exec('ALTER TABLE local_playlist_items ADD COLUMN published_at TEXT');
  }
}

export function getDb(): Database.Database {
  return db;
}

// ─── Token helpers ──────────────────────────────────────────────────────────

export function saveTokens(tokens: AuthTokens): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO auth_tokens (id, access_token, refresh_token, token_type, expiry_date, scope, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, datetime('now'))
  `);
  stmt.run(tokens.access_token, tokens.refresh_token ?? null, tokens.token_type ?? null, tokens.expiry_date ?? null, tokens.scope ?? null);
}

export function getTokens(): AuthTokens | null {
  const row = db.prepare('SELECT * FROM auth_tokens WHERE id = 1').get() as any;
  if (!row) return null;
  return {
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    token_type: row.token_type,
    expiry_date: row.expiry_date,
    scope: row.scope,
  };
}

export function clearTokens(): void {
  db.prepare('DELETE FROM auth_tokens').run();
}

// ─── User info helpers ──────────────────────────────────────────────────────

export function saveUserInfo(user: UserInfo): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO user_info (id, email, name, picture, updated_at)
    VALUES (1, ?, ?, ?, datetime('now'))
  `);
  stmt.run(user.email, user.name, user.picture);
}

export function getUserInfo(): UserInfo | null {
  const row = db.prepare('SELECT * FROM user_info WHERE id = 1').get() as any;
  if (!row) return null;
  return {
    email: row.email,
    name: row.name,
    picture: row.picture,
  };
}

export function clearUserInfo(): void {
  db.prepare('DELETE FROM user_info').run();
}

// ─── App settings helpers ──────────────────────────────────────────────────

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as any;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(key, value);
}

// ─── Queue helpers ──────────────────────────────────────────────────────────

export function addToQueue(request: DownloadRequest): QueueItem {
  const stmt = db.prepare(`
    INSERT INTO queue (video_id, title, channel, thumbnail_url, url, format, quality, resolution, start_time, end_time, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `);
  const result = stmt.run(
    request.videoId, request.title, request.channel, request.thumbnailUrl,
    request.url, request.format, request.quality, request.resolution ?? null,
    request.startTime ?? null, request.endTime ?? null
  );
  return getQueueItem(result.lastInsertRowid as number)!;
}

export function getQueueItem(id: number): QueueItem | null {
  const row = db.prepare('SELECT * FROM queue WHERE id = ?').get(id) as any;
  return row ? rowToQueueItem(row) : null;
}

export function getQueue(): QueueItem[] {
  const rows = db.prepare('SELECT * FROM queue WHERE status NOT IN (\'completed\', \'cancelled\') ORDER BY priority DESC, created_at ASC').all() as any[];
  return rows.map(rowToQueueItem);
}

export function updateQueueItem(id: number, updates: Partial<Record<string, any>>): void {
  const fields: string[] = [];
  const values: any[] = [];

  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }

  if (fields.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE queue SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteQueueItem(id: number): void {
  db.prepare('DELETE FROM queue WHERE id = ?').run(id);
}

export function getPendingQueueItems(): QueueItem[] {
  const rows = db.prepare("SELECT * FROM queue WHERE status = 'pending' ORDER BY priority DESC, created_at ASC").all() as any[];
  return rows.map(rowToQueueItem);
}

export function getActiveQueueItems(): QueueItem[] {
  const rows = db.prepare("SELECT * FROM queue WHERE status = 'downloading' ORDER BY started_at ASC").all() as any[];
  return rows.map(rowToQueueItem);
}

// ─── Download history helpers ───────────────────────────────────────────────

export function addDownloadRecord(item: QueueItem, filePath: string, fileSize: number): DownloadRecord {
  const stmt = db.prepare(`
    INSERT INTO downloads (video_id, title, channel, channel_id, thumbnail_url, url, format, quality, resolution, file_path, file_size, duration, start_time, end_time, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'completed')
  `);
  const result = stmt.run(
    item.videoId, item.title, item.channel, null, item.thumbnailUrl,
    item.url, item.format, item.quality, item.resolution ?? null,
    filePath, fileSize, item.startTime ?? null, item.endTime ?? null
  );
  return getDownloadRecord(result.lastInsertRowid as number)!;
}

export function getDownloadRecord(id: number): DownloadRecord | null {
  const row = db.prepare('SELECT * FROM downloads WHERE id = ?').get(id) as any;
  return row ? rowToDownloadRecord(row) : null;
}

export function getDownloadHistory(limit: number = 100): DownloadRecord[] {
  const rows = db.prepare('SELECT * FROM downloads ORDER BY downloaded_at DESC LIMIT ?').all(limit) as any[];
  return rows.map(rowToDownloadRecord);
}

export function deleteDownloadRecords(ids: number[]): void {
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM downloads WHERE id IN (${placeholders})`).run(...ids);
}

export function clearDownloadHistory(): void {
  db.prepare('DELETE FROM downloads').run();
}

export function getStats(): { totalDownloads: number; totalSize: number; thisWeek: number } {
  const total = db.prepare('SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as size FROM downloads').get() as any;
  const week = db.prepare("SELECT COUNT(*) as count FROM downloads WHERE downloaded_at >= datetime('now', '-7 days')").get() as any;
  return {
    totalDownloads: total.count,
    totalSize: total.size,
    thisWeek: week.count,
  };
}

// ─── Local playlist helpers ─────────────────────────────────────────────────

export interface LocalPlaylistRow {
  id: number;
  name: string;
  description: string;
  youtubePlaylistId: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalPlaylistItemRow {
  id: number;
  playlistId: number;
  videoId: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
  duration: number;
  publishedAt: string;
  position: number;
  addedAt: string;
}

export function createLocalPlaylist(name: string, description: string = ''): LocalPlaylistRow {
  const stmt = db.prepare("INSERT INTO local_playlists (name, description) VALUES (?, ?)");
  const result = stmt.run(name, description);
  return getLocalPlaylist(result.lastInsertRowid as number)!;
}

export function getLocalPlaylist(id: number): LocalPlaylistRow | null {
  const row = db.prepare('SELECT * FROM local_playlists WHERE id = ?').get(id) as any;
  return row ? rowToLocalPlaylist(row) : null;
}

export function getLocalPlaylists(): LocalPlaylistRow[] {
  const rows = db.prepare('SELECT * FROM local_playlists ORDER BY updated_at DESC').all() as any[];
  return rows.map(rowToLocalPlaylist);
}

export function updateLocalPlaylist(id: number, updates: { name?: string; description?: string; youtubePlaylistId?: string | null; lastSyncedAt?: string | null }): LocalPlaylistRow | null {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.youtubePlaylistId !== undefined) { fields.push('youtube_playlist_id = ?'); values.push(updates.youtubePlaylistId); }
  if (updates.lastSyncedAt !== undefined) { fields.push('last_synced_at = ?'); values.push(updates.lastSyncedAt); }

  if (fields.length === 0) return getLocalPlaylist(id);
  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE local_playlists SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getLocalPlaylist(id);
}

export function deleteLocalPlaylist(id: number): void {
  db.prepare('DELETE FROM local_playlists WHERE id = ?').run(id);
}

export function addPlaylistItem(playlistId: number, item: { videoId: string; title: string; channel: string; thumbnailUrl: string; duration: number; publishedAt?: string }): LocalPlaylistItemRow {
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) as max FROM local_playlist_items WHERE playlist_id = ?').get(playlistId) as any;
  const position = (maxPos.max ?? -1) + 1;

  const stmt = db.prepare("INSERT OR IGNORE INTO local_playlist_items (playlist_id, video_id, title, channel, thumbnail_url, duration, published_at, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  stmt.run(playlistId, item.videoId, item.title, item.channel, item.thumbnailUrl, item.duration, item.publishedAt ?? null, position);

  db.prepare("UPDATE local_playlists SET updated_at = datetime('now') WHERE id = ?").run(playlistId);

  const row = db.prepare('SELECT * FROM local_playlist_items WHERE playlist_id = ? AND video_id = ?').get(playlistId, item.videoId) as any;
  return rowToPlaylistItem(row);
}

export function removePlaylistItem(playlistId: number, videoId: string): void {
  db.prepare('DELETE FROM local_playlist_items WHERE playlist_id = ? AND video_id = ?').run(playlistId, videoId);
  db.prepare("UPDATE local_playlists SET updated_at = datetime('now') WHERE id = ?").run(playlistId);
}

export function getPlaylistItems(playlistId: number): LocalPlaylistItemRow[] {
  const rows = db.prepare('SELECT * FROM local_playlist_items WHERE playlist_id = ? ORDER BY position ASC').all(playlistId) as any[];
  return rows.map(rowToPlaylistItem);
}

export function reorderPlaylistItem(playlistId: number, videoId: string, newPosition: number): void {
  const current = db.prepare('SELECT position FROM local_playlist_items WHERE playlist_id = ? AND video_id = ?').get(playlistId, videoId) as any;
  if (!current) return;

  const oldPosition = current.position;
  if (oldPosition === newPosition) return;

  if (newPosition > oldPosition) {
    db.prepare('UPDATE local_playlist_items SET position = position - 1 WHERE playlist_id = ? AND position > ? AND position <= ?').run(playlistId, oldPosition, newPosition);
  } else {
    db.prepare('UPDATE local_playlist_items SET position = position + 1 WHERE playlist_id = ? AND position >= ? AND position < ?').run(playlistId, newPosition, oldPosition);
  }

  db.prepare('UPDATE local_playlist_items SET position = ? WHERE playlist_id = ? AND video_id = ?').run(newPosition, playlistId, videoId);
  db.prepare("UPDATE local_playlists SET updated_at = datetime('now') WHERE id = ?").run(playlistId);
}

function rowToLocalPlaylist(row: any): LocalPlaylistRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    youtubePlaylistId: row.youtube_playlist_id ?? null,
    lastSyncedAt: row.last_synced_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToPlaylistItem(row: any): LocalPlaylistItemRow {
  return {
    id: row.id,
    playlistId: row.playlist_id,
    videoId: row.video_id,
    title: row.title,
    channel: row.channel || '',
    thumbnailUrl: row.thumbnail_url || '',
    duration: row.duration,
    publishedAt: row.published_at || '',
    position: row.position,
    addedAt: row.added_at,
  };
}

// ─── Row mappers ────────────────────────────────────────────────────────────

function rowToQueueItem(row: any): QueueItem {
  return {
    id: row.id,
    videoId: row.video_id,
    title: row.title,
    channel: row.channel || '',
    thumbnailUrl: row.thumbnail_url || '',
    url: row.url,
    format: row.format,
    quality: row.quality,
    resolution: row.resolution ?? undefined,
    startTime: row.start_time ?? undefined,
    endTime: row.end_time ?? undefined,
    priority: row.priority,
    status: row.status,
    progress: row.progress,
    downloadedBytes: row.downloaded_bytes,
    totalBytes: row.total_bytes,
    speed: row.speed || '',
    eta: row.eta || '',
    error: row.error ?? undefined,
    tempFilePath: row.temp_file_path ?? undefined,
    scheduledAt: row.scheduled_at ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
  };
}

function rowToDownloadRecord(row: any): DownloadRecord {
  return {
    id: row.id,
    videoId: row.video_id,
    title: row.title,
    channel: row.channel || '',
    channelId: row.channel_id ?? undefined,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    url: row.url,
    format: row.format,
    quality: row.quality,
    resolution: row.resolution ?? undefined,
    filePath: row.file_path || '',
    fileSize: row.file_size,
    duration: row.duration,
    startTime: row.start_time ?? undefined,
    endTime: row.end_time ?? undefined,
    status: row.status,
    error: row.error ?? undefined,
    downloadedAt: row.downloaded_at,
  };
}
