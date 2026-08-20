/**
 * publicCardCacheBackfill — fills the holes in `scryfall_cache` from Scryfall
 * during a public-index reconcile (TASK-247 tanda 4 ronda 2, HIGH-1).
 *
 * WHY THIS EXISTS, MEASURED. Read-only count against production 2026-08-19,
 * the whole `public_cards` collection (8,388 documents): 3,005 documents
 * (35.8%) carry no `setCode`, over 2,387 distinct scryfallIds. One seller's
 * ENTIRE profile — 1,703 of 1,703 — is in that set. Until tanda 4 the browser
 * patched the field in per loaded page (`enrichPublicCardsInMemory`); tanda 4
 * deleted that path, so the index entry is now the only source. Without a set
 * code, `getCardPrices` (src/services/mtgjson.ts) cannot resolve an mtgjson
 * uuid, so the Card Kingdom price — the primary price source of this product
 * — never replaces the TCG one, and UserProfileView's `collectionSets`, which
 * requires a truthy setCode, leaves the set filter unusable.
 *
 * publicCardEntry.js's `sc: data.setCode || cache.set` fallback closes 2,054
 * of those 2,387 ids. The remaining 333 are what this module is for: 322 have
 * a cache document written by the import path (whose
 * buildCacheFieldsFromScryfall never stored `set` — see
 * src/utils/importHelpers.ts) and 11 have no cache document at all.
 *
 * WHERE THE FIX GOES (Rafael, ticket comment DECISION 9, not relitigable):
 * in the WRITER, during the reconcile, re-fetching from Scryfall what the
 * cache is missing. Explicitly rejected: accepting the residue without a CK
 * price, and keeping a narrowed enrichment step in the browser (which only
 * ever reaches the loaded page — the original defect of this ticket). The
 * chosen option also leaves the shared cache better populated for the rest of
 * the product, not only for public profiles.
 *
 * HOW IT TALKS TO SCRYFALL: the same shape scripts/backfill-scryfall-cache.mjs
 * already uses — POST /cards/collection in batches of 75, one request at a
 * time, an interval well clear of Scryfall's requested 50-100ms, an
 * identifying User-Agent, and a bounded retry on 429. Reused rather than
 * reinvented, and the field set written is `refreshScryfallCache`'s
 * (functions/index.js) rather than the import path's, precisely because that
 * one includes `set` / `set_name`.
 *
 * FAILURE POLICY: a reconcile that already read the seller's whole collection
 * must never be aborted by a third-party HTTP call. Every batch is isolated:
 * a failed batch is counted and logged, its ids simply stay uncached, their
 * entries keep `sc: ''`, and the index is still built. The next reconcile
 * retries them naturally, since Firestore — not a state file — is what says
 * which ids are still missing.
 *
 * Dependency-free CommonJS with `fetch` and `sleep` injected, so vitest can
 * EXECUTE the batching, the pacing, the cap and the partial-failure isolation
 * without a network and without firebase-admin (TASK-236).
 */

/** Scryfall's own limit for POST /cards/collection. */
const SCRYFALL_BATCH_SIZE = 75;
/** Scryfall asks for 50-100ms between requests; we stay well clear of it. */
const SCRYFALL_MIN_INTERVAL_MS = 150;
/**
 * Per-run ceiling. A cold account could need thousands of ids; at 75 per
 * request that is minutes of a 300s function. Capping makes the repair
 * INCREMENTAL — each reconcile closes up to this many ids and the next one
 * picks up the rest, which is the safe direction: a partially repaired cache
 * is strictly better than a reconcile that times out and writes no index at
 * all. Measured context: the whole production public set needs 333 ids, one
 * run's worth several times over.
 */
