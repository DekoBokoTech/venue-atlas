import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSummary, buildWebFacilities, buildSearchIndex, PER_COUNTRY_CAP } from '../summary-builder.js';

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'summary-builder-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function withTempDirs(fn) {
  const inDir = await mkdtemp(path.join(tmpdir(), 'summary-builder-in-'));
  const outDir = await mkdtemp(path.join(tmpdir(), 'summary-builder-out-'));
  try {
    await fn(inDir, outDir);
  } finally {
    await rm(inDir, { recursive: true, force: true });
    await rm(outDir, { recursive: true, force: true });
  }
}

test('buildSummary sorts by capacity descending, within the teams-having subset', () => withTempDir(async (dir) => {
  const records = [
    { id: 'Q1', name: 'Small', name_ja: null, lat: 1, lng: 1, country: 'XX', capacity: 1000, teams: ['Q100'] },
    { id: 'Q2', name: 'Big', name_ja: null, lat: 2, lng: 2, country: 'XX', capacity: 90000, teams: ['Q200'] },
    { id: 'Q3', name: 'Medium', name_ja: null, lat: 3, lng: 3, country: 'XX', capacity: 50000, teams: ['Q300'] },
  ];
  await writeFile(path.join(dir, 'XX.json'), JSON.stringify(records));

  const { summary } = await buildSummary(dir);

  assert.deepEqual(summary.map((r) => r.id), ['Q2', 'Q3', 'Q1']);
}));

test('buildSummary excludes records with no teams, even at very high capacity, and includes a lower-capacity record with a team', () => withTempDir(async (dir) => {
  const records = [
    { id: 'Q1', name: 'HugeButNoTeam', name_ja: null, lat: 1, lng: 1, country: 'XX', capacity: 200000, teams: [] },
    { id: 'Q2', name: 'SmallWithTeam', name_ja: null, lat: 2, lng: 2, country: 'XX', capacity: 500, teams: ['Q999'] },
  ];
  await writeFile(path.join(dir, 'XX.json'), JSON.stringify(records));

  const { summary } = await buildSummary(dir);

  assert.deepEqual(summary.map((r) => r.id), ['Q2']);
}));

test('buildSummary includes a teams-having record with null capacity, ranked after capacity-known ones', () => withTempDir(async (dir) => {
  const records = [
    { id: 'Q1', name: 'NoCapacityWithTeam', name_ja: null, lat: 1, lng: 1, country: 'XX', capacity: null, teams: ['Q1'] },
    { id: 'Q2', name: 'HasCapacityWithTeam', name_ja: null, lat: 2, lng: 2, country: 'XX', capacity: 5000, teams: ['Q2'] },
    { id: 'Q3', name: 'NoCapacityNoTeam', name_ja: null, lat: 3, lng: 3, country: 'XX', capacity: null, teams: [] },
  ];
  await writeFile(path.join(dir, 'XX.json'), JSON.stringify(records));

  const { summary } = await buildSummary(dir);

  assert.deepEqual(summary.map((r) => r.id), ['Q2', 'Q1']);
}));

test('buildSummary caps the result at 700 records', () => withTempDir(async (dir) => {
  const records = Array.from({ length: 720 }, (_, i) => ({
    id: 'Q' + i, name: 'S' + i, name_ja: null, lat: 0, lng: 0, country: 'XX', capacity: 720 - i, teams: ['Q' + i + 'team'],
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
    { id: 'Q1', name: 'A', name_ja: null, lat: 1, lng: 1, country: 'XX', capacity: 1000, teams: ['Q10'] },
  ]));
  await writeFile(path.join(dir, 'YY.json'), JSON.stringify([
    { id: 'Q2', name: 'B', name_ja: null, lat: 2, lng: 2, country: 'YY', capacity: 2000, teams: ['Q20'] },
  ]));

  const { summary, centroids } = await buildSummary(dir);

  assert.equal(summary.length, 2);
  assert.deepEqual(Object.keys(centroids).sort(), ['XX', 'YY']);
}));

