import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEntity } from '../normalize.js';

test('normalizeEntity extracts all fields from a full coord binding + entity', () => {
  const coordBinding = {
    item: { value: 'http://www.wikidata.org/entity/Q123456' },
    coord: { value: 'Point(139.0 35.0)' },
  };
  const entity = {
    labels: {
      en: { language: 'en', value: 'Test Stadium' },
      ja: { language: 'ja', value: 'テストスタジアム' },
    },
    claims: {
      P1083: [{ mainsnak: { datavalue: { value: { amount: '+50000' } } } }],
      P571: [{ mainsnak: { datavalue: { value: { time: '+1990-04-01T00:00:00Z' } } } }],
      P18: [{ mainsnak: { datavalue: { value: 'Test.jpg' } } }],
      P856: [{ mainsnak: { datavalue: { value: 'https://example.com' } } }],
    },
    sitelinks: {
      jawiki: { title: 'Test Stadium' },
    },
  };

  const record = normalizeEntity(coordBinding, entity, 'JP', '2026-09-08T00:00:00.000Z');

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
    image_url: 'Test.jpg',
    website: 'https://example.com',
    sources: ['Wikidata', 'Wikipedia'],
    last_synced_at: '2026-09-08T00:00:00.000Z',
  });
});

test('normalizeEntity returns null when coordinates are missing', () => {
  const coordBinding = { item: { value: 'http://www.wikidata.org/entity/Q999' } };
  assert.equal(normalizeEntity(coordBinding, {}, 'JP', '2026-09-08T00:00:00.000Z'), null);
});

test('normalizeEntity fills missing optional fields with null/empty defaults', () => {
  const coordBinding = {
    item: { value: 'http://www.wikidata.org/entity/Q1' },
    coord: { value: 'Point(0.0 0.0)' },
  };

  const record = normalizeEntity(coordBinding, {}, 'FR', '2026-09-08T00:00:00.000Z');

  assert.equal(record.name, 'Q1');
  assert.equal(record.name_ja, null);
  assert.equal(record.capacity, null);
  assert.equal(record.opened_year, null);
  assert.deepEqual(record.sources, ['Wikidata']);
});

test('normalizeEntity uses UNKNOWN countryCode as a null country', () => {
  const coordBinding = {
    item: { value: 'http://www.wikidata.org/entity/Q1' },
    coord: { value: 'Point(0.0 0.0)' },
  };

  const record = normalizeEntity(coordBinding, {}, 'UNKNOWN', '2026-09-08T00:00:00.000Z');

  assert.equal(record.country, null);
});

test('normalizeEntity falls back to the English Wikipedia sitelink when no Japanese one exists', () => {
  const coordBinding = {
    item: { value: 'http://www.wikidata.org/entity/Q1' },
    coord: { value: 'Point(0.0 0.0)' },
  };
  const entity = { sitelinks: { enwiki: { title: 'Some Stadium' } } };

  const record = normalizeEntity(coordBinding, entity, 'US', '2026-09-08T00:00:00.000Z');

  assert.equal(record.wikipedia_url, 'https://en.wikipedia.org/wiki/Some_Stadium');
  assert.deepEqual(record.sources, ['Wikidata', 'Wikipedia']);
});

test('normalizeEntity extracts the facility website from P856', () => {
  const coordBinding = {
    item: { value: 'http://www.wikidata.org/entity/Q13205' },
    coord: { value: 'Point(2.36 48.924444)' },
  };
  const entity = {
    claims: {
      P856: [{ mainsnak: { datavalue: { value: 'http://www.stadefrance.com/' } } }],
    },
  };

  const record = normalizeEntity(coordBinding, entity, 'FR', '2026-09-09T00:00:00.000Z');

  assert.equal(record.website, 'http://www.stadefrance.com/');
});

test('normalizeEntity leaves website null when P856 is absent', () => {
  const coordBinding = {
    item: { value: 'http://www.wikidata.org/entity/Q1' },
    coord: { value: 'Point(0.0 0.0)' },
  };

  const record = normalizeEntity(coordBinding, {}, 'FR', '2026-09-09T00:00:00.000Z');

  assert.equal(record.website, null);
});
