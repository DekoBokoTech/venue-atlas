// scripts/fetch-res-names.js
//
// One-off/manual script (NOT part of the nightly collection workflow run by
// scripts/collect-facilities.js): fetches France's RES (Recensement des
// équipements sportifs) `data-es-installation` dataset from the
// Opendatasoft Explore API v2.1 and writes a lightweight lookup file,
// data/res-names.json, shaped as { "<numero>": "<nom>", ... }.
//
// Run manually/infrequently:
//   node scripts/fetch-res-names.js
//
// This never writes RES's raw bulk data to disk -- records are requested
// with `select=numero,nom` (only the two fields this lookup needs) and held
// in memory only until the final lookup file is written.
//
// See scripts/lib/res-names.js for the fetch/pagination logic and its
// header comment for why the walk is chunked by department.

import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fetchAllResNames } from './lib/res-names.js';

const OUTPUT_PATH = path.join(process.cwd(), 'data', 'res-names.json');

async function main() {
  const startedAt = Date.now();

  const index = await fetchAllResNames({
    onDepartmentDone: (depCode, count) => {
      const label = depCode === null ? '(no dept)' : depCode;
      console.log(`[dep ${label}] fetched ${count} records`);
    },
  });

  const entryCount = Object.keys(index).length;
  await writeFile(OUTPUT_PATH, JSON.stringify(index, null, 2) + '\n', 'utf-8');

  const elapsedS = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Wrote ${entryCount} entries to data/res-names.json in ${elapsedS}s.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
