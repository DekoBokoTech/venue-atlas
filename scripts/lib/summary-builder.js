import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const SUMMARY_SIZE = 700;

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
    .filter((r) => r.capacity != null)
    .sort((a, b) => b.capacity - a.capacity)
    .slice(0, SUMMARY_SIZE)
    .map((r) => ({
      id: r.id,
      name: r.name,
      name_ja: r.name_ja,
      lat: r.lat,
      lng: r.lng,
      country: r.country,
      capacity: r.capacity,
    }));

  return { summary, centroids };
}
