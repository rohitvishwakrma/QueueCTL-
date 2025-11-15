// src/queue.js
const { db, init, getConfig, setConfig } = require('./db');
const nowISO = () => new Date().toISOString();

init();

function enqueue(job) {
  const stmt = db.prepare(`INSERT INTO jobs
    (id, command, state, attempts, max_retries, created_at, updated_at, available_at)
    VALUES (@id,@command,'pending',@attempts,@max_retries,@created_at,@updated_at,@available_at)`);
  const data = {
    id: job.id,
    command: job.command,
    attempts: job.attempts || 0,
    max_retries: job.max_retries != null ? job.max_retries : Number(getConfig('max_retries')),
    created_at: job.created_at || nowISO(),
    updated_at: job.updated_at || nowISO(),
    available_at: 0
  };
  stmt.run(data);
}

function getStatusSummary() {
  const rows = db.prepare(`SELECT state, count(*) as cnt FROM jobs GROUP BY state`).all();
  const workers = { active: 0 }; // worker discovery not implemented here (could be via PID file)
  const map = {};
  rows.forEach(r => { map[r.state] = r.cnt; });
  return { jobs: map, workers };
}

/**
 * Atomically claim one pending job that is available (available_at <= now)
 * This uses a transaction: find id, update state -> processing and set updated time and return the job.
 */
function claimJob() {
  const now = Math.floor(Date.now() / 1000);
  // allow claiming both newly pending jobs and previously failed jobs whose backoff elapsed
  const select = db.prepare(`SELECT * FROM jobs WHERE state IN ('pending','failed') AND available_at <= ? ORDER BY created_at ASC LIMIT 1`);
  const job = select.get(now);
  if (!job) return null;
  const update = db.prepare(`UPDATE jobs SET state='processing', updated_at=?, attempts=attempts WHERE id=? AND state IN ('pending','failed')`);
  // attempt to set processing only if still pending
  const info = update.run(new Date().toISOString(), job.id);
  if (info.changes === 0) return null;
  // re-fetch
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(job.id);
}

function completeJob(id) {
  db.prepare(`UPDATE jobs SET state='completed', updated_at=? WHERE id = ?`).run(nowISO(), id);
}

function failJob(id, errorMsg) {
  const job = db.prepare('SELECT attempts, max_retries FROM jobs WHERE id = ?').get(id);
  const attempts = job.attempts + 1;
  const maxRetries = job.max_retries;
  const base = Number(getConfig('backoff_base') || 2);

  // move to DLQ when attempts have reached or exceeded configured maxRetries
  if (attempts >= maxRetries) {
    db.prepare(`UPDATE jobs SET state='dead', attempts=?, last_error=?, updated_at=? WHERE id = ?`)
      .run(attempts, errorMsg, nowISO(), id);
    return { movedToDLQ: true };
  } else {
    // exponential backoff: available_at = now + base^attempts (seconds)
    const delaySeconds = Math.pow(base, attempts);
    const available_at = Math.floor(Date.now() / 1000) + delaySeconds;
    db.prepare(`UPDATE jobs SET state='failed', attempts=?, last_error=?, updated_at=?, available_at=? WHERE id = ?`)
      .run(attempts, errorMsg, nowISO(), available_at, id);
    return { movedToDLQ: false, delaySeconds };
  }
}

function listJobs(filter = {}) {
  let sql = 'SELECT * FROM jobs';
  const where = [];
  const params = [];
  if (filter.state) {
    where.push('state = ?'); params.push(filter.state);
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY created_at ASC';
  return db.prepare(sql).all(...params);
}

function retryDLQ(jobId) {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND state = "dead"').get(jobId);
  if (!job) throw new Error('DLQ job not found');
  db.prepare(`UPDATE jobs SET state='pending', attempts=0, updated_at=?, last_error=NULL, available_at=0 WHERE id = ?`)
    .run(nowISO(), jobId);
}

module.exports = { enqueue, claimJob, completeJob, failJob, getStatusSummary, listJobs, retryDLQ, getConfig, setConfig };
