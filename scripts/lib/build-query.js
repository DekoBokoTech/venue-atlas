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

export function buildCountryListQuery() {
  return `
SELECT ?country ?countryCode (COUNT(DISTINCT ?item) AS ?count) WHERE {
  ?item wdt:P625 [] .
  VALUES ?class { wd:Q1076486 wd:Q7579839 }
  ?item wdt:P31/wdt:P279* ?class .
  ?item wdt:P17 ?country .
  ?country wdt:P297 ?countryCode .
}
GROUP BY ?country ?countryCode
ORDER BY DESC(?count)
`.trim();
}
