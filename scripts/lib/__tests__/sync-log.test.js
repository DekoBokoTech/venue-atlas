// scripts/lib/__tests__/sync-log.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appendSyncLog } from '../sync-log.js';

test('appendSyncLog creates a new log file with one entry', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sync-log-'));
  const filePath = path.join(dir, 'sync_log.json');
  try {
    await appendSyncLog(filePath, { timestamp: '2026-09-08T00:00:00Z', totalFetched: 10 });
    const log = JSON.parse(await readFile(filePath, 'utf-8'));
    assert.deepEqual(log, [{ timestamp: '2026-09-08T00:00:00Z', totalFetched: 10 }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('appendSyncLog appends to an existing log file', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sync-log-'));
  const filePath = path.join(dir, 'sync_log.json');
  try {
    await appendSyncLog(filePath, { timestamp: 't1' });
    await appendSyncLog(filePath, { timestamp: 't2' });
    const log = JSON.parse(await readFile(filePath, 'utf-8'));
    assert.deepEqual(log, [{ timestamp: 't1' }, { timestamp: 't2' }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
