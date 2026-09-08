import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadProgress, saveProgress } from '../progress.js';

test('loadProgress returns the default cursor when the file does not exist', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'progress-'));
  try {
    const progress = await loadProgress(path.join(dir, 'progress.json'));
    assert.deepEqual(progress, { countryIndex: 0, offset: 0 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('saveProgress writes a cursor that loadProgress reads back', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'progress-'));
  const filePath = path.join(dir, 'progress.json');
  try {
    await saveProgress(filePath, { countryIndex: 3, offset: 4000 });
    const progress = await loadProgress(filePath);
    assert.deepEqual(progress, { countryIndex: 3, offset: 4000 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
