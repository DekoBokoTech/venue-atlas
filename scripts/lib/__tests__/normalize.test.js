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

  const record = normalizeEntity(coordBinding, entity, 'JP', '2026-09-08T00:00:00.000Z', new Map());

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
    is_existing: true,
    roof_type: null,
    teams: [],
    events: [],
    wikipedia_url: 'https://ja.wikipedia.org/wiki/Test_Stadium',
    wikidata_url: 'https://www.wikidata.org/wiki/Q123456',
    image_url: 'Test.jpg',
    website: 'https://example.com',
    res_url: null,
    sources: ['Wikidata', 'Wikipedia'],
    last_synced_at: '2026-09-08T00:00:00.000Z',
  });
});

test('normalizeEntity returns null when coordinates are missing', () => {
  const coordBinding = { item: { value: 'http://www.wikidata.org/entity/Q999' } };
  assert.equal(normalizeEntity(coordBinding, {}, 'JP', '2026-09-08T00:00:00.000Z', new Map()), null);
});

test('normalizeEntity fills missing optional fields with null/empty defaults', () => {
  const coordBinding = {
    item: { value: 'http://www.wikidata.org/entity/Q1' },
    coord: { value: 'Point(0.0 0.0)' },
  };

  const entity = { labels: { ja: { language: 'ja', value: 'テスト施設' } } };
  const record = normalizeEntity(coordBinding, entity, 'FR', '2026-09-08T00:00:00.000Z', new Map());

  assert.equal(record.name, 'Q1');
  assert.equal(record.name_ja, 'テスト施設');
  assert.equal(record.capacity, null);
  assert.equal(record.opened_year, null);
  assert.deepEqual(record.sources, ['Wikidata']);
});

test('normalizeEntity uses UNKNOWN countryCode as a null country', () => {
  const coordBinding = {
    item: { value: 'http://www.wikidata.org/entity/Q1' },
    coord: { value: 'Point(0.0 0.0)' },
  };

  const entity = { labels: { en: { language: 'en', value: 'Some Facility' } } };
  const record = normalizeEntity(coordBinding, entity, 'UNKNOWN', '2026-09-08T00:00:00.000Z', new Map());

  assert.equal(record.country, null);
});

test('normalizeEntity falls back to the English Wikipedia sitelink when no Japanese one exists', () => {
  const coordBinding = {
    item: { value: 'http://www.wikidata.org/entity/Q1' },
    coord: { value: 'Point(0.0 0.0)' },
  };
  const entity = { labels: { en: { language: 'en', value: 'Some Stadium' } }, sitelinks: { enwiki: { title: 'Some Stadium' } } };

  const record = normalizeEntity(coordBinding, entity, 'US', '2026-09-08T00:00:00.000Z', new Map());

  assert.equal(record.wikipedia_url, 'https://en.wikipedia.org/wiki/Some_Stadium');
  assert.deepEqual(record.sources, ['Wikidata', 'Wikipedia']);
});

test('normalizeEntity extracts the facility website from P856', () => {
  const coordBinding = {
    item: { value: 'http://www.wikidata.org/entity/Q13205' },
    coord: { value: 'Point(2.36 48.924444)' },
  };
  const entity = {
    labels: { en: { language: 'en', value: 'Stade de France' } },
    claims: {
      P856: [{ mainsnak: { datavalue: { value: 'http://www.stadefrance.com/' } } }],
    },
  };

  const record = normalizeEntity(coordBinding, entity, 'FR', '2026-09-09T00:00:00.000Z', new Map());

  assert.equal(record.website, 'http://www.stadefrance.com/');
});

test('normalizeEntity leaves website null when P856 is absent', () => {
  const coordBinding = {
    item: { value: 'http://www.wikidata.org/entity/Q1' },
    coord: { value: 'Point(0.0 0.0)' },
  };

  const entity = { labels: { en: { language: 'en', value: 'Some Facility' } } };
  const record = normalizeEntity(coordBinding, entity, 'FR', '2026-09-09T00:00:00.000Z', new Map());

  assert.equal(record.website, null);
});

