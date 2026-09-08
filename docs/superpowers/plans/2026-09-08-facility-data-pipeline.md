# Facility Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a GitHub Actions-driven pipeline that collects worldwide stadium/arena facility data from Wikidata and stores it as static, country-partitioned JSON files in this repository.

**Architecture:** A Node.js script queries the Wikidata Query Service (SPARQL) in pages, normalizes each result into a facility record, groups records by country, and merges them into per-country JSON files under `data/facilities/`. A GitHub Actions workflow runs the script on a schedule (and on manual dispatch) and commits any changes.

**Tech Stack:** Node.js (built-in `fetch`, `node:test`, `node:fs/promises` — no npm dependencies), GitHub Actions, GitHub Pages (hosting target for later phases).

**Spec:** [docs/superpowers/specs/2026-09-08-facility-data-pipeline-design.md](../specs/2026-09-08-facility-data-pipeline-design.md)

## Global Constraints

- No Vercel, Supabase, or paid/rented server (Xserver) — hosting is GitHub Pages, automation is GitHub Actions only.
- Data is stored as static JSON in this repository, never in a database.
- A facility record MUST have coordinates (`lat`/`lng`); every other field may be `null`/empty when unavailable.
- Use only Node.js built-ins (`fetch`, `node:test`, `node:assert/strict`, `node:fs/promises`, `node:path`, `node:os`) — do not add npm dependencies.
- Node.js version: `>=18` (declared in `package.json` `engines`).
- Source attribution is tracked per-record via a `sources` array field; the design defers rendering it to Phase 2 (page-level source list).

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `data/facilities/.gitkeep`
- Create: `data/facility_details/.gitkeep`
- Create: `data/sync_log.json`
- Create: `scripts/lib/__tests__/.gitkeep`

**Interfaces:**
- Produces: `npm test` runs `node --test scripts/lib/__tests__/`; `npm run collect` runs `node scripts/collect-facilities.js` (script itself is added in Task 7).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "stadium-atlas",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "test": "node --test scripts/lib/__tests__/",
    "collect": "node scripts/collect-facilities.js"
  }
}
```

- [ ] **Step 2: Create data directory scaffolding**

Create `data/facilities/.gitkeep` (empty file), `data/facility_details/.gitkeep` (empty file), `scripts/lib/__tests__/.gitkeep` (empty file), and `data/sync_log.json` with content:

```json
[]
```

- [ ] **Step 3: Verify the test runner works with zero tests**

Run: `npm test`
Expected: exits with code 0, reports 0 tests run (no test files exist yet).

- [ ] **Step 4: Commit**

```bash
git add package.json data/facilities/.gitkeep data/facility_details/.gitkeep data/sync_log.json scripts/lib/__tests__/.gitkeep
git commit -m "chore: scaffold facility data pipeline project"
```

---

### Task 2: SPARQL client with retry

**Files:**
- Create: `scripts/lib/sparql-client.js`
- Test: `scripts/lib/__tests__/sparql-client.test.js`

**Interfaces:**
- Produces: `async function querySparql(query, options = {})` where `options` is `{ fetchImpl, maxRetries = 3, retryDelayMs = 1000 }`. Returns `Array` of SPARQL binding objects (`json.results.bindings`). Throws an `Error` after retries are exhausted.

- [ ] **Step 1: Write the failing tests**

```js
// scripts/lib/__tests__/sparql-client.test.js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../sparql-client.js'`

- [ ] **Step 3: Write the implementation**

```js
// scripts/lib/sparql-client.js
const ENDPOINT = 'https://query.wikidata.org/sparql';

export async function querySparql(query, options = {}) {
  const {
    fetchImpl = fetch,
    maxRetries = 3,
    retryDelayMs = 1000,
  } = options;

  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: 'application/sparql-results+json',
          'User-Agent': 'stadium-atlas-bot/1.0',
        },
      });

      if (response.status === 429 || response.status >= 500) {
        throw new Error(`Retryable HTTP status: ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(`SPARQL request failed with status ${response.status}`);
      }

      const json = await response.json();
      return json.results.bindings;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = retryDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`SPARQL query failed after ${maxRetries + 1} attempts: ${lastError.message}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/sparql-client.js scripts/lib/__tests__/sparql-client.test.js
git commit -m "feat: add Wikidata SPARQL client with retry/backoff"
```

