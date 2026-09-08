export function buildQuery({ limit, offset }) {
  return `
SELECT ?item ?nameEn ?nameJa ?itemLabel ?coord ?capacity ?inception ?countryCode ?wikipediaUrl ?wikipediaUrlEn ?image WHERE {
  ?item wdt:P31/wdt:P279* wd:Q1076486 .
  ?item wdt:P625 ?coord .
  OPTIONAL { ?item rdfs:label ?nameEn . FILTER(LANG(?nameEn) = "en") }
  OPTIONAL { ?item rdfs:label ?nameJa . FILTER(LANG(?nameJa) = "ja") }
  OPTIONAL { ?item wdt:P1083 ?capacity . }
  OPTIONAL { ?item wdt:P571 ?inception . }
  OPTIONAL {
    ?item wdt:P17 ?country .
    ?country wdt:P297 ?countryCode .
  }
  OPTIONAL {
    ?wikipediaUrl schema:about ?item ;
                  schema:isPartOf <https://ja.wikipedia.org/> .
  }
  OPTIONAL {
    ?wikipediaUrlEn schema:about ?item ;
                    schema:isPartOf <https://en.wikipedia.org/> .
  }
  OPTIONAL { ?item wdt:P18 ?image . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en,mul". }
}
ORDER BY ?item
LIMIT ${limit}
OFFSET ${offset}
`.trim();
}