test('normalizeEntity resolves teams from P466 via the relatedEntities map', () => {
  const coordBinding = {
    item: { value: 'http://www.wikidata.org/entity/Q13205' },
    coord: { value: 'Point(2.36 48.924444)' },
  };
  const entity = {
    labels: { en: { language: 'en', value: 'Stade de France' } },
    claims: {
      P466: [
        { mainsnak: { datavalue: { value: { id: 'Q47774' } } } },
        { mainsnak: { datavalue: { value: { id: 'Q518116' } } } },
      ],
    },
  };
  const relatedEntities = new Map([
    ['Q47774', { label: 'サッカーフランス代表', website: 'https://www.fff.fr', year: null }],
    ['Q518116', { label: 'ラグビーフランス代表', website: null, year: null }],
  ]);

  const record = normalizeEntity(coordBinding, entity, 'FR', '2026-09-09T00:00:00.000Z', relatedEntities);

  assert.deepEqual(record.teams, [
    { name: 'サッカーフランス代表', url: 'https://www.fff.fr' },
    { name: 'ラグビーフランス代表', url: null },
  ]);
});

test('normalizeEntity caps teams at 4 and skips unresolved (null-label) QIDs', () => {
  const coordBinding = { item: { value: 'http://www.wikidata.org/entity/Q1' }, coord: { value: 'Point(0.0 0.0)' } };
  const entity = {
    labels: { en: { language: 'en', value: 'Some Facility' } },
    claims: {
      P466: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'].map((id) => ({ mainsnak: { datavalue: { value: { id } } } })),
    },
  };
  const relatedEntities = new Map([
    ['Q1', { label: 'A', website: null, year: null }],
    ['Q2', { label: null, website: null, year: null }],
    ['Q3', { label: 'C', website: null, year: null }],
    ['Q4', { label: 'D', website: null, year: null }],
    ['Q5', { label: 'E', website: null, year: null }],
  ]);

  const record = normalizeEntity(coordBinding, entity, 'FR', '2026-09-09T00:00:00.000Z', relatedEntities);

  assert.deepEqual(record.teams.map((t) => t.name), ['A', 'C', 'D', 'E']);
});

test('normalizeEntity resolves events from P793, sorted by year, filtering non-sporting entries', () => {
  const coordBinding = { item: { value: 'http://www.wikidata.org/entity/Q13205' }, coord: { value: 'Point(2.36 48.924444)' } };
  const entity = {
    labels: { en: { language: 'en', value: 'Stade de France' } },
    claims: {
      P793: ['Q1', 'Q2', 'Q3', 'Q4'].map((id) => ({ mainsnak: { datavalue: { value: { id } } } })),
    },
  };
  const relatedEntities = new Map([
    ['Q1', { label: '1998 FIFAワールドカップ', website: null, year: 1998 }],
    ['Q2', { label: 'パリ同時多発テロ事件', website: null, year: 2015 }],
    ['Q3', { label: 'UEFA EURO 2016', website: null, year: 2016 }],
    ['Q4', { label: '着工', website: null, year: null }],
  ]);

  const record = normalizeEntity(coordBinding, entity, 'FR', '2026-09-09T00:00:00.000Z', relatedEntities);

  assert.deepEqual(record.events, [
    { name: '1998 FIFAワールドカップ', year: 1998 },
    { name: 'UEFA EURO 2016', year: 2016 },
  ]);
});

test('normalizeEntity caps events at 5, sorting null years last', () => {
  const coordBinding = { item: { value: 'http://www.wikidata.org/entity/Q1' }, coord: { value: 'Point(0.0 0.0)' } };
  const entity = {
    labels: { en: { language: 'en', value: 'Some Facility' } },
    claims: {
      P793: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'].map((id) => ({ mainsnak: { datavalue: { value: { id } } } })),
    },
  };
  const relatedEntities = new Map([
    ['Q1', { label: 'Event 2010', website: null, year: 2010 }],
    ['Q2', { label: 'Event no-year-A', website: null, year: null }],
    ['Q3', { label: 'Event 2005', website: null, year: 2005 }],
    ['Q4', { label: 'Event 2020', website: null, year: 2020 }],
    ['Q5', { label: 'Event 2015', website: null, year: 2015 }],
    ['Q6', { label: 'Event no-year-B', website: null, year: null }],
  ]);

  const record = normalizeEntity(coordBinding, entity, 'FR', '2026-09-09T00:00:00.000Z', relatedEntities);

  assert.deepEqual(record.events.map((e) => e.name), ['Event 2005', 'Event 2010', 'Event 2015', 'Event 2020', 'Event no-year-A']);
});

