import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBinding } from '../normalize.js';

test('normalizeBinding extracts all fields from a full binding', () => {
  const binding = {
    item: { value: 'http://www.wikidata.org/entity/Q123456' },
    nameEn: { value: 'Test Stadium' },
    nameJa: { value: 'テストスタジアム' },
    coord: { value: 'Point(139.0 35.0)' },
    capacity: { value: '50000' },
    inception: { value: '1990-04-01T00:00:00Z' },
    countryCode: { value: 'JP' },
    wikipediaUrl: { value: 'https://ja.wikipedia.org/wiki/Test_Stadium' },
    image: { value: 'https://commons.wikimedia.org/wiki/File:Test.jpg' },
  };

  const record = normalizeBinding(binding, '2026-09-08T00:00:00.000Z');

  assert.deepEqual(record, {
    id: 'Q123456',
    name: 'Test Stadium',
    name_ja: 'テストスタジアム',
    lat: 35.0,
    lng: 139.0,
    country: 'JP',
    sport_types: [],
    capacity: 50000,
    opened_year: 1990,
    closed_year: null,
    roof_type: null,
    teams: [],
    wikipedia_url: 'https://ja.wikipedia.org/wiki/Test_Stadium',
    wikidata_url: 'https://www.wikidata.org/wiki/Q123456',
    image_url: 'https://commons.wikimedia.org/wiki/File:Test.jpg',
    sources: ['Wikidata', 'Wikipedia'],
    last_synced_at: '2026-09-08T00:00:00.000Z',
  });
});

test('normalizeBinding returns null when coordinates are missing', () => {
  const binding = {
    item: { value: 'http://www.wikidata.org/entity/Q999' },
    nameEn: { value: 'No Coord Facility' },
  };

  assert.equal(normalizeBinding(binding, '2026-09-08T00:00:00.000Z'), null);
});

test('normalizeBinding fills missing optional fields with null/empty defaults', () => {
  const binding = {
    item: { value: 'http://www.wikidata.org/entity/Q1' },
    coord: { value: 'Point(0.0 0.0)' },
  };

  const record = normalizeBinding(binding, '2026-09-08T00:00:00.000Z');

  assert.equal(record.name, 'Q1');
  assert.equal(record.name_ja, null);
  assert.equal(record.capacity, null);
  assert.equal(record.opened_year, null);
  assert.equal(record.country, null);
  assert.deepEqual(record.sources, ['Wikidata']);
});

test('normalizeBinding falls back to the English Wikipedia sitelink when no Japanese one exists', () => {
  const binding = {
    item: { value: 'http://www.wikidata.org/entity/Q42' },
    coord: { value: 'Point(0.0 0.0)' },
    wikipediaUrlEn: { value: 'https://en.wikipedia.org/wiki/Test_Stadium' },
  };

  const record = normalizeBinding(binding, '2026-09-08T00:00:00.000Z');

  assert.equal(record.wikipedia_url, 'https://en.wikipedia.org/wiki/Test_Stadium');
  assert.deepEqual(record.sources, ['Wikidata', 'Wikipedia']);
});

test('normalizeBinding falls back to the label-service itemLabel when nameEn is absent', () => {
  const binding = {
    item: { value: 'http://www.wikidata.org/entity/Q42' },
    coord: { value: 'Point(0.0 0.0)' },
    itemLabel: { value: 'Stade de Test' },
  };

  const record = normalizeBinding(binding, '2026-09-08T00:00:00.000Z');

  assert.equal(record.name, 'Stade de Test');
});
