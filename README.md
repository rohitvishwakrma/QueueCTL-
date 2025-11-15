# queuectl-node

# Project layout
queuectl-node/
├─ package.json
├─ bin/
│  └─ queuectl.js           
├─ src/
│  ├─ db.js                  
│  ├─ queue.js               
# queuectl-node

QueueCTL — CLI-based background job queue (Node.js)

This repository implements a minimal production-minded job queue to satisfy the QueueCTL internship assignment. It provides:

- Persistent job storage (SQLite)
- CLI for enqueueing jobs, managing workers, and inspecting the queue
- Multiple worker support with graceful shutdown
- Retry with exponential backoff and a Dead Letter Queue (DLQ)
- Configurable retry/backoff via CLI

---

## Quick Setup (Windows / Unix)

1. Open a terminal (cmd.exe, PowerShell, or a Unix shell) and install dependencies:

```cmd
cd /d d:\Projects\QueuctlAss\queuectl-node
npm install
```

Notes:
- The project uses `better-sqlite3`. If `npm install` fails due to native build issues, consider using WSL on Windows or ask me to switch the DB layer to the `sqlite3` binding.

---

## CLI Overview

Run commands via `node bin\queuectl.js <command>` (or install with `npm link` to use `queuectl`).

Commands:

- `enqueue <jobJson>` — add a new job. Example:

```cmd
node bin\queuectl.js enqueue "{\"id\":\"job1\",\"command\":\"echo hello\"}"
```

- `worker start --count <n>` — start workers in foreground (Ctrl+C to stop):

```cmd
node bin\queuectl.js worker start --count 2
```

- `worker:stop` — request worker stop by removing pidfile (simple coordination):

```cmd
node bin\queuectl.js worker:stop
```

- `status` — summary of job counts by state:

```cmd
node bin\queuectl.js status
```

- `list [--state <state>]` — list jobs (optionally filtered by state):

```cmd
node bin\queuectl.js list --state pending
```

- `dlq list` / `dlq:retry <jobId>` — inspect and retry dead jobs.

- `config set|get` — manage `max_retries` and `backoff_base`.

---

## Job schema

Jobs are stored in the `jobs` table. A job contains at least:

```json
{
  "id": "unique-job-id",
  "command": "echo 'Hello'",
  "state": "pending",
  "attempts": 0,
  "max_retries": 3,
  "created_at": "2025-11-04T10:30:00Z",
  "updated_at": "2025-11-04T10:30:00Z"
}
```

States: `pending`, `processing`, `completed`, `failed`, `dead` (DLQ).

---

## Worker behavior & retries

- Workers call `claimJob()` to atomically pick a pending job whose `available_at` <= now and mark it `processing`.
- The worker executes the `command` using the platform shell (`cmd.exe /c` on Windows, `/bin/sh -c` on Unix).
- On non-zero exit code or execution error the job is `failJob()`ed: `attempts` increments and an exponential backoff is applied:

```
delaySeconds = base ^ attempts
```

where `base` defaults to `2` (config table) and `attempts` is the number of previous failures. If `attempts > max_retries` the job state becomes `dead` (DLQ).

---

## Persistence

- The SQLite DB file `queue.db` is created in the project root by default. Set `QUEUECTL_DB` env var to override.

---

## Demo & validation

A quick demo script `scripts/demo.js` enqueues several jobs (one failing) and starts workers briefly.

Run it:

```cmd
cd /d d:\Projects\QueuctlAss\queuectl-node
node scripts\demo.js
```

Manual validation steps:

1. Enqueue a success job:

```cmd
node bin\queuectl.js enqueue "{\"id\":\"ok1\",\"command\":\"node -e \\\"process.exit(0)\\\"\"}"
node bin\queuectl.js worker start --count 1
```

2. Enqueue a failing job (retries then DLQ):

```cmd
node bin\queuectl.js enqueue "{\"id\":\"fail1\",\"command\":\"node -e \\\"process.exit(2)\\\"\", \"max_retries\": 2}"
```

Watch logs; the job should retry with backoff and eventually move to `dead`.

3. Verify persistence: stop the worker, restart it, and confirm pending/failed jobs remain in DB.

---

## Architecture files

- `src/db.js` — DB init and config
- `src/queue.js` — enqueue/claim/complete/fail/retry logic
- `src/runner.js` — worker process loop (executes commands)
- `src/worker-manager.js` — starts/stops workers and manages pidfile
- `bin/queuectl.js` — CLI entry

---



# QueueCTL-  
