export function buildScanQuery({ limit, offset, countryQid = null }) {
  let scopeFilter = '';
  if (countryQid === 'UNKNOWN') {
    scopeFilter = 'FILTER NOT EXISTS { ?item wdt:P17 ?anyCountry . ?anyCountry wdt:P297 ?anyCode . }';
  } else if (countryQid) {
    scopeFilter = `?item wdt:P17 wd:${countryQid} .`;
  }

  return `
SELECT DISTINCT ?item ?coord WHERE {
  ?item wdt:P625 ?coord .
  VALUES ?class { wd:Q1076486 wd:Q7579839 }
  ?item wdt:P31/wdt:P279* ?class .
  ${scopeFilter}
}
ORDER BY ?item
LIMIT ${limit}
OFFSET ${offset}
`.trim();
}

// Split by class (one class per query) rather than a single VALUES-based
// query across both classes: this unbounded aggregate GROUP BY has no
// LIMIT/OFFSET, so doubling the class list roughly doubles the P279*
// subclass-tree evaluation cost across the whole graph — confirmed live,
// the single-class version returns in ~6.5s (HTTP 200) while the combined
// two-class version reliably fails with HTTP 500 after 60s+. buildScanQuery
// is unaffected (its LIMIT/OFFSET keeps per-page cost bounded) and keeps
// the combined VALUES form. Callers sum per-class counts client-side.
export function buildCountryListQuery(classQid = 'Q1076486') {
  return `
SELECT ?country ?countryCode (COUNT(DISTINCT ?item) AS ?count) WHERE {
  ?item wdt:P625 [] .
  ?item wdt:P31/wdt:P279* wd:${classQid} .
  ?item wdt:P17 ?country .
  ?country wdt:P297 ?countryCode .
}
GROUP BY ?country ?countryCode
ORDER BY DESC(?count)
`.trim();
}
