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

export function normalizeEntity(coordBinding, entity, countryCode, syncedAt) {
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
    teams: [],
    wikipedia_url: wikipediaUrl,
    wikidata_url: `https://www.wikidata.org/wiki/${qid}`,
    image_url: imageValue ?? null,
    website: websiteValue ?? null,
    sources: wikipediaUrl ? ['Wikidata', 'Wikipedia'] : ['Wikidata'],
    last_synced_at: syncedAt,
  };
}
