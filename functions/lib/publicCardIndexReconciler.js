/**
 * publicCardIndexReconciler — the ONE orchestration of TASK-247's
 * public-profile index reconciliation, shared by functions/index.js's
 * `reconcilePublicCardIndex` (self-only onCall) and
 * scripts/reconcile-public-card-index.mjs (the arbitrary-seller
 * administrative path). Review round 2 (MEDIUM-4) found this logic
 * duplicated ~150 lines across those two files — the same HIGH bug this
 * ticket already fixed once (functions/lib/publicCardIndexExecutor.js's
 * buildPublicCardsQuerySpec) had to be patched in TWO places for exactly
 * that reason. This module exists so there is exactly one place doing
 * Firestore reads/writes for this feature; both callers inject their own
 * `db` (each already has its own admin app — functions/index.js's module
 * top-level `admin.initializeApp()`, the script's own `initializeApp()`
 * with `gcloud auth application-default login` credentials) and their own
 * `documentIdOrderBy` sentinel (`admin.firestore.FieldPath.documentId()`
 * vs the ESM `FieldPath.documentId()` — both resolve to the exact same
 * class from the same firebase-admin package underneath, just imported
 * through different entry points for CJS vs ESM callers).
 *
 * NOT covered by vitest, documented explicitly rather than faked with a
 * vacuous assertion: this module does real Firestore reads/writes and
 * needs a live `db`. functions/lib/publicCardIndex.js and
 * functions/lib/publicCardIndexExecutor.js — everything this module
 * DECIDES rather than DOES — already have their own test files covering
 * chunk assembly, divergence diagnosis, plan construction, batch slicing,
 * strategy selection, the query spec, and the collapse guard. This module
 * is the untested wiring those tests exist to make thin enough not to need
 * its own coverage.
 */

const {
  buildPublicIndex,
  diagnosePublicIndex,
  planPublicIndexReconciliation,
  DEFAULT_CHUNK_TARGET_SIZE,
} = require('./publicCardIndex');
const {
  planFirestoreBatches,
  chooseApplyStrategy,
  buildPublicCardsQuerySpec,
  requiresCollapseConfirmation,
} = require('./publicCardIndexExecutor');

// MEDIUM-4: the single definition of which public_cards fields feed
// buildPublicEntry — both callers used to keep their own copy of this
// list, which is exactly the kind of thing that silently drifts (one path
// gains a field the other doesn't, and the two paths build different
// entries for the same card).
const PUBLIC_CARD_FIELDS = [
  'scryfallId', 'cardId', 'cardName', 'cardNameLower', 'quantity', 'price',
  'status', 'foil', 'condition', 'setCode', 'edition', 'updatedAt',
];

const READ_CHUNK = 2000;

// MEDIUM-3: a soft lease on the index's own _meta document, guarding
// against two reconciliations running concurrently for the same seller
// (the onCall has maxInstances 3, and the admin script can run alongside
// it with no coordination). This project already has the precedent for
// this shape of guard (card_index's persist gen-token, project memory) —
// same idea, applied here as a short-lived lease rather than a
// version-compare, because a full generation-token scheme would need every
// reader to understand generations too, which is tanda 3's concern, not
// this one's. A transaction reads _meta, refuses if a lease already looks
// live (younger than RECONCILE_LEASE_STALE_MS), and otherwise stamps its
// own `reconcileLeaseAt`. The plan's own unconditional `metaRef.set(...)`
// at the end of a successful run (see applyPlan below) overwrites the
// WHOLE _meta document with the plan's meta shape — which has no
// `reconcileLeaseAt` field — so a successful run releases the lease simply
// by finishing normally, with no separate release step to forget. A run
// that crashes mid-flight leaves the lease in place until it goes stale
// (RECONCILE_LEASE_STALE_MS), at which point the NEXT reconciliation
// attempt is free to proceed — there is no separate janitor process for
// this, by design: the next attempt IS the cleanup.
const RECONCILE_LEASE_STALE_MS = 10 * 60 * 1000; // 10 minutes

/** Same shape as functions/index.js's fetchScryfallCacheMap for card_index
 * (buildCardIndex/applyCardIndexDelta) — scryfallId -> cache doc data. */
