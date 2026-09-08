import { test } from 'node:test';
import assert from 'node:assert/strict';
import { querySparql } from '../sparql-client.js';

test('querySparql returns bindings on success', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ results: { bindings: [{ item: { value: 'x' } }] } }),
  });

  const bindings = await querySparql('SELECT * WHERE {}', { fetchImpl });
  assert.deepEqual(bindings, [{ item: { value: 'x' } }]);
});

test('querySparql retries on a 429 response then succeeds', async () => {
  let callCount = 0;
  const fetchImpl = async () => {
    callCount++;
    if (callCount === 1) {
      return { ok: false, status: 429 };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ results: { bindings: [] } }),
    };
  };

  const bindings = await querySparql('SELECT * WHERE {}', { fetchImpl, retryDelayMs: 0 });
  assert.deepEqual(bindings, []);
  assert.equal(callCount, 2);
});

test('querySparql throws after exhausting retries', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500 });

  await assert.rejects(
    () => querySparql('SELECT * WHERE {}', { fetchImpl, maxRetries: 2, retryDelayMs: 0 }),
    /SPARQL query failed after 3 attempts/
  );
});
