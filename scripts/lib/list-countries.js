import { querySparql } from './sparql-client.js';
import { buildCountryListQuery } from './build-query.js';

// Kept in sync with buildScanQuery's VALUES class list in build-query.js.
const VENUE_CLASSES = ['Q1076486', 'Q7579839'];

export async function listCountries(options = {}) {
  const counts = new Map();

  for (const classQid of VENUE_CLASSES) {
    const bindings = await querySparql(buildCountryListQuery(classQid), options);
    for (const binding of bindings) {
      const countryQid = binding.country.value.split('/').pop();
      const countryCode = binding.countryCode.value;
      const count = parseInt(binding.count.value, 10);
      const existing = counts.get(countryQid);
      if (existing) {
        existing.count += count;
      } else {
        counts.set(countryQid, { countryCode, count });
      }
    }
  }

  const countries = Array.from(counts.entries())
    .map(([countryQid, { countryCode, count }]) => ({ countryQid, countryCode, count }))
    .sort((a, b) => b.count - a.count);

  countries.push({ countryQid: 'UNKNOWN', countryCode: 'UNKNOWN', count: null });

  return countries;
}