test('buildSummary only includes the fields needed for map markers, and is_existing is still present', () => withTempDir(async (dir) => {
  await writeFile(path.join(dir, 'XX.json'), JSON.stringify([
    { id: 'Q1', name: 'A', name_ja: 'エー', lat: 1, lng: 1, country: 'XX', capacity: 1000, is_existing: true, wikidata_url: 'https://www.wikidata.org/wiki/Q1', teams: ['Q42'], events: [], sport_types: ['association football'] },
  ]));

  const { summary } = await buildSummary(dir);

  assert.deepEqual(summary[0], { id: 'Q1', name: 'A', name_ja: 'エー', lat: 1, lng: 1, country: 'XX', capacity: 1000, is_existing: true, sport_types: ['association football'] });
}));

test('buildWebFacilities passes a file under the cap through byte-identical', () => withTempDirs(async (inDir, outDir) => {
  const records = Array.from({ length: 5 }, (_, i) => ({
    id: 'Q' + i, name: 'S' + i, name_ja: null, lat: 0, lng: 0, country: 'XX', capacity: i * 100,
  }));
  const content = JSON.stringify(records, null, 2) + '\n';
  await writeFile(path.join(inDir, 'XX.json'), content);

  const result = await buildWebFacilities(inDir, outDir);

  const written = await readFile(path.join(outDir, 'XX.json'), 'utf-8');
  assert.equal(written, content);
  assert.equal(result.filesWritten, 1);
  assert.deepEqual(result.cappedFiles, []);
}));

test('buildWebFacilities truncates a file over the cap, sorted by capacity descending with nulls last', () => withTempDirs(async (inDir, outDir) => {
  const total = PER_COUNTRY_CAP + 50;
  const records = [];
  for (let i = 0; i < total; i++) {
    records.push({
      id: 'Q' + i,
      name: 'S' + i,
      name_ja: null,
      lat: 0,
      lng: 0,
      country: 'YY',
      // First 30 records have no capacity; the rest get distinct descending values.
      capacity: i < 30 ? null : total - i,
    });
  }
  await writeFile(path.join(inDir, 'YY.json'), JSON.stringify(records));

  const result = await buildWebFacilities(inDir, outDir);

  const written = JSON.parse(await readFile(path.join(outDir, 'YY.json'), 'utf-8'));
  assert.equal(written.length, PER_COUNTRY_CAP);
  assert.deepEqual(result.cappedFiles, ['YY']);

  // With 3020 non-null-capacity records and a cap of 3000, every null-capacity
  // record should have been sorted after all of them and dropped by truncation.
  assert.ok(written.every((r) => r.capacity != null));
  for (let i = 1; i < written.length; i++) {
    assert.ok(written[i - 1].capacity >= written[i].capacity);
  }
  const maxCapacity = Math.max(...records.filter((r) => r.capacity != null).map((r) => r.capacity));
  assert.equal(written[0].capacity, maxCapacity);
}));

test('buildWebFacilities handles multiple country files independently', () => withTempDirs(async (inDir, outDir) => {
  const smallRecords = Array.from({ length: 10 }, (_, i) => ({
    id: 'A' + i, name: 'A' + i, name_ja: null, lat: 0, lng: 0, country: 'AA', capacity: i,
  }));
  const bigRecords = Array.from({ length: PER_COUNTRY_CAP + 10 }, (_, i) => ({
    id: 'B' + i, name: 'B' + i, name_ja: null, lat: 0, lng: 0, country: 'BB', capacity: PER_COUNTRY_CAP + 10 - i,
  }));
  const smallContent = JSON.stringify(smallRecords, null, 2) + '\n';
  await writeFile(path.join(inDir, 'AA.json'), smallContent);
  await writeFile(path.join(inDir, 'BB.json'), JSON.stringify(bigRecords));

  const result = await buildWebFacilities(inDir, outDir);

  assert.equal(result.filesWritten, 2);
  assert.deepEqual(result.cappedFiles, ['BB']);

  const writtenSmall = await readFile(path.join(outDir, 'AA.json'), 'utf-8');
  assert.equal(writtenSmall, smallContent);

  const writtenBig = JSON.parse(await readFile(path.join(outDir, 'BB.json'), 'utf-8'));
  assert.equal(writtenBig.length, PER_COUNTRY_CAP);
  assert.equal(writtenBig[0].id, 'B0');
}));

