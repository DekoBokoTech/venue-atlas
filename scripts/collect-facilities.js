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
const MAX_PAGES = Number(process.env.COLLECT_MAX_PAGES) || 200;
const PAGE_DELAY_MS = 200;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

async function fetchAllBindings() {
  const all = [];
  const errors = [];
  let offset = 0;
  let page = 0;

  while (page < MAX_PAGES) {
    let bindings;
    try {
      const query = buildQuery({ limit: PAGE_SIZE, offset });
      bindings = await querySparql(query);
    } catch (error) {
      errors.push(error.message);
      break;
    }

    all.push(...bindings);
    page++;
    if (bindings.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
  }

  return { bindings: all, errors };
}

async function main() {
  const syncedAt = new Date().toISOString();
  const { bindings, errors } = await fetchAllBindings();

  const records = bindings
    .map((binding) => normalizeBinding(binding, syncedAt))
    .filter((record) => record !== null);

  const byCountry = new Map();
  for (const record of records) {
    // record.country comes from a Wikidata P297 claim, which is user-editable
    // upstream data. It is used below as a file path component, so validate it
    // looks like a well-formed 2-letter ISO code before trusting it; anything
    // else (including absent values) falls back to the UNKNOWN bucket.
    const key = record.country && COUNTRY_CODE_PATTERN.test(record.country) ? record.country : 'UNKNOWN';
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

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