---

### Task 3: SPARQL query builder

**Files:**
- Create: `scripts/lib/build-query.js`
- Test: `scripts/lib/__tests__/build-query.test.js`

**Interfaces:**
- Produces: `function buildQuery({ limit, offset })` → returns a SPARQL query `string` selecting sports-venue-class entities (via `wd:Q1076486` and its subclasses) with coordinates, paginated via `LIMIT`/`OFFSET`. Selected variables: `?item`, `?nameEn`, `?nameJa`, `?coord`, `?capacity`, `?inception`, `?countryCode`, `?wikipediaUrl`, `?image`.

- [ ] **Step 1: Write the failing tests**

```js
// scripts/lib/__tests__/build-query.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuery } from '../build-query.js';

test('buildQuery includes the requested limit and offset', () => {
  const query = buildQuery({ limit: 500, offset: 1000 });
  assert.match(query, /LIMIT 500/);
  assert.match(query, /OFFSET 1000/);
});

test('buildQuery targets sports venue subclasses with coordinates', () => {
  const query = buildQuery({ limit: 10, offset: 0 });
  assert.match(query, /wd:Q1076486/);
  assert.match(query, /wdt:P625/);
});

test('buildQuery requests both English and Japanese labels', () => {
  const query = buildQuery({ limit: 10, offset: 0 });
  assert.match(query, /\?nameEn/);
  assert.match(query, /\?nameJa/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../build-query.js'`

- [ ] **Step 3: Write the implementation**

```js
// scripts/lib/build-query.js
export function buildQuery({ limit, offset }) {
  return `
SELECT ?item ?nameEn ?nameJa ?coord ?capacity ?inception ?countryCode ?wikipediaUrl ?image WHERE {
  ?item wdt:P31/wdt:P279* wd:Q1076486 .
  ?item wdt:P625 ?coord .
  OPTIONAL { ?item rdfs:label ?nameEn . FILTER(LANG(?nameEn) = "en") }
  OPTIONAL { ?item rdfs:label ?nameJa . FILTER(LANG(?nameJa) = "ja") }
  OPTIONAL { ?item wdt:P1083 ?capacity . }
  OPTIONAL { ?item wdt:P571 ?inception . }
  OPTIONAL {
    ?item wdt:P17 ?country .
    ?country wdt:P297 ?countryCode .
  }
  OPTIONAL {
    ?wikipediaUrl schema:about ?item ;
                  schema:isPartOf <https://ja.wikipedia.org/> .
  }
  OPTIONAL { ?item wdt:P18 ?image . }
}
ORDER BY ?item
LIMIT ${limit}
OFFSET ${offset}
`.trim();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/build-query.js scripts/lib/__tests__/build-query.test.js
git commit -m "feat: add paginated Wikidata query builder for sports venues"
```

**Note for implementer:** Before Task 7's manual dry run, paste one generated query into the Wikidata Query Service web UI (query.wikidata.org) to confirm the property IDs (P1083 capacity, P571 inception, P17 country, P297 ISO code, P18 image) return the expected shape. If any property differs, adjust `buildQuery` and its tests together.

---

### Task 4: Facility record normalization

**Files:**
- Create: `scripts/lib/normalize.js`
- Test: `scripts/lib/__tests__/normalize.test.js`

**Interfaces:**
- Consumes: a single SPARQL binding object as produced by `querySparql` (Task 2) using the shape from `buildQuery` (Task 3).
- Produces: `function normalizeBinding(binding, syncedAt)` → returns a facility record object, or `null` if the binding has no coordinates. Record shape:
  ```
  {
    id, name, name_ja, lat, lng, country, sport_types,
    capacity, opened_year, closed_year, roof_type, teams,
    wikipedia_url, wikidata_url, image_url, sources, last_synced_at
  }
  ```

- [ ] **Step 1: Write the failing tests**

```js
// scripts/lib/__tests__/normalize.test.js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../normalize.js'`

