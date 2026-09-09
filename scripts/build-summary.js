import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { buildSummary, buildWebFacilities } from './lib/summary-builder.js';

const FACILITIES_DIR = path.join(process.cwd(), 'data', 'facilities');
const SUMMARY_PATH = path.join(process.cwd(), 'data', 'summary.json');
const CENTROIDS_PATH = path.join(process.cwd(), 'data', 'country-centroids.json');
const WEB_FACILITIES_DIR = path.join(process.cwd(), 'data', 'facilities-web');

async function main() {
  const { summary, centroids } = await buildSummary(FACILITIES_DIR);
  await writeFile(SUMMARY_PATH, JSON.stringify(summary, null, 2) + '\n', 'utf-8');
  await writeFile(CENTROIDS_PATH, JSON.stringify(centroids, null, 2) + '\n', 'utf-8');
  console.log(`Wrote ${summary.length} summary records and ${Object.keys(centroids).length} country centroids.`);

  const { filesWritten, cappedFiles } = await buildWebFacilities(FACILITIES_DIR, WEB_FACILITIES_DIR);
  console.log(`Wrote ${filesWritten} web-facilities files (${cappedFiles.length} capped: ${cappedFiles.join(', ')}).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
