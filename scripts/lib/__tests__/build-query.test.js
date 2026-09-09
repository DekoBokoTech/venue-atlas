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
  assert.match(query, /SELECT DISTINCT \?item \?coord WHERE/);
});

test('buildScanQuery also matches items classified as sports complexes (Q7579839), e.g. Nagasaki Stadium City', () => {
  const query = buildScanQuery({ limit: 10, offset: 0 });
  assert.match(query, /wd:Q7579839/);
});

test('buildScanQuery combines the class alternatives via a single VALUES-driven pattern to avoid duplicate rows', () => {
  const query = buildScanQuery({ limit: 10, offset: 0 });
  assert.match(query, /VALUES \?class \{ wd:Q1076486 wd:Q7579839 \}/);
  assert.match(query, /\?item wdt:P31\/wdt:P279\* \?class \./);
  assert.match(query, /SELECT DISTINCT/);
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
  const query = buildCountryListQuery('Q1076486');
  assert.match(query, /GROUP BY \?country \?countryCode/);
  assert.match(query, /COUNT\(DISTINCT \?item\)/);
  assert.match(query, /wdt:P297/);
});

test('buildCountryListQuery defaults to Q1076486 and takes one class per call, not a combined VALUES list', () => {
  const defaultQuery = buildCountryListQuery();
  assert.match(defaultQuery, /wd:Q1076486/);
  assert.doesNotMatch(defaultQuery, /VALUES \?class/);

  const complexQuery = buildCountryListQuery('Q7579839');
  assert.match(complexQuery, /wd:Q7579839/);
  assert.doesNotMatch(complexQuery, /wd:Q1076486/);
});
