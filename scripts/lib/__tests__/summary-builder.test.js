import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSummary } from '../summary-builder.js';

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'summary-builder-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('buildSummary sorts by capacity descending', () => withTempDir(async (dir) => {
  const records = [
    { id: 'Q1', name: 'Small', name_ja: null, lat: 1, lng: 1, country: 'XX', capacity: 1000 },
    { id: 'Q2', name: 'Big', name_ja: null, lat: 2, lng: 2, country: 'XX', capacity: 90000 },
    { id: 'Q3', name: 'Medium', name_ja: null, lat: 3, lng: 3, country: 'XX', capacity: 50000 },
  ];
  await writeFile(path.join(dir, 'XX.json'), JSON.stringify(records));

  const { summary } = await buildSummary(dir);

  assert.deepEqual(summary.map((r) => r.id), ['Q2', 'Q3', 'Q1']);
}));

test('buildSummary excludes records with null capacity', () => withTempDir(async (dir) => {
  const records = [
    { id: 'Q1', name: 'NoCapacity', name_ja: null, lat: 1, lng: 1, country: 'XX', capacity: null },
    { id: 'Q2', name: 'HasCapacity', name_ja: null, lat: 2, lng: 2, country: 'XX', capacity: 5000 },
  ];
  await writeFile(path.join(dir, 'XX.json'), JSON.stringify(records));

  const { summary } = await buildSummary(dir);

  assert.deepEqual(summary.map((r) => r.id), ['Q2']);
}));

test('buildSummary caps the result at 700 records', () => withTempDir(async (dir) => {
  const records = Array.from({ length: 720 }, (_, i) => ({
    id: 'Q' + i, name: 'S' + i, name_ja: null, lat: 0, lng: 0, country: 'XX', capacity: 720 - i,
  }));
  await writeFile(path.join(dir, 'XX.json'), JSON.stringify(records));

  const { summary } = await buildSummary(dir);

  assert.equal(summary.length, 700);
  assert.equal(summary[0].id, 'Q0');
}));

test('buildSummary computes the simple-average centroid per country file', () => withTempDir(async (dir) => {
  const records = [
    { id: 'Q1', name: 'A', name_ja: null, lat: 10, lng: 20, country: 'XX', capacity: 1000 },
    { id: 'Q2', name: 'B', name_ja: null, lat: 30, lng: 40, country: 'XX', capacity: 2000 },
  ];
  await writeFile(path.join(dir, 'XX.json'), JSON.stringify(records));

  const { centroids } = await buildSummary(dir);

  assert.deepEqual(centroids, { XX: { lat: 20, lng: 30 } });
}));

test('buildSummary skips a centroid for an empty country file', () => withTempDir(async (dir) => {
  await writeFile(path.join(dir, 'EMPTY.json'), JSON.stringify([]));

  const { centroids } = await buildSummary(dir);

  assert.deepEqual(centroids, {});
}));

test('buildSummary aggregates across multiple country files', () => withTempDir(async (dir) => {
  await writeFile(path.join(dir, 'XX.json'), JSON.stringify([
    { id: 'Q1', name: 'A', name_ja: null, lat: 1, lng: 1, country: 'XX', capacity: 1000 },
  ]));
  await writeFile(path.join(dir, 'YY.json'), JSON.stringify([
    { id: 'Q2', name: 'B', name_ja: null, lat: 2, lng: 2, country: 'YY', capacity: 2000 },
  ]));

  const { summary, centroids } = await buildSummary(dir);

  assert.equal(summary.length, 2);
  assert.deepEqual(Object.keys(centroids).sort(), ['XX', 'YY']);
}));

test('buildSummary only includes the fields needed for map markers', () => withTempDir(async (dir) => {
  await writeFile(path.join(dir, 'XX.json'), JSON.stringify([
    { id: 'Q1', name: 'A', name_ja: 'エー', lat: 1, lng: 1, country: 'XX', capacity: 1000, wikidata_url: 'https://www.wikidata.org/wiki/Q1', teams: [], events: [] },
  ]));

  const { summary } = await buildSummary(dir);

  assert.deepEqual(summary[0], { id: 'Q1', name: 'A', name_ja: 'エー', lat: 1, lng: 1, country: 'XX', capacity: 1000 });
}));