const MAX_BACKFILL_IDS = 1500;
/**
 * Ceiling on a 429's `Retry-After` (MEDIUM-2, review round 3). The header was
 * previously slept for at face value: `Retry-After: 3600` meant an hour-long
 * sleep inside a 300s Cloud Function, at a point in the reconcile BEFORE any
 * index write — the single path that ends in "no index was written at all",
 * which is precisely what the FAILURE POLICY above says must never happen.
 * Capped, a rate-limited batch simply exhausts its bounded retries and is
 * counted as failed, which IS the declared policy: its ids stay uncached,
 * their entries keep `sc: ''`, and the index is still built.
 */
const MAX_RETRY_AFTER_MS = 5000;
/** Backoff used when a 429 carries no usable `Retry-After` at all. */
const DEFAULT_429_BACKOFF_MS = 2000;
/**
 * Whole-run ceiling on the Scryfall phase (MEDIUM-2). Capping each individual
 * sleep is not enough on its own: enough capped batches still add up inside a
 * 300s function. Once this budget is spent the remaining batches are ABANDONED
 * (counted and logged, never silently dropped) and the reconcile carries on to
 * write its index — the next run picks the ids up again, since Firestore, not
 * a state file, is what remembers which ids are still missing.
 */
const BACKFILL_TIME_BUDGET_MS = 60 * 1000;
/**
 * Where an id Scryfall's own collection endpoint refuses to return is
 * recorded (LOW, review round 3). Such an id is a deleted or never-existing
 * printing, not a transient failure — before this, nothing remembered it and
 * every future reconcile of that seller spent a request on it again, forever.
 *
 * Deliberately NOT recorded as an empty `scryfall_cache` document: a cache
 * document that exists but carries no data would clear publicCardEntry's `x`
 * flag ("no cache doc at all") while telling a reader nothing, turning a
 * visible gap into an invisible one — the failure shape this whole ticket is
 * about.
 */
const SCRYFALL_NOT_FOUND_COLLECTION = 'scryfall_not_found';
/**
 * How long a not-found record is honored before the id is tried again. A
 * printing really can appear later (a card newly added to Scryfall's data),
 * so the record expires rather than banning the id forever — same shape as
 * publicCardIndexReconciler's lease staleness: a plain epoch-ms number, no
 * admin Timestamp needed, testable without firebase-admin.
 */
const NOT_FOUND_RETRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SCRYFALL_API = 'https://api.scryfall.com';
const USER_AGENT =
  'CranialTrading-PublicIndexReconcile/1.0 (+https://cranial-trading.web.app; contact: srparca@gmail.com)';

/**
 * The field set refreshScryfallCache (functions/index.js) writes. NOT the
 * import path's buildCacheFieldsFromScryfall list, which omits `set` and
 * `set_name` — omitting `set` is precisely the hole this module closes.
 */
const SCRYFALL_CACHE_FIELDS = [
  'name', 'set', 'set_name', 'collector_number', 'rarity', 'type_line',
  'mana_cost', 'cmc', 'colors', 'color_identity', 'power', 'toughness',
  'image_uris', 'card_faces', 'oracle_text', 'keywords', 'legalities',
  'full_art', 'produced_mana', 'prices',
];

/**
 * @param {object} card a Scryfall card object
 * @returns {Record<string, unknown>} only the fields Scryfall actually sent —
 *   never a key with an undefined value, which Firestore rejects.
 */
function pickScryfallCacheFields(card) {
  const result = {};
  for (const field of SCRYFALL_CACHE_FIELDS) {
    // eslint-disable-next-line security/detect-object-injection
    if (card[field] !== undefined && card[field] !== null) {
      // eslint-disable-next-line security/detect-object-injection
      result[field] = card[field];
    }
  }
  return result;
}

/**
 * Which scryfallIds are worth a Scryfall request: the ones with no cache
 * document at all, and the ones whose cache document has no `set`. An id
 * that already has `set` is left alone — never re-spend Scryfall quota on
 * something another account already caused to be cached (the same rule
 * scripts/backfill-scryfall-cache.mjs states as TASK-243's redirect).
 *
 * LOW (review round 3): the per-run cap used to be silent — this returned a
 * bare array truncated at MAX_BACKFILL_IDS and said nothing about what it had
 * left behind, so an operator reading the logs could not tell a run that
 * finished the job from one that stopped halfway. It now reports the
 * remainder, and the reconciler logs it.
 *
 * @param {string[]} scryfallIds
 * @param {Record<string, object>} cacheByScryfallId
 * @returns {{ids: string[], remaining: number}} at most MAX_BACKFILL_IDS ids,
 *   plus how many more would have been needed
 */
