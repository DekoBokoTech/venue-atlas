import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNameIndex,
  resUrlForNumero,
  fetchDepartmentCodes,
  fetchDepartmentRecords,
  fetchAllResNames,
} from '../res-names.js';

test('buildNameIndex builds a numero -> nom lookup from a flat record list', () => {
  const records = [
    { numero: 'I930660048', nom: 'STADE DE FRANCE' },
    { numero: 'I920250005', nom: 'STADE YVES DU MANOIR' },
  ];

  assert.deepEqual(buildNameIndex(records), {
    I930660048: 'STADE DE FRANCE',
    I920250005: 'STADE YVES DU MANOIR',
  });
});

test('buildNameIndex skips records missing numero or nom', () => {
  const records = [
    { numero: 'I1', nom: 'Named' },
    { numero: 'I2', nom: null },
    { numero: null, nom: 'Unnumbered' },
    { numero: 'I3' },
    {},
  ];

  assert.deepEqual(buildNameIndex(records), { I1: 'Named' });
});

test('buildNameIndex returns an empty object for an empty list', () => {
  assert.deepEqual(buildNameIndex([]), {});
});

test('resUrlForNumero builds the Opendatasoft table-view URL, URL-encoding the numero', () => {
  assert.equal(
    resUrlForNumero('I930660048'),
    'https://equipements.sports.gouv.fr/explore/dataset/data-es-installation/table/?q=I930660048'
  );
});

test('fetchDepartmentCodes returns the dep_code facet values from the group_by response', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      results: [
        { dep_code: null, n: 318 },
        { dep_code: '1', n: 1871 },
        { dep_code: '2A', n: 329 },
      ],
    }),
  });

  const codes = await fetchDepartmentCodes({ fetchImpl });

  assert.deepEqual(codes, [null, '1', '2A']);
});

test('fetchDepartmentRecords pages with limit/offset until a short page ends the walk', async () => {
  const requestedUrls = [];
  const pages = [
    Array.from({ length: 100 }, (_, i) => ({ numero: `I${i}`, nom: `Name ${i}` })),
    Array.from({ length: 40 }, (_, i) => ({ numero: `I${100 + i}`, nom: `Name ${100 + i}` })),
  ];
  let call = 0;
  const fetchImpl = async (url) => {
    requestedUrls.push(url);
    const results = pages[call++];
    return { ok: true, status: 200, json: async () => ({ results }) };
  };

  const records = await fetchDepartmentRecords('75', { fetchImpl, pageDelayMs: 0 });

  assert.equal(records.length, 140);
  assert.equal(requestedUrls.length, 2);
  assert.match(requestedUrls[0], /offset=0/);
  assert.match(requestedUrls[1], /offset=100/);
  assert.match(requestedUrls[0], /where=dep_code%3D%2275%22/);
});

test('fetchDepartmentRecords filters on "dep_code is null" for the null-department bucket', async () => {
  const requestedUrls = [];
  const fetchImpl = async (url) => {
    requestedUrls.push(url);
    return { ok: true, status: 200, json: async () => ({ results: [] }) };
  };

  await fetchDepartmentRecords(null, { fetchImpl, pageDelayMs: 0 });

  assert.match(requestedUrls[0], /where=dep_code%20is%20null/);
});

test('fetchDepartmentRecords retries on a 500 response then succeeds', async () => {
  let callCount = 0;
  const fetchImpl = async () => {
    callCount++;
    if (callCount === 1) return { ok: false, status: 500 };
    return { ok: true, status: 200, json: async () => ({ results: [] }) };
  };

  const records = await fetchDepartmentRecords('75', { fetchImpl, retryDelayMs: 0, pageDelayMs: 0 });

  assert.deepEqual(records, []);
  assert.equal(callCount, 2);
});

test('fetchDepartmentRecords throws after exhausting retries', async () => {
  const fetchImpl = async () => ({ ok: false, status: 503 });

  await assert.rejects(
    () => fetchDepartmentRecords('75', { fetchImpl, maxRetries: 1, retryDelayMs: 0, pageDelayMs: 0 }),
    /RES request failed after 2 attempts/
  );
});

test('fetchAllResNames walks every department and merges into one name index', async () => {
  const depCodes = [null, '1', '2A'];
  const recordsByDep = {
    null: [{ numero: 'I0', nom: 'Null-dept facility' }],
    1: [{ numero: 'I1', nom: 'Dept 1 facility' }],
    '2A': [{ numero: 'I2A', nom: 'Corse facility' }],
  };
  const doneLog = [];

  const fetchImpl = async (url) => {
    if (url.includes('group_by=dep_code')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ results: depCodes.map((dep_code) => ({ dep_code, n: 1 })) }),
      };
    }
    const decoded = decodeURIComponent(url);
    const key = decoded.includes('dep_code is null')
      ? 'null'
      : /dep_code="([^"]+)"/.exec(decoded)[1];
    return { ok: true, status: 200, json: async () => ({ results: recordsByDep[key] }) };
  };

  const index = await fetchAllResNames({
    fetchImpl,
    pageDelayMs: 0,
    onDepartmentDone: (depCode, count) => doneLog.push([depCode, count]),
  });

  assert.deepEqual(index, {
    I0: 'Null-dept facility',
    I1: 'Dept 1 facility',
    I2A: 'Corse facility',
  });
  assert.deepEqual(doneLog, [[null, 1], ['1', 1], ['2A', 1]]);
});
