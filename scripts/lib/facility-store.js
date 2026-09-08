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
