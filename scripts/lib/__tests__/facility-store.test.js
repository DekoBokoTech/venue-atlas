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

test('mergeFacilities adds new records and updates existing ones by id when a real field changes', () => {
  const existing = [
    { id: 'Q1', name: 'Old Name', last_synced_at: '2026-09-01T00:00:00.000Z' },
    { id: 'Q2', name: 'Unchanged', last_synced_at: '2026-09-01T00:00:00.000Z' },
  ];
  const incoming = [
    { id: 'Q1', name: 'New Name', last_synced_at: '2026-09-08T00:00:00.000Z' },
    { id: 'Q3', name: 'Brand New', last_synced_at: '2026-09-08T00:00:00.000Z' },
  ];

  const { merged, newCount, updatedCount } = mergeFacilities(existing, incoming);

  assert.equal(newCount, 1);
  assert.equal(updatedCount, 1);
  assert.deepEqual(merged, [
    { id: 'Q1', name: 'New Name', last_synced_at: '2026-09-08T00:00:00.000Z' },
    { id: 'Q2', name: 'Unchanged', last_synced_at: '2026-09-01T00:00:00.000Z' },
    { id: 'Q3', name: 'Brand New', last_synced_at: '2026-09-08T00:00:00.000Z' },
  ]);
});

test('mergeFacilities keeps the existing last_synced_at when nothing else changed', () => {
  const existing = [
    { id: 'Q1', name: 'Stadium A', capacity: 40000, last_synced_at: '2026-09-01T00:00:00.000Z' },
  ];
  const incoming = [
    { id: 'Q1', name: 'Stadium A', capacity: 40000, last_synced_at: '2026-09-08T00:00:00.000Z' },
  ];

  const { merged, newCount, updatedCount } = mergeFacilities(existing, incoming);

  assert.equal(newCount, 0);
  assert.equal(updatedCount, 0);
  assert.deepEqual(merged, [
    { id: 'Q1', name: 'Stadium A', capacity: 40000, last_synced_at: '2026-09-01T00:00:00.000Z' },
  ]);
});

test('mergeFacilities removes an existing record whose id is in excludedIds and not in incoming', () => {
  const existing = [
    { id: 'Q1', name: 'Q1', last_synced_at: '2026-09-01T00:00:00.000Z' },
    { id: 'Q2', name: 'Kept Stadium', last_synced_at: '2026-09-01T00:00:00.000Z' },
  ];
  const incoming = [];
  const excludedIds = ['Q1'];

  const { merged, newCount, updatedCount, deletedCount } = mergeFacilities(existing, incoming, excludedIds);

  assert.equal(deletedCount, 1);
  assert.equal(newCount, 0);
  assert.equal(updatedCount, 0);
  assert.deepEqual(merged, [
    { id: 'Q2', name: 'Kept Stadium', last_synced_at: '2026-09-01T00:00:00.000Z' },
  ]);
});

test('mergeFacilities keeps a record present in both excludedIds and incoming, and does not count it as deleted', () => {
  const existing = [
    { id: 'Q1', name: 'Q1', last_synced_at: '2026-09-01T00:00:00.000Z' },
  ];
  const incoming = [
    { id: 'Q1', name: 'Now Has A Name', last_synced_at: '2026-09-08T00:00:00.000Z' },
  ];
  const excludedIds = ['Q1'];

  const { merged, newCount, updatedCount, deletedCount } = mergeFacilities(existing, incoming, excludedIds);

  assert.equal(deletedCount, 0);
  assert.equal(newCount, 0);
  assert.equal(updatedCount, 1);
  assert.deepEqual(merged, [
    { id: 'Q1', name: 'Now Has A Name', last_synced_at: '2026-09-08T00:00:00.000Z' },
  ]);
});

test('mergeFacilities treats an excludedIds entry not present in existing as a harmless no-op', () => {
  const existing = [
    { id: 'Q2', name: 'Kept Stadium', last_synced_at: '2026-09-01T00:00:00.000Z' },
  ];
  const incoming = [];
  const excludedIds = ['Q999'];

  const { merged, newCount, updatedCount, deletedCount } = mergeFacilities(existing, incoming, excludedIds);

  assert.equal(deletedCount, 0);
  assert.equal(newCount, 0);
  assert.equal(updatedCount, 0);
  assert.deepEqual(merged, [
    { id: 'Q2', name: 'Kept Stadium', last_synced_at: '2026-09-01T00:00:00.000Z' },
  ]);
});

test('mergeFacilities defaults excludedIds to an empty array when omitted', () => {
  const existing = [
    { id: 'Q1', name: 'Old Name', last_synced_at: '2026-09-01T00:00:00.000Z' },
  ];
  const incoming = [
    { id: 'Q1', name: 'New Name', last_synced_at: '2026-09-08T00:00:00.000Z' },
  ];

  const { merged, deletedCount } = mergeFacilities(existing, incoming);

  assert.equal(deletedCount, 0);
  assert.deepEqual(merged, [
    { id: 'Q1', name: 'New Name', last_synced_at: '2026-09-08T00:00:00.000Z' },
  ]);
});