function selectIdsNeedingCacheBackfill(scryfallIds, cacheByScryfallId) {
  const cache = cacheByScryfallId || {};
  const needed = [];
  let remaining = 0;
  for (const id of scryfallIds || []) {
    if (!id) continue;
    // eslint-disable-next-line security/detect-object-injection
    const doc = cache[id];
    if (doc && doc.set) continue;
    if (needed.length >= MAX_BACKFILL_IDS) {
      remaining++;
      continue;
    }
    needed.push(id);
  }
  return { ids: needed, remaining };
}

/**
 * Reads the not-found records for the given ids and returns the subset that
 * is still within NOT_FOUND_RETRY_MS — i.e. the ids not worth asking Scryfall
 * about again yet. Degrades to "no records" when the injected `db` has no
 * `getAll` (some fakes don't), never throwing: a failure to read this
 * optimization must not cost the backfill itself.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {string[]} ids
 * @param {() => number} nowImpl
 * @returns {Promise<Set<string>>}
 */
async function fetchKnownMissingIds(db, ids, nowImpl) {
  if (!db || typeof db.getAll !== 'function' || ids.length === 0) return new Set();
  const known = new Set();
  const READ_BATCH = 300;
  try {
    for (let i = 0; i < ids.length; i += READ_BATCH) {
      const refs = ids.slice(i, i + READ_BATCH).map((id) => db.collection(SCRYFALL_NOT_FOUND_COLLECTION).doc(id));
      // eslint-disable-next-line no-await-in-loop
      const snaps = await db.getAll(...refs);
      for (const snap of snaps) {
        if (!snap || !snap.exists) continue;
        const data = snap.data() || {};
        const at = data.notFoundAt;
        // A record with no usable timestamp is honored (it was written by
        // this module, so it means "not found"); a stale one is retried.
        if (Number.isFinite(at) && nowImpl() - at >= NOT_FOUND_RETRY_MS) continue;
        known.add(snap.id);
      }
    }
  } catch {
    return new Set();
  }
  return known;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One POST /cards/collection with a bounded retry on 429 / transport error.
 * Never throws: a caller gets `{ ok: false, reason }` so the batch's ids can
 * be counted as failed without taking the reconcile down.
 */
async function fetchCollectionBatch(identifiers, { fetchImpl, sleepImpl, retries }) {
  let left = retries;
  while (left > 0) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetchImpl(`${SCRYFALL_API}/cards/collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT, Accept: 'application/json' },
        body: JSON.stringify({ identifiers }),
      });

      if (response.status === 429) {
        // MEDIUM-2 (review round 3): `Retry-After` is a third party's number
        // and is honored only up to MAX_RETRY_AFTER_MS. A garbage header
        // (`Retry-After: later`) parses to NaN and falls back to the default
        // rather than becoming a NaN sleep. When the bounded retries run out
        // the batch is simply reported as failed, which is this module's
        // declared failure policy — never an unbounded wait inside a 300s
        // function that has not written its index yet.
        const retryAfter = response.headers && response.headers.get ? response.headers.get('Retry-After') : null;
        const asked = retryAfter ? Number.parseInt(retryAfter, 10) * 1000 : NaN;
        const wanted = Number.isFinite(asked) && asked > 0 ? asked : DEFAULT_429_BACKOFF_MS;
        const delay = Math.min(wanted, MAX_RETRY_AFTER_MS);
        left--;
        // eslint-disable-next-line no-await-in-loop
        if (left > 0) await sleepImpl(delay);
        continue;
      }

      if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };

      // eslint-disable-next-line no-await-in-loop
      const data = await response.json();
      return { ok: true, cards: (data && data.data) || [] };
    } catch (err) {
      left--;
      if (left === 0) return { ok: false, reason: err instanceof Error ? err.message : String(err) };
      // eslint-disable-next-line no-await-in-loop
      await sleepImpl(500);
    }
  }
  return { ok: false, reason: 'exhausted retries' };
}

/**
 * Fetches the given scryfallIds from Scryfall, writes them into
 * `scryfall_cache`, and MERGES them into `cacheByScryfallId` in place so the
 * caller's very next index build already sees them — a backfill that only
 * wrote Firestore would leave this run's entries with the same empty `sc` and
 * repair nothing until the following run.
 *
 * @param {object} args
 * @param {FirebaseFirestore.Firestore} args.db
 * @param {string[]} args.scryfallIds ids to fetch (already selected)
 * @param {Record<string, object>} args.cacheByScryfallId mutated in place
 * @param {Function} [args.fetchImpl] injectable for tests; defaults to global fetch
 * @param {Function} [args.sleepImpl] injectable for tests
 * @param {number} [args.retries]
 * @param {(msg: string) => void} [args.log]
 * @param {(msg: string) => void} [args.logError]
 * @param {*} [args.serverTimestamp] value written to `_cachedAt` /
 *   `_metadataUpdatedAt` — the caller supplies its own admin Timestamp so this
 *   module stays free of firebase-admin. Omitted = the fields are not written.
 * @param {() => number} [args.nowImpl] injectable clock (tests only)
 * @param {number} [args.timeBudgetMs] whole-run ceiling on the Scryfall phase
 * @returns {Promise<{requested: number, written: number, notFound: number,
 *   failed: number, requests: number, skippedKnownMissing: number,
 *   abandoned: number}>}
 */
async function backfillScryfallCacheForIds({
  db,
  scryfallIds,
  cacheByScryfallId,
  fetchImpl = typeof fetch === 'function' ? fetch : null,
  sleepImpl = defaultSleep,
  retries = 3,
  log = () => {},
  logError = () => {},
  serverTimestamp = null,
  nowImpl = Date.now,
  timeBudgetMs = BACKFILL_TIME_BUDGET_MS,
}) {
  const requestedIds = (scryfallIds || []).filter(Boolean);
  const stats = {
    requested: requestedIds.length,
    written: 0,
    notFound: 0,
    failed: 0,
    requests: 0,
    skippedKnownMissing: 0,
    abandoned: 0,
  };
  if (requestedIds.length === 0) return stats;
  if (!fetchImpl) {
    logError('[publicCardCacheBackfill] no fetch implementation available — skipping cache backfill');
    stats.failed = requestedIds.length;
    return stats;
  }

  // LOW (review round 3): ids Scryfall has already refused to return are not
  // asked for again until their record goes stale.
  const knownMissing = await fetchKnownMissingIds(db, requestedIds, nowImpl);
  const ids = requestedIds.filter((id) => !knownMissing.has(id));
  stats.skippedKnownMissing = requestedIds.length - ids.length;
  if (ids.length === 0) {
    log(`[publicCardCacheBackfill] all ${stats.skippedKnownMissing} id(s) already known-missing — no request made`);
    return stats;
  }

  let lastRequestAt = 0;
  const startedAt = nowImpl();

  for (let i = 0; i < ids.length; i += SCRYFALL_BATCH_SIZE) {
    // MEDIUM-2: whole-run ceiling. What is left is reported, not dropped in
    // silence — the next reconcile picks these ids up again.
    if (nowImpl() - startedAt >= timeBudgetMs) {
      stats.abandoned = ids.length - i;
      logError(
        `[publicCardCacheBackfill] time budget of ${timeBudgetMs}ms spent — ` +
          `abandoning ${stats.abandoned} id(s) for the next run; the index is still built`
      );
      break;
    }
    const batch = ids.slice(i, i + SCRYFALL_BATCH_SIZE);

    const elapsed = Date.now() - lastRequestAt;
    if (lastRequestAt !== 0 && elapsed < SCRYFALL_MIN_INTERVAL_MS) {
      // eslint-disable-next-line no-await-in-loop
      await sleepImpl(SCRYFALL_MIN_INTERVAL_MS - elapsed);
    }
    lastRequestAt = Date.now();
    stats.requests++;

    // eslint-disable-next-line no-await-in-loop
    const result = await fetchCollectionBatch(
      batch.map((id) => ({ id })),
      { fetchImpl, sleepImpl, retries }
    );

    if (!result.ok) {
      // Isolated on purpose: these ids simply stay uncached, their entries
      // keep `sc: ''`, and the index is still built. The next reconcile
      // retries them — Firestore, not a state file, is what remembers.
      stats.failed += batch.length;
      logError(`[publicCardCacheBackfill] batch of ${batch.length} failed (${result.reason}) — ids left uncached`);
      continue;
    }

    const returned = new Set();
    const writer = db.batch();
    for (const card of result.cards) {
      if (!card || !card.id) continue;
      returned.add(card.id);
      const fields = pickScryfallCacheFields(card);
      const stamped = serverTimestamp
        ? { ...fields, _cachedAt: serverTimestamp, _metadataUpdatedAt: serverTimestamp }
        : fields;
      writer.set(db.collection('scryfall_cache').doc(card.id), stamped, { merge: true });
      // eslint-disable-next-line security/detect-object-injection
      cacheByScryfallId[card.id] = { ...(cacheByScryfallId[card.id] || {}), ...fields };
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      await writer.commit();
      stats.written += returned.size;
    } catch (err) {
      stats.failed += batch.length;
      logError(
        `[publicCardCacheBackfill] writing ${returned.size} cache doc(s) failed: ${err instanceof Error ? err.message : String(err)}`
      );
      continue;
    }

    // Ids Scryfall's own collection endpoint did not return are a genuine
    // miss (a deleted or never-existing printing), not a transient failure —
    // counted, logged, and RECORDED (LOW, review round 3) so the next
    // reconcile of this seller does not spend a request on them again until
    // the record goes stale. Recorded in their own collection, never as an
    // empty scryfall_cache document — see SCRYFALL_NOT_FOUND_COLLECTION.
    const missingIds = batch.filter((id) => !returned.has(id));
    if (missingIds.length > 0) {
      stats.notFound += missingIds.length;
      try {
        const marker = db.batch();
        for (const id of missingIds) {
          marker.set(db.collection(SCRYFALL_NOT_FOUND_COLLECTION).doc(id), { notFoundAt: nowImpl() }, { merge: true });
        }
        // eslint-disable-next-line no-await-in-loop
        await marker.commit();
      } catch (err) {
        // Purely an optimization: failing to record a miss costs one request
        // on the next run, nothing more. Never worth failing the batch over.
        logError(
          `[publicCardCacheBackfill] could not record ${missingIds.length} not-found id(s): ` +
            `${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  log(
    `[publicCardCacheBackfill] requested=${stats.requested} written=${stats.written} ` +
      `notFound=${stats.notFound} failed=${stats.failed} requests=${stats.requests} ` +
      `skippedKnownMissing=${stats.skippedKnownMissing} abandoned=${stats.abandoned}`
  );
  return stats;
}

module.exports = {
  MAX_BACKFILL_IDS,
  MAX_RETRY_AFTER_MS,
  BACKFILL_TIME_BUDGET_MS,
  NOT_FOUND_RETRY_MS,
  SCRYFALL_BATCH_SIZE,
  SCRYFALL_MIN_INTERVAL_MS,
  SCRYFALL_CACHE_FIELDS,
  SCRYFALL_NOT_FOUND_COLLECTION,
  pickScryfallCacheFields,
  selectIdsNeedingCacheBackfill,
  fetchKnownMissingIds,
  backfillScryfallCacheForIds,
};
