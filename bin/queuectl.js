#!/usr/bin/env node
const { program } = require('commander');
const { enqueue, getStatusSummary, listJobs, retryDLQ, getConfig, setConfig } = require('../src/queue');
const { WorkerManager, pidFile } = require('../src/worker-manager');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

program
  .name('queuectl')
  .description('CLI for background job queue')
  .version('1.0.0');

program
  .command('enqueue')
  .argument('<jobJson>', 'job JSON string e.g. \'{"id":"job1","command":"sleep 2"}\'')
  .action((jobJson) => {
    try {
      const j = JSON.parse(jobJson);
      if (!j.id) j.id = uuidv4();
      if (!j.command) throw new Error('command required');
      j.attempts = 0;
      j.created_at = j.created_at || new Date().toISOString();
      enqueue(j);
      console.log('enqueued', j.id);
    } catch (err) {
      console.error('Invalid JSON or error:', err.message);
    }
  });

program
  .command('worker')
  .description('Worker commands')
  .command('start')
  .option('--count <n>', 'number of parallel workers', '1')
  .action((opts) => {
    const count = Number(opts.count || 1);
    const mgr = new WorkerManager();
    mgr.start(count);
    console.log(`Started ${count} worker(s). Press Ctrl+C to stop.`);
    // keep process alive
  });

program
  .command('worker:stop')
  .description('Stop running workers by removing pidfile (relies on pidfile & signals)')
  .action(() => {
    if (fs.existsSync(pidFile)) {
      try { fs.unlinkSync(pidFile); } catch(e) {}
      console.log('Requested worker stop (remove pidfile). If workers are separate process, send SIGTERM to them.');
    } else {
      console.log('No workers pidfile found.');
    }
  });

// status
program
  .command('status')
  .description('Show summary of job states & active workers')
  .action(() => {
    const s = getStatusSummary();
    console.log(JSON.stringify(s, null, 2));
  });

program
  .command('list')
  .description('List jobs')
  .option('--state <state>', 'filter by state')
  .action((opts) => {
    const rows = listJobs({ state: opts.state });
    console.log(rows.map(r => ({ id: r.id, state: r.state, attempts: r.attempts, command: r.command, last_error: r.last_error })).slice(0, 200));
  });

program
  .command('dlq')
  .description('Dead Letter Queue commands')
  .command('list')
  .action(() => {
    const rows = listJobs({ state: 'dead' });
    console.log(rows);
  });

program
  .command('dlq:retry')
  .argument('<jobId>', 'job id in DLQ to retry')
  .action((jobId) => {
    try {
      retryDLQ(jobId);
      console.log('DLQ job retried -> moved to pending:', jobId);
    } catch (err) {
      console.error('Error retrying DLQ job:', err.message);
    }
  });

program
  .command('config')
  .description('Config commands')
  .command('set')
  .argument('<key>')
  .argument('<value>')
  .action((key, value) => {
    // normalize keys like `max-retries` -> `max_retries`
    const normalized = key.replace(/-/g, '_');
    setConfig(normalized, value);
    console.log('set', normalized, value);
  });

program
  .command('config:get')
  .argument('[key]')
  .action((key) => {
    if (key) {
      const normalized = key.replace(/-/g, '_');
      console.log(normalized, getConfig(normalized));
    } else {
      console.log({
        max_retries: getConfig('max_retries'),
        backoff_base: getConfig('backoff_base')
      });
    }
  });

program.parse(process.argv);
