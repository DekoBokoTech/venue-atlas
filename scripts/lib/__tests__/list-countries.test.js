import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listCountries } from '../list-countries.js';

test('listCountries maps bindings into country records and appends the UNKNOWN bucket', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      results: {
        bindings: [
          {
            country: { value: 'http://www.wikidata.org/entity/Q142' },
            countryCode: { value: 'FR' },
            count: { value: '135323' },
          },
          {
            country: { value: 'http://www.wikidata.org/entity/Q30' },
            countryCode: { value: 'US' },
            count: { value: '6705' },
          },
        ],
      },
    }),
  });

  const countries = await listCountries({ fetchImpl });

  assert.deepEqual(countries, [
    { countryQid: 'Q142', countryCode: 'FR', count: 135323 },
    { countryQid: 'Q30', countryCode: 'US', count: 6705 },
    { countryQid: 'UNKNOWN', countryCode: 'UNKNOWN', count: null },
  ]);
});
