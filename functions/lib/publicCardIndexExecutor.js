/**
 * publicCardIndexExecutor — the server-side write layer for the
 * public-profile card index (TASK-247 tanda 2b/5). Everything in this
 * module is a PURE function: it decides WHAT to write and how to slice it
 * into Firestore-legal batches, but never touches Firestore itself. The
 * Cloud Function wired in functions/index.js (`reconcilePublicCardIndex`)
 * does the actual reads/writes, following exactly the ordering this module
 * hands back — that wiring is NOT covered by these tests (functions/index.js
 * calls admin.initializeApp() at require() time and has no emulator
 * harness, TASK-236 — see cardIndexEntry.js / publicCardIndex.js for the
 * same constraint on the modules this one builds on).
 *
 * WHY THIS MODULE EXISTS, SEPARATE FROM publicCardIndex.js: that module
 * (tanda 2a) already produces a `plan` — `{ rebuildRequired, chunksToWrite,
 * chunksToDelete, meta }` — describing WHAT should change. It never
 * describes HOW to apply that plan safely: Firestore's writeBatch has a
 * hard 500-operation ceiling and a 10 MiB per-batch payload ceiling (this
 * project has 5 measured failed-deletion incidents from hitting exactly
 * that byte ceiling — project memory, "5 intentos fallidos de borrado").
 * At the target-market ceiling this ticket is sized against (100k cards,
 * project memory "80% tiene 25k+, 30% tiene 100k+"), a full rebuild is 256
 * chunk documents of ~172 KB each (publicCardIndex.js's own CHUNK SIZING
 * math) — 44 MB total, nowhere close to 500 ops, but each individual chunk
 * document is nowhere near a size where operation COUNT is the binding
 * constraint either. Both ceilings are enforced here so neither one is
 * ever the thing a caller discovers by having a batch.commit() reject.
 *
 * ATOMICITY (TASK-247 tanda 2b instruction: "decí con qué orden de
 * escritura queda el estado menos dañino ante un corte a mitad"). Firestore
 * has no cross-document transaction that can span an unbounded number of
 * chunk writes plus deletes plus a meta update, so a full rebuild CANNOT be
 * made atomic across all of it. What this module guarantees instead is a
 * WRITE ORDER whose every intermediate state is at least as good as the
 * state before the rebuild started — for a SHRINK or same-size rebuild,
 * never worse, never a state with FEWER live cards visible than actually
 * exist. A GROW crosses into a bounded, temporary reduced-visibility
 * window instead — see the CORRECTION note below the three steps; it is
 * real, it is not "never fewer", and anything reading this file to design
 * a query layer on top of the index (tanda 3) needs to know that exactly:
 *
 *   1. chunksToWrite FIRST, in size/op-bounded batches. Until every batch in
 *      this phase commits, the index's meta document still advertises the
 *      OLD totalChunks — a reader (tanda 3's query function) keeps reading
 *      the OLD chunk range, which mid-phase may now contain a MIX of
 *      already-rewritten NEW-scheme chunks and not-yet-touched OLD-scheme
 *      chunks.
 *   2. meta LAST of the "make it correct" work, as a single-document write
 *      (single documents are Firestore-atomic on their own). The instant
 *      this commits, readers start trusting the NEW totalChunks and NEW
 *      chunk range — which is only ever flipped live once every document in
 *      that range has already been fully written in step 1. A crash between
 *      steps 1 and 2 just means step 2 runs again next pass; it is
 *      idempotent (same meta payload every time, computed fresh).
 *   3. chunksToDelete LAST of all — pure cleanup of chunk ids that are no
 *      longer in the new meta's range, so by the time this phase runs no
 *      reader can be looking at them (meta already excludes them from the
 *      range it advertises). A crash here just leaves harmless orphaned
 *      chunk documents outside the live range; the next diagnose pass
 *      reports them as `chunksPresentCount` exceeding `metaTotalChunks`
 *      (MED-1 in publicCardIndex.js) and schedules them for deletion again.
 *
 * This order is deliberately WRITE-then-META-then-DELETE, never
 * DELETE-first: deleting old chunks before the new ones (or before meta)
 * are safely live would create a window where a reader honoring the OLD
 * meta range finds documents genuinely MISSING at their expected path —
 * the one outcome this ordering exists to rule out, for shrink AND grow
 * alike.
 *
 * CORRECTION (review round 2, TASK-247 tanda 2b): the claim above used to
 * read "never worse, never a state with FEWER live cards than actually
 * exist" unconditionally. That is TRUE for a shrink or same-bucket-count
 * rebuild (old chunks 0..N-1 all still get overwritten with new content
 * that is a superset-during-transition of what's real, nothing outside
 * that range is touched until step 3), but FALSE for a GROW, which is the
 * common case in practice — adding cards, not removing them. Example
 * measured against this ticket's own numbers: 6,647 cards at
 * chunkTargetSize 400 requests 17 chunks, rounds to 32 (nextPowerOfTwo).
 * Going from an old totalChunks of 16 to a new 32 means step 1 overwrites
 * OLD chunks 0..15 with NEW-scheme content, where each now holds roughly
 * HALF the cards it used to (the other half hashed into the new chunks
 * 16..31, which the OLD meta — still live throughout step 1 — does not
 * advertise at all). A reader honoring `meta.totalChunks = 16` during that
 * window sees roughly HALF the seller's real cards, not a superset, not
 * "never fewer" — genuinely fewer, for the entire duration of step 1. This
 * window closes the instant step 2 (the meta write) commits, and a crash
 * mid-step-1 leaves that reduced-visibility state pinned until the NEXT
 * reconciliation pass repairs it — and there is currently no pass that
 * runs automatically (see MEDIUM-3/lease note below on concurrent runs,
 * and this module's export list — nothing here schedules a retry). The
 * write order chosen is still the right one: changing chunk-bucket space
 * cannot be made atomic by any ordering when a hash-based lookup is
 * involved (a reader has to compute which chunk to open BEFORE it can
 * check whether that chunk's content is "new" or "old" — there is no order
 * that hides a grow's transition from every possible reader). What this
 * order buys is that the window is bounded to step 1's own duration and
 * self-heals on the very next successful reconciliation, not that it
 * doesn't exist.
 *
 * hasMalformedChunkId (see publicCardIndex.js's MED-2/diagnosePublicIndex):
 * a chunk document whose `id` field is not a finite number cannot be named
 * by `chunksToDelete`, which is a list of numeric chunk ids — there is no
 * numeric id to put in that list. `chooseApplyStrategy` surfaces this as
 * its own strategy, 'wipe-subcollection', which functions/index.js must
 * handle by deleting every document currently in the chunks subcollection
 * (by its real Firestore document reference, not by a computed numeric id)
 * before writing chunksToWrite — the only strategy that can actually name
 * and remove a structurally corrupt chunk document.
 */

