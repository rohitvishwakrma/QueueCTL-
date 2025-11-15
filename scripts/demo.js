// scripts/demo.js
// Demo script: enqueue several jobs and start workers to process them for a short time.

const path = require('path');
const { enqueue, getStatusSummary, listJobs } = require('../src/queue');
const { WorkerManager } = require('../src/worker-manager');
const fs = require('fs');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('Demo: enqueueing jobs...');
  for (let i = 1; i <= 5; i++) {
    const id = `demo-${Date.now()}-${i}`;
    // Use node -e to print and exit 0 or 1 for one failing job
    const command = i === 3 ? `node -e "console.error('job ${i} failing'); process.exit(1)"` : `node -e "console.log('job ${i} ok'); process.exit(0)"`;
    enqueue({ id, command });
    console.log('enqueued', id, command);
  }

  console.log('Starting 2 workers...');
  const mgr = new WorkerManager();
  mgr.start(2);

  console.log('Letting workers run for 12 seconds...');
  await sleep(12000);

  console.log('Stopping workers...');
  mgr.stop();

  await sleep(500); // give a moment to flush
  console.log('Status summary:');
  console.log(JSON.stringify(getStatusSummary(), null, 2));

  console.log('Recent jobs:');
  console.log(listJobs().slice(0, 20));
}

main().catch(err => {
  console.error('Demo error', err);
  process.exit(1);
});
