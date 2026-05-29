import Database from 'better-sqlite3';
import { app } from 'electron';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import type { AuthTokens, UserInfo, QueueItem, DownloadRecord, DownloadRequest, LibraryItem } from '../../shared/types';

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

    CREATE TABLE IF NOT EXISTS library (
      video_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      channel TEXT,
      channel_id TEXT,
      thumbnail_url TEXT,
      url TEXT NOT NULL,
      format TEXT,
      quality TEXT,
      resolution TEXT,
      file_path TEXT,
      file_size INTEGER DEFAULT 0,
      duration INTEGER DEFAULT 0,
      published_at TEXT,
      downloaded_at TEXT,
      added_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migration: add published_at if missing
  const playlistItemCols = db.pragma('table_info(local_playlist_items)') as any[];
  const playlistItemColNames = new Set(playlistItemCols.map((c: any) => c.name));
  if (!playlistItemColNames.has('published_at')) {
    db.exec('ALTER TABLE local_playlist_items ADD COLUMN published_at TEXT');
  }

  runMigrations();
}

function runMigrations(): void {
  const version = getSetting('schema_version');
  const currentVersion = parseInt(version || '1', 10);

  if (currentVersion < 2) {
    migrateToV2();
  }
}

function migrateToV2(): void {
  console.log('[db] Running migration to schema v2 (library table)...');

  const outputDir = getSetting('output_dir') || path.join(os.homedir(), 'Downloads');

  const migrate = db.transaction(() => {
    // 1. Populate library from downloads (dedup: keep most recent per video_id)
    db.exec(`
      INSERT OR IGNORE INTO library (video_id, title, channel, channel_id, thumbnail_url, url, format, quality, resolution, file_path, file_size, duration, downloaded_at, added_at, updated_at)
      SELECT video_id, title, channel, channel_id, thumbnail_url, url, format, quality, resolution, file_path, file_size, duration, downloaded_at, downloaded_at, downloaded_at
      FROM downloads
      WHERE id IN (
        SELECT id FROM downloads d1
        WHERE d1.id = (SELECT MAX(d2.id) FROM downloads d2 WHERE d2.video_id = d1.video_id)
      )
    `);

    // 2. Populate library from playlist items not already there
    db.exec(`
      INSERT OR IGNORE INTO library (video_id, title, channel, thumbnail_url, url, duration, published_at, added_at, updated_at)
      SELECT video_id, title, channel, thumbnail_url,
             'https://www.youtube.com/watch?v=' || video_id,
             duration, published_at, added_at, added_at
      FROM local_playlist_items
      WHERE video_id NOT IN (SELECT video_id FROM library)
    `);

    // 3. Convert absolute paths to relative in library
    const items = db.prepare('SELECT video_id, file_path FROM library WHERE file_path IS NOT NULL').all() as any[];
    const updatePath = db.prepare('UPDATE library SET file_path = ? WHERE video_id = ?');
    for (const item of items) {
      if (item.file_path && item.file_path.startsWith(outputDir)) {
        const relative = item.file_path.slice(outputDir.length).replace(/^[\/\\]/, '');
        updatePath.run(relative, item.video_id);
      }
    }

    // 4. Set schema version
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('schema_version', '2', datetime('now'))").run();
  });

  migrate();
  console.log('[db] Migration to schema v2 complete.');
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

export function updateDownloadFilePath(id: number, filePath: string): void {
  db.prepare('UPDATE downloads SET file_path = ? WHERE id = ?').run(filePath, id);
}

export function clearFailedQueue(): void {
  db.prepare("DELETE FROM queue WHERE status IN ('failed', 'cancelled')").run();
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

// ─── Path helpers ──────────────────────────────────────────────────────────

export function resolveFilePath(relativePath: string | null): string | null {
  if (!relativePath) return null;
  if (path.isAbsolute(relativePath)) return relativePath;
  const outputDir = getSetting('output_dir') || path.join(os.homedir(), 'Downloads');
  return path.join(outputDir, relativePath);
}

export function toRelativePath(absolutePath: string): string {
  const outputDir = getSetting('output_dir') || path.join(os.homedir(), 'Downloads');
  const normalized = absolutePath.replace(/\\/g, '/');
  const normalizedDir = outputDir.replace(/\\/g, '/').replace(/\/$/, '') + '/';
  if (normalized.startsWith(normalizedDir)) {
    return normalized.slice(normalizedDir.length);
  }
  return absolutePath;
}

// ─── Library helpers ──────────────────────────────────────────────────────

export function upsertLibraryItem(item: {
  videoId: string;
  title: string;
  channel?: string;
  channelId?: string;
  thumbnailUrl?: string;
  url: string;
  format?: string;
  quality?: string;
  resolution?: string;
  filePath?: string | null;
  fileSize?: number;
  duration?: number;
  publishedAt?: string;
  downloadedAt?: string;
}): void {
  db.prepare(`
    INSERT INTO library (video_id, title, channel, channel_id, thumbnail_url, url, format, quality, resolution, file_path, file_size, duration, published_at, downloaded_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(video_id) DO UPDATE SET
      title = COALESCE(excluded.title, title),
      channel = COALESCE(excluded.channel, channel),
      channel_id = COALESCE(excluded.channel_id, channel_id),
      thumbnail_url = COALESCE(excluded.thumbnail_url, thumbnail_url),
      format = COALESCE(excluded.format, format),
      quality = COALESCE(excluded.quality, quality),
      resolution = COALESCE(excluded.resolution, resolution),
      file_path = COALESCE(excluded.file_path, file_path),
      file_size = CASE WHEN excluded.file_size > 0 THEN excluded.file_size ELSE file_size END,
      duration = CASE WHEN excluded.duration > 0 THEN excluded.duration ELSE duration END,
      downloaded_at = COALESCE(excluded.downloaded_at, downloaded_at),
      updated_at = datetime('now')
  `).run(
    item.videoId, item.title, item.channel ?? null, item.channelId ?? null,
    item.thumbnailUrl ?? null, item.url, item.format ?? null, item.quality ?? null,
    item.resolution ?? null, item.filePath ?? null, item.fileSize ?? 0,
    item.duration ?? 0, item.publishedAt ?? null, item.downloadedAt ?? null
  );
}

export function getLibraryItem(videoId: string): LibraryItem | null {
  const row = db.prepare('SELECT * FROM library WHERE video_id = ?').get(videoId) as any;
  return row ? rowToLibraryItem(row) : null;
}

export function getLibraryItems(opts?: { limit?: number; offset?: number; search?: string; sort?: string; order?: 'asc' | 'desc' }): LibraryItem[] {
  const limit = opts?.limit || 500;
  const offset = opts?.offset || 0;
  const sort = opts?.sort || 'updated_at';
  const order = opts?.order || 'desc';

  const validSorts = ['title', 'channel', 'format', 'file_size', 'resolution', 'downloaded_at', 'added_at', 'updated_at'];
  const sortCol = validSorts.includes(sort) ? sort : 'updated_at';
  const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

  let query = `SELECT * FROM library`;
  const params: any[] = [];

  if (opts?.search) {
    query += ` WHERE title LIKE ? OR channel LIKE ?`;
    const term = `%${opts.search}%`;
    params.push(term, term);
  }

  query += ` ORDER BY ${sortCol} ${sortOrder} LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(rowToLibraryItem);
}

export function getRecentLibraryItems(limit: number = 10): LibraryItem[] {
  const rows = db.prepare('SELECT * FROM library WHERE downloaded_at IS NOT NULL ORDER BY downloaded_at DESC LIMIT ?').all(limit) as any[];
  return rows.map(rowToLibraryItem);
}

export function deleteLibraryItems(videoIds: string[], deleteFiles: boolean = false): void {
  if (videoIds.length === 0) return;

  if (deleteFiles) {
    const outputDir = getSetting('output_dir') || path.join(os.homedir(), 'Downloads');
    for (const videoId of videoIds) {
      const item = db.prepare('SELECT file_path FROM library WHERE video_id = ?').get(videoId) as any;
      if (item?.file_path) {
        const absolute = path.isAbsolute(item.file_path) ? item.file_path : path.join(outputDir, item.file_path);
        try { if (fs.existsSync(absolute)) fs.unlinkSync(absolute); } catch {}
      }
    }
  }

  const placeholders = videoIds.map(() => '?').join(',');
  // CASCADE will handle local_playlist_items FK references
  db.prepare(`DELETE FROM library WHERE video_id IN (${placeholders})`).run(...videoIds);
}

export function getLibraryStats(): { totalItems: number; totalSize: number; downloadedCount: number } {
  const total = db.prepare('SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as size FROM library').get() as any;
  const downloaded = db.prepare('SELECT COUNT(*) as count FROM library WHERE downloaded_at IS NOT NULL').get() as any;
  return {
    totalItems: total.count,
    totalSize: total.size,
    downloadedCount: downloaded.count,
  };
}

export function getPlaylistItemsWithLibrary(playlistId: number): LocalPlaylistItemRow[] {
  const rows = db.prepare(`
    SELECT pi.id, pi.playlist_id, pi.video_id, pi.position, pi.added_at,
           COALESCE(l.title, pi.title) as title,
           COALESCE(l.channel, pi.channel) as channel,
           COALESCE(l.thumbnail_url, pi.thumbnail_url) as thumbnail_url,
           COALESCE(l.duration, pi.duration) as duration,
           COALESCE(l.published_at, pi.published_at) as published_at
    FROM local_playlist_items pi
    LEFT JOIN library l ON l.video_id = pi.video_id
    WHERE pi.playlist_id = ?
    ORDER BY pi.position ASC
  `).all(playlistId) as any[];
  return rows.map(rowToPlaylistItem);
}

function rowToLibraryItem(row: any): LibraryItem {
  return {
    videoId: row.video_id,
    title: row.title,
    channel: row.channel || '',
    channelId: row.channel_id ?? undefined,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    url: row.url,
    format: row.format ?? undefined,
    quality: row.quality ?? undefined,
    resolution: row.resolution ?? undefined,
    filePath: resolveFilePath(row.file_path),
    fileSize: row.file_size || 0,
    duration: row.duration || 0,
    publishedAt: row.published_at ?? undefined,
    downloadedAt: row.downloaded_at ?? undefined,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
  };
}
