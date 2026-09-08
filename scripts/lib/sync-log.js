import { readFile, writeFile } from 'node:fs/promises';

export async function appendSyncLog(filePath, entry) {
  let log = [];
  try {
    const content = await readFile(filePath, 'utf-8');
    log = JSON.parse(content);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  log.push(entry);
  await writeFile(filePath, JSON.stringify(log, null, 2) + '\n', 'utf-8');
}
