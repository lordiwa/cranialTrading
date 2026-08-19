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
 * REVIEW ROUND (fresh-context reviewer, reproduced against the 6,647 real
 * public_cards documents of the production profile — 2 HIGH, both real):
 *
 * HIGH-1 (fixed): the detector was BLIND to duplicate entries. `actualById`
 * used to be a Map keyed by cardId, so a second stale copy of the same card
 * sitting in a different chunk silently OVERWROTE the first in the map and
 * vanished from the analysis — measured: 6,648 entries against 6,647 real
 * cards (one duplicate), and the old code reported `isDivergent: false`
 * with the plan saying "index already matches public_cards — no writes
 * needed". A duplicated index, certified healthy, forever. This is the
 * exact self-duplication failure mode card_index already has its own
 * memory entry for. Fixed: `actualByCardId` now maps cardId -> an ARRAY of
 * occurrences, so a duplicate is visible as `occurrences.length > 1` rather
 * than being overwritten. A new `duplicated` diagnosis category reports
 * every duplicated cardId with all the chunk ids it was found in;
 * `planPublicIndexReconciliation` rewrites every one of those chunks (the
 * fresh build only ever places a card in ONE chunk, so rewriting all of
 * them converges the count back to 1).
 *
 * HIGH-2 (fixed): a full rebuild plan had no way to represent DELETION, so
 * a seller who shrank their account (fewer cards -> fewer chunks) never
 * converged. Measured: 32-chunk index, seller drops to 8 cards -> desired
 * shrinks to 8 chunks -> the old plan wrote chunks 0-7 and left chunks 8-31
 * sitting at their old paths untouched. Re-diagnosing the "repaired" state
 * still showed `isDivergent: true` (chunksPresentCount 32 != metaTotalChunks
 * 8) — every future reconciliation pass would keep calling for a full
 * rebuild, forever, without ever reaching a healthy state. This direction
 * matters because it is NOT hypothetical for this project: the ~1,093
 * orphaned restos measured in production exist precisely because cards that
 * stopped being for sale were never cleaned out of anything. Fixed: a full
 * rebuild plan now also carries `chunksToDelete` — every chunk id currently
 * present that falls OUTSIDE the new index's [0, totalChunks) range. The
 * 2b caller MUST delete those chunk documents (or, equivalently, delete the
 * entire chunks subcollection before writing chunksToWrite) — this is now a
 * contract anchored by the 'shrink: ... converges' test below, not an
 * assumption left for 2b to guess. Writing chunksToWrite alone, with
 * chunksToDelete ignored, reproduces the exact non-convergent loop measured
 * above — also locked by a dedicated regression test.
 *
 * MEDIUM fixes (fresh-context reviewer, mutation-tested — all 5 survivors
 * killed):
 *
 * MED-1: the bucket-space check used to compare only chunk COUNT against
 * meta.totalChunks, not that the chunk ids actually present are exactly
 * `0..totalChunks-1`. Four chunk documents at ids {0,1,2,7} with
 * meta.totalChunks=4 used to pass (count matches) while the id set is
 * wrong. Fixed: `totalChunksMismatch` now also requires every present
 * chunk id, sorted, to equal its own index (0,1,2,...) — any gap or
 * out-of-range id forces a mismatch.
 * MED-2: a chunk document with a non-numeric `id` field used to fall back
 * to its POSITION in the iteration order (`chunkList.length`) — a
 * positional fallback inside the module whose entire point is to not be
 * positional. Fixed: a chunk with a non-finite `id` is now excluded from
 * `chunkList` entirely (its cards read as `missing`, the safe direction)
 * and unconditionally forces `totalChunksMismatch: true` via
 * `hasMalformedChunkId` — a structurally corrupt chunk can never be
 * silently absorbed into an "everything's fine, incremental repair" plan.
 * MED-3: the misplaced- and orphaned-repair write paths had no dedicated
 * test locking that the OLD (wrong) chunk actually loses the stale copy —
 * see 'misplaced repair actually removes the stale copy from its old
 * chunk' and 'orphaned repair actually removes the stale entry from its
 * chunk' below. Orphaned repair matters most in practice: it is the path
 * that runs against the ~1,093 measured restos.
 * MED-4: no test covered `isDivergent: true` from `totalChunksMismatch`
 * ALONE, with zero per-entry diffs (e.g. an account emptied to 0 cards
 * while stale meta still claims 4 chunks) — see 'flags divergence from
 * totalChunksMismatch alone...' below.
 * MED-5: no test asserted `plan.meta` on the incremental branch — a
 * regression that made 2b persist a wrong meta on an otherwise-correct
 * incremental repair would have gone undetected. Locked below.
 *
 * LOW fixes: `chunkTargetSize` <= 0 (in particular a NEGATIVE value, which
 * is truthy and used to slip past `|| DEFAULT_CHUNK_TARGET_SIZE`) now
 * normalizes to the default instead of reaching `nextPowerOfTwo` with a
 * misleading downstream error. `diagnosePublicIndex` also now falls back to
 * `currentMeta.chunkTargetSize` when the caller doesn't pass an explicit
 * `options.chunkTargetSize` — the earlier version silently used the
 * DEFAULT regardless of what the index was actually built with, which
 * would have put a seller diagnosed under a different chunkTargetSize than
 * the one live in their meta into a perpetual rebuild loop the moment the
 * two constants diverged (e.g. a future tanda changing the default).
 *
 * SECOND REVIEW ROUND (fresh-context reviewer, 0 HIGH — the HIGH-2 guard
 * was mutation-confirmed to hold in all 4 directions the reviewer tried):
 *
 * MEDIUM-2 (fixed, the important one — the reviewer reproduced it): the
 * LOW fix above made `diagnosePublicIndex` and `buildPublicIndex` resolve
 * `chunkTargetSize` through DIFFERENT fallback paths when a caller omits
 * `options.chunkTargetSize` from both — `diagnosePublicIndex` now falls
 * back to `currentMeta.chunkTargetSize`, but `buildPublicIndex` has no meta
 * to fall back to and silently uses the module DEFAULT (400). Measured
 * repro: a 4-chunk index built at chunkTargetSize 2, one new card to index.
 * `diagnosePublicIndex(chunks, meta, docs)` (no options) correctly falls
 * back to `meta.chunkTargetSize = 2` and reports `totalChunksMismatch:
 * false` (an incremental repair). But `buildPublicIndex(docs, cache)` (no
 * options, called by 2b to produce the `freshBuild` the plan is built
 * from) has no meta and silently resolves to the DEFAULT, giving
 * `freshBuild.meta.totalChunks = 1` — a completely different bucket space
 * than the one the diagnosis just validated. The incremental branch's
 * `freshBuild.chunks[chunkId] || { id: chunkId, entries: [] }` fallback
 * then writes an EMPTY chunk for the one chunk id being repaired (chunk
 * id 3 doesn't exist in a 1-chunk freshBuild), deleting 2 live cards that
 * were previously in that chunk while reporting `rebuildRequired: false`.
 * Fixed: the incremental branch now hard-checks `freshBuild.meta.totalChunks
 * === diagnosis.metaTotalChunks` and THROWS if they disagree — a caller
 * mismatch here is a real bug (the two functions were fed different
 * chunkTargetSize), and a loud error is safer than a plan that looks
 * successful while quietly dropping cards. The contract, restated for 2b:
 * always call `buildPublicIndex` for `freshBuild` with the SAME
 * chunkTargetSize the diagnosis resolved (pass `options.chunkTargetSize`
 * explicitly to both, or read it back off `currentMeta.chunkTargetSize`
 * before calling `buildPublicIndex`).
 *
 * MEDIUM-1 (fixed): `chunksToDelete` used a plain `id >= totalChunks`
 * filter, which does not catch a NEGATIVE or FRACTIONAL chunk id (both are
 * numerically less than any reasonable totalChunks, so they'd slip through
 * and stay behind forever — the exact non-convergence shape of HIGH-2, with
 * a different kind of bad id as the input). Fixed: the filter is now
 * `!Number.isInteger(id) || id < 0 || id >= totalChunks` — anything that
 * isn't a valid chunk id in the new range gets scheduled for deletion, not
 * just anything numerically too large. `hasMalformedChunkId` (a
 * non-numeric `id` field entirely, MED-2) is also now exposed on the
 * diagnosis return value — the earlier version computed it internally but
 * never surfaced it, leaving 2b with no signal that some chunk needs
 * handling outside the normal chunksToWrite/chunksToDelete lists (e.g. by
 * deleting the whole chunks subcollection instead of relying on exact ids).
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
 * plan of WRITES (and, since the review round, DELETES) — never performs
 * them. The dividing line between an incremental patch and a full rebuild
 * is the `totalChunks` CONTRACT publicCardEntry.js already fixed in tanda
 * 1: `totalChunks` may only change via a full atomic rebuild, never be
 * derived per-write. So:
 *
 *   - Incremental repair (rebuildRequired: false) is chosen whenever the
 *     current index's own bucket space (its meta's `totalChunks`, and the
 *     EXACT set of chunk documents actually present) still matches what a
 *     fresh build of the CURRENT public_cards would want. In that case
 *     only the specific chunks touched by a missing, orphaned, misplaced,
 *     or duplicated entry need to be rewritten — every other chunk is
 *     already correct and is left untouched. `chunksToDelete` is always
 *     empty on this branch — a bucket-space match means there is nothing
 *     outside the valid chunk range to remove.
 *   - Full rebuild (rebuildRequired: true) is forced whenever the bucket
 *     space itself is wrong: the persisted `totalChunks` no longer matches
 *     what the current card count wants (the seller grew/shrank across a
 *     power-of-two boundary), the chunk documents actually present don't
 *     match what the meta claims (missing, extra, or out-of-range chunk
 *     ids), or a chunk document is structurally corrupt (MED-2). Patching
 *     individual chunks in that state is exactly the bug this module
 *     exists to prevent: an incremental writer using the OLD totalChunks
 *     and a background reconciler computing chunk ids under a NEW
 *     totalChunks would disagree about where any given card belongs, which
 *     is "the index loses entries" wearing a reconciliation bug instead of
 *     a hash bug. On this branch, `chunksToWrite` is every chunk 0..N-1 of
 *     a fresh build, and `chunksToDelete` is every currently-present chunk
 *     id that falls outside that range (HIGH-2) — both must be applied for
 *     the index to actually converge; applying `chunksToWrite` alone
 *     reproduces the shrink bug this review round found.
 */

