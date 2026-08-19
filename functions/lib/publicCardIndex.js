/**
 * publicCardIndex — assembly, divergence-detection, and reconciliation for
 * the public-profile card index (TASK-247 tanda 2a/4).
 *
 * All three responsibilities below are PURE functions: data in, data out.
 * Nothing here reads or writes Firestore, and nothing here requires
 * firebase-admin — same dependency-free CommonJS technique as
 * publicCardEntry.js (TASK-247 tanda 1) and cardIndexEntry.js (TASK-245), so
 * this module is require()'able and EXECUTABLE by vitest without an
 * emulator (functions/ has no emulator harness — TASK-236). The tanda 2b
 * caller does the actual Firestore reads/writes using the plans this module
 * returns.
 *
 * AC10 (ticket header, restated): this new index must NOT inherit
 * card_index's POSITION-based chunking (TASK-208/TASK-238 — chunks that
 * lose entries, an index that goes empty and still passes every health
 * check that only asks "does a document exist at this path?"). This module
 * closes both halves of that gap for the public index:
 *
 *   1. Chunk assignment is entirely identity-derived. `buildPublicIndex`
 *      never chunks by array position — it delegates to
 *      publicCardEntry.js's `publicChunkId(scryfallId, totalChunks)`, which
 *      hashes the card's own scryfallId. Nothing in this file iterates
 *      publicCardDocs and assigns chunk N to the Nth doc.
 *   2. `diagnosePublicIndex` is the detector this project has never had for
 *      card_index. It does not ask "does the index exist" — it recomputes,
 *      from the SAME identity-derived rule, where every real public_cards
 *      document should live, and compares that against what the chunk
 *      documents actually contain. An index that still has all its chunk
 *      documents present but every `entries` array emptied out (the exact
 *      TASK-208/TASK-238 failure shape) is caught by `missing` covering
 *      100% of the account's cards, not by a separate "is it empty" special
 *      case — see `indexEmptied` below for why a dedicated flag still
 *      exists on top of that.
 *
 * CHUNK SIZING (AC10 "decide and document the criterion", measured
 * numbers): target ~400 entries per chunk before power-of-two rounding.
 * This number is not invented here — publicCardEntry.js's own header
 * ("Known cost of this scheme...", "Known READ cost of rounding up...")
 * already assumes a caller using "one chunk per ~400 cards" sizing logic
 * and measures the read-amplification cost against exactly that number.
 * This module is that caller, so it keeps the number the earlier tanda's
 * math was already built around instead of introducing a second,
 * un-reconciled constant.
 *
 * Why 400 is safe at both ends of this project's measured seller sizes:
 *   - Entry weight is measured at 441 bytes (publicCardEntry.js header).
 *     Firestore's per-document limit is 1 MiB (1,048,576 bytes), so a
 *     single chunk document can hold up to floor(1048576 / 441) = 2,377
 *     entries before it would ever risk the doc-size limit.
 *   - Today's largest real seller (measured, production): 6,647 public
 *     cards -> ceil(6647/400) = 17 requested chunks -> nextPowerOfTwo(17)
 *     = 32 actual chunks -> ~208 entries/chunk average -> ~91.7 KB/chunk.
 *     That is 2.3% of the 1 MiB limit and works out to roughly 11x headroom
 *     even before accounting for the fact that the hash spreads entries
 *     unevenly across buckets (a single bucket running ~4-5x over the
 *     average before it would approach the byte ceiling).
 *   - The target market this ticket is sized against (project memory,
 *     measured): 80% of sellers carry 25k+ cards, 30% carry 100k+. At
 *     100,000 cards: ceil(100000/400) = 250 requested -> nextPowerOfTwo(250)
 *     = 256 actual chunks -> ~391 entries/chunk average -> ~172 KB/chunk,
 *     still only 16.4% of the 1 MiB ceiling. A seller would need average
 *     bucket occupancy to run ~6x over the mean before any single chunk
 *     document risked the Firestore limit — implausible for a
 *     well-distributed 32-bit hash (FNV-1a) over a 256-bucket space.
 *   - The trade documented in publicCardEntry.js (up to ~2x chunk reads
 *     right after a seller crosses a power-of-two boundary, for a
 *     full-index scan) is accepted here unchanged — 400 does not make that
 *     trade worse or better, it only sets how OFTEN a seller crosses a
 *     boundary at all. A smaller target (e.g. 100/chunk) would cross
 *     boundaries more often and multiply write amplification on every
 *     single-card update for no byte-budget benefit; a larger target (e.g.
 *     1000/chunk) starts eating meaningfully into the 2,377-entry ceiling
 *     margin at 100k+ scale while saving nothing this project has measured
 *     a need for. 400 was already the number the tanda-1 module's own cost
 *     analysis was written against, so keeping it here also keeps that
 *     analysis accurate instead of stale.
 *
 * RECONCILIATION (AC10, second half): `diagnosePublicIndex` produces a
 * diagnosis, `planPublicIndexReconciliation` turns that diagnosis into a
 * plan of WRITES (never performs them). The dividing line between an
 * incremental patch and a full rebuild is the `totalChunks` CONTRACT
 * publicCardEntry.js already fixed in tanda 1: `totalChunks` may only
 * change via a full atomic rebuild, never be derived per-write. So:
 *
 *   - Incremental repair (rebuildRequired: false) is chosen whenever the
 *     current index's own bucket space (its meta's `totalChunks`, and the
 *     chunk documents actually present) still matches what a fresh build
 *     of the CURRENT public_cards would want. In that case only the
 *     specific chunks touched by a missing, orphaned, or misplaced entry
 *     need to be rewritten — every other chunk is already correct and is
 *     left untouched.
 *   - Full rebuild (rebuildRequired: true) is forced whenever the bucket
 *     space itself is wrong: the persisted `totalChunks` no longer matches
 *     what the current card count wants (the seller grew/shrank across a
 *     power-of-two boundary), or the chunk documents actually present
 *     don't match what the meta claims. Patching individual chunks in that
 *     state is exactly the bug this module exists to prevent: an
 *     incremental writer using the OLD totalChunks and a background
 *     reconciler computing chunk ids under a NEW totalChunks would disagree
 *     about where any given card belongs, which is "the index loses
 *     entries" wearing a reconciliation bug instead of a hash bug.
 */

