import { fetchEntities } from './wikidata-entities.js';

export function createRelatedEntityCache() {
  return { map: new Map() };
}

// P118 ("league") is often multi-valued on a team over its history (e.g. a
// relegated/promoted club carries both its former and current league). We
// only want the team's CURRENT league(s): drop deprecated-rank claims and
// claims qualified with an end time (P582), and when any preferred-rank
// claim exists, prefer those over normal-rank ones.
function resolveLeagueQids(entity) {
  const claims = entity?.claims?.P118 ?? [];
  const current = claims.filter((claim) => claim.rank !== 'deprecated' && !claim.qualifiers?.P582);
  const preferred = current.filter((claim) => claim.rank === 'preferred');
  const pool = preferred.length > 0 ? preferred : current;
  return pool.map((claim) => claim.mainsnak?.datavalue?.value?.id).filter(Boolean);
}

function shapeEntity(entity) {
  if (!entity) return { label: null, labelEn: null, labelJa: null, website: null, year: null, leagueQids: [] };
  const labelEn = entity.labels?.en?.value ?? null;
  const labelJa = entity.labels?.ja?.value ?? null;
  const label = labelJa ?? labelEn ?? null;
  const website = entity.claims?.P856?.[0]?.mainsnak?.datavalue?.value ?? null;
  const time = entity.claims?.P585?.[0]?.mainsnak?.datavalue?.value?.time;
  const yearMatch = time ? /^[+-]?(\d+)-/.exec(time) : null;
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
  const leagueQids = resolveLeagueQids(entity);
  return { label, labelEn, labelJa, website, year, leagueQids };
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