// Firestore hard ceiling is 500 operations per WriteBatch. Kept as the
// exact limit (not a fraction of it) — operation count is a hard integer
// limit, not a soft budget the way byte size is, so there's nothing to
// leave headroom against.
const BATCH_MAX_OPS = 500;

// Firestore hard ceiling is 10 MiB (10 * 1024 * 1024 bytes) per WriteBatch.
// This project has 5 measured failed-deletion incidents from hitting that
// exact ceiling (project memory: "5 intentos fallidos de borrado"), so a
// safety margin is used instead of the raw limit — 9 MiB leaves ~10%
// headroom for the estimate below being approximate (see estimateOpBytes)
// and for Firestore's own per-write overhead (field paths, document
// metadata) that a plain JSON byte count does not capture exactly.
const BATCH_MAX_BYTES = 9 * 1024 * 1024;

/**
 * Estimates the Firestore payload size of a single write/delete operation.
 * Not exact, and NOT conservative in the sense of "always an overestimate"
 * — the opposite (review round 2 correction): `JSON.stringify` UNDERESTIMATES
 * the real encoded Firestore payload for this compact entry shape.
 * Firestore's wire format spends a fixed ~8 bytes per number field plus the
 * field name length + 1, on top of what a plain JSON byte count charges —
 * for publicCardEntry.js's ~441 B entries (several numeric fields: `q`,
 * `p`, `f`, `cm`, `ca`, plus short key names) that overhead realistically
 * lands around 5-8% of the JSON estimate. BATCH_MAX_BYTES already carries
 * ~10% headroom under Firestore's real 10 MiB ceiling specifically to
 * absorb this — the code doesn't need to change, only this comment, which
 * used to describe the underestimate as if it were a safety margin instead
 * of the thing the margin above exists to cover.
 *
 * @param {{type: 'set'|'delete', data?: object}} op
 * @returns {number} estimated bytes
 */
