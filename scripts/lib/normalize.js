function parsePoint(wktPoint) {
  const match = /Point\(([-0-9.]+) ([-0-9.]+)\)/.exec(wktPoint);
  if (!match) return null;
  return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
}

function extractYear(timeValue) {
  const match = /^[+-]?(\d+)-/.exec(timeValue);
  return match ? parseInt(match[1], 10) : null;
}

function wikipediaUrlFromSitelink(sitelinks, site, lang) {
  const link = sitelinks?.[site];
  if (!link) return null;
  const title = link.title.replace(/ /g, '_');
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`;
}

const TEAM_CAP = 4;
const EVENT_CAP = 5;
const NON_SPORTING_EVENT_PATTERN = /テロ|事件|着工|竣工|施工|attack|bombing|groundbreaking|demolition/i;

export function resolveClaimIds(entity, property) {
  return (entity?.claims?.[property] ?? [])
    .map((claim) => claim.mainsnak?.datavalue?.value?.id)
    .filter(Boolean);
}

export function normalizeEntity(coordBinding, entity, countryCode, syncedAt, relatedEntities = new Map()) {
  if (!coordBinding.coord) return null;
  const coord = parsePoint(coordBinding.coord.value);
  if (!coord) return null;

  const qid = coordBinding.item.value.split('/').pop();

  const nameEn = entity?.labels?.en?.value;
  const nameJa = entity?.labels?.ja?.value;
  const capacityAmount = entity?.claims?.P1083?.[0]?.mainsnak?.datavalue?.value?.amount;
  const inceptionTime = entity?.claims?.P571?.[0]?.mainsnak?.datavalue?.value?.time;
  const imageValue = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  const websiteValue = entity?.claims?.P856?.[0]?.mainsnak?.datavalue?.value;

  const wikipediaUrlJa = wikipediaUrlFromSitelink(entity?.sitelinks, 'jawiki', 'ja');
  const wikipediaUrlEn = wikipediaUrlFromSitelink(entity?.sitelinks, 'enwiki', 'en');
  const wikipediaUrl = wikipediaUrlJa || wikipediaUrlEn;

  const teams = resolveClaimIds(entity, 'P466')
    .map((teamQid) => relatedEntities.get(teamQid))
    .filter((info) => info && info.label)
    .slice(0, TEAM_CAP)
    .map((info) => ({ name: info.label, url: info.website }));

  const events = resolveClaimIds(entity, 'P793')
    .map((eventQid) => relatedEntities.get(eventQid))
    .filter((info) => info && info.label && !NON_SPORTING_EVENT_PATTERN.test(info.label))
    .sort((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity))
    .slice(0, EVENT_CAP)
    .map((info) => ({ name: info.label, year: info.year }));

  return {
    id: qid,
    name: nameEn ?? qid,
    name_ja: nameJa ?? null,
    lat: coord.lat,
    lng: coord.lng,
    country: countryCode && countryCode !== 'UNKNOWN' ? countryCode : null,
    sport_types: [],
    capacity: capacityAmount ? parseInt(capacityAmount, 10) : null,
    opened_year: inceptionTime ? extractYear(inceptionTime) : null,
    closed_year: null,
    roof_type: null,
    teams,
    events,
    wikipedia_url: wikipediaUrl,
    wikidata_url: `https://www.wikidata.org/wiki/${qid}`,
    image_url: imageValue ?? null,
    website: websiteValue ?? null,
    sources: wikipediaUrl ? ['Wikidata', 'Wikipedia'] : ['Wikidata'],
    last_synced_at: syncedAt,
  };
}
