import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRelatedEntityCache, resolveRelatedEntities } from '../related-entities.js';

function makeEntity({ labelEn, labelJa, website, time, leagueClaims }) {
  const claims = {};
  if (website) claims.P856 = [{ mainsnak: { datavalue: { value: website } } }];
  if (time) claims.P585 = [{ mainsnak: { datavalue: { value: { time } } } }];
  if (leagueClaims) claims.P118 = leagueClaims;
  const labels = {};
  if (labelEn) labels.en = { value: labelEn };
  if (labelJa) labels.ja = { value: labelJa };
  return { labels, claims };
}

function leagueClaim(id, { rank = 'normal', endTime = null } = {}) {
  const claim = { mainsnak: { datavalue: { value: { id } } }, rank };
  if (endTime) claim.qualifiers = { P582: [{ datavalue: { value: { time: endTime } } }] };
  return claim;
}

test('resolveRelatedEntities fetches and shapes entities not yet cached', async () => {
  const fetchImpl = async (url) => {
    const ids = new URL(url).searchParams.get('ids').split('|');
    const entities = {};
    if (ids.includes('Q1')) entities.Q1 = makeEntity({ labelJa: 'チームA', website: 'https://team-a.example' });
    if (ids.includes('Q2')) entities.Q2 = makeEntity({ labelJa: 'イベントB', time: '+2016-00-00T00:00:00Z' });
    return { ok: true, status: 200, json: async () => ({ entities }) };
  };

  const cache = createRelatedEntityCache();
  const result = await resolveRelatedEntities(['Q1', 'Q2'], cache, { fetchImpl });

  assert.deepEqual(result.get('Q1'), { label: 'チームA', labelEn: null, labelJa: 'チームA', website: 'https://team-a.example', year: null, leagueQids: [] });
  assert.deepEqual(result.get('Q2'), { label: 'イベントB', labelEn: null, labelJa: 'イベントB', website: null, year: 2016, leagueQids: [] });
});

test('resolveRelatedEntities reuses cached entries without re-fetching', async () => {
  let callCount = 0;
  const fetchImpl = async (url) => {
    callCount++;
    const ids = new URL(url).searchParams.get('ids').split('|');
    const entities = {};
    ids.forEach((id) => { entities[id] = makeEntity({ labelJa: 'Label-' + id }); });
    return { ok: true, status: 200, json: async () => ({ entities }) };
  };

  const cache = createRelatedEntityCache();
  await resolveRelatedEntities(['Q1'], cache, { fetchImpl });
  assert.equal(callCount, 1);

  await resolveRelatedEntities(['Q1'], cache, { fetchImpl });
  assert.equal(callCount, 1, 'second call must not re-fetch an already-cached QID');
});

test('resolveRelatedEntities only fetches the QIDs missing from cache, and dedupes duplicates', async () => {
  const requestedBatches = [];
  const fetchImpl = async (url) => {
    const ids = new URL(url).searchParams.get('ids').split('|');
    requestedBatches.push(ids.slice().sort());
    const entities = {};
    ids.forEach((id) => { entities[id] = makeEntity({ labelJa: 'Label-' + id }); });
    return { ok: true, status: 200, json: async () => ({ entities }) };
  };

  const cache = createRelatedEntityCache();
  await resolveRelatedEntities(['Q1', 'Q1', 'Q2'], cache, { fetchImpl });
  assert.deepEqual(requestedBatches, [['Q1', 'Q2']]);

  await resolveRelatedEntities(['Q1', 'Q3'], cache, { fetchImpl });
  assert.deepEqual(requestedBatches[1], ['Q3']);
});

test('resolveRelatedEntities treats an entity with no label as unresolved (null label)', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ entities: { Q9: makeEntity({}) } }) });
  const cache = createRelatedEntityCache();
  const result = await resolveRelatedEntities(['Q9'], cache, { fetchImpl });
  assert.equal(result.get('Q9').label, null);
});

test('resolveRelatedEntities extracts current-league QIDs (P118) from a team entity, dropping deprecated/past claims', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      entities: {
        Q1: makeEntity({
          labelEn: 'Some FC',
          leagueClaims: [
            leagueClaim('Q_CURRENT'),
            leagueClaim('Q_DEPRECATED', { rank: 'deprecated' }),
            leagueClaim('Q_PAST', { endTime: '+2019-00-00T00:00:00Z' }),
          ],
        }),
      },
    }),
  });

  const cache = createRelatedEntityCache();
  const result = await resolveRelatedEntities(['Q1'], cache, { fetchImpl });

  assert.deepEqual(result.get('Q1').leagueQids, ['Q_CURRENT']);
});

test('resolveRelatedEntities prefers preferred-rank league claims over normal-rank ones', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      entities: {
        Q1: makeEntity({
          labelEn: 'Some FC',
          leagueClaims: [leagueClaim('Q_NORMAL'), leagueClaim('Q_PREFERRED', { rank: 'preferred' })],
        }),
      },
    }),
  });

  const cache = createRelatedEntityCache();
  const result = await resolveRelatedEntities(['Q1'], cache, { fetchImpl });

  assert.deepEqual(result.get('Q1').leagueQids, ['Q_PREFERRED']);
});

test('resolveRelatedEntities returns an empty leagueQids array when there is no P118 claim', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ entities: { Q1: makeEntity({ labelEn: 'Some Event' } ) } }) });
  const cache = createRelatedEntityCache();
  const result = await resolveRelatedEntities(['Q1'], cache, { fetchImpl });
  assert.deepEqual(result.get('Q1').leagueQids, []);
});
