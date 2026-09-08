const ENDPOINT = 'https://query.wikidata.org/sparql';

export async function querySparql(query, options = {}) {
  const {
    fetchImpl = fetch,
    maxRetries = 3,
    retryDelayMs = 1000,
  } = options;

  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: 'application/sparql-results+json',
          'User-Agent': 'stadium-atlas-bot/1.0',
        },
      });

      if (response.status === 429 || response.status >= 500) {
        throw new Error(`Retryable HTTP status: ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(`SPARQL request failed with status ${response.status}`);
      }

      const json = await response.json();
      return json.results.bindings;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = retryDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`SPARQL query failed after ${maxRetries + 1} attempts: ${lastError.message}`);
}