function estimateOpBytes(op) {
  if (!op || op.type !== 'set') return 64; // delete: path only, no document payload
  try {
    return Buffer.byteLength(JSON.stringify(op.data || {}), 'utf8');
  } catch {
    // Circular or otherwise non-serializable data would fail Firestore's
    // own write anyway — surfacing as "very large" here routes it into its
    // own batch instead of silently underestimating it.
    return BATCH_MAX_BYTES;
  }
}

/**
 * Slices a flat list of Firestore operations into batches, each respecting
 * BOTH the 500-operation ceiling and the byte-size ceiling. A single
 * operation that alone exceeds BATCH_MAX_BYTES is still placed in its own
 * batch rather than dropped or throwing — Firestore's own commit is the
 * authority on whether it actually fits; this function's job is to never
 * needlessly split what doesn't need splitting, not to pre-reject an edge
 * case it can't fully evaluate without Firestore's real wire encoding.
 *
 * @param {Array<{type: 'set'|'delete', ref: *, data?: object}>} ops
 * @returns {Array<Array<{type: 'set'|'delete', ref: *, data?: object}>>}
 */
function chunkOpsIntoBatches(ops) {
  const batches = [];
  let current = [];
  let currentBytes = 0;

  for (const op of ops) {
    const opBytes = estimateOpBytes(op);
    const wouldExceed =
      current.length >= BATCH_MAX_OPS || (current.length > 0 && currentBytes + opBytes > BATCH_MAX_BYTES);
    if (wouldExceed) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(op);
    currentBytes += opBytes;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Turns a reconciliation plan (publicCardIndex.js's
 * `planPublicIndexReconciliation` output) into the three write PHASES
 * described in this module's header — write, then meta, then delete — each
 * already sliced into Firestore-legal batches. Pure: returns descriptions
 * of operations (`{type, chunkId, data}` for writes, `{type, chunkId}` for
 * deletes — no Firestore refs, since this module never imports
 * firebase-admin), never performs them.
 *
 * @param {ReturnType<typeof import('./publicCardIndex').planPublicIndexReconciliation>} plan
 * @returns {{
 *   writeBatches: Array<Array<{type: 'set', chunkId: number, data: object}>>,
 *   metaOp: {type: 'set', data: object},
 *   deleteBatches: Array<Array<{type: 'delete', chunkId: number}>>,
 * }}
 */
function planFirestoreBatches(plan) {
  const chunksToWrite = plan && plan.chunksToWrite ? plan.chunksToWrite : {};
  const chunksToDelete = plan && Array.isArray(plan.chunksToDelete) ? plan.chunksToDelete : [];

  const writeOps = Object.values(chunksToWrite).map((chunk) => ({
    type: 'set',
    chunkId: chunk.id,
    data: chunk,
  }));
  const deleteOps = chunksToDelete.map((chunkId) => ({ type: 'delete', chunkId }));

  return {
    writeBatches: chunkOpsIntoBatches(writeOps),
    metaOp: { type: 'set', data: plan ? plan.meta : undefined },
    deleteBatches: chunkOpsIntoBatches(deleteOps),
  };
}

/**
 * Decides which of three apply strategies functions/index.js's
 * `reconcilePublicCardIndex` must use, given a diagnosis + the plan
 * computed from it. `hasMalformedChunkId` takes priority over everything
 * else the diagnosis reports: a structurally corrupt chunk id can't be
 * named by chunksToDelete (see this module's header), so no amount of
 * "was it actually divergent otherwise" changes that the ONLY way to
 * remove that document is to wipe the whole subcollection by real document
 * reference and rebuild every chunk from scratch.
 *
 * @param {ReturnType<typeof import('./publicCardIndex').planPublicIndexReconciliation>} plan
 * @param {ReturnType<typeof import('./publicCardIndex').diagnosePublicIndex>} diagnosis
 * @returns {'noop'|'incremental'|'rebuild-by-id'|'wipe-subcollection'}
 */
function chooseApplyStrategy(plan, diagnosis) {
  if (diagnosis && diagnosis.hasMalformedChunkId) return 'wipe-subcollection';
  if (!plan || !plan.rebuildRequired) {
    const touchesNothing =
      plan && Object.keys(plan.chunksToWrite || {}).length === 0 && (plan.chunksToDelete || []).length === 0;
    return touchesNothing ? 'noop' : 'incremental';
  }
  return 'rebuild-by-id';
}

/**
 * buildPublicCardsQuerySpec — TASK-247 tanda 2b HIGH fix (measured against
 * production by the orchestrator, not caught by review or by vitest: the
 * first version of this executor read `users/{uid}/public_cards`, a
 * subcollection that DOES NOT EXIST. `public_cards` is a ROOT collection
 * with a `userId` field — measured: `users/<uid>/public_cards` = 0
 * documents, `public_cards` filtered by `where userId` = 6,647 for the
 * same seller. The real subcollections under `users/{uid}` are `binders`,
 * `cardPriceHistory`, `card_index`, `cards`, `matches_eliminados`,
 * `priceHistory` — `public_cards` is not among them. `functions/index.js`
 * already had the correct shape one function away: `buildCardIndex`'s
 * dashboard counter uses `db.collection('public_cards').count()`
 * (root-level) — this executor just didn't follow that same pattern for
 * its own read.
 *
 * WHY THIS FUNCTION EXISTS: the actual Firestore query can't be
 * unit-tested without firebase-admin (functions/index.js's
 * admin.initializeApp() at require() time — same constraint as every other
 * Cloud Function in this file). But WHICH collection and WHICH filter get
 * used is a plain data decision, extracted here so it CAN be locked by a
 * test — this function returns a description of the query, never the
 * query itself, and never touches Firestore. Both functions/index.js and
 * scripts/reconcile-public-card-index.mjs build their real
 * `db.collection(spec.collectionPath).where(spec.whereField, spec.whereOp,
 * spec.whereValue)` from this SAME spec, so there is exactly one place
 * that can go stale about where public_cards actually lives.
 *
 * @param {string} userId
 * @returns {{collectionPath: string, whereField: string, whereOp: '==', whereValue: string}}
 */
function buildPublicCardsQuerySpec(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new Error(`buildPublicCardsQuerySpec: userId must be a non-empty string, got ${JSON.stringify(userId)}`);
  }
  return {
    collectionPath: 'public_cards',
    whereField: 'userId',
    whereOp: '==',
    whereValue: userId,
  };
}

// review round 2 (MEDIUM-1): the reviewer's proposed threshold, kept as
// named constants rather than inlined so the "why 100, why 10%" is one
// place to read and one place to change. Below COLLAPSE_MIN_META_COUNT the
// index is small enough that a proportional check doesn't mean much (a
// 3-card index dropping to 1 is not the same risk shape as a 6,647-card
// index dropping to 1) — the exact-zero behavior from before this fix
// still applies to those, unchanged.
const COLLAPSE_MIN_META_COUNT = 100;
const COLLAPSE_RATIO = 0.1;

/**
 * requiresCollapseConfirmation — the safety guard the query bug above
 * demonstrates this project needs, not just this one bug fixed. ANY
 * executor that can REDUCE a derived copy needs a check for "the source
 * read came back suspiciously, catastrophically small" — a read that comes
 * back far smaller than what the index already believes exists is not
 * strong evidence the seller emptied most of their account, it is at least
 * as likely evidence the read itself is broken (wrong collection, wrong
 * filter, a truncated page, a transient permission/connectivity failure
 * that returns partial results instead of throwing). Applying a
 * full-rebuild plan built from a falsely small read would silently
 * collapse a healthy N-entry index toward nothing — the exact "índice
 * vaciado" failure family (TASK-208/TASK-238) this whole ticket exists to
 * close, reintroduced by the piece meant to repair it.
 *
 * CORRECTION (review round 2, MEDIUM-1): the first version of this guard
 * only checked `docsCount === 0`, so `requiresCollapseConfirmation(1, {
 * count: 6647 })` returned `false` — a truncated read that comes back with
 * exactly 1 document (instead of 0) sailed straight through and would
 * collapse 6,647 entries down to 1 with no guard at all. The asymmetry the
 * reviewer argued for is why this is now a PROPORTIONAL check rather than
 * an exact-zero one: if this guard is ever wrong in the "refuses when it
 * didn't need to" direction, the cost is a stale-but-still-visible index
 * an operator unblocks with an explicit flag; if it's wrong in the
 * "doesn't refuse when it should have" direction, the cost is the silent
 * índice-vaciado failure this ticket exists to close. Those two failure
 * costs are not symmetric, so the guard is deliberately biased toward
 * refusing.
 *
 * FAIL-CLOSED on an unusable `currentMeta.count` (CORRECTION, same round):
 * the first version used `Number.isFinite(currentMeta.count)` to decide
 * whether to even consider confirmation — a non-finite count (a stored
 * string, `Infinity`, `NaN`, from a corrupted meta write) made the check
 * fall straight through to "no confirmation needed", the opposite of safe.
 * Fixed: an unusable count REQUIRES confirmation whenever the caller can
 * show the index still has real entries (`currentEntryCount`, the actual
 * summed `entries.length` across the chunk documents the caller just
 * read — always available to the reconciler, since it already reads every
 * chunk to diagnose). Only when the count is unusable AND no entries are
 * known to exist does this fall through to "nothing to protect".
 *
 * This does not (and cannot, from pure data alone) distinguish a real
 * "the seller removed most/all of their public cards" from a broken read —
 * both look identical from here. It exists to force that distinction to be
 * made EXPLICITLY (a human confirming, or an operator passing an explicit
 * override flag) rather than happening silently as the default path of an
 * otherwise-ordinary reconciliation run.
 *
 * @param {number} docsCount public_cards documents actually read for this seller
 * @param {{count?: number}|null|undefined} currentMeta the index's current meta document
 * @param {number} [currentEntryCount] the actual number of entries currently
 *   found across the index's chunk documents (summed by the caller from the
 *   same read used to build the diagnosis) — only consulted when
 *   `currentMeta.count` itself is not a usable finite number.
 * @returns {boolean} true when applying a rebuild plan as-is would collapse
 *   the index by more than COLLAPSE_RATIO and must be blocked pending
 *   explicit confirmation
 */
function requiresCollapseConfirmation(docsCount, currentMeta, currentEntryCount) {
  if (!currentMeta) return false; // no existing index at all — nothing to collapse
  const metaCount = currentMeta.count;
  if (!Number.isFinite(metaCount)) {
    // Fail-closed: an unusable stored count is treated as "unknown, could
    // be large" whenever the caller can show the index still has entries.
    return Number.isFinite(currentEntryCount) && currentEntryCount > 0;
  }
  if (metaCount < COLLAPSE_MIN_META_COUNT) return false;
  return docsCount < metaCount * COLLAPSE_RATIO;
}

module.exports = {
  BATCH_MAX_OPS,
  BATCH_MAX_BYTES,
  COLLAPSE_MIN_META_COUNT,
  COLLAPSE_RATIO,
  estimateOpBytes,
  chunkOpsIntoBatches,
  planFirestoreBatches,
  chooseApplyStrategy,
  buildPublicCardsQuerySpec,
  requiresCollapseConfirmation,
};
