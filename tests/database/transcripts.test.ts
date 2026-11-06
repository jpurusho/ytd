/**
 * Tests for transcript database functions
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// These tests would ideally run against an in-memory SQLite database
describe('Transcript Database Functions', () => {
  let db: Database.Database;
  let dbPath: string;

  beforeEach(() => {
    // Create temporary database
    dbPath = path.join(os.tmpdir(), `test-${Date.now()}.db`);
    db = new Database(dbPath);

    // Initialize schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS library (
        video_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        url TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS transcripts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id TEXT NOT NULL,
        format TEXT NOT NULL DEFAULT 'json',
        language TEXT,
        transcript_text TEXT,
        transcript_json TEXT,
        word_count INTEGER,
        duration_seconds INTEGER,
        method TEXT,
        model TEXT,
        status TEXT DEFAULT 'pending',
        error TEXT,
        progress REAL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT,
        FOREIGN KEY (video_id) REFERENCES library(video_id) ON DELETE CASCADE
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS transcripts_fts USING fts5(
        video_id UNINDEXED,
        transcript_text,
        content=transcripts,
        content_rowid=id
      );
    `);

    // Insert test data
    db.prepare('INSERT INTO library (video_id, title, url) VALUES (?, ?, ?)').run(
      'test123',
      'Test Video',
      'https://example.com'
    );
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('should create a transcript record', () => {
    const result = db.prepare(`
      INSERT INTO transcripts (video_id, method, model, status, progress)
      VALUES (?, ?, ?, 'pending', 0)
    `).run('test123', 'whisper-local', 'base');

    expect(result.lastInsertRowid).toBeGreaterThan(0);
  });

  it('should retrieve transcript by video_id', () => {
    db.prepare(`
      INSERT INTO transcripts (video_id, method, model, status)
      VALUES (?, ?, ?, ?)
    `).run('test123', 'whisper-local', 'base', 'completed');

    const row = db.prepare('SELECT * FROM transcripts WHERE video_id = ?').get('test123');
    expect(row).toBeDefined();
    expect((row as any).video_id).toBe('test123');
  });

  it('should update transcript status', () => {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO transcripts (video_id, status) VALUES (?, ?)
    `).run('test123', 'pending');

    db.prepare('UPDATE transcripts SET status = ?, progress = ? WHERE id = ?').run(
      'completed',
      100,
      lastInsertRowid
    );

    const row = db.prepare('SELECT * FROM transcripts WHERE id = ?').get(lastInsertRowid);
    expect((row as any).status).toBe('completed');
    expect((row as any).progress).toBe(100);
  });

  it('should perform full-text search', () => {
    // Insert transcript with text
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO transcripts (video_id, transcript_text, status)
      VALUES (?, ?, ?)
    `).run('test123', 'This is a test transcript about cats and dogs', 'completed');

    // Update FTS index
    db.prepare(`
      INSERT INTO transcripts_fts(rowid, video_id, transcript_text)
      VALUES (?, ?, ?)
    `).run(lastInsertRowid, 'test123', 'This is a test transcript about cats and dogs');

    // Search
    const results = db.prepare(`
      SELECT video_id FROM transcripts_fts WHERE transcripts_fts MATCH ?
    `).all('cats');

    expect(results).toHaveLength(1);
    expect((results[0] as any).video_id).toBe('test123');
  });
});
