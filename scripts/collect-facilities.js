// scripts/collect-facilities.js
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { querySparql } from './lib/sparql-client.js';
import { buildScanQuery } from './lib/build-query.js';
import { fetchEntities } from './lib/wikidata-entities.js';
import { normalizeEntity, resolveClaimIds } from './lib/normalize.js';
import { createRelatedEntityCache, resolveRelatedEntities } from './lib/related-entities.js';
import { loadFacilities, mergeFacilities, saveFacilities } from './lib/facility-store.js';
import { appendSyncLog } from './lib/sync-log.js';
import { commitAndPush } from './lib/git-commit.js';
import { listCountries } from './lib/list-countries.js';
import { loadProgress, saveProgress } from './lib/progress.js';

const DATA_DIR = path.join(process.cwd(), 'data', 'facilities');
const SYNC_LOG_PATH = path.join(process.cwd(), 'data', 'sync_log.json');
const PROGRESS_PATH = path.join(process.cwd(), 'data', 'progress.json');
const RES_NAMES_PATH = path.join(process.cwd(), 'data', 'res-names.json');
const PAGE_SIZE = 500;
const MAX_PAGES_PER_COUNTRY = Number(process.env.COLLECT_MAX_PAGES_PER_COUNTRY) || 400;
const MAX_COUNTRIES = Number(process.env.COLLECT_MAX_COUNTRIES) || Infinity;
const PAGE_DELAY_MS = 200;
const COMMIT_EVERY_PAGES = Number(process.env.COLLECT_COMMIT_EVERY_PAGES) || 10;
// Cooldown after a country's scan/enrich/related query fails (typically a
// Wikidata rate-limit or timeout). Without this, an errored country falls
// through to the next one with zero delay, and immediately issuing another
// SPARQL request while WDQS is already rate-limiting/timing out just
// compounds the problem — observed live as three consecutive countries
// (FR/US/DE) each failing outright (429/504) with no recovery between them.
const COUNTRY_ERROR_COOLDOWN_MS = Number(process.env.COLLECT_COUNTRY_ERROR_COOLDOWN_MS) || 10000;

// Loads the RES (French sports-facility registry) numero -> nom lookup
// generated manually by scripts/fetch-res-names.js, as a Map. This script
// runs nightly for all 218 countries -- including France before that file
// has ever been generated -- so a missing file falls back to an empty
// lookup rather than failing the whole run.
async function loadResNameIndex() {
  try {
    const content = await readFile(RES_NAMES_PATH, 'utf-8');
    const json = JSON.parse(content);
    return new Map(Object.entries(json));
  } catch (error) {
    if (error.code === 'ENOENT') return new Map();
    throw error;
  }
}

async function flushCountry(countryCode, records, pendingDeletions, syncedAt, errors, page, progress) {
  const existing = await loadFacilities(DATA_DIR, countryCode);
  const result = mergeFacilities(existing, records, pendingDeletions);
  await saveFacilities(DATA_DIR, countryCode, result.merged);

  await appendSyncLog(SYNC_LOG_PATH, {
    timestamp: syncedAt,
    countryCode,
    pagesFetched: page,
    totalFetched: records.length,
    newCount: result.newCount,
    updatedCount: result.updatedCount,
    deletedCount: result.deletedCount,
    errorCount: errors.length,
    errors,
  });

  await saveProgress(PROGRESS_PATH, progress);

  const { committed } = commitAndPush(`chore: update facility data (${countryCode}, through page ${page})`);

  console.log(
    `[${countryCode}] through page ${page}: ${records.length} facilities (${result.newCount} new, ${result.updatedCount} updated, ${result.deletedCount} deleted). Committed: ${committed}. Progress: country ${progress.countryIndex}, offset ${progress.offset}.`
  );

  return { newCount: result.newCount, updatedCount: result.updatedCount, deletedCount: result.deletedCount };
}