test('normalizeEntity returns empty teams/events arrays when there are no P466/P793 claims', () => {
  const coordBinding = { item: { value: 'http://www.wikidata.org/entity/Q1' }, coord: { value: 'Point(0.0 0.0)' } };
  const entity = { labels: { en: { language: 'en', value: 'Some Facility' } } };
  const record = normalizeEntity(coordBinding, entity, 'FR', '2026-09-09T00:00:00.000Z', new Map());
  assert.deepEqual(record.teams, []);
  assert.deepEqual(record.events, []);
});

test('normalizeEntity filters out an event labeled 施工 (construction work)', () => {
  const coordBinding = { item: { value: 'http://www.wikidata.org/entity/Q125886420' }, coord: { value: 'Point(0.0 0.0)' } };
  const entity = {
    labels: { en: { language: 'en', value: 'Some Stadium' } },
    claims: {
      P793: [{ mainsnak: { datavalue: { value: { id: 'Q1' } } } }],
    },
  };
  const relatedEntities = new Map([['Q1', { label: '施工', website: null, year: null }]]);

  const record = normalizeEntity(coordBinding, entity, 'RS', '2026-09-09T00:00:00.000Z', relatedEntities);

  assert.deepEqual(record.events, []);
});

test('normalizeEntity filters out an English-labeled non-sporting event', () => {
  const coordBinding = { item: { value: 'http://www.wikidata.org/entity/Q1' }, coord: { value: 'Point(0.0 0.0)' } };
  const entity = {
    labels: { en: { language: 'en', value: 'Some Stadium' } },
    claims: {
      P793: [{ mainsnak: { datavalue: { value: { id: 'Q1' } } } }],
    },
  };
  const relatedEntities = new Map([['Q1', { label: 'Groundbreaking ceremony', website: null, year: null }]]);

  const record = normalizeEntity(coordBinding, entity, 'US', '2026-09-09T00:00:00.000Z', relatedEntities);

  assert.deepEqual(record.events, []);
});

test('normalizeEntity does not throw when called without relatedEntities on an entity with P466/P793 claims', () => {
  const coordBinding = { item: { value: 'http://www.wikidata.org/entity/Q1' }, coord: { value: 'Point(0.0 0.0)' } };
  const entity = {
    labels: { en: { language: 'en', value: 'Some Facility' } },
    claims: {
      P466: [{ mainsnak: { datavalue: { value: { id: 'Q47774' } } } }],
      P793: [{ mainsnak: { datavalue: { value: { id: 'Q1' } } } }],
    },
  };

  const record = normalizeEntity(coordBinding, entity, 'FR', '2026-09-09T00:00:00.000Z');

  assert.deepEqual(record.teams, []);
  assert.deepEqual(record.events, []);
});

test('normalizeEntity derives closed_year from P576 and marks is_existing false', () => {
  const coordBinding = { item: { value: 'http://www.wikidata.org/entity/Q1' }, coord: { value: 'Point(0.0 0.0)' } };
  const entity = {
    labels: { en: { language: 'en', value: 'Former Stadium' } },
    claims: {
      P576: [{ mainsnak: { datavalue: { value: { time: '+2005-06-15T00:00:00Z' } } } }],
    },
  };

  const record = normalizeEntity(coordBinding, entity, 'FR', '2026-09-09T00:00:00.000Z', new Map());

  assert.equal(record.closed_year, 2005);
  assert.equal(record.is_existing, false);
});

test('normalizeEntity defaults is_existing to true when there is no P576 and no unfinished-building P31', () => {
  const coordBinding = { item: { value: 'http://www.wikidata.org/entity/Q1' }, coord: { value: 'Point(0.0 0.0)' } };
  const entity = { labels: { en: { language: 'en', value: 'Active Stadium' } } };

  const record = normalizeEntity(coordBinding, entity, 'FR', '2026-09-09T00:00:00.000Z', new Map());

  assert.equal(record.closed_year, null);
  assert.equal(record.is_existing, true);
});

test('normalizeEntity marks is_existing false for a never-built proposal (P31=Q1570262), leaving closed_year null', () => {
  const coordBinding = { item: { value: 'http://www.wikidata.org/entity/Q1' }, coord: { value: 'Point(0.0 0.0)' } };
  const entity = {
    labels: { en: { language: 'en', value: 'Deutsches Stadion' } },
    claims: {
      P31: [{ mainsnak: { datavalue: { value: { id: 'Q1570262' } } } }],
    },
  };

  const record = normalizeEntity(coordBinding, entity, 'DE', '2026-09-09T00:00:00.000Z', new Map());

  assert.equal(record.is_existing, false);
  assert.equal(record.closed_year, null);
});

