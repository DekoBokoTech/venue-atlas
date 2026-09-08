const ENTITY_ENDPOINT = 'https://www.wikidata.org/w/api.php';
const BATCH_SIZE = 50;

async function fetchBatch(qids, options) {
  const { fetchImpl, maxRetries, retryDelayMs } = options;
  const url = `${ENTITY_ENDPOINT}?action=wbgetentities&ids=${qids.join('|')}&props=labels|claims|sitelinks&languages=ja|en&sitefilter=jawiki|enwiki&format=json`;

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'stadium-atlas-bot/1.0',
        },
      });

      if (response.status === 429 || response.status >= 500) {
        const retryAfterHeader = response.headers?.get?.('retry-after');
        const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : null;
        throw Object.assign(new Error(`Retryable HTTP status: ${response.status}`), { retryAfterMs });
      }

      if (!response.ok) {
        throw new Error(`wbgetentities request failed with status ${response.status}`);
      }

      const json = await response.json();
      return json.entities;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = Number.isFinite(error.retryAfterMs) ? error.retryAfterMs : retryDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`wbgetentities batch failed after ${maxRetries + 1} attempts: ${lastError.message}`);
}

export async function fetchEntities(qids, options = {}) {
  const {
    fetchImpl = fetch,
    maxRetries = 3,
    retryDelayMs = 1000,
    batchSize = BATCH_SIZE,
    batchDelayMs = 1500,
  } = options;

  const entities = {};

  for (let i = 0; i < qids.length; i += batchSize) {
    const batch = qids.slice(i, i + batchSize);
    const batchEntities = await fetchBatch(batch, { fetchImpl, maxRetries, retryDelayMs });
    Object.assign(entities, batchEntities);

    if (i + batchSize < qids.length) {
      await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
    }
  }

  return entities;
}