test('buildWebFacilities creates outDir recursively if it does not exist', () => withTempDirs(async (inDir, outDir) => {
  const nestedOutDir = path.join(outDir, 'nested', 'deep');
  await writeFile(path.join(inDir, 'XX.json'), JSON.stringify([
    { id: 'Q1', name: 'A', name_ja: null, lat: 0, lng: 0, country: 'XX', capacity: 100 },
  ]));

  await buildWebFacilities(inDir, nestedOutDir);

  const written = JSON.parse(await readFile(path.join(nestedOutDir, 'XX.json'), 'utf-8'));
  assert.equal(written.length, 1);
}));

test('buildSearchIndex includes every record across multiple country files, not just a capped subset', () => withTempDir(async (dir) => {
  const xxRecords = Array.from({ length: 10 }, (_, i) => ({
    id: 'X' + i, name: 'X' + i, name_ja: null, lat: 0, lng: 0, country: 'XX', capacity: i,
  }));
  const yyRecords = Array.from({ length: 5 }, (_, i) => ({
    id: 'Y' + i, name: 'Y' + i, name_ja: null, lat: 0, lng: 0, country: 'YY', capacity: i,
  }));
  await writeFile(path.join(dir, 'XX.json'), JSON.stringify(xxRecords));
  await writeFile(path.join(dir, 'YY.json'), JSON.stringify(yyRecords));

  const index = await buildSearchIndex(dir);

  assert.equal(index.length, 15);
}));

test('buildSearchIndex includes records with null capacity', () => withTempDir(async (dir) => {
  await writeFile(path.join(dir, 'XX.json'), JSON.stringify([
    { id: 'Q1', name: 'NoCapacity', name_ja: null, lat: 1, lng: 1, country: 'XX', capacity: null },
  ]));

  const index = await buildSearchIndex(dir);

  assert.deepEqual(index.map((r) => r.id), ['Q1']);
}));

test('buildSearchIndex only includes the fields needed for search', () => withTempDir(async (dir) => {
  await writeFile(path.join(dir, 'XX.json'), JSON.stringify([
    { id: 'Q1', name: 'A', name_ja: 'エー', lat: 1, lng: 1, country: 'XX', capacity: 1000, is_existing: true, wikidata_url: 'https://www.wikidata.org/wiki/Q1', teams: [], events: [] },
  ]));

  const index = await buildSearchIndex(dir);

  assert.deepEqual(index[0], { id: 'Q1', name: 'A', name_ja: 'エー', lat: 1, lng: 1, country: 'XX', capacity: 1000, teams: [], leagues: [] });
}));

test('buildSearchIndex includes team names for team-based search', () => withTempDir(async (dir) => {
  await writeFile(path.join(dir, 'XX.json'), JSON.stringify([
    { id: 'Q1', name: 'A', name_ja: null, lat: 1, lng: 1, country: 'XX', capacity: 1000, teams: [{ name: 'FC Bayern München', url: null }, { name: 'Munich 1860', url: null }] },
  ]));

  const index = await buildSearchIndex(dir);

  assert.deepEqual(index[0].teams, ['FC Bayern München', 'Munich 1860']);
}));

test('buildSearchIndex includes both English and Japanese league names, deduped, for league-based search', () => withTempDir(async (dir) => {
  await writeFile(path.join(dir, 'XX.json'), JSON.stringify([
    {
      id: 'Q1', name: 'A', name_ja: null, lat: 1, lng: 1, country: 'DE', capacity: 1000,
      leagues: [
        { name: 'Bundesliga', name_ja: 'ブンデスリーガ' },
        { name: 'DEL', name_ja: null },
      ],
    },
  ]));

  const index = await buildSearchIndex(dir);

  assert.deepEqual(index[0].leagues, ['Bundesliga', 'ブンデスリーガ', 'DEL']);
}));

test('buildSearchIndex defaults teams/leagues to empty arrays when the source record has neither field', () => withTempDir(async (dir) => {
  await writeFile(path.join(dir, 'XX.json'), JSON.stringify([
    { id: 'Q1', name: 'A', name_ja: null, lat: 1, lng: 1, country: 'XX', capacity: 1000 },
  ]));

  const index = await buildSearchIndex(dir);

  assert.deepEqual(index[0].teams, []);
  assert.deepEqual(index[0].leagues, []);
}));

test('buildSearchIndex contributes zero entries from an empty country file', () => withTempDir(async (dir) => {
  await writeFile(path.join(dir, 'EMPTY.json'), JSON.stringify([]));

  const index = await buildSearchIndex(dir);

  assert.deepEqual(index, []);
}));
