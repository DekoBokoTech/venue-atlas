// scripts/collect-facilities.js
import path from 'node:path';
import { querySparql } from './lib/sparql-client.js';
import { buildScanQuery } from './lib/build-query.js';
import { fetchEntities } from './lib/wikidata-entities.js';
import { normalizeEntity } from './lib/normalize.js';
import { loadFacilities, mergeFacilities, saveFacilities } from './lib/facility-store.js';
import { appendSyncLog } from './lib/sync-log.js';
import { commitAndPush } from './lib/git-commit.js';
import { listCountries } from './lib/list-countries.js';
import { loadProgress, saveProgress } from './lib/progress.js';

const DATA_DIR = path.join(process.cwd(), 'data', 'facilities');
const SYNC_LOG_PATH = path.join(process.cwd(), 'data', 'sync_log.json');
const PROGRESS_PATH = path.join(process.cwd(), 'data', 'progress.json');
const PAGE_SIZE = 500;
const MAX_PAGES_PER_COUNTRY = Number(process.env.COLLECT_MAX_PAGES_PER_COUNTRY) || 400;
const MAX_COUNTRIES = Number(process.env.COLLECT_MAX_COUNTRIES) || Infinity;
const PAGE_DELAY_MS = 200;
const COMMIT_EVERY_PAGES = Number(process.env.COLLECT_COMMIT_EVERY_PAGES) || 10;

async function flushCountry(countryCode, records, syncedAt, errors, page, progress) {
  const existing = await loadFacilities(DATA_DIR, countryCode);
  const result = mergeFacilities(existing, records);
  await saveFacilities(DATA_DIR, countryCode, result.merged);

  await appendSyncLog(SYNC_LOG_PATH, {
    timestamp: syncedAt,
    countryCode,
    pagesFetched: page,
    totalFetched: records.length,
    newCount: result.newCount,
    updatedCount: result.updatedCount,
    errorCount: errors.length,
    errors,
  });

  await saveProgress(PROGRESS_PATH, progress);

  const { committed } = commitAndPush(`chore: update facility data (${countryCode}, through page ${page})`);

  console.log(
    `[${countryCode}] through page ${page}: ${records.length} facilities (${result.newCount} new, ${result.updatedCount} updated). Committed: ${committed}. Progress: country ${progress.countryIndex}, offset ${progress.offset}.`
  );

  return { newCount: result.newCount, updatedCount: result.updatedCount };
}

async function collectCountry(countryQid, countryCode, countryIndex, totalCountries, startOffset, syncedAt, allErrors) {
  let offset = startOffset;
  let page = 0;
  let pending = [];
  const countryErrors = [];
  let totalNew = 0;
  let totalUpdated = 0;

  while (page < MAX_PAGES_PER_COUNTRY) {
    let coordBindings;
    try {
      const query = buildScanQuery({ limit: PAGE_SIZE, offset, countryQid });
      coordBindings = await querySparql(query);
    } catch (error) {
      countryErrors.push(error.message);
      allErrors.push(`[${countryCode}] scan: ${error.message}`);
      break;
    }

    if (coordBindings.length > 0) {
      const qids = coordBindings.map((binding) => binding.item.value.split('/').pop());

      let entities;
      try {
        entities = await fetchEntities(qids);
      } catch (error) {
        countryErrors.push(error.message);
        allErrors.push(`[${countryCode}] enrich: ${error.message}`);
        break;
      }

      const records = coordBindings
        .map((binding) => {
          const qid = binding.item.value.split('/').pop();
          return normalizeEntity(binding, entities[qid], countryCode, syncedAt);
        })
        .filter((record) => record !== null);

      pending.push(...records);
    }

    page++;
    offset += PAGE_SIZE;

    const isLastPage = coordBindings.length < PAGE_SIZE;

    if (page % COMMIT_EVERY_PAGES === 0 || isLastPage) {
      const progress = isLastPage
        ? { countryIndex: (countryIndex + 1) % totalCountries, offset: 0 }
        : { countryIndex, offset };
      const { newCount, updatedCount } = await flushCountry(countryCode, pending, syncedAt, countryErrors, page, progress);
      totalNew += newCount;
      totalUpdated += updatedCount;
      pending = [];
    }

    if (isLastPage) break;
    await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
  }

  if (pending.length > 0 || countryErrors.length > 0) {
    const progress = { countryIndex, offset };
    const { newCount, updatedCount } = await flushCountry(countryCode, pending, syncedAt, countryErrors, page, progress);
    totalNew += newCount;
    totalUpdated += updatedCount;
  }

  return { newCount: totalNew, updatedCount: totalUpdated, errorCount: countryErrors.length };
}

async function main() {
  const syncedAt = new Date().toISOString();
  const errors = [];

  let countries;
  try {
    countries = await listCountries();
  } catch (error) {
    console.error('Failed to list countries:', error.message);
    process.exitCode = 1;
    return;
  }

  if (countries.length === 0) {
    console.log('No countries returned by listCountries(); nothing to do.');
    return;
  }

  const progress = await loadProgress(PROGRESS_PATH);
  const startIndex = progress.countryIndex % countries.length;
  const countriesToProcess = Number.isFinite(MAX_COUNTRIES) ? Math.min(MAX_COUNTRIES, countries.length) : countries.length;

  console.log(`Resuming from country index ${startIndex} (${countries[startIndex].countryCode}), offset ${progress.offset}.`);

  let grandNew = 0;
  let grandUpdated = 0;

  for (let i = 0; i < countriesToProcess; i++) {
    const idx = (startIndex + i) % countries.length;
    const { countryQid, countryCode } = countries[idx];
    const startOffset = i === 0 ? progress.offset : 0;

    const { newCount, updatedCount, errorCount } = await collectCountry(
      countryQid,
      countryCode,
      idx,
      countries.length,
      startOffset,
      syncedAt,
      errors
    );
    grandNew += newCount;
    grandUpdated += updatedCount;
    if (errorCount > 0) {
      console.log(`[${countryCode}] stopped early after an error; moving on to the next country.`);
    }
  }

  console.log(
    `Synced ${countriesToProcess} countries starting at index ${startIndex}: ${grandNew} new, ${grandUpdated} updated, ${errors.length} errors.`
  );

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
