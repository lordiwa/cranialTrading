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
 * `functions/lib/publicCardIndexReconciler.js` — the SAME shared
 * orchestration functions/index.js's `reconcilePublicCardIndex` wraps
 * (review round 2, MEDIUM-4: this script used to carry its own ~150-line
 * copy of that orchestration, which is exactly how the collection-path
 * HIGH bug earlier in this ticket had to be fixed in two places instead of
 * one) — with its own admin app. It could not require functions/index.js
 * even if it wanted to: that file calls admin.initializeApp() at require()
 * time, which would collide with this script's own initializeApp() call
 * for the same default app.
 *
 * STORAGE LAYOUT (owned by publicCardIndexReconciler.js — see its header):
 * users/{uid}/public_card_index/{chunkId} (chunkId as a string) holds
 * { id, entries }; users/{uid}/public_card_index/_meta holds
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
 *
 * Prints `proyecto: <projectId>` as its very first line, always, before
 * touching Firestore — a tool that writes/deletes derived index data must
 * never let which project it targets depend silently on whichever .env
 * happened to load. Against `cranial-trading` (production) without
 * --dry-run, it additionally refuses to run at all unless --yes-production
 * is also passed.
 *
 * --force-empty-index: required to let a run through when the read comes
 * back suspiciously small for a seller whose index already has many more
 * entries — refused by default (see requiresCollapseConfirmation in
 * functions/lib/publicCardIndexExecutor.js). This is deliberately a
 * SEPARATE flag from --dry-run/--yes-production: it must be typed on
 * purpose after confirming by some other means that the small read is
 * real and not a broken/truncated query.
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { reconcilePublicCardIndexForUser } from '../functions/lib/publicCardIndexReconciler.js';

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
// TASK-247 safety guard: a rebuild that would collapse a much larger index
// down to a suspiciously small read (see requiresCollapseConfirmation) is
// refused by default, in this script exactly like in the callable function
// — this flag is the ONLY way past that refusal, and it must be typed
// deliberately, never implied by another flag.
const forceEmptyIndex = has('--force-empty-index');

if (!targetUid && !allSellers) {
  console.error('Falta --uid=<userId> o --all. Ver la cabecera del archivo para el uso completo.');
  process.exit(1);
}

// An admin script that writes and deletes derived index data MUST say
// which project it's about to touch, every run, unconditionally — this
// used to resolve FIREBASE_PROJECT || VITE_FIREBASE_PROJECT_ID ||
// 'cranial-trading-dev' in silence, so which project got written depended
// on whatever .env happened to be loaded. Printed BEFORE any Firestore call.
const projectId = process.env.FIREBASE_PROJECT || process.env.VITE_FIREBASE_PROJECT_ID || 'cranial-trading-dev';
console.log(`proyecto: ${projectId}`);
if (projectId === 'cranial-trading' && !dryRun && !has('--yes-production')) {
  console.error(
    'Este script va a ESCRIBIR/BORRAR en el proyecto de PRODUCCION (cranial-trading). ' +
      'Repetí el comando agregando --yes-production si es realmente lo que querés, o ' +
      'agregá --dry-run para solo diagnosticar sin escribir nada.'
  );
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const documentIdOrderBy = FieldPath.documentId();

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
    const result = await reconcilePublicCardIndexForUser({
      db,
      userId: uid,
      documentIdOrderBy,
      forceEmptyIndex,
      dryRun,
      log: console.log,
      logError: console.error,
      // overrideHint (review round 3): this script's caller DOES have a
      // real override — say so, unlike the callable's self-service path.
      overrideHint: `re-run with --uid=${uid} --force-empty-index after confirming the small read is real.`,
    });
    if (result.refused) {
      console.error(`[${uid}] RECHAZADO: ${result.message}`);
    } else if (result.dryRun) {
      console.log(`[${uid}] --dry-run: strategy=${result.strategy} count=${result.count} — no writes performed.`);
    } else {
      // Review round 3 (operability): wrote/deleted counts, lost when the
      // orchestration moved into the shared reconciler module — restored.
      console.log(
        `[${uid}] strategy=${result.strategy} count=${result.count} totalChunks=${result.totalChunks} ` +
          `wrote=${result.wrote ?? 0} deleted=${result.deleted ?? 0}`
      );
    }
    results.push({ uid, ...result });
  }

  const refusedCount = results.filter((r) => r.refused).length;
  const repairedCount = results.filter((r) => !r.refused && r.strategy !== 'noop').length;
  console.log(
    `\nDone. ${results.length} seller(s) checked, ${repairedCount} needed a repair, ${refusedCount} refused.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
