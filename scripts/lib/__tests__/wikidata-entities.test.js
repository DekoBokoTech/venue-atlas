import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchEntities } from '../wikidata-entities.js';

test('fetchEntities returns the entities map for a single small batch', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      entities: {
        Q1: { id: 'Q1', labels: {}, claims: {}, sitelinks: {} },
        Q2: { id: 'Q2', labels: {}, claims: {}, sitelinks: {} },
      },
    }),
  });

  const entities = await fetchEntities(['Q1', 'Q2'], { fetchImpl });

  assert.deepEqual(Object.keys(entities).sort(), ['Q1', 'Q2']);
});

test('fetchEntities splits requests into batches and merges the results', async () => {
  const requestedIdSets = [];
  const fetchImpl = async (url) => {
    const idsParam = new URL(url).searchParams.get('ids');
    requestedIdSets.push(idsParam.split('|'));
    const entities = {};
    for (const id of idsParam.split('|')) {
      entities[id] = { id, labels: {}, claims: {}, sitelinks: {} };
    }
    return { ok: true, status: 200, json: async () => ({ entities }) };
  };

  const qids = Array.from({ length: 5 }, (_, i) => `Q${i}`);
  const entities = await fetchEntities(qids, { fetchImpl, batchSize: 2, batchDelayMs: 0 });

  assert.deepEqual(requestedIdSets, [['Q0', 'Q1'], ['Q2', 'Q3'], ['Q4']]);
  assert.deepEqual(Object.keys(entities).sort(), ['Q0', 'Q1', 'Q2', 'Q3', 'Q4']);
});

test('fetchEntities retries on a 429 response then succeeds', async () => {
  let callCount = 0;
  const fetchImpl = async () => {
    callCount++;
    if (callCount === 1) {
      return { ok: false, status: 429 };
    }
    return { ok: true, status: 200, json: async () => ({ entities: { Q1: { id: 'Q1' } } }) };
  };

  const entities = await fetchEntities(['Q1'], { fetchImpl, retryDelayMs: 0 });

  assert.deepEqual(entities, { Q1: { id: 'Q1' } });
  assert.equal(callCount, 2);
});

test('fetchEntities waits for the Retry-After duration when a 429 includes one', async () => {
  let callCount = 0;
  const delays = [];
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms) => {
    delays.push(ms);
    return originalSetTimeout(fn, 0);
  };

  try {
    const fetchImpl = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 429,
          headers: { get: (name) => (name === 'retry-after' ? '5' : null) },
        };
      }
      return { ok: true, status: 200, json: async () => ({ entities: { Q1: { id: 'Q1' } } }) };
    };

    await fetchEntities(['Q1'], { fetchImpl, retryDelayMs: 1000 });

    assert.equal(delays[0], 5000);
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});

test('fetchEntities throws after exhausting retries', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500 });

  await assert.rejects(
    () => fetchEntities(['Q1'], { fetchImpl, maxRetries: 2, retryDelayMs: 0 }),
    /wbgetentities batch failed after 3 attempts/
  );
});