async function fetchScryfallCacheMap(db, scryfallIds) {
  const map = new Map();
  const CACHE_BATCH = 5000;
  for (let i = 0; i < scryfallIds.length; i += CACHE_BATCH) {
    const batch = scryfallIds.slice(i, i + CACHE_BATCH);
    const refs = batch.map((id) => db.collection('scryfall_cache').doc(id));
    if (refs.length === 0) continue;
    // eslint-disable-next-line no-await-in-loop
    const cacheDocs = await db.getAll(...refs);
    for (const cDoc of cacheDocs) {
      if (!cDoc.exists) continue;
      map.set(cDoc.id, cDoc.data());
    }
  }
  return map;
}

/**
 * Acquires (or refuses) the soft lease on `metaRef` — see
 * RECONCILE_LEASE_STALE_MS above. Returns `{ acquired: true }` or
 * `{ acquired: false, leaseAgeMs }`.
 */
async function acquireReconcileLease(db, metaRef) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(metaRef);
    const data = snap.exists ? snap.data() : {};
    const now = Date.now();
    const leaseAt = data.reconcileLeaseAt;
    if (Number.isFinite(leaseAt) && now - leaseAt < RECONCILE_LEASE_STALE_MS) {
      return { acquired: false, leaseAgeMs: now - leaseAt };
    }
    tx.set(metaRef, { ...data, reconcileLeaseAt: now }, { merge: true });
    return { acquired: true };
  });
}

/**
 * reconcilePublicCardIndexForUser — the shared orchestration.
 *
 * @param {object} args
 * @param {FirebaseFirestore.Firestore} args.db
 * @param {string} args.userId
 * @param {*} args.documentIdOrderBy the caller's `FieldPath.documentId()`
 *   sentinel (see module header — same class either import path resolves to)
 * @param {boolean} [args.forceEmptyIndex] override requiresCollapseConfirmation
 *   — only the admin script exposes this; the onCall wrapper never passes it
 * @param {boolean} [args.dryRun] diagnose and plan only, never write
 * @param {(msg: string) => void} [args.log]
 * @param {(msg: string) => void} [args.logError]
 * @returns {Promise<{
 *   refused?: boolean, message?: string,
 *   dryRun?: boolean,
 *   strategy: string, isDivergent: boolean, reason: string,
 *   totalChunks: number, count: number,
 * }>}
 */
