import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listCountries } from '../list-countries.js';

test('listCountries maps bindings into country records and appends the UNKNOWN bucket', async () => {
  // listCountries now issues one query per venue class (see build-query.js's
  // buildCountryListQuery split) and sums counts client-side. This mock
  // returns different bindings per class, keyed off the query text, so the
  // test also exercises the cross-class merge, not just a single response.
  const fetchImpl = async (url) => {
    const isQ1076486 = decodeURIComponent(url).includes('wd:Q1076486');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        results: {
          bindings: isQ1076486
            ? [
                { country: { value: 'http://www.wikidata.org/entity/Q142' }, countryCode: { value: 'FR' }, count: { value: '135323' } },
                { country: { value: 'http://www.wikidata.org/entity/Q30' }, countryCode: { value: 'US' }, count: { value: '6705' } },
              ]
            : [
                { country: { value: 'http://www.wikidata.org/entity/Q142' }, countryCode: { value: 'FR' }, count: { value: '18' } },
                { country: { value: 'http://www.wikidata.org/entity/Q17' }, countryCode: { value: 'JP' }, count: { value: '11' } },
              ],
        },
      }),
    };
  };

  const countries = await listCountries({ fetchImpl });

  assert.deepEqual(countries, [
    { countryQid: 'Q142', countryCode: 'FR', count: 135341 },
    { countryQid: 'Q30', countryCode: 'US', count: 6705 },
    { countryQid: 'Q17', countryCode: 'JP', count: 11 },
    { countryQid: 'UNKNOWN', countryCode: 'UNKNOWN', count: null },
  ]);
});
