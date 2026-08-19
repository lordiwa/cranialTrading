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
 * state before the rebuild started — never worse, never a state with FEWER
 * live cards visible than actually exist:
 *
 *   1. chunksToWrite FIRST, in size/op-bounded batches. Until every batch in
 *      this phase commits, the index's meta document still advertises the
 *      OLD totalChunks — a reader (tanda 3's query function) keeps reading
 *      the OLD chunk range, which mid-phase may now contain a MIX of
 *      already-rewritten NEW-scheme chunks and not-yet-touched OLD-scheme
 *      chunks. That mix can show a stale/orphaned card an extra moment, or
 *      (for a misplaced card) briefly show the SAME card twice — never
 *      FEWER cards than the healthy old index had. A crash anywhere in this
 *      phase leaves that same safe, merely-stale-not-wrong state; the next
 *      diagnose/reconcile pass (this is a converging fixed point, not a
 *      one-shot operation — see publicCardIndex.js's header) picks up
 *      exactly where it left off, because chunksToWrite content is
 *      recomputed fresh from public_cards each run, not diffed against what
 *      was already written.
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
 * the one outcome this ordering exists to rule out.
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
 * Not exact (Firestore's own wire encoding has overhead a JSON byte count
 * doesn't capture — see BATCH_MAX_BYTES headroom above), but conservative
 * enough to keep every produced batch well clear of the real 10 MiB
 * ceiling: `JSON.stringify` is always <= the encoded Firestore payload
 * would be for the same compact numeric/string-only entry shape
 * (publicCardEntry.js's `n`/`nl`/`s`/etc keys), and a delete carries no
 * payload of its own worth estimating beyond a small constant for the
 * document path.
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

module.exports = {
  BATCH_MAX_OPS,
  BATCH_MAX_BYTES,
  estimateOpBytes,
  chunkOpsIntoBatches,
  planFirestoreBatches,
  chooseApplyStrategy,
};