test('normalizeEntity returns null when neither an English nor a Japanese label is available', () => {
  const coordBinding = { item: { value: 'http://www.wikidata.org/entity/Q120218965' }, coord: { value: 'Point(0.0 0.0)' } };
  const entity = { labels: { fr: { language: 'fr', value: 'Nom Français' } } };

  const record = normalizeEntity(coordBinding, entity, 'FR', '2026-09-09T00:00:00.000Z', new Map());

  assert.equal(record, null);
});

test('normalizeEntity does not return null when only a Japanese label exists, and sets name_ja correctly', () => {
  const coordBinding = { item: { value: 'http://www.wikidata.org/entity/Q1' }, coord: { value: 'Point(0.0 0.0)' } };
  const entity = { labels: { ja: { language: 'ja', value: '日本語スタジアム' } } };

  const record = normalizeEntity(coordBinding, entity, 'JP', '2026-09-09T00:00:00.000Z', new Map());

  assert.notEqual(record, null);
  assert.equal(record.name, 'Q1');
  assert.equal(record.name_ja, '日本語スタジアム');
});

// --- RES (P11840) name enrichment ------------------------------------------

test('normalizeEntity resolves a name from RES via P11840 when Wikidata has no en/ja label, and is not excluded', () => {
  const coordBinding = { item: { value: 'http://www.wikidata.org/entity/Q13205' }, coord: { value: 'Point(2.36 48.924444)' } };
  const entity = {
    labels: {},
    claims: {
      P11840: [{ mainsnak: { datavalue: { value: 'I930660048' } } }],
    },
  };
  const resNameIndex = new Map([['I930660048', 'STADE DE FRANCE']]);

  const record = normalizeEntity(coordBinding, entity, 'FR', '2026-09-09T00:00:00.000Z', new Map(), resNameIndex);

  assert.notEqual(record, null);
  assert.equal(record.name, 'STADE DE FRANCE');
  assert.equal(record.name_ja, null);
  assert.deepEqual(record.sources, ['Wikidata', 'RES']);
  assert.equal(record.res_url, 'https://equipements.sports.gouv.fr/explore/dataset/data-es-installation/table/?q=I930660048');
});

test('normalizeEntity still returns null when P11840 is set but resNameIndex has no matching entry', () => {
  const coordBinding = { item: { value: 'http://www.wikidata.org/entity/Q13205' }, coord: { value: 'Point(2.36 48.924444)' } };
  const entity = {
    labels: {},
    claims: {
      P11840: [{ mainsnak: { datavalue: { value: 'I930660048' } } }],
    },
  };

  const record = normalizeEntity(coordBinding, entity, 'FR', '2026-09-09T00:00:00.000Z', new Map(), new Map());

  assert.equal(record, null);
});

test('normalizeEntity is unaffected by RES lookups when there is no P11840 claim at all', () => {
  const coordBinding = { item: { value: 'http://www.wikidata.org/entity/Q1' }, coord: { value: 'Point(0.0 0.0)' } };
  const entity = { labels: { en: { language: 'en', value: 'Some Facility' } } };
  const resNameIndex = new Map([['I999999999', 'Some Other Facility']]);

  const record = normalizeEntity(coordBinding, entity, 'FR', '2026-09-09T00:00:00.000Z', new Map(), resNameIndex);

  assert.equal(record.name, 'Some Facility');
  assert.deepEqual(record.sources, ['Wikidata']);
  assert.equal(record.res_url, null);
});

test('normalizeEntity does not let RES override an existing Wikidata name even when P11840 also resolves', () => {
  const coordBinding = { item: { value: 'http://www.wikidata.org/entity/Q13205' }, coord: { value: 'Point(2.36 48.924444)' } };
  const entity = {
    labels: { en: { language: 'en', value: 'Stade de France' } },
    claims: {
      P11840: [{ mainsnak: { datavalue: { value: 'I930660048' } } }],
    },
  };
  const resNameIndex = new Map([['I930660048', 'STADE DE FRANCE (RES NAME)']]);

  const record = normalizeEntity(coordBinding, entity, 'FR', '2026-09-09T00:00:00.000Z', new Map(), resNameIndex);

  assert.equal(record.name, 'Stade de France');
  assert.deepEqual(record.sources, ['Wikidata']);
  assert.equal(record.res_url, null);
});
