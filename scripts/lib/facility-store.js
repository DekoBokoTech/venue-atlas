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

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => deepEqual(a[key], b[key]));
}

function unchangedExceptTimestamp(existingRecord, incomingRecord) {
  const { last_synced_at: _existingTs, ...existingRest } = existingRecord;
  const { last_synced_at: _incomingTs, ...incomingRest } = incomingRecord;
  return deepEqual(existingRest, incomingRest);
}

// `excludedIds` lets a country-run reconcile QIDs that were scanned this pass but
// rejected by the site's own normalization rules (e.g. no discoverable name, or
// classed as never actually built) — those records are removed from `existing`
// unless the same id also shows up in `incoming` (a record excluded on an earlier
// pass but valid again this pass, e.g. a name was added upstream, always wins over
// deletion). This only reconciles exclusions decided within a single country's
// scan of QIDs it actually saw this pass.
//
// Note: facilities are still never removed from a country's file if their country
// changes, or if they're deleted upstream in Wikidata (i.e. simply absent from this
// pass's scan results entirely) — reconciliation across country files, and for
// disappearance-from-Wikidata, is deferred to a later phase.
export function mergeFacilities(existing, incoming, excludedIds = []) {
  const incomingIds = new Set(incoming.map((record) => record.id));
  const excludedIdSet = new Set(excludedIds);

  const map = new Map(existing.map((record) => [record.id, record]));
  let newCount = 0;
  let updatedCount = 0;
  let deletedCount = 0;

  for (const id of excludedIdSet) {
    if (map.has(id) && !incomingIds.has(id)) {
      map.delete(id);
      deletedCount++;
    }
  }

  for (const record of incoming) {
    const existingRecord = map.get(record.id);
    if (existingRecord) {
      if (unchangedExceptTimestamp(existingRecord, record)) {
        map.set(record.id, { ...record, last_synced_at: existingRecord.last_synced_at });
      } else {
        updatedCount++;
        map.set(record.id, record);
      }
    } else {
      newCount++;
      map.set(record.id, record);
    }
  }

  const merged = Array.from(map.values()).sort((a, b) => a.id.localeCompare(b.id));
  return { merged, newCount, updatedCount, deletedCount };
}

export async function saveFacilities(dir, countryCode, records) {
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${countryCode}.json`);
  await writeFile(filePath, JSON.stringify(records, null, 2) + '\n', 'utf-8');
}
