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
