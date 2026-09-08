import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadFacilities, saveFacilities, mergeFacilities } from '../facility-store.js';

test('loadFacilities returns an empty array when the file does not exist', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'facility-store-'));
  try {
    const records = await loadFacilities(dir, 'JP');
    assert.deepEqual(records, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('saveFacilities writes records that loadFacilities reads back', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'facility-store-'));
  try {
    const records = [{ id: 'Q1', name: 'A' }];
    await saveFacilities(dir, 'JP', records);
    const loaded = await loadFacilities(dir, 'JP');
    assert.deepEqual(loaded, records);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('mergeFacilities adds new records and updates existing ones by id', () => {
  const existing = [
    { id: 'Q1', name: 'Old Name' },
    { id: 'Q2', name: 'Unchanged' },
  ];
  const incoming = [
    { id: 'Q1', name: 'New Name' },
    { id: 'Q3', name: 'Brand New' },
  ];

  const { merged, newCount, updatedCount } = mergeFacilities(existing, incoming);

  assert.equal(newCount, 1);
  assert.equal(updatedCount, 1);
  assert.deepEqual(merged, [
    { id: 'Q1', name: 'New Name' },
    { id: 'Q2', name: 'Unchanged' },
    { id: 'Q3', name: 'Brand New' },
  ]);
});
