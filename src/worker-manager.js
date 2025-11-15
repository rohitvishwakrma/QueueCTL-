// src/worker-manager.js
const Worker = require('./runner');
const fs = require('fs');
const path = require('path');
const pidFile = path.resolve(process.cwd(), 'queuectl.pid');

class WorkerManager {
  constructor() {
    this.workers = [];
    this.abortController = null;
  }

  start(count = 1) {
    if (fs.existsSync(pidFile)) {
      console.warn('pidfile exists - another worker might be running. start anyway? (ignoring)');
    }
    fs.writeFileSync(pidFile, String(process.pid), { encoding: 'utf8' });

    this.abortController = { aborted: false };
    for (let i = 0; i < count; i++) {
      const w = new Worker(i + 1);
      this.workers.push(w);
      w.runLoop(this.abortController).catch(err => console.error('worker error', err));
    }

    // graceful
    const shutdown = async () => {
      console.log('Received shutdown signal. Stopping workers gracefully.');
      this.stop();
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  stop() {
    if (fs.existsSync(pidFile)) try { fs.unlinkSync(pidFile); } catch {}
    if (this.abortController) this.abortController.aborted = true;
    this.workers.forEach(w => w.stop());
  }
}

module.exports = { WorkerManager, pidFile };
