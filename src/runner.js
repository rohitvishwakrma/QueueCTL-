// src/runner.js
const { claimJob, completeJob, failJob } = require('./queue');
const { spawn } = require('child_process');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class Worker {
  constructor(id, opts = {}) {
    this.id = id;
    this._running = false;
    this.pollInterval = opts.pollInterval || 1000; // ms
  }

  async runLoop(signal) {
    this._running = true;
    while (this._running && (!signal || !signal.aborted)) {
      const job = claimJob();
      if (!job) {
        await sleep(this.pollInterval);
        continue;
      }
      console.log(`[worker-${this.id}] claimed job ${job.id} -> ${job.command}`);
      try {
        await this._executeCommand(job);
        completeJob(job.id);
        console.log(`[worker-${this.id}] completed ${job.id}`);
      } catch (err) {
        const msg = (err && err.message) ? err.message : String(err);
        const result = failJob(job.id, msg);
        if (result.movedToDLQ) {
          console.log(`[worker-${this.id}] job ${job.id} moved to DLQ: ${msg}`);
        } else {
          console.log(`[worker-${this.id}] job ${job.id} failed: ${msg} | retry after ${result.delaySeconds}s`);
        }
      }
    }
    console.log(`[worker-${this.id}] exiting runLoop`);
  }

  _executeCommand(job) {
    return new Promise((resolve, reject) => {
      // choose shell depending on platform for cross-platform support
      let child;
      if (process.platform === 'win32') {
        // Windows: use cmd.exe /c
        child = spawn(process.env.comspec || 'cmd.exe', ['/c', job.command], { stdio: 'inherit' });
      } else {
        // Unix-like: use /bin/sh -c
        child = spawn('/bin/sh', ['-c', job.command], { stdio: 'inherit' });
      }

      child.on('error', (err) => {
        reject(new Error('spawn error: ' + err.message));
      });
      child.on('exit', (code, signal) => {
        if (signal) {
          reject(new Error(`process killed by signal ${signal}`));
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(`exit code ${code}`));
        }
      });
    });
  }

  stop() {
    this._running = false;
  }
}

module.exports = Worker;
