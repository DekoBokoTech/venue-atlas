import { querySparql } from './sparql-client.js';
import { buildCountryListQuery } from './build-query.js';

export async function listCountries(options = {}) {
  const bindings = await querySparql(buildCountryListQuery(), options);

  const countries = bindings.map((binding) => ({
    countryQid: binding.country.value.split('/').pop(),
    countryCode: binding.countryCode.value,
    count: parseInt(binding.count.value, 10),
  }));

  countries.push({ countryQid: 'UNKNOWN', countryCode: 'UNKNOWN', count: null });

  return countries;
}
