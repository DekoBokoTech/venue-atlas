function parsePoint(wktPoint) {
  const match = /Point\(([-0-9.]+) ([-0-9.]+)\)/.exec(wktPoint);
  if (!match) return null;
  return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
}

export function normalizeBinding(binding, syncedAt) {
  if (!binding.coord) return null;
  const coord = parsePoint(binding.coord.value);
  if (!coord) return null;

  const qid = binding.item.value.split('/').pop();

  return {
    id: qid,
    name: binding.nameEn ? binding.nameEn.value : qid,
    name_ja: binding.nameJa ? binding.nameJa.value : null,
    lat: coord.lat,
    lng: coord.lng,
    country: binding.countryCode ? binding.countryCode.value : null,
    sport_types: [],
    capacity: binding.capacity ? parseInt(binding.capacity.value, 10) : null,
    opened_year: binding.inception ? new Date(binding.inception.value).getUTCFullYear() : null,
    closed_year: null,
    roof_type: null,
    teams: [],
    wikipedia_url: binding.wikipediaUrl ? binding.wikipediaUrl.value : null,
    wikidata_url: `https://www.wikidata.org/wiki/${qid}`,
    image_url: binding.image ? binding.image.value : null,
    sources: binding.wikipediaUrl ? ['Wikidata', 'Wikipedia'] : ['Wikidata'],
    last_synced_at: syncedAt,
  };
}
