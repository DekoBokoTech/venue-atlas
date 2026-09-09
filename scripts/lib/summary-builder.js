import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Cap on the initial-load summary set (venues with a professional/notable team
// occupant, per Wikidata P466), taking the highest-capacity ones first. Kept
// deliberately small (matching the site's original top-700 density) so the
// first view reads as "notable pro venues," not "every venue with any team
// record" — the team-having pool is already ~1,859 and growing, so without a
// tight cap here the initial view looks just as dense/uncurated as before.
const SUMMARY_CAP = 700;
export const PER_COUNTRY_CAP = 3000;

export async function buildSummary(facilitiesDir) {
  const files = (await readdir(facilitiesDir)).filter((f) => f.endsWith('.json'));
  const allRecords = [];
  const centroids = {};

  for (const file of files) {
    const countryCode = path.basename(file, '.json');
    const content = await readFile(path.join(facilitiesDir, file), 'utf-8');
    const records = JSON.parse(content);

    // Avoid spread operator with large arrays to prevent stack overflow
    for (const record of records) {
      allRecords.push(record);
    }

    if (records.length > 0) {
      const sumLat = records.reduce((sum, r) => sum + r.lat, 0);
      const sumLng = records.reduce((sum, r) => sum + r.lng, 0);
      centroids[countryCode] = {
        lat: sumLat / records.length,
        lng: sumLng / records.length,
      };
    }
  }

  const summary = allRecords
    .filter((r) => Array.isArray(r.teams) && r.teams.length > 0)
    .sort(byCapacityDescNullsLast)
    .slice(0, SUMMARY_CAP)
    .map((r) => ({
      id: r.id,
      name: r.name,
      name_ja: r.name_ja,
      lat: r.lat,
      lng: r.lng,
      country: r.country,
      capacity: r.capacity,
      is_existing: r.is_existing,
      sport_types: r.sport_types,
    }));

  return { summary, centroids };
}

export async function buildSearchIndex(facilitiesDir) {
  const files = (await readdir(facilitiesDir)).filter((f) => f.endsWith('.json'));
  const index = [];

  for (const file of files) {
    const content = await readFile(path.join(facilitiesDir, file), 'utf-8');
    const records = JSON.parse(content);

    for (const record of records) {
      index.push({
        id: record.id,
        name: record.name,
        name_ja: record.name_ja,
        lat: record.lat,
        lng: record.lng,
        country: record.country,
        capacity: record.capacity,
      });
    }
  }

  return index;
}

function byCapacityDescNullsLast(a, b) {
  const aNull = a.capacity == null;
  const bNull = b.capacity == null;
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  return b.capacity - a.capacity;
}

export async function buildWebFacilities(facilitiesDir, outDir) {
  const files = (await readdir(facilitiesDir)).filter((f) => f.endsWith('.json'));
  await mkdir(outDir, { recursive: true });

  let filesWritten = 0;
  const cappedFiles = [];

  for (const file of files) {
    const countryCode = path.basename(file, '.json');
    const content = await readFile(path.join(facilitiesDir, file), 'utf-8');
    const records = JSON.parse(content);

    if (records.length <= PER_COUNTRY_CAP) {
      await writeFile(path.join(outDir, file), content, 'utf-8');
    } else {
      const truncated = records.slice().sort(byCapacityDescNullsLast).slice(0, PER_COUNTRY_CAP);
      await writeFile(path.join(outDir, file), JSON.stringify(truncated, null, 2) + '\n', 'utf-8');
      cappedFiles.push(countryCode);
    }
    filesWritten++;
  }

  return { filesWritten, cappedFiles };
}
