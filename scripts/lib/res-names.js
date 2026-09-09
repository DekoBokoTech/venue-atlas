// scripts/lib/res-names.js
//
// Fetches France's RES (Recensement des équipements sportifs) installation
// dataset from the Opendatasoft Explore API v2.1 and builds a
// numero -> nom lookup, used by normalizeEntity() to backfill a facility
// name for French Wikidata items that carry a P11840 (RES ID) value but
// have neither an English nor a Japanese Wikidata label.
//
// Table-mapping note (see project research on P11840): P11840 values are
// shaped like `data-es-installation.numero` (e.g. "I930660048") and never
// match `data-es-equipement.numero` (a longer, differently-shaped ID:
// "E<code><installation_numero>"). This module only ever queries
// data-es-installation.
//
// Pagination note: the /records endpoint caps `limit` at 100 and rejects
// any request where offset + limit > 10000 (confirmed against the live API)
// -- so a single filterless paged walk tops out at 10000 of the dataset's
// ~152000 records, well short of the full table. This module chunks the
// walk by `dep_code` (France's ~100 departments/territories; the largest,
// Nord, holds ~3600 records) so every per-department query window stays
// comfortably under the 10000 cap, and pages each department with
// limit=100 + offset, which is how the API actually supports full coverage.

const BASE_URL = 'https://equipements.sports.gouv.fr/api/explore/v2.1/catalog/datasets/data-es-installation/records';
const PAGE_SIZE = 100;

// Confirmed working (200, no redirect) against the live site: the
// Opendatasoft "table" explore view filtered to a single record's numero.
const RES_TABLE_URL = 'https://equipements.sports.gouv.fr/explore/dataset/data-es-installation/table/?q=';

export function resUrlForNumero(numero) {
  return `${RES_TABLE_URL}${encodeURIComponent(numero)}`;
}

async function requestWithRetry(url, options) {
  const { fetchImpl, maxRetries, retryDelayMs } = options;
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'stadium-atlas-bot/1.0',
        },
      });

      if (response.status === 429 || response.status >= 500) {
        throw new Error(`Retryable HTTP status: ${response.status}`);
      }
      if (!response.ok) {
        throw new Error(`RES request failed with status ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * Math.pow(2, attempt)));
      }
    }
  }

  throw new Error(`RES request failed after ${maxRetries + 1} attempts: ${lastError.message}`);
}

// Returns the distinct dep_code values present in the dataset (including
// `null`, for the small bucket of records with no department assigned) via
// a single group_by aggregation call.
export async function fetchDepartmentCodes(options = {}) {
  const { fetchImpl = fetch, maxRetries = 3, retryDelayMs = 1000 } = options;
  const url = `${BASE_URL}?limit=100&group_by=dep_code&select=dep_code,count(*)+as+n&order_by=dep_code`;
  const json = await requestWithRetry(url, { fetchImpl, maxRetries, retryDelayMs });
  return (json.results || []).map((r) => r.dep_code);
}

function whereClauseForDept(depCode) {
  return depCode === null || depCode === undefined ? 'dep_code is null' : `dep_code="${depCode}"`;
}

// Pages through every record for one department (limit=100 + offset,
// stopping when a page comes back short), returning the flat list of
// {numero, nom} records.
export async function fetchDepartmentRecords(depCode, options = {}) {
  const { fetchImpl = fetch, maxRetries = 3, retryDelayMs = 1000, pageDelayMs = 150 } = options;
  const where = encodeURIComponent(whereClauseForDept(depCode));
  const records = [];
  let offset = 0;

  for (;;) {
    const url = `${BASE_URL}?limit=${PAGE_SIZE}&offset=${offset}&select=numero,nom&where=${where}`;
    const json = await requestWithRetry(url, { fetchImpl, maxRetries, retryDelayMs });
    const results = json.results || [];
    records.push(...results);

    if (results.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    if (pageDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, pageDelayMs));
  }

  return records;
}

// Pure and unit-testable: builds a numero -> nom lookup object from a flat
// list of RES records, skipping any record missing either field.
export function buildNameIndex(records) {
  const index = {};
  for (const record of records) {
    if (record && record.numero && record.nom) {
      index[record.numero] = record.nom;
    }
  }
  return index;
}

// Orchestrates the full fetch: department list, then paged records per
// department, then the numero -> nom index. `onDepartmentDone(depCode,
// count)` is called after each department finishes, for progress logging.
export async function fetchAllResNames(options = {}) {
  const { onDepartmentDone, ...fetchOptions } = options;
  const depCodes = await fetchDepartmentCodes(fetchOptions);
  const allRecords = [];

  for (const depCode of depCodes) {
    const records = await fetchDepartmentRecords(depCode, fetchOptions);
    allRecords.push(...records);
    if (onDepartmentDone) onDepartmentDone(depCode, records.length);
  }

  return buildNameIndex(allRecords);
}
