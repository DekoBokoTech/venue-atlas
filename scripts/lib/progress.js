import { readFile, writeFile } from 'node:fs/promises';

const DEFAULT_PROGRESS = { countryIndex: 0, offset: 0 };

export async function loadProgress(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') return { ...DEFAULT_PROGRESS };
    throw error;
  }
}

export async function saveProgress(filePath, progress) {
  await writeFile(filePath, JSON.stringify(progress, null, 2) + '\n', 'utf-8');
}
