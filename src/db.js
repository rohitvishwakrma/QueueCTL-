// src/db.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.QUEUECTL_DB || path.resolve(process.cwd(), 'queue.db');

if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

const db = new Database(DB_PATH);

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      command TEXT NOT NULL,
      state TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      max_retries INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_error TEXT,
      available_at INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_state_available ON jobs(state, available_at);

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // defaults
  const getCfg = db.prepare('SELECT value FROM config WHERE key = ?');
  if (!getCfg.get('max_retries')) {
    db.prepare('INSERT OR REPLACE INTO config (key,value) VALUES (?,?)').run('max_retries', '3');
  }
  if (!getCfg.get('backoff_base')) {
    db.prepare('INSERT OR REPLACE INTO config (key,value) VALUES (?,?)').run('backoff_base', '2');
  }
}

function getConfig(key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : null;
}
function setConfig(key, value) {
  return db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?,?)').run(key, String(value));
}

module.exports = { db, init, getConfig, setConfig };