- [ ] **Step 3: Write the implementation**

```js
// scripts/lib/normalize.js
function parsePoint(wktPoint) {
  const match = /Point\(([-0-9.]+) ([-0-9.]+)\)/.exec(wktPoint);
  if (!match) return null;
  return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
}

export function normalizeBinding(binding, syncedAt) {
  if (!binding.coord) return null;
  const coord = parsePoint(binding.coord.value);
  if (!coord) return null;

  const qid = binding.item.value.split('/').pop();

  return {
    id: qid,
    name: binding.nameEn ? binding.nameEn.value : qid,
    name_ja: binding.nameJa ? binding.nameJa.value : null,
    lat: coord.lat,
    lng: coord.lng,
    country: binding.countryCode ? binding.countryCode.value : null,
    sport_types: [],
    capacity: binding.capacity ? parseInt(binding.capacity.value, 10) : null,
    opened_year: binding.inception ? new Date(binding.inception.value).getUTCFullYear() : null,
    closed_year: null,
    roof_type: null,
    teams: [],
    wikipedia_url: binding.wikipediaUrl ? binding.wikipediaUrl.value : null,
    wikidata_url: `https://www.wikidata.org/wiki/${qid}`,
    image_url: binding.image ? binding.image.value : null,
    sources: binding.wikipediaUrl ? ['Wikidata', 'Wikipedia'] : ['Wikidata'],
    last_synced_at: syncedAt,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/normalize.js scripts/lib/__tests__/normalize.test.js
git commit -m "feat: normalize SPARQL bindings into facility records"
```

---

### Task 5: Per-country facility store (load/merge/save)

**Files:**
- Create: `scripts/lib/facility-store.js`
- Test: `scripts/lib/__tests__/facility-store.test.js`

**Interfaces:**
- Consumes: facility record objects as produced by `normalizeBinding` (Task 4).
- Produces:
  - `async function loadFacilities(dir, countryCode)` → `Array` of records from `<dir>/<countryCode>.json`, or `[]` if the file does not exist.
  - `function mergeFacilities(existing, incoming)` → `{ merged: Array, newCount: number, updatedCount: number }`, merged sorted by `id` ascending, incoming records win on id collision.
  - `async function saveFacilities(dir, countryCode, records)` → writes `records` as pretty-printed JSON to `<dir>/<countryCode>.json`, creating `dir` if needed.

- [ ] **Step 1: Write the failing tests**

```js
// scripts/lib/__tests__/facility-store.test.js
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