const { buildPublicEntry, publicChunkId, nextPowerOfTwo } = require('./publicCardEntry');

// See header: kept equal to the "~400 cards/chunk" sizing already assumed by
// publicCardEntry.js's own documented cost analysis.
const DEFAULT_CHUNK_TARGET_SIZE = 400;
const SCHEMA_VERSION = 1;

/**
 * How many chunks a given card count should request, before power-of-two
 * rounding — the shared sizing rule `buildPublicIndex` and
 * `diagnosePublicIndex` both use, so a fresh build and a divergence check
 * against the SAME card count always agree on the target bucket space.
 *
 * @param {number} count
 * @param {number} chunkTargetSize
 */
function requestedChunkCount(count, chunkTargetSize) {
  if (!count || count <= 0) return 1;
  return Math.ceil(count / chunkTargetSize);
}

/**
 * Assembles a full public-profile index from a seller's public_cards
 * documents and their matching scryfall_cache documents. Always produces
 * every chunk from 0..totalChunks-1 (even ones with zero entries) — this is
 * the function tanda 2b calls for an initial build AND for a full rebuild
 * (see `planPublicIndexReconciliation`'s `rebuildRequired: true` branch,
 * which is meant to be satisfied by calling this function again with the
 * account's current documents).
 *
 * Chunk assignment is 100% identity-derived (AC10): every entry's chunk
 * comes from `publicChunkId(scryfallId, totalChunks)` in publicCardEntry.js,
 * never from the entry's position in `publicCardDocs`. Feeding this
 * function the same documents in a different order produces byte-identical
 * chunk contents (modulo entry order within a chunk, which callers should
 * not depend on).
 *
 * @param {Array<object>} publicCardDocs users/{uid}/public_cards documents.
 *   Each must carry at least `cardId` and `scryfallId` (the real fields —
 *   see publicCardEntry.js's header for the full measured field list).
 * @param {Object<string, object>} scryfallCacheByScryfallId map of
 *   scryfallId -> that card's scryfall_cache document fields. A missing key
 *   is treated the same as an explicit null/undefined cache doc.
 * @param {{chunkTargetSize?: number}} [options]
 * @returns {{chunks: Object<number, {id: number, entries: object[]}>,
 *   meta: {schemaVersion: number, totalChunks: number, count: number,
 *   chunkTargetSize: number}}}
 */
