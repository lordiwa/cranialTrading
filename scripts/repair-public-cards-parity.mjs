#!/usr/bin/env node
/**
 * repair-public-cards-parity — TASK-290.
 *
 * WHY THIS SCRIPT EXISTS. Dev's root `public_cards` collection (the ONE
 * `public_cards` is a root collection with a `userId` field, NOT a
 * subcollection — see functions/lib/publicCardIndexExecutor.js's
 * `buildPublicCardsQuerySpec` doc comment for the measured history of that
 * confusion) drifted to 400 documents for the `qa_mtg` seller
 * (90PkdmyFKrVm1RLDXjInJdlYXy73) while `users/{uid}/cards` still has 2,202
 * cards with status=sale/trade AND public=true — MEASURED 2026-09-16,
 * artifacts/scratch-290-ac1.mjs. The nightly E2E anti-empty-green sensor
 * (`e2e/specs/user-profile/user-profile.spec.ts`, floor of 1000 — DO NOT
 * touch that floor or that test, see its own header) reads
 * `users/{uid}/public_card_index`, which is DERIVED from `public_cards` —
 * so `public_cards` is the thing that actually needs repairing; the index
 * is rebuilt separately (see STEP 2 below), never written by this script.
 *
 * WHAT THIS SCRIPT DOES. For one seller (`--uid`):
 *   1. Reads `users/{uid}/cards`, filters to the write-gate predicate
 *      (`isEligibleForPublicCards` in repairPublicCardsParityHelpers.mjs,
 *      duplicating `isPublicCard` in src/services/publicCards.ts — see that
 *      helper's own comment for why it's a duplicate, not a re-export).
 *   2. Builds each eligible card's public_cards document via the REAL
 *      `buildPublicCardDoc` from src/services/publicCards.ts — loaded
 *      through scripts/lib/loadBuildPublicCardDoc.mjs rather than
 *      hand-copying the literal, which is exactly the drift TASK-247
 *      tanda 2c closed (that function's own doc comment: three call sites
 *      used to carry their own copy and drifted).
 *   3. Upserts EVERY eligible card's document (not just the missing ones) —
 *      self-healing any content drift (price/condition/etc.), not just
 *      presence — using the SAME document id `syncCardToPublic` uses
 *      (`${userId}_${cardId}`), so re-running this script is an idempotent
 *      overwrite, never a duplicate.
 *   4. Deletes any `public_cards` document for this seller that is no
 *      longer eligible (a genuine orphan — sold, made private, or deleted).
 *
 * WHAT THIS SCRIPT DELIBERATELY DOES NOT DO: touch
 * `users/{uid}/public_card_index`. That index is DERIVED from
 * `public_cards` by a separate, already-existing, already-reviewed
 * reconciler — writing it by hand here would be exactly the "index written
 * by hand, wrong shape, passes health checks" trap this project's central
 * bug family (`project_card_index_redesign_v3`) documents.
 *
 * REQUIRED FOLLOW-UP STEP (not run automatically by this script, on
 * purpose — two single-responsibility scripts, matching the existing
 * seed-e2e-bulk-cards.mjs / "click ACTUALIZAR" precedent of a documented
 * manual next step rather than one script reaching into another's job):
 *
 *   node scripts/reconcile-public-card-index.mjs --uid=<uid>
 *
 * Going from 400 to 2,202 documents is GROWTH, so
 * `requiresCollapseConfirmation` (functions/lib/publicCardIndexExecutor.js)
 * should not refuse the reconcile — verify this by reading its printed
 * strategy/count, don't assume it.
 *
 * SAFETY RAIL — dev only by default, same pattern as every other script in
 * this directory (seed-e2e-bulk-cards.mjs, seed-e2e-public-card.mjs,
 * reconcile-public-card-index.mjs). Pass --project=<id> to target a
 * different Firebase project; anything other than the default
 * (cranial-trading-dev) refuses to run without --i-know-what-im-doing.
 * This session is additionally under an explicit instruction to never
 * touch production — this rail is what keeps that true after this session
 * ends too.
 *
 * Usage:
 *   node scripts/repair-public-cards-parity.mjs --uid=<userId> [--dry-run]
 *   node scripts/repair-public-cards-parity.mjs --uid=<userId> --project=<id> --i-know-what-im-doing
 *
 * --dry-run reads and diffs only — prints what WOULD be written/deleted and
 * exits without touching Firestore.
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadBuildPublicCardDoc } from './lib/loadBuildPublicCardDoc.mjs';
import {
  isEligibleForPublicCards,
  computePublicCardId,
  diffPublicCardIds,
  assertNoUndefinedFields,
  toAdminWritableDate,
  chunkList,
} from './repairPublicCardsParityHelpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(repoRoot, '.env.local') });

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (name, fallback = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const DEFAULT_PROJECT_ID = 'cranial-trading-dev';
const dryRun = has('--dry-run');
const targetUid = val('uid');
const BATCH_SIZE = 400; // Firestore's hard limit is 500 ops/batch.

if (!targetUid) {
  console.error('Falta --uid=<userId>. Ver la cabecera del archivo para el uso completo.');
  process.exit(1);
}

const projectId = val('project') ?? DEFAULT_PROJECT_ID;
console.log(`proyecto: ${projectId}`);
if (projectId !== DEFAULT_PROJECT_ID && !has('--i-know-what-im-doing')) {
  console.error(
    `Refusing to run against project "${projectId}" — this script defaults to ${DEFAULT_PROJECT_ID}.\n` +
    `Pass --project=${projectId} --i-know-what-im-doing to confirm a deliberate target other than dev.`
  );
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

async function main() {
  const buildPublicCardDoc = await loadBuildPublicCardDoc();

  const userSnap = await db.collection('users').doc(targetUid).get();
  if (!userSnap.exists) {
    throw new Error(`users/${targetUid} does not exist — refusing to seed public_cards for a nonexistent user.`);
  }
  const userData = userSnap.data();
  const username = userData.username;
  if (!username) {
    throw new Error(`users/${targetUid} has no username field — buildPublicCardDoc requires one.`);
  }
  const location = userData.location ?? '';
  const avatarUrl = userData.avatarUrl ?? null;

  const cardsSnap = await db.collection('users').doc(targetUid).collection('cards').get();
  const cards = cardsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const eligible = cards.filter(isEligibleForPublicCards);
  console.log(`users/${targetUid}/cards: total=${cards.length} elegibles (sale/trade, public=true)=${eligible.length}`);

  const existingSnap = await db.collection('public_cards').where('userId', '==', targetUid).get();
  const existingIds = existingSnap.docs.map((d) => d.id);
  console.log(`public_cards (raiz, userId=${targetUid}) ANTES: ${existingIds.length}`);

  const expectedIds = eligible.map((c) => computePublicCardId(targetUid, c.id));
  const { toCreate, toDelete } = diffPublicCardIds(expectedIds, existingIds);
  const toRefresh = expectedIds.length - toCreate.length;
  console.log(`diff: a crear (faltantes)=${toCreate.length}, a refrescar (ya existian)=${toRefresh}, huerfanos a borrar=${toDelete.length}`);

  if (dryRun) {
    console.log('--dry-run: no se escribio ni borro nada.');
    return;
  }

  let written = 0;
  for (const chunk of chunkList(eligible, BATCH_SIZE)) {
    const batch = db.batch();
    for (const card of chunk) {
      const docId = computePublicCardId(targetUid, card.id);
      const built = buildPublicCardDoc(card, targetUid, username, location, avatarUrl);
      const adminDoc = { ...built, updatedAt: toAdminWritableDate(built.updatedAt) };
      assertNoUndefinedFields(adminDoc, docId);
      batch.set(db.collection('public_cards').doc(docId), adminDoc);
    }
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
    written += chunk.length;
    console.log(`escritas ${written}/${eligible.length}`);
  }

  let deleted = 0;
  for (const chunk of chunkList(toDelete, BATCH_SIZE)) {
    const batch = db.batch();
    for (const id of chunk) batch.delete(db.collection('public_cards').doc(id));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
    deleted += chunk.length;
  }
  if (toDelete.length > 0) console.log(`borrados (huerfanos) ${deleted}/${toDelete.length}`);

  const afterSnap = await db.collection('public_cards').where('userId', '==', targetUid).count().get();
  console.log(`public_cards (raiz, userId=${targetUid}) DESPUES: ${afterSnap.data().count}`);
  console.log(
    '\nSIGUIENTE PASO (obligatorio, no lo corre este script):\n' +
    `  node scripts/reconcile-public-card-index.mjs --uid=${targetUid}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
