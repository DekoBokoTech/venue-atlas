import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { buildSummary } from './lib/summary-builder.js';

const FACILITIES_DIR = path.join(process.cwd(), 'data', 'facilities');
const SUMMARY_PATH = path.join(process.cwd(), 'data', 'summary.json');
const CENTROIDS_PATH = path.join(process.cwd(), 'data', 'country-centroids.json');

async function main() {
  const { summary, centroids } = await buildSummary(FACILITIES_DIR);
  await writeFile(SUMMARY_PATH, JSON.stringify(summary, null, 2) + '\n', 'utf-8');
  await writeFile(CENTROIDS_PATH, JSON.stringify(centroids, null, 2) + '\n', 'utf-8');
  console.log(`Wrote ${summary.length} summary records and ${Object.keys(centroids).length} country centroids.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