const { buildPublicEntry, publicChunkId, nextPowerOfTwo } = require('./publicCardEntry');

// See header: kept equal to the "~400 cards/chunk" sizing already assumed by
// publicCardEntry.js's own documented cost analysis.
const DEFAULT_CHUNK_TARGET_SIZE = 400;
const SCHEMA_VERSION = 1;

/**
 * LOW fix: normalizes a requested chunkTargetSize, falling back to the
 * default for anything that isn't a positive finite number — in
 * particular a NEGATIVE value, which is truthy and used to slip past a
 * plain `value || DEFAULT_CHUNK_TARGET_SIZE` check and reach
 * `nextPowerOfTwo` with a confusing downstream error instead of a clear
 * fallback.
 *
 * @param {*} value
 */
function normalizeChunkTargetSize(value) {
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_CHUNK_TARGET_SIZE;
}

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
  return Math.ceil(count / normalizeChunkTargetSize(chunkTargetSize));
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
  const chunkTargetSize = normalizeChunkTargetSize(options.chunkTargetSize);
  const totalChunks = nextPowerOfTwo(requestedChunkCount(docs.length, chunkTargetSize));

  const chunks = {};
  for (let id = 0; id < totalChunks; id++) {
    // `tc` (TASK-247 tanda 3, mitigation A): the totalChunks this chunk was
    // WRITTEN under. publicCardIndexExecutor.js's header documents that
    // while the index GROWS (say 16 -> 32), step 1 overwrites old chunks
    // 0..15 with new-scheme content while `_meta` — live throughout step 1
    // — still advertises 16, so a reader trusting `_meta` sees roughly HALF
    // the seller's cards, and a crash mid-step-1 pins that state until the
    // next reconciliation pass, which nothing schedules automatically. That
    // is TASK-247's own bug with a new cause, and `_meta` alone cannot
    // reveal it. A chunk whose `tc` disagrees with `_meta.totalChunks`
    // proves the two are from different generations — detectable by pure
    // reads, with no transaction, lease or coordination, for ~20 bytes per
    // chunk document (32 of them on the production profile). The reader
    // side is functions/lib/publicCardIndexQuery.js's
    // detectGenerationMismatch; it answers `partial: true` with no `total`
    // rather than reporting a number that might be half the truth.
    //
    // This is mitigation A (DETECT). Mitigation B (double-buffer each
    // generation under its own document ids so the window never exists at
    // all) is a change to the write layer and is deliberately NOT in this
    // tanda; A stays useful as a safety net even after B ships.
    chunks[id] = { id, entries: [], tc: totalChunks };
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
 * @param {{totalChunks: number, chunkTargetSize?: number}|null|undefined}
 *   currentMeta the index's current meta document, or null/undefined if no
 *   meta document exists at all (treated as "no index" — every real card
 *   is `missing`, and `totalChunksMismatch` is set because there is
 *   nothing to match). When `options.chunkTargetSize` is not given, this
 *   function falls back to `currentMeta.chunkTargetSize` (the size the
 *   index was actually built with) before falling back to the module
 *   default — see LOW fix in the header.
 * @param {Array<object>} publicCardDocs the seller's real public_cards
 *   documents right now (same shape `buildPublicIndex` takes).
 * @param {{chunkTargetSize?: number}} [options]
 * @returns {{
 *   isDivergent: boolean,
 *   missing: Array<{cardId: string, scryfallId: string, expectedChunk: number}>,
 *   orphaned: Array<{cardId: string, scryfallId: string, actualChunk: number}>,
 *   misplaced: Array<{cardId: string, scryfallId: string, actualChunk: number, expectedChunk: number}>,
 *   duplicated: Array<{cardId: string, scryfallId: string, expectedChunk: number, chunks: number[]}>,
 *   totalChunksMismatch: boolean,
 *   metaTotalChunks: number|null,
 *   desiredTotalChunks: number,
 *   chunksPresentCount: number,
 *   presentChunkIds: number[],
 *   hasMalformedChunkId: boolean,
 *   indexEmptied: boolean,
 * }}
 */
function diagnosePublicIndex(currentChunks, currentMeta, publicCardDocs, options = {}) {
  const docs = Array.isArray(publicCardDocs) ? publicCardDocs : [];
  const chunkTargetSize = normalizeChunkTargetSize(
    options.chunkTargetSize ?? (currentMeta && currentMeta.chunkTargetSize)
  );
  const desiredTotalChunks = nextPowerOfTwo(requestedChunkCount(docs.length, chunkTargetSize));
  const metaTotalChunks =
    currentMeta && Number.isFinite(currentMeta.totalChunks) ? currentMeta.totalChunks : null;

  // Normalize currentChunks (object-keyed or array) into a flat list of
  // { chunkId, entries }. MED-2: a chunk whose `id` field is not a finite
  // number is EXCLUDED here rather than given a positional fallback id —
  // this module exists to stop chunk identity from ever being inferred
  // from iteration order, including here in the reader. Its cards read as
  // `missing` below (the safe direction), and `hasMalformedChunkId` forces
  // a full rebuild regardless of what the count/id-set checks conclude.
  const chunkList = [];
  let hasMalformedChunkId = false;
  if (currentChunks) {
    const iterable = Array.isArray(currentChunks) ? currentChunks : Object.values(currentChunks);
    for (const chunk of iterable) {
      if (!chunk) continue;
      if (!Number.isFinite(chunk.id)) {
        hasMalformedChunkId = true;
        continue;
      }
      chunkList.push({ chunkId: chunk.id, entries: Array.isArray(chunk.entries) ? chunk.entries : [] });
    }
  }
  const presentChunkIds = chunkList.map((c) => c.chunkId).sort((a, b) => a - b);
  const chunksPresentCount = presentChunkIds.length;

  // MED-1: the bucket space only truly "matches" when the present chunk
  // ids are EXACTLY {0, 1, ..., metaTotalChunks-1} — matching COUNT alone
  // (e.g. 4 chunks present at ids {0,1,2,7} against meta.totalChunks=4)
  // used to pass this check while the id set itself was wrong.
  const chunkIdsMatchMeta =
    metaTotalChunks !== null &&
    chunksPresentCount === metaTotalChunks &&
    presentChunkIds.every((id, idx) => id === idx);

  // The rule used to decide whether entries can still be trusted against
  // `metaTotalChunks`: only when the bucket space itself (meta + the exact
  // set of chunks 0..totalChunks-1) already matches what a fresh build of
  // the CURRENT public_cards wants, AND no chunk document is structurally
  // corrupt. Any mismatch here means "expected chunk" cannot be
  // meaningfully computed under the STORED totalChunks without also being
  // wrong the moment a rebuild lands, so we force a full rebuild rather
  // than report per-entry misplacement against a bucket space that's
  // already known to be stale.
  const totalChunksMismatch =
    metaTotalChunks === null ||
    metaTotalChunks !== desiredTotalChunks ||
    !chunkIdsMatchMeta ||
    hasMalformedChunkId;

  const effectiveTotalChunks = totalChunksMismatch ? desiredTotalChunks : metaTotalChunks;

  // Build the actual index: cardId (`i`) -> ARRAY of occurrences. HIGH-1:
  // this used to be cardId -> single occurrence, which let a second
  // (stale) copy of a card silently overwrite the first and vanish from
  // the diagnosis entirely — measured, a real duplicate in production data
  // was invisible to the old code. Every occurrence is now kept.
  const actualByCardId = new Map();
  let actualEntryCount = 0;
  for (const { chunkId, entries } of chunkList) {
    for (const entry of entries) {
      actualEntryCount += 1;
      const cardId = entry && entry.i;
      if (!cardId) continue; // malformed entry, not this function's concern
      if (!actualByCardId.has(cardId)) actualByCardId.set(cardId, []);
      actualByCardId.get(cardId).push({ chunkId, scryfallId: entry.s || '' });
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
  const duplicated = [];
  for (const [cardId, expected] of expectedById) {
    const occurrences = actualByCardId.get(cardId);
    if (!occurrences || occurrences.length === 0) {
      missing.push({ cardId, scryfallId: expected.scryfallId, expectedChunk: expected.expectedChunk });
    } else if (occurrences.length > 1) {
      // HIGH-1: reported as its own category rather than silently folded
      // into `misplaced` (which occurrence would even be "the" actual
      // chunk?) or lost like the pre-fix Map overwrite did.
      duplicated.push({
        cardId,
        scryfallId: expected.scryfallId,
        expectedChunk: expected.expectedChunk,
        chunks: occurrences.map((o) => o.chunkId),
      });
    } else if (occurrences[0].chunkId !== expected.expectedChunk) {
      misplaced.push({
        cardId,
        scryfallId: expected.scryfallId,
        actualChunk: occurrences[0].chunkId,
        expectedChunk: expected.expectedChunk,
      });
    }
  }

  // Restos (measured in production: ~1,093 of them) — present in the index,
  // no longer backed by a real public_cards document. A card that is BOTH
  // orphaned and duplicated (multiple stale copies of a deleted card)
  // reports one orphaned entry per surviving occurrence — every one of
  // those chunks still needs to be rewritten to actually converge.
  const orphaned = [];
  for (const [cardId, occurrences] of actualByCardId) {
    if (expectedById.has(cardId)) continue;
    for (const occurrence of occurrences) {
      orphaned.push({ cardId, scryfallId: occurrence.scryfallId, actualChunk: occurrence.chunkId });
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
    missing.length > 0 ||
    orphaned.length > 0 ||
    misplaced.length > 0 ||
    duplicated.length > 0 ||
    totalChunksMismatch;

  return {
    isDivergent,
    missing,
    orphaned,
    misplaced,
    duplicated,
    totalChunksMismatch,
    metaTotalChunks,
    desiredTotalChunks,
    chunksPresentCount,
    presentChunkIds,
    hasMalformedChunkId,
    indexEmptied,
  };
}

/**
 * Turns a diagnosis into a plan of WRITES and DELETES — data describing
 * what should change where, never an effect. Tanda 2b executes the plan
 * against Firestore; this function only decides its shape.
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
 *   chunksToDelete: number[],
 *   meta: {schemaVersion: number, totalChunks: number, count: number, chunkTargetSize: number},
 * }}
 */
function planPublicIndexReconciliation(diagnosis, freshBuild) {
  // Bucket space itself is wrong (or unknown) — see header: a per-chunk
  // patch under a stale totalChunks is the exact "two writers disagree on
  // where a card belongs" bug this module exists to prevent. The only
  // correct plan is every chunk of a fresh build, written atomically.
  if (diagnosis.totalChunksMismatch) {
    // HIGH-2: chunks currently present outside the new [0, totalChunks)
    // range are NOT touched by chunksToWrite (which only ever spans
    // 0..totalChunks-1) and must be explicitly deleted, or a shrink never
    // converges — the old plan silently left them behind forever. MED-1:
    // "outside the range" means anything that ISN'T a valid integer id in
    // [0, totalChunks) — a plain `id >= totalChunks` filter let a negative
    // or fractional id slip through (both are numerically small) and stay
    // behind forever, the same non-convergence with a different bad input.
    const chunksToDelete = (diagnosis.presentChunkIds || []).filter(
      (id) => !Number.isInteger(id) || id < 0 || id >= freshBuild.meta.totalChunks
    );
    return {
      rebuildRequired: true,
      reason:
        `full rebuild required: index totalChunks (${diagnosis.metaTotalChunks}) does not match ` +
        `what the current public_cards count wants (${diagnosis.desiredTotalChunks}), or the chunk ` +
        `documents actually present (${diagnosis.chunksPresentCount}) do not match the meta — an ` +
        'incremental patch cannot change bucket space without remapping the whole index (AC10 contract)',
      chunksToWrite: freshBuild.chunks,
      chunksToDelete,
      meta: freshBuild.meta,
    };
  }

  // MEDIUM-2 hard guard: an incremental repair is only safe when `freshBuild`
  // shares the EXACT bucket space the diagnosis just validated. If it
  // doesn't (e.g. `freshBuild` was built with no explicit chunkTargetSize
  // and silently fell back to the module DEFAULT while the diagnosis
  // resolved a different size from currentMeta.chunkTargetSize — see
  // header), the chunksToWrite fallback below would write an EMPTY chunk
  // for whatever id is being repaired, silently dropping every live card
  // that used to be in it. This is a caller bug, not a recoverable
  // reconciliation case — refuse loudly instead of emitting a plan that
  // looks like a successful, small repair.
  if (freshBuild.meta.totalChunks !== diagnosis.metaTotalChunks) {
    throw new Error(
      `planPublicIndexReconciliation: freshBuild.meta.totalChunks (${freshBuild.meta.totalChunks}) does ` +
        `not match the diagnosis's metaTotalChunks (${diagnosis.metaTotalChunks}) even though the ` +
        'diagnosis itself reported totalChunksMismatch: false. freshBuild must be built with the SAME ' +
        'chunkTargetSize the diagnosis resolved (pass options.chunkTargetSize explicitly to both calls, ' +
        'or read it back off currentMeta.chunkTargetSize before calling buildPublicIndex) — otherwise an ' +
        '"incremental repair" plan would write an empty chunk and silently drop live cards.'
    );
  }

  // Bucket space agrees — only the specific chunks touched by a missing,
  // orphaned, misplaced, or duplicated entry need to be rewritten. Every
  // other chunk is already correct and is left out of the plan entirely.
  // Nothing needs deleting on this branch: a bucket-space match means
  // there is no chunk outside the valid range to begin with.
  const affectedChunkIds = new Set();
  for (const m of diagnosis.missing) affectedChunkIds.add(m.expectedChunk);
  for (const o of diagnosis.orphaned) affectedChunkIds.add(o.actualChunk);
  for (const mp of diagnosis.misplaced) {
    affectedChunkIds.add(mp.expectedChunk);
    affectedChunkIds.add(mp.actualChunk);
  }
  for (const d of diagnosis.duplicated) {
    affectedChunkIds.add(d.expectedChunk);
    for (const chunkId of d.chunks) affectedChunkIds.add(chunkId);
  }

  const chunksToWrite = {};
  for (const chunkId of affectedChunkIds) {
    // The correct content for an affected chunk is exactly what a fresh
    // build says belongs there — this doubles as the fix for `missing`
    // (the card is now present), `misplaced` (the card's old chunk no
    // longer contains it, its new chunk does), `orphaned` (the stale entry
    // is absent from the fresh build's version of that chunk), and
    // `duplicated` (the fresh build only ever places the card in ONE
    // chunk, so rewriting every chunk it was found in collapses the count
    // back to exactly 1).
    chunksToWrite[chunkId] = freshBuild.chunks[chunkId] || { id: chunkId, entries: [] };
  }

  return {
    rebuildRequired: false,
    reason:
      affectedChunkIds.size === 0
        ? 'index already matches public_cards — no writes needed'
        : `incremental repair of ${affectedChunkIds.size} chunk(s): ` +
          `${diagnosis.missing.length} missing, ${diagnosis.orphaned.length} orphaned, ` +
          `${diagnosis.misplaced.length} misplaced, ${diagnosis.duplicated.length} duplicated`,
    chunksToWrite,
    chunksToDelete: [],
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
