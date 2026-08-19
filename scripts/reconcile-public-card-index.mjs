#!/usr/bin/env node
/**
 * reconcile-public-card-index — the administrative, arbitrary-seller
 * invocation path for TASK-247's public-profile index reconciliation.
 *
 * WHY THIS IS A SCRIPT AND NOT AN EXTRA MODE ON THE CALLABLE FUNCTION.
 * functions/index.js's `reconcilePublicCardIndex` is SELF-ONLY —
 * `targetUserId = request.auth.uid`, no client-suppliable userId anywhere
 * — because this project already has two closed tickets (TASK-214 for
 * queryCardIndex, TASK-211 for buildCardIndex) for the exact mistake of
 * trusting a client-supplied uid on a function that reads another user's
 * data. There is no admin-claim / role infrastructure in this project to
 * gate a "yes, arbitrary target" branch safely (grepped: no isAdmin, no
 * custom claims, anywhere in functions/ or src/), so this script is the
 * administrative path instead — same pattern this project already uses for
 * exactly this shape of access: `gcloud auth application-default login`
 * credentials via firebase-admin, matching scripts/card-index-fixture.mjs
 * and the nightly E2E admin teardown (e2e/helpers/admin.ts,
 * GOOGLE_APPLICATION_CREDENTIALS). Real operator credentials, not an
 * HTTP-reachable trust decision.
 *
 * This script does NOT call the deployed callable function. It requires
 * the SAME pure, unit-tested modules the callable function's wiring uses
 * (functions/lib/publicCardIndex.js, functions/lib/publicCardIndexExecutor.js)
 * directly and does its own Firestore reads/writes with its own admin app
 * — it could not require functions/index.js even if it wanted to: that
 * file calls admin.initializeApp() at require() time, which would collide
 * with this script's own initializeApp() call for the same default app.
 *
 * STORAGE LAYOUT (must match functions/index.js's reconcilePublicCardIndex
 * exactly): users/{uid}/public_card_index/{chunkId} (chunkId as a string)
 * holds { id, entries }; users/{uid}/public_card_index/_meta holds
 * { schemaVersion, totalChunks, count, chunkTargetSize }.
 *
 * USAGE:
 *   gcloud auth application-default login
 *   node scripts/reconcile-public-card-index.mjs --uid=<userId>
 *   node scripts/reconcile-public-card-index.mjs --uid=<userId> --dry-run
 *   node scripts/reconcile-public-card-index.mjs --all   # every seller
 *                                                          # with a
 *                                                          # public_cards
 *                                                          # document
 *
 * --dry-run reads and diagnoses only — prints what WOULD be written and
 * exits without touching Firestore. Always run --dry-run before the first
 * real invocation against a seller you haven't reconciled before.
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  buildPublicIndex,
  diagnosePublicIndex,
  planPublicIndexReconciliation,
  DEFAULT_CHUNK_TARGET_SIZE,
} from '../functions/lib/publicCardIndex.js';
import { planFirestoreBatches, chooseApplyStrategy } from '../functions/lib/publicCardIndexExecutor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(repoRoot, '.env.local') });
dotenv.config({ path: path.join(repoRoot, '.env.development') });

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (name, fallback = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const dryRun = has('--dry-run');
const targetUid = val('uid');
const allSellers = has('--all');

if (!targetUid && !allSellers) {
  console.error('Falta --uid=<userId> o --all. Ver la cabecera del archivo para el uso completo.');
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT || process.env.VITE_FIREBASE_PROJECT_ID || 'cranial-trading-dev';
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const PUBLIC_CARD_FIELDS = [
  'scryfallId', 'cardId', 'cardName', 'cardNameLower', 'quantity', 'price',
  'status', 'foil', 'condition', 'setCode', 'edition', 'updatedAt',
];

/** Same fetchScryfallCacheMap shape as functions/index.js — kept local
 * since that helper isn't exported (and importing functions/index.js at
 * all would double-initialize the admin app — see header). */