async function collectCountry(countryQid, countryCode, countryIndex, totalCountries, startOffset, syncedAt, allErrors, relatedEntityCache, resNameIndex) {
  let offset = startOffset;
  let page = 0;
  let pending = [];
  let pendingDeletions = [];
  const countryErrors = [];
  let totalNew = 0;
  let totalUpdated = 0;
  let totalDeleted = 0;

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

      const relatedQids = [];
      for (const qid of qids) {
        const entity = entities[qid];
        relatedQids.push(...resolveClaimIds(entity, 'P466'), ...resolveClaimIds(entity, 'P793'), ...resolveClaimIds(entity, 'P641'));
      }
      let relatedEntities;
      try {
        relatedEntities = await resolveRelatedEntities(relatedQids, relatedEntityCache);
      } catch (error) {
        countryErrors.push(error.message);
        allErrors.push(`[${countryCode}] related: ${error.message}`);
        break;
      }

      // Second hop: resolve each team's current league(s) (P118), now that
      // resolveRelatedEntities has populated each team's leagueQids above.
      // Leagues are supplementary (search enrichment only), so a failure
      // here is logged but does not abort the page -- venues simply end up
      // with an empty `leagues` array for this pass.
      const teamQids = [];
      for (const qid of qids) {
        teamQids.push(...resolveClaimIds(entities[qid], 'P466'));
      }
      const leagueQids = teamQids.flatMap((teamQid) => relatedEntities.get(teamQid)?.leagueQids ?? []);
      if (leagueQids.length > 0) {
        try {
          const leagueEntities = await resolveRelatedEntities(leagueQids, relatedEntityCache);
          for (const [leagueQid, info] of leagueEntities) relatedEntities.set(leagueQid, info);
        } catch (error) {
          allErrors.push(`[${countryCode}] leagues: ${error.message}`);
        }
      }

      const normalized = coordBindings.map((binding) => {
        const qid = binding.item.value.split('/').pop();
        return { qid, record: normalizeEntity(binding, entities[qid], countryCode, syncedAt, relatedEntities, resNameIndex) };
      });

      pending.push(...normalized.filter(({ record }) => record !== null).map(({ record }) => record));
      pendingDeletions.push(...normalized.filter(({ record }) => record === null).map(({ qid }) => qid));
    }

    page++;
    offset += PAGE_SIZE;

    const isLastPage = coordBindings.length < PAGE_SIZE;

    if (page % COMMIT_EVERY_PAGES === 0 || isLastPage) {
      const progress = isLastPage
        ? { countryIndex: (countryIndex + 1) % totalCountries, offset: 0 }
        : { countryIndex, offset };
      const { newCount, updatedCount, deletedCount } = await flushCountry(countryCode, pending, pendingDeletions, syncedAt, countryErrors, page, progress);
      totalNew += newCount;
      totalUpdated += updatedCount;
      totalDeleted += deletedCount;
      pending = [];
      pendingDeletions = [];
    }

    if (isLastPage) break;
    await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
  }

  if (pending.length > 0 || pendingDeletions.length > 0 || countryErrors.length > 0) {
    const progress = { countryIndex, offset };
    const { newCount, updatedCount, deletedCount } = await flushCountry(countryCode, pending, pendingDeletions, syncedAt, countryErrors, page, progress);
    totalNew += newCount;
    totalUpdated += updatedCount;
    totalDeleted += deletedCount;
  }

  return { newCount: totalNew, updatedCount: totalUpdated, deletedCount: totalDeleted, errorCount: countryErrors.length };
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

  const relatedEntityCache = createRelatedEntityCache();
  const resNameIndex = await loadResNameIndex();
  console.log(`Loaded ${resNameIndex.size} RES names from data/res-names.json.`);

  let grandNew = 0;
  let grandUpdated = 0;
  let grandDeleted = 0;

  for (let i = 0; i < countriesToProcess; i++) {
    const idx = (startIndex + i) % countries.length;
    const { countryQid, countryCode } = countries[idx];
    const startOffset = i === 0 ? progress.offset : 0;

    const { newCount, updatedCount, deletedCount, errorCount } = await collectCountry(
      countryQid,
      countryCode,
      idx,
      countries.length,
      startOffset,
      syncedAt,
      errors,
      relatedEntityCache,
      resNameIndex
    );
    grandNew += newCount;
    grandUpdated += updatedCount;
    grandDeleted += deletedCount;
    if (errorCount > 0) {
      console.log(`[${countryCode}] stopped early after an error; cooling down ${COUNTRY_ERROR_COOLDOWN_MS}ms before the next country.`);
      await new Promise((resolve) => setTimeout(resolve, COUNTRY_ERROR_COOLDOWN_MS));
    }
  }

  console.log(
    `Synced ${countriesToProcess} countries starting at index ${startIndex}: ${grandNew} new, ${grandUpdated} updated, ${grandDeleted} deleted, ${errors.length} errors.`
  );

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
