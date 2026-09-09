import { fetchEntities } from './wikidata-entities.js';

export function createRelatedEntityCache() {
  return { map: new Map() };
}

function shapeEntity(entity) {
  if (!entity) return { label: null, website: null, year: null };
  const label = entity.labels?.ja?.value ?? entity.labels?.en?.value ?? null;
  const website = entity.claims?.P856?.[0]?.mainsnak?.datavalue?.value ?? null;
  const time = entity.claims?.P585?.[0]?.mainsnak?.datavalue?.value?.time;
  const yearMatch = time ? /^[+-]?(\d+)-/.exec(time) : null;
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
  return { label, website, year };
}

export async function resolveRelatedEntities(qids, cache, options = {}) {
  const uniqueQids = Array.from(new Set(qids));
  const missing = uniqueQids.filter((qid) => !cache.map.has(qid));

  if (missing.length > 0) {
    const entities = await fetchEntities(missing, options);
    for (const qid of missing) {
      cache.map.set(qid, shapeEntity(entities[qid]));
    }
  }

  const result = new Map();
  for (const qid of uniqueQids) {
    result.set(qid, cache.map.get(qid));
  }
  return result;
}
