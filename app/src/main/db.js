import Database from 'better-sqlite3'
import path from 'path'
import { DEFAULT_PROMPT_1, DEFAULT_PROMPT_2 } from './prompts'

const SETTINGS_DEFAULTS = {
  apiKey1: '',
  apiKey2: '',
  concurrency: 30,
  defaultQuality: 'low',
  autoRetry: 2,
  outputFormat: 'png',
  preventSleep: true,
  thbRate: 36,
  prompt1: DEFAULT_PROMPT_1,
  prompt2: DEFAULT_PROMPT_2
}

export function initDb(dir) {
  const db = new Database(path.join(dir, 'studio.db'))
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS uploads (path TEXT PRIMARY KEY, url TEXT, mtime INTEGER);
    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER,
      mannequin_path TEXT, mannequin_url TEXT,
      garment_folder TEXT, output_folder TEXT,
      quality TEXT, views TEXT,
      width INTEGER, height INTEGER,
      prompt_id INTEGER, prompt_text TEXT
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER,
      kind TEXT DEFAULT 'generate',
      parent_job_id INTEGER,
      garment_path TEXT,
      view TEXT, quality TEXT,
      prompt TEXT,
      base_image TEXT DEFAULT 'mannequin',
      status TEXT DEFAULT 'queued',
      fal_request_id TEXT, key_idx INTEGER DEFAULT 0,
      attempts INTEGER DEFAULT 0, next_at INTEGER DEFAULT 0,
      error TEXT, output_path TEXT,
      created_at INTEGER, done_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_batch ON jobs(batch_id);
  `)
  return db
}

export function getSettings(db) {
  const out = { ...SETTINGS_DEFAULTS }
  for (const row of db.prepare('SELECT key, value FROM settings').all()) {
    try { out[row.key] = JSON.parse(row.value) } catch { out[row.key] = row.value }
  }
  return out
}

export function setSettings(db, patch) {
  const stmt = db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  const tx = db.transaction((entries) => {
    for (const [k, v] of entries) stmt.run(k, JSON.stringify(v))
  })
  tx(Object.entries(patch))
}