async function fetchScryfallCacheMap(scryfallIds) {
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

async function reconcileOneSeller(userId) {
  const publicCardsRef = db.collection(`users/${userId}/public_cards`);
  const indexRef = db.collection(`users/${userId}/public_card_index`);
  const metaRef = indexRef.doc('_meta');

  const docs = [];
  let lastDoc = null;
  const READ_CHUNK = 2000;
  while (true) {
    let query = publicCardsRef.select(...PUBLIC_CARD_FIELDS).orderBy(FieldPath.documentId()).limit(READ_CHUNK);
    if (lastDoc) query = query.startAfter(lastDoc);
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await query.get();
    if (snapshot.empty) break;
    for (const doc of snapshot.docs) docs.push(doc.data());
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.docs.length < READ_CHUNK) break;
  }

  const uniqueScryfallIds = [...new Set(docs.map((d) => d.scryfallId).filter(Boolean))];
  const scryfallCacheMap = await fetchScryfallCacheMap(uniqueScryfallIds);
  const cacheByScryfallId = {};
  for (const [scryfallId, cacheDoc] of scryfallCacheMap) cacheByScryfallId[scryfallId] = cacheDoc;

  const [chunkSnapshot, metaSnapshot] = await Promise.all([indexRef.get(), metaRef.get()]);
  const currentChunks = [];
  for (const doc of chunkSnapshot.docs) {
    if (doc.id === '_meta') continue;
    currentChunks.push(doc.data());
  }
  const currentMeta = metaSnapshot.exists ? metaSnapshot.data() : null;

  const chunkTargetSize =
    currentMeta && Number.isFinite(currentMeta.chunkTargetSize) && currentMeta.chunkTargetSize > 0
      ? currentMeta.chunkTargetSize
      : DEFAULT_CHUNK_TARGET_SIZE;

  const diagnosis = diagnosePublicIndex(currentChunks, currentMeta, docs, { chunkTargetSize });
  const freshBuild = buildPublicIndex(docs, cacheByScryfallId, { chunkTargetSize });
  const plan = planPublicIndexReconciliation(diagnosis, freshBuild);
  const strategy = chooseApplyStrategy(plan, diagnosis);

  console.log(
    `[${userId}] docs=${docs.length} strategy=${strategy} isDivergent=${diagnosis.isDivergent} ` +
      `missing=${diagnosis.missing.length} orphaned=${diagnosis.orphaned.length} misplaced=${diagnosis.misplaced.length} ` +
      `duplicated=${diagnosis.duplicated.length} hasMalformedChunkId=${diagnosis.hasMalformedChunkId} reason="${plan.reason}"`
  );

  if (strategy === 'noop') return { userId, strategy, wrote: 0, deleted: 0 };
  if (dryRun) {
    console.log(`[${userId}] --dry-run: no writes performed.`);
    return { userId, strategy, wrote: 0, deleted: 0, dryRun: true };
  }

  const { writeBatches, metaOp, deleteBatches } = planFirestoreBatches(plan);
  let wrote = 0;
  let deleted = 0;

  // Same order as functions/index.js's reconcilePublicCardIndexForUser:
  // writes first, meta flip second, deletes last. See
  // functions/lib/publicCardIndexExecutor.js's header for the atomicity
  // write-up this order is derived from.
  for (const batch of writeBatches) {
    const writer = db.batch();
    for (const op of batch) writer.set(indexRef.doc(String(op.chunkId)), op.data);
    // eslint-disable-next-line no-await-in-loop
    await writer.commit();
    wrote += batch.length;
  }

  await metaRef.set(metaOp.data);

  if (strategy === 'wipe-subcollection') {
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
  } else {
    for (const batch of deleteBatches) {
      const writer = db.batch();
      for (const op of batch) writer.delete(indexRef.doc(String(op.chunkId)));
      // eslint-disable-next-line no-await-in-loop
      await writer.commit();
      deleted += batch.length;
    }
  }

  console.log(`[${userId}] wrote ${wrote} chunk doc(s), deleted ${deleted} chunk doc(s).`);
  return { userId, strategy, wrote, deleted };
}

async function main() {
  let targets = [targetUid];
  if (allSellers) {
    // Every distinct userId that has at least one public_cards document —
    // a collectionGroup query across all sellers, admin-only (bypasses
    // Firestore rules via the admin SDK, same as every other script here).
    const snapshot = await db.collectionGroup('public_cards').select('userId').get();
    const uids = new Set();
    for (const doc of snapshot.docs) {
      const uid = doc.data().userId || doc.ref.parent.parent?.id;
      if (uid) uids.add(uid);
    }
    targets = [...uids];
    console.log(`--all: ${targets.length} seller(s) with at least one public_cards document.`);
  }

  const results = [];
  for (const uid of targets) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await reconcileOneSeller(uid));
  }

  const divergentCount = results.filter((r) => r.strategy !== 'noop').length;
  console.log(`\nDone. ${results.length} seller(s) checked, ${divergentCount} needed a repair.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
