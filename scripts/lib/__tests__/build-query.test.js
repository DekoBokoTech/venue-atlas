import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuery } from '../build-query.js';

test('buildQuery includes the requested limit and offset', () => {
  const query = buildQuery({ limit: 500, offset: 1000 });
  assert.match(query, /LIMIT 500/);
  assert.match(query, /OFFSET 1000/);
});

test('buildQuery targets sports venue subclasses with coordinates', () => {
  const query = buildQuery({ limit: 10, offset: 0 });
  assert.match(query, /wd:Q1076486/);
  assert.match(query, /wdt:P625/);
});

test('buildQuery requests both English and Japanese labels', () => {
  const query = buildQuery({ limit: 10, offset: 0 });
  assert.match(query, /\?nameEn/);
  assert.match(query, /\?nameJa/);
});
