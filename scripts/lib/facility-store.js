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

// Note: facilities are never removed from a country's file if their country changes
// or they're deleted upstream in Wikidata; reconciliation across country files is
// deferred to a later phase.
export function mergeFacilities(existing, incoming) {
  const map = new Map(existing.map((record) => [record.id, record]));
  let newCount = 0;
  let updatedCount = 0;

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
  return { merged, newCount, updatedCount };
}

export async function saveFacilities(dir, countryCode, records) {
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${countryCode}.json`);
  await writeFile(filePath, JSON.stringify(records, null, 2) + '\n', 'utf-8');
}