test('mergeFacilities adds new records and updates existing ones by id', () => {
  const existing = [
    { id: 'Q1', name: 'Old Name' },
    { id: 'Q2', name: 'Unchanged' },
  ];
  const incoming = [
    { id: 'Q1', name: 'New Name' },
    { id: 'Q3', name: 'Brand New' },
  ];

  const { merged, newCount, updatedCount } = mergeFacilities(existing, incoming);

  assert.equal(newCount, 1);
  assert.equal(updatedCount, 1);
  assert.deepEqual(merged, [
    { id: 'Q1', name: 'New Name' },
    { id: 'Q2', name: 'Unchanged' },
    { id: 'Q3', name: 'Brand New' },
  ]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../facility-store.js'`

- [ ] **Step 3: Write the implementation**

```js
// scripts/lib/facility-store.js
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export async function loadFacilities(dir, countryCode) {
  const filePath = path.join(dir, `${countryCode}.json`);
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export function mergeFacilities(existing, incoming) {
  const map = new Map(existing.map((record) => [record.id, record]));
  let newCount = 0;
  let updatedCount = 0;

  for (const record of incoming) {
    if (map.has(record.id)) {
      updatedCount++;
    } else {
      newCount++;
    }
    map.set(record.id, record);
  }

  const merged = Array.from(map.values()).sort((a, b) => a.id.localeCompare(b.id));
  return { merged, newCount, updatedCount };
}

export async function saveFacilities(dir, countryCode, records) {
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${countryCode}.json`);
  await writeFile(filePath, JSON.stringify(records, null, 2) + '\n', 'utf-8');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/facility-store.js scripts/lib/__tests__/facility-store.test.js
git commit -m "feat: add per-country facility JSON store with merge logic"
```

---

### Task 6: Sync log

**Files:**
- Create: `scripts/lib/sync-log.js`
- Test: `scripts/lib/__tests__/sync-log.test.js`

**Interfaces:**
- Produces: `async function appendSyncLog(filePath, entry)` — reads the JSON array at `filePath` (or starts with `[]` if missing), pushes `entry`, writes it back.

- [ ] **Step 1: Write the failing tests**

```js
// scripts/lib/__tests__/sync-log.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appendSyncLog } from '../sync-log.js';

test('appendSyncLog creates a new log file with one entry', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sync-log-'));
  const filePath = path.join(dir, 'sync_log.json');
  try {
    await appendSyncLog(filePath, { timestamp: '2026-09-08T00:00:00Z', totalFetched: 10 });
    const log = JSON.parse(await readFile(filePath, 'utf-8'));
    assert.deepEqual(log, [{ timestamp: '2026-09-08T00:00:00Z', totalFetched: 10 }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('appendSyncLog appends to an existing log file', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sync-log-'));
  const filePath = path.join(dir, 'sync_log.json');
  try {
    await appendSyncLog(filePath, { timestamp: 't1' });
    await appendSyncLog(filePath, { timestamp: 't2' });
    const log = JSON.parse(await readFile(filePath, 'utf-8'));
    assert.deepEqual(log, [{ timestamp: 't1' }, { timestamp: 't2' }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../sync-log.js'`

- [ ] **Step 3: Write the implementation**

```js
// scripts/lib/sync-log.js
import { readFile, writeFile } from 'node:fs/promises';

export async function appendSyncLog(filePath, entry) {
  let log = [];
  try {
    const content = await readFile(filePath, 'utf-8');
    log = JSON.parse(content);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  log.push(entry);
  await writeFile(filePath, JSON.stringify(log, null, 2) + '\n', 'utf-8');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/sync-log.js scripts/lib/__tests__/sync-log.test.js
git commit -m "feat: add append-only sync log writer"
```

---

### Task 7: Main collection script (integration)

**Files:**
- Create: `scripts/collect-facilities.js`

**Interfaces:**
- Consumes: `querySparql` (Task 2), `buildQuery` (Task 3), `normalizeBinding` (Task 4), `loadFacilities`/`mergeFacilities`/`saveFacilities` (Task 5), `appendSyncLog` (Task 6).
- Produces: a CLI entry point invoked via `npm run collect`. Writes/updates `data/facilities/<COUNTRY>.json` and appends one entry to `data/sync_log.json`. Prints a one-line summary to stdout. No automated test — verified via manual dry run (Step 2 below).

- [ ] **Step 1: Write the implementation**

```js
// scripts/collect-facilities.js
import path from 'node:path';
import { querySparql } from './lib/sparql-client.js';
import { buildQuery } from './lib/build-query.js';
import { normalizeBinding } from './lib/normalize.js';
import { loadFacilities, mergeFacilities, saveFacilities } from './lib/facility-store.js';
import { appendSyncLog } from './lib/sync-log.js';

const DATA_DIR = path.join(process.cwd(), 'data', 'facilities');
const SYNC_LOG_PATH = path.join(process.cwd(), 'data', 'sync_log.json');
const PAGE_SIZE = 500;
const MAX_PAGES = Number(process.env.COLLECT_MAX_PAGES) || Infinity;

async function fetchAllBindings() {
  const all = [];
  let offset = 0;
  let page = 0;

  while (page < MAX_PAGES) {
    const query = buildQuery({ limit: PAGE_SIZE, offset });
    const bindings = await querySparql(query);
    all.push(...bindings);
    page++;
    if (bindings.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}

async function main() {
  const syncedAt = new Date().toISOString();
  const errors = [];
  let bindings = [];

  try {
    bindings = await fetchAllBindings();
  } catch (error) {
    errors.push(error.message);
  }

  const records = bindings
    .map((binding) => normalizeBinding(binding, syncedAt))
    .filter((record) => record !== null);

  const byCountry = new Map();
  for (const record of records) {
    const key = record.country || 'UNKNOWN';
    if (!byCountry.has(key)) byCountry.set(key, []);
    byCountry.get(key).push(record);
  }

  let newCount = 0;
  let updatedCount = 0;

  for (const [countryCode, countryRecords] of byCountry) {
    const existing = await loadFacilities(DATA_DIR, countryCode);
    const result = mergeFacilities(existing, countryRecords);
    await saveFacilities(DATA_DIR, countryCode, result.merged);
    newCount += result.newCount;
    updatedCount += result.updatedCount;
  }

  await appendSyncLog(SYNC_LOG_PATH, {
    timestamp: syncedAt,
    totalFetched: records.length,
    newCount,
    updatedCount,
    errorCount: errors.length,
    errors,
  });

  console.log(`Synced ${records.length} facilities (${newCount} new, ${updatedCount} updated, ${errors.length} errors).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Manual dry run with a capped page count**

Run: `COLLECT_MAX_PAGES=1 npm run collect`
Expected: the process prints a `Synced N facilities (...)` line where `0 < N <= 500`, and `data/facilities/` now contains one or more `<COUNTRY>.json` files with real Wikidata facility records (spot-check that `lat`/`lng` look plausible and `wikidata_url` resolves).

If the property IDs from Task 3 turn out to be wrong (e.g., `capacity` always null, or the query errors), fix `buildQuery` and its tests before continuing.

- [ ] **Step 3: Commit**

```bash
git add scripts/collect-facilities.js data/facilities/ data/sync_log.json
git commit -m "feat: wire up end-to-end facility collection script"
```

---

### Task 8: GitHub Actions automation

**Files:**
- Create: `.github/workflows/collect-facilities.yml`

**Interfaces:**
- Produces: a scheduled + manually-dispatchable GitHub Actions workflow that runs `npm run collect` and commits any resulting changes under `data/`.

- [ ] **Step 1: Write the workflow file**

```yaml
# .github/workflows/collect-facilities.yml
name: Collect Facility Data

on:
  schedule:
    - cron: '0 3 * * *'
  workflow_dispatch:

jobs:
  collect:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm run collect
      - name: Commit and push if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/
          git diff --staged --quiet || git commit -m "chore: update facility data"
          git push
```

- [ ] **Step 2: Commit the workflow**

```bash
git add .github/workflows/collect-facilities.yml
git commit -m "ci: schedule daily facility data collection"
```

- [ ] **Step 3: Create the GitHub repository and push (confirm with user first)**

This step publishes the repository to GitHub — confirm the target account/visibility with the user before running.

```bash
gh repo create stadium-atlas --public --source=. --remote=origin --push
```

- [ ] **Step 4: Trigger the workflow manually and verify it succeeds**

```bash
gh workflow run collect-facilities.yml
gh run watch
```

Expected: the run completes successfully, and `git pull` afterward shows a new `chore: update facility data` commit (or no commit, if the manual dry run in Task 7 already captured the same data — check `data/sync_log.json` for a new entry either way).

---

## Self-Review Notes

- **Spec coverage:** Architecture/data flow (Tasks 1, 7, 8), JSON data model (Tasks 1, 4, 5), collection logic incl. pagination and language priority (Tasks 3, 4, 7), execution model incl. manual initial load + scheduled updates (Task 8), error handling/retry (Task 2, 7), sync log (Task 6), test coverage for the parsing/merge logic (Tasks 2–6). Out-of-scope items from the spec (globe UI, Wikipedia body text, OSM, search/filter, per-field source display) are intentionally not covered here.
- **Placeholder scan:** No TBD/TODO markers; every step has runnable code or an exact command.
- **Type consistency:** `normalizeBinding` (Task 4) output fields match exactly what `mergeFacilities`/`saveFacilities` (Task 5) and `collect-facilities.js` (Task 7) consume (`id`, `country`, etc.). `buildQuery`'s variable names (`nameEn`, `nameJa`, `coord`, `capacity`, `inception`, `countryCode`, `wikipediaUrl`, `image`) match exactly what `normalizeBinding` reads.