function buildPublicIndex(publicCardDocs, scryfallCacheByScryfallId, options = {}) {
  const docs = Array.isArray(publicCardDocs) ? publicCardDocs : [];
  const cacheById = scryfallCacheByScryfallId || {};
  const chunkTargetSize = options.chunkTargetSize || DEFAULT_CHUNK_TARGET_SIZE;
  const totalChunks = nextPowerOfTwo(requestedChunkCount(docs.length, chunkTargetSize));

  const chunks = {};
  for (let id = 0; id < totalChunks; id++) {
    chunks[id] = { id, entries: [] };
  }

  for (const doc of docs) {
    const scryfallId = (doc && doc.scryfallId) || '';
    const cache = cacheById[scryfallId] || null;
    const entry = buildPublicEntry(doc, cache);
    const chunkId = publicChunkId(scryfallId, totalChunks);
    chunks[chunkId].entries.push(entry);
  }

  return {
    chunks,
    meta: {
      schemaVersion: SCHEMA_VERSION,
      totalChunks,
      count: docs.length,
      chunkTargetSize,
    },
  };
}

/**
 * Compares the index actually stored (chunk documents + meta document, as
 * read from Firestore by the caller) against what it SHOULD contain given
 * the seller's current public_cards documents. Pure comparison — no reads,
 * no writes.
 *
 * This is the detector card_index has never had (AC10): a health check
 * that only confirms "the meta/chunk documents exist" cannot see a chunk
 * whose `entries` array was silently emptied, which is precisely the
 * TASK-208/TASK-238 failure mode. This function instead recomputes, from
 * the same identity rule `buildPublicIndex` uses, exactly where every real
 * card should be, and diffs that against what is actually there — so an
 * emptied-but-present index shows up as `missing` covering every card in
 * the account (and also flips `indexEmptied`, see below), not as "index
 * looks fine, no document is missing at its path".
 *
 * @param {Object<number, {id: number, entries: object[]}>|Array<{id: number,
 *   entries: object[]}>} currentChunks the chunk documents as currently
 *   stored, keyed (or indexed) by chunk id. Pass whatever chunk documents
 *   actually exist at the index's current chunk paths — including ones
 *   whose `entries` array is empty.
 * @param {{totalChunks: number}|null|undefined} currentMeta the index's
 *   current meta document, or null/undefined if no meta document exists at
 *   all (treated as "no index" — every real card is `missing`, and
 *   `totalChunksMismatch` is set because there is nothing to match).
 * @param {Array<object>} publicCardDocs the seller's real public_cards
 *   documents right now (same shape `buildPublicIndex` takes).
 * @param {{chunkTargetSize?: number}} [options]
 * @returns {{
 *   isDivergent: boolean,
 *   missing: Array<{cardId: string, scryfallId: string, expectedChunk: number}>,
 *   orphaned: Array<{cardId: string, scryfallId: string, actualChunk: number}>,
 *   misplaced: Array<{cardId: string, scryfallId: string, actualChunk: number, expectedChunk: number}>,
 *   totalChunksMismatch: boolean,
 *   metaTotalChunks: number|null,
 *   desiredTotalChunks: number,
 *   chunksPresentCount: number,
 *   indexEmptied: boolean,
 * }}
 */
