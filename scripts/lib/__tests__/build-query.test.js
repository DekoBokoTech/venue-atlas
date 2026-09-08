import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScanQuery, buildCountryListQuery } from '../build-query.js';

test('buildScanQuery includes the requested limit and offset', () => {
  const query = buildScanQuery({ limit: 500, offset: 1000 });
  assert.match(query, /LIMIT 500/);
  assert.match(query, /OFFSET 1000/);
});

test('buildScanQuery targets sports venue subclasses with coordinates, id + coord only', () => {
  const query = buildScanQuery({ limit: 10, offset: 0 });
  assert.match(query, /wd:Q1076486/);
  assert.match(query, /wdt:P625/);
  assert.match(query, /SELECT \?item \?coord WHERE/);
});

test('buildScanQuery scopes to a specific country when countryQid is given', () => {
  const query = buildScanQuery({ limit: 10, offset: 0, countryQid: 'Q142' });
  assert.match(query, /\?item wdt:P17 wd:Q142 \./);
});

test('buildScanQuery omits the country scope when countryQid is not given', () => {
  const query = buildScanQuery({ limit: 10, offset: 0 });
  assert.doesNotMatch(query, /\?item wdt:P17 wd:Q/);
});

test('buildScanQuery filters to country-less items when countryQid is UNKNOWN', () => {
  const query = buildScanQuery({ limit: 10, offset: 0, countryQid: 'UNKNOWN' });
  assert.match(query, /FILTER NOT EXISTS/);
});

test('buildScanQuery does not request labels, capacity, or the label service', () => {
  const query = buildScanQuery({ limit: 10, offset: 0 });
  assert.doesNotMatch(query, /SERVICE wikibase:label/);
  assert.doesNotMatch(query, /wdt:P1083/);
});

test('buildCountryListQuery groups facility counts by country', () => {
  const query = buildCountryListQuery();
  assert.match(query, /GROUP BY \?country \?countryCode/);
  assert.match(query, /COUNT\(\?item\)/);
  assert.match(query, /wdt:P297/);
});
