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
const NEVER_BUILT_CLASS = 'Q1570262'; // "unfinished building" (P31 instance-of)

// Opendatasoft "table" explore view for France's RES (Recensement des
// équipements sportifs) data-es-installation dataset, filtered to a single
// record's numero. Confirmed working (200, no redirect) against the live
// site; see scripts/lib/res-names.js for the dataset/table-mapping research.
const RES_TABLE_URL = 'https://equipements.sports.gouv.fr/explore/dataset/data-es-installation/table/?q=';

export function resolveClaimIds(entity, property) {
  return (entity?.claims?.[property] ?? [])
    .map((claim) => claim.mainsnak?.datavalue?.value?.id)
    .filter(Boolean);
}

export function normalizeEntity(coordBinding, entity, countryCode, syncedAt, relatedEntities = new Map(), resNameIndex = new Map()) {
  if (!coordBinding.coord) return null;
  const coord = parsePoint(coordBinding.coord.value);
  if (!coord) return null;

  const qid = coordBinding.item.value.split('/').pop();

  const nameEn = entity?.labels?.en?.value;
  const nameJa = entity?.labels?.ja?.value;

  // P11840: RES identifier (matches data-es-installation.numero). Only
  // consulted as a last resort, when Wikidata itself has neither an English
  // nor a Japanese label -- a record that already has a Wikidata name never
  // gets its name overridden by RES.
  const resNumero = entity?.claims?.P11840?.[0]?.mainsnak?.datavalue?.value;
  const resName = (!nameEn && !nameJa && resNumero) ? (resNameIndex.get(resNumero) ?? null) : null;

  if (!nameEn && !nameJa && !resName) return null;

  const capacityAmount = entity?.claims?.P1083?.[0]?.mainsnak?.datavalue?.value?.amount;
  const inceptionTime = entity?.claims?.P571?.[0]?.mainsnak?.datavalue?.value?.time;
  const dissolvedTime = entity?.claims?.P576?.[0]?.mainsnak?.datavalue?.value?.time;
  const closedYear = dissolvedTime ? extractYear(dissolvedTime) : null;
  const isNeverBuilt = resolveClaimIds(entity, 'P31').includes(NEVER_BUILT_CLASS);
  const isExisting = closedYear === null && !isNeverBuilt;
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

  const sources = ['Wikidata'];
  if (wikipediaUrl) sources.push('Wikipedia');
  if (resName) sources.push('RES');

  return {
    id: qid,
    name: nameEn ?? resName ?? qid,
    name_ja: nameJa ?? null,
    lat: coord.lat,
    lng: coord.lng,
    country: countryCode && countryCode !== 'UNKNOWN' ? countryCode : null,
    sport_types: [],
    capacity: capacityAmount ? parseInt(capacityAmount, 10) : null,
    opened_year: inceptionTime ? extractYear(inceptionTime) : null,
    closed_year: closedYear,
    is_existing: isExisting,
    roof_type: null,
    teams,
    events,
    wikipedia_url: wikipediaUrl,
    wikidata_url: `https://www.wikidata.org/wiki/${qid}`,
    image_url: imageValue ?? null,
    website: websiteValue ?? null,
    res_url: resName ? `${RES_TABLE_URL}${encodeURIComponent(resNumero)}` : null,
    sources,
    last_synced_at: syncedAt,
  };
}