function diagnosePublicIndex(currentChunks, currentMeta, publicCardDocs, options = {}) {
  const docs = Array.isArray(publicCardDocs) ? publicCardDocs : [];
  const chunkTargetSize = options.chunkTargetSize || DEFAULT_CHUNK_TARGET_SIZE;
  const desiredTotalChunks = nextPowerOfTwo(requestedChunkCount(docs.length, chunkTargetSize));
  const metaTotalChunks =
    currentMeta && Number.isFinite(currentMeta.totalChunks) ? currentMeta.totalChunks : null;

  // Normalize currentChunks (object-keyed or array) into a flat list of
  // { chunkId, entries }.
  const chunkList = [];
  if (currentChunks) {
    const iterable = Array.isArray(currentChunks) ? currentChunks : Object.values(currentChunks);
    for (const chunk of iterable) {
      if (!chunk) continue;
      const chunkId = Number.isFinite(chunk.id) ? chunk.id : chunkList.length;
      chunkList.push({ chunkId, entries: Array.isArray(chunk.entries) ? chunk.entries : [] });
    }
  }
  const chunksPresentCount = chunkList.length;

  // The rule used to decide whether entries can still be trusted against
  // `metaTotalChunks`: only when the bucket space itself (meta + presence
  // of every chunk 0..totalChunks-1) already matches what a fresh build of
  // the CURRENT public_cards wants. Any mismatch here means "expected
  // chunk" cannot be meaningfully computed under the STORED totalChunks
  // without also being wrong the moment a rebuild lands, so we force a
  // full rebuild rather than report per-entry misplacement against a
  // bucket space that's already known to be stale.
  const totalChunksMismatch =
    metaTotalChunks === null ||
    metaTotalChunks !== desiredTotalChunks ||
    chunksPresentCount !== metaTotalChunks;

  const effectiveTotalChunks = totalChunksMismatch ? desiredTotalChunks : metaTotalChunks;

  // Build the actual index: cardId (`i`) -> { scryfallId, actualChunk }.
  const actualById = new Map();
  let actualEntryCount = 0;
  for (const { chunkId, entries } of chunkList) {
    for (const entry of entries) {
      actualEntryCount += 1;
      const cardId = entry && entry.i;
      if (!cardId) continue; // malformed entry, not this function's concern
      actualById.set(cardId, { scryfallId: entry.s || '', actualChunk: chunkId });
    }
  }

  // Build the expected index from the real public_cards documents, always
  // against `effectiveTotalChunks` so missing/misplaced stay meaningful
  // even when totalChunksMismatch is true (the rebuild plan still wants to
  // know exactly which cards exist).
  const expectedById = new Map();
  for (const doc of docs) {
    const cardId = doc && doc.cardId;
    if (!cardId) continue;
    const scryfallId = (doc && doc.scryfallId) || '';
    const expectedChunk = publicChunkId(scryfallId, effectiveTotalChunks);
    expectedById.set(cardId, { scryfallId, expectedChunk });
  }

  const missing = [];
  const misplaced = [];
  for (const [cardId, expected] of expectedById) {
    const actual = actualById.get(cardId);
    if (!actual) {
      missing.push({ cardId, scryfallId: expected.scryfallId, expectedChunk: expected.expectedChunk });
    } else if (actual.actualChunk !== expected.expectedChunk) {
      misplaced.push({
        cardId,
        scryfallId: expected.scryfallId,
        actualChunk: actual.actualChunk,
        expectedChunk: expected.expectedChunk,
      });
    }
  }

  // Restos (measured in production: ~1,093 of them) — present in the index,
  // no longer backed by a real public_cards document.
  const orphaned = [];
  for (const [cardId, actual] of actualById) {
    if (!expectedById.has(cardId)) {
      orphaned.push({ cardId, scryfallId: actual.scryfallId, actualChunk: actual.actualChunk });
    }
  }

  // Dedicated flag (on top of `missing` already covering this case): chunk
  // documents are present at the index's own paths, meta claims cards
  // exist, but every entries array actually came back empty. This is the
  // exact "index vaciado" shape from TASK-208/TASK-238 — spelled out
  // explicitly rather than left for a caller to infer from `missing.length
  // === docs.length`, which is also true (harmlessly) whenever the account
  // itself has zero cards.
  const indexEmptied = chunksPresentCount > 0 && actualEntryCount === 0 && docs.length > 0;

  const isDivergent =
    missing.length > 0 || orphaned.length > 0 || misplaced.length > 0 || totalChunksMismatch;

  return {
    isDivergent,
    missing,
    orphaned,
    misplaced,
    totalChunksMismatch,
    metaTotalChunks,
    desiredTotalChunks,
    chunksPresentCount,
    indexEmptied,
  };
}