async function reconcilePublicCardIndexForUser({
  db,
  userId,
  documentIdOrderBy,
  forceEmptyIndex = false,
  dryRun = false,
  log = () => {},
  logError = () => {},
  // Review round 3 (operability): the self-only onCall caller has NO way
  // to override the collapse guard (forceEmptyIndex is never wired to
  // request.data — see the AUTHORIZATION note in functions/index.js), so
  // telling that caller to "re-run with an explicit override" points at a
  // flag their own path doesn't have. Each caller passes a hint describing
  // ITS OWN actual recovery path; this default only fires if a future
  // caller forgets to pass one, and says so explicitly rather than
  // implying an override exists.
  overrideHint = 'no override is available on this path — check with an operator',
}) {
  // HIGH fix (TASK-247 tanda 2b, measured against production): public_cards
  // is a ROOT collection with a `userId` field, NOT a subcollection of
  // users/{uid}. See buildPublicCardsQuerySpec's own header in
  // publicCardIndexExecutor.js for the full measured detail.
  const querySpec = buildPublicCardsQuerySpec(userId);
  const publicCardsRef = db
    .collection(querySpec.collectionPath)
    .where(querySpec.whereField, querySpec.whereOp, querySpec.whereValue);
  const indexRef = db.collection(`users/${userId}/public_card_index`);
  const metaRef = indexRef.doc('_meta');

  // Phase 1: read every public_cards doc for this seller. orderBy on top of
  // the userId equality filter needs no composite index (a single equality
  // filter plus an order on the document id itself is exempt from
  // Firestore's composite-index requirement).
  const docs = [];
  let lastDoc = null;
  while (true) {
    let query = publicCardsRef.select(...PUBLIC_CARD_FIELDS).orderBy(documentIdOrderBy).limit(READ_CHUNK);
    if (lastDoc) query = query.startAfter(lastDoc);
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await query.get();
    if (snapshot.empty) break;
    for (const doc of snapshot.docs) docs.push(doc.data());
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.docs.length < READ_CHUNK) break;
  }

  // Phase 2: scryfall_cache join (AC9).
  const uniqueScryfallIds = [...new Set(docs.map((d) => d.scryfallId).filter(Boolean))];
  const scryfallCacheMap = await fetchScryfallCacheMap(db, uniqueScryfallIds);
  const cacheByScryfallId = {};
  for (const [scryfallId, cacheDoc] of scryfallCacheMap) cacheByScryfallId[scryfallId] = cacheDoc;

  // Phase 3: read the existing index (chunks + meta) as it currently
  // stands in Firestore.
  const [chunkSnapshot, metaSnapshot] = await Promise.all([indexRef.get(), metaRef.get()]);
  const currentChunks = [];
  let currentEntryCount = 0;
  for (const doc of chunkSnapshot.docs) {
    if (doc.id === '_meta') continue;
    const data = doc.data();
    // MEDIUM-5 fix (review round 2): a chunk document whose declared `id`
    // field doesn't match its OWN Firestore document path (e.g. a doc at
    // path "07" with `id: 7`) can never be repaired by chunksToDelete (a
    // list of NUMBERS, not paths) — diagnosePublicIndex would see a finite
    // `id: 7`, consider it well-formed, and the plan would target path "7"
    // while "07" sits untouched forever, permanently divergent. Fixed at
    // this exact boundary — between the Firestore read and the pure
    // diagnosis — by comparing the document's OWN path (`doc.id`, a
    // string) against `String(data.id)` and, on any mismatch, overriding
    // the id to a non-finite value before handing it to diagnosePublicIndex.
    // That routes it straight into publicCardIndex.js's OWN existing
    // hasMalformedChunkId path (MED-2 there) without needing to touch that
    // module at all: the chunk is excluded from chunkList (its cards read
    // as `missing`, the safe direction) and hasMalformedChunkId flips true,
    // which chooseApplyStrategy already turns into 'wipe-subcollection' —
    // and the wipe phase below finds "07" via listDocuments() and deletes
    // it by its REAL path, the only way to actually remove it.
    const pathMatchesDeclaredId = Number.isFinite(data.id) && String(data.id) === doc.id;
    currentChunks.push(pathMatchesDeclaredId ? data : { ...data, id: NaN });
    if (Array.isArray(data.entries)) currentEntryCount += data.entries.length;
  }
  const currentMeta = metaSnapshot.exists ? metaSnapshot.data() : null;

  // SAFETY GUARD (TASK-247 tanda 2b, proportional as of review round 2 —
  // see requiresCollapseConfirmation's own header for the full reasoning).
  if (requiresCollapseConfirmation(docs.length, currentMeta, currentEntryCount) && !forceEmptyIndex) {
    const message =
      `reconcilePublicCardIndex refused for user ${userId}: read ${docs.length} public_cards document(s) ` +
      `but the existing index still reports ${currentMeta && currentMeta.count} entries (${currentEntryCount} ` +
      'actual entries found across its chunks). Applying a rebuild as-is would collapse a much larger index ' +
      'toward nothing — this is refused by default rather than applied silently. If the seller genuinely ' +
      `removed most/all of their public cards: ${overrideHint}`;
    logError(`[reconcilePublicCardIndex] ${message}`);
    return { refused: true, message };
  }

  // Contract from publicCardIndex.js's header (MEDIUM-2): diagnosis and
  // freshBuild MUST share the exact same chunkTargetSize, resolved here
  // once and passed explicitly to both — never left for each call to
  // resolve on its own.
  const chunkTargetSize =
    currentMeta && Number.isFinite(currentMeta.chunkTargetSize) && currentMeta.chunkTargetSize > 0
      ? currentMeta.chunkTargetSize
      : DEFAULT_CHUNK_TARGET_SIZE;

  const diagnosis = diagnosePublicIndex(currentChunks, currentMeta, docs, { chunkTargetSize });
  const freshBuild = buildPublicIndex(docs, cacheByScryfallId, { chunkTargetSize });
  const plan = planPublicIndexReconciliation(diagnosis, freshBuild);
  const strategy = chooseApplyStrategy(plan, diagnosis);

  log(
    `[reconcilePublicCardIndex] user ${userId}: strategy=${strategy} isDivergent=${diagnosis.isDivergent} ` +
      `missing=${diagnosis.missing.length} orphaned=${diagnosis.orphaned.length} misplaced=${diagnosis.misplaced.length} ` +
      `duplicated=${diagnosis.duplicated.length} hasMalformedChunkId=${diagnosis.hasMalformedChunkId} reason="${plan.reason}"`
  );

  if (strategy === 'noop') {
    return {
      strategy,
      isDivergent: diagnosis.isDivergent,
      reason: plan.reason,
      totalChunks: currentMeta ? currentMeta.totalChunks : freshBuild.meta.totalChunks,
      count: docs.length,
    };
  }

  if (dryRun) {
    log(`[reconcilePublicCardIndex] user ${userId}: --dry-run, no writes performed.`);
    return {
      dryRun: true,
      strategy,
      isDivergent: diagnosis.isDivergent,
      reason: plan.reason,
      totalChunks: freshBuild.meta.totalChunks,
      count: docs.length,
    };
  }

  // MEDIUM-3: refuse to proceed if another reconciliation for this same
  // seller already holds the lease.
  const lease = await acquireReconcileLease(db, metaRef);
  if (!lease.acquired) {
    const message =
      `reconcilePublicCardIndex refused for user ${userId}: another reconciliation attempt started ` +
      `${Math.round(lease.leaseAgeMs / 1000)}s ago and hasn't finished or gone stale yet ` +
      `(stale after ${RECONCILE_LEASE_STALE_MS / 1000}s). Refusing to run concurrently rather than risk ` +
      'two writers computing different totalChunks for the same account.';
    logError(`[reconcilePublicCardIndex] ${message}`);
    return { refused: true, message };
  }

  const { writeBatches, metaOp, deleteBatches } = planFirestoreBatches(plan);
  // Review round 3 (operability): both callers used to print how many
  // chunk docs were written/deleted — lost when the orchestration moved
  // into this shared module. For a tool that writes and deletes derived
  // data, that count is the minimum an operator needs to see.
  let wrote = 0;
  let deleted = 0;

  // Ordering (see functions/lib/publicCardIndexExecutor.js header for the
  // full atomicity write-up, corrected in review round 2 for the grow
  // case): writes first, meta flip second, deletes last.
  for (const batch of writeBatches) {
    const writer = db.batch();
    for (const op of batch) writer.set(indexRef.doc(String(op.chunkId)), op.data);
    // eslint-disable-next-line no-await-in-loop
    await writer.commit();
    wrote += batch.length;
  }

  // This unconditional overwrite (not a merge) is also what releases the
  // lease acquired above — the new document has no `reconcileLeaseAt`
  // field at all, so a successful run simply stops holding it.
  await metaRef.set(metaOp.data);

  if (strategy === 'wipe-subcollection') {
    // hasMalformedChunkId OR the MEDIUM-5 path/id-mismatch case above: a
    // chunk that can't be named by a numeric chunksToDelete entry. List
    // every doc actually in the subcollection and delete whichever ones
    // are NOT a valid chunk id in the new [0, totalChunks) range (and
    // isn't `_meta`).
    const validChunkDocIds = new Set(Array.from({ length: freshBuild.meta.totalChunks }, (_, i) => String(i)));
    const allRefs = await indexRef.listDocuments();
    const staleRefs = allRefs.filter((ref) => ref.id !== '_meta' && !validChunkDocIds.has(ref.id));
    for (let i = 0; i < staleRefs.length; i += 500) {
      const batch = db.batch();
      for (const ref of staleRefs.slice(i, i + 500)) batch.delete(ref);
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
      deleted += Math.min(500, staleRefs.length - i);
    }
    log(`[reconcilePublicCardIndex] user ${userId}: wiped ${staleRefs.length} stale/malformed chunk doc(s)`);
  } else {
    for (const batch of deleteBatches) {
      const writer = db.batch();
      for (const op of batch) writer.delete(indexRef.doc(String(op.chunkId)));
      // eslint-disable-next-line no-await-in-loop
      await writer.commit();
      deleted += batch.length;
    }
  }

  log(`[reconcilePublicCardIndex] user ${userId}: wrote ${wrote} chunk doc(s), deleted ${deleted} chunk doc(s)`);

  return {
    strategy,
    isDivergent: diagnosis.isDivergent,
    reason: plan.reason,
    totalChunks: freshBuild.meta.totalChunks,
    count: docs.length,
    wrote,
    deleted,
  };
}

module.exports = {
  PUBLIC_CARD_FIELDS,
  RECONCILE_LEASE_STALE_MS,
  fetchScryfallCacheMap,
  acquireReconcileLease,
  reconcilePublicCardIndexForUser,
};
