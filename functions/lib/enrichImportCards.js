/**
 * enrichImportCards — server-side completion of Scryfall metadata for
 * bulkImportCards (TASK-286).
 *
 * TASK-285 put enrichment on the CLIENT only. Measured in production
 * 2026-08-26 (account Rt5DOfZXBtPZkEpK4N5pW6a5FXs1, post reimport): 5765
 * cards created, type_line/colors/rarity/cmc 0/5766, scryfall_cache
 * unchanged (1501 -> 1501) — the client's `_cacheFields` path never ran.
 * Whatever the cause on the client side, bulkImportCards is the one place
 * that always runs (the client can't be bypassed here), so THIS is where
 * a card with a scryfallId but no metadata gets one more chance before it
 * lands in Firestore.
 *
 * Two-tier lookup, matching the "user doc wins, cache fills the rest"
 * semantics already defined in ./cardIndexEntry.js's mergeScryfallMetadata
 * (reused here, not reimplemented):
 *   1. scryfall_cache, batched (injected `getCacheMap`, expected to be
 *      functions/index.js's existing fetchScryfallCacheMap — db.getAll,
 *      no 10-id `in` limit).
 *   2. Scryfall's /cards/collection for whatever the cache didn't have
 *      (injected `fetchScryfallBatch`, called here in batches of 75 —
 *      Scryfall's documented limit for that endpoint).
 *
 * Dependency-injected on purpose: functions/index.js calls
 * admin.initializeApp() at require time (TASK-236's constraint — no
 * emulator harness), so this module must stay free of firebase-admin and
 * of real network calls to be require()'d and EXECUTED by vitest, same
 * technique as cardIndexEntry.js.
 *
 * AC4: Scryfall failing or not resolving an id never drops the card — it
 * is written with whatever it already had, and counted in
 * `unresolvedCount` so the caller (bulkImportCards) can report it instead
 * of the TASK-281-shaped silent success.
 */
const { mergeScryfallMetadata } = require('./cardIndexEntry');

const SCRYFALL_COLLECTION_BATCH_SIZE = 75;

function isEmpty(value) {
  if (Array.isArray(value)) return value.length === 0;
  return value === undefined || value === null || value === '';
}

/**
 * A card needs enrichment when it has a scryfallId (something to look up)
 * but is missing any of the four fields TASK-286 measured at 0 in
 * production. `cmc` uses a numeric-null check (not isEmpty) because a
 * legitimate cmc of 0 must not be treated as missing — same rule
 * mergeScryfallMetadata already applies with `??`.
 *
 * @param {object} card
 */
function needsEnrichment(card) {
  if (!card || !card.scryfallId) return false;
  return (
    isEmpty(card.type_line)
    || isEmpty(card.colors)
    || isEmpty(card.rarity)
    || card.cmc === undefined
    || card.cmc === null
  );
}

/**
 * @param {object[]} cards - client-submitted cards, already stripped of
 *   id/createdAt/updatedAt/_cacheFields by the caller.
 * @param {object} deps
 * @param {(ids: string[]) => Promise<Map<string, object>>} deps.getCacheMap
 *   Batched scryfall_cache read for a set of scryfallIds. Called with the
 *   deduplicated list of ids that need enrichment (never with an empty
 *   array).
 * @param {(ids: string[]) => Promise<object[]>} [deps.fetchScryfallBatch]
 *   Calls Scryfall's /cards/collection for up to 75 ids at a time; returns
 *   Scryfall card objects (an id Scryfall can't resolve is simply absent
 *   from the result, not an error). Optional — omitting it (or leaving an
 *   id unresolved) is equivalent to Scryfall being unavailable: those
 *   cards fall through to `unresolvedCount`.
 * @returns {Promise<{
 *   cards: object[],
 *   cacheWrites: Map<string, object>,
 *   unresolvedCount: number,
 * }>}
 *   `cards` is the input array with enriched cards replaced (order and
 *   length preserved 1:1, so the caller can zip results back to refs).
 *   `cacheWrites` holds only the ids resolved via Scryfall (AC2) — ids
 *   already in scryfall_cache are not rewritten. `unresolvedCount` is the
 *   number of cards that still needed enrichment and got none.
 */
async function enrichCardsForImport(cards, { getCacheMap, fetchScryfallBatch }) {
  const needsCheck = cards.map(needsEnrichment);
  const needingIds = [...new Set(
    cards.filter((_, i) => needsCheck[i]).map((c) => c.scryfallId)
  )];

  if (needingIds.length === 0) {
    // AC3: cards already complete → zero calls of any kind.
    return { cards, cacheWrites: new Map(), unresolvedCount: 0 };
  }

  const cacheMap = await getCacheMap(needingIds);

  const stillMissingIds = needingIds.filter((id) => !cacheMap.has(id));
  const scryfallResults = new Map();

  if (stillMissingIds.length > 0 && typeof fetchScryfallBatch === 'function') {
    for (let i = 0; i < stillMissingIds.length; i += SCRYFALL_COLLECTION_BATCH_SIZE) {
      const batchIds = stillMissingIds.slice(i, i + SCRYFALL_COLLECTION_BATCH_SIZE);
      let resolved = [];
      try {
        // eslint-disable-next-line no-await-in-loop
        resolved = await fetchScryfallBatch(batchIds);
      } catch {
        // AC4: Scryfall down/erroring for this batch — those cards stay
        // unresolved below, they are not lost.
        resolved = [];
      }
      for (const scryfallCard of resolved || []) {
        if (scryfallCard && scryfallCard.id) {
          scryfallResults.set(scryfallCard.id, scryfallCard);
        }
      }
    }
  }

  let unresolvedCount = 0;
  const cacheWrites = new Map();
  const enrichedCards = cards.map((card, i) => {
    if (!needsCheck[i]) return card;

    const fromCache = cacheMap.get(card.scryfallId);
    const fromScryfall = scryfallResults.get(card.scryfallId);
    const resolvedAgainst = fromCache || fromScryfall;

    if (!resolvedAgainst) {
      unresolvedCount += 1;
      return card;
    }

    if (fromScryfall && !fromCache) {
      // AC2: write back only what came from a live Scryfall lookup — a
      // cache hit is already in scryfall_cache, no need to rewrite it.
      cacheWrites.set(card.scryfallId, fromScryfall);
    }

    return mergeScryfallMetadata(card, resolvedAgainst);
  });

  return { cards: enrichedCards, cacheWrites, unresolvedCount };
}

module.exports = { enrichCardsForImport, needsEnrichment };