/**
 * Turns a diagnosis into a plan of WRITES — data describing what should be
 * written where, never an effect. Tanda 2b executes the plan against
 * Firestore; this function only decides its shape.
 *
 * @param {ReturnType<typeof diagnosePublicIndex>} diagnosis
 * @param {ReturnType<typeof buildPublicIndex>} freshBuild the result of
 *   calling `buildPublicIndex` on the SAME public_cards documents (and the
 *   matching scryfall_cache lookup) the diagnosis was computed against.
 *   Used both as the source of correct entries for an incremental repair
 *   and as the entire payload when a full rebuild is required.
 * @returns {{
 *   rebuildRequired: boolean,
 *   reason: string,
 *   chunksToWrite: Object<number, {id: number, entries: object[]}>,
 *   meta: {schemaVersion: number, totalChunks: number, count: number, chunkTargetSize: number},
 * }}
 */
function planPublicIndexReconciliation(diagnosis, freshBuild) {
  // Bucket space itself is wrong (or unknown) — see header: a per-chunk
  // patch under a stale totalChunks is the exact "two writers disagree on
  // where a card belongs" bug this module exists to prevent. The only
  // correct plan is every chunk of a fresh build, written atomically.
  if (diagnosis.totalChunksMismatch) {
    return {
      rebuildRequired: true,
      reason:
        `full rebuild required: index totalChunks (${diagnosis.metaTotalChunks}) does not match ` +
        `what the current public_cards count wants (${diagnosis.desiredTotalChunks}), or the chunk ` +
        `documents actually present (${diagnosis.chunksPresentCount}) do not match the meta — an ` +
        'incremental patch cannot change bucket space without remapping the whole index (AC10 contract)',
      chunksToWrite: freshBuild.chunks,
      meta: freshBuild.meta,
    };
  }

  // Bucket space agrees — only the specific chunks touched by a missing,
  // orphaned, or misplaced entry need to be rewritten. Every other chunk is
  // already correct and is left out of the plan entirely.
  const affectedChunkIds = new Set();
  for (const m of diagnosis.missing) affectedChunkIds.add(m.expectedChunk);
  for (const o of diagnosis.orphaned) affectedChunkIds.add(o.actualChunk);
  for (const mp of diagnosis.misplaced) {
    affectedChunkIds.add(mp.expectedChunk);
    affectedChunkIds.add(mp.actualChunk);
  }

  const chunksToWrite = {};
  for (const chunkId of affectedChunkIds) {
    // The correct content for an affected chunk is exactly what a fresh
    // build says belongs there — this doubles as the fix for `missing`
    // (the card is now present) and `misplaced` (the card's old chunk no
    // longer contains it, its new chunk does) and `orphaned` (the stale
    // entry is absent from the fresh build's version of that chunk).
    chunksToWrite[chunkId] = freshBuild.chunks[chunkId] || { id: chunkId, entries: [] };
  }

  return {
    rebuildRequired: false,
    reason:
      affectedChunkIds.size === 0
        ? 'index already matches public_cards — no writes needed'
        : `incremental repair of ${affectedChunkIds.size} chunk(s): ` +
          `${diagnosis.missing.length} missing, ${diagnosis.orphaned.length} orphaned, ` +
          `${diagnosis.misplaced.length} misplaced`,
    chunksToWrite,
    meta: freshBuild.meta,
  };
}

module.exports = {
  buildPublicIndex,
  diagnosePublicIndex,
  planPublicIndexReconciliation,
  requestedChunkCount,
  DEFAULT_CHUNK_TARGET_SIZE,
};
