#!/usr/bin/env node
/**
 * backfill-cardnamelower.cjs (TASK-085)
 *
 * One-time backfill/cleanup pass over `public_cards`, run once TASK-085's
 * rules change (anonymous read) is deployed:
 *
 *   1. FIX: sets `cardNameLower` (lowercased `cardName`) on legit sale/trade
 *      docs that are missing it. searchPublicCards() (publicCardSearch.ts)
 *      queries `cardNameLower`, but docs written before the TASK-085
 *      sync-writer fix (src/services/publicCards.ts) never had that field,
 *      so they're invisible to that query until their next edit re-syncs
 *      the doc. This closes that gap without waiting for a re-sync.
 *
 *   2. DELETE (review fix H1 — BLOCKING): removes any doc whose status is
 *      NOT 'sale'/'trade'. Before TASK-085's whitelist fix, the sync
 *      writers used a `status !== 'collection'` BLACKLIST, so a card moved
 *      to 'wishlist' while still `public: true` got re-published to
 *      public_cards under status 'wishlist' instead of being deleted. Once
 *      public_cards is anonymously readable, any such legacy doc is a
 *      private-wishlist leak — and giving it cardNameLower would make the
 *      leak show up IN anonymous search results, which is exactly backwards.
 *      These docs must be deleted, never backfilled.
 *
 * Idempotent: skips docs that already have cardNameLower and are sale/trade.
 * Safe to re-run. DRY-RUN by default — only `--apply` performs writes.
 *
 * Usage:
 *   gcloud auth application-default login   # or export GOOGLE_APPLICATION_CREDENTIALS
 *   node scripts/backfill-cardnamelower.cjs --project cranial-trading-dev            # dry-run
 *   node scripts/backfill-cardnamelower.cjs --project cranial-trading-dev --apply    # writes
 *   node scripts/backfill-cardnamelower.cjs --project cranial-trading --apply        # prod, after dev verification
 *
 * DO NOT RUN as part of this ticket's implementation — Rafael runs this
 * manually against dev (and later prod) once the code change is verified.
 */

const admin = require('firebase-admin');

const COLLECTION = 'public_cards';
const BATCH_SIZE = 400;
const LEGIT_STATUSES = new Set(['sale', 'trade']);

function parseArgs() {
  const args = process.argv.slice(2);
  let project = null;
  let apply = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && args[i + 1]) {
      project = args[++i];
    } else if (args[i] === '--apply') {
      apply = true;
    }
  }

  return { project, apply };
}

async function main() {
  const { project, apply } = parseArgs();
  if (!project) {
    console.error('Missing --project <cranial-trading-dev|cranial-trading>');
    process.exit(1);
  }

  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: project });
  const db = admin.firestore();

  console.log(`\n=== public_cards backfill + cleanup ===`);
  console.log(`Project: ${project}`);
  console.log(`Mode:    ${apply ? 'APPLY (writes)' : 'DRY-RUN (no writes)'}\n`);

  const snapshot = await db.collection(COLLECTION).get();
  console.log(`Scanned ${snapshot.size} docs in ${COLLECTION}.`);

  const toDelete = [];
  const toFix = [];

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();

    if (!LEGIT_STATUSES.has(data.status)) {
      toDelete.push(docSnap);
      continue;
    }

    if (!data.cardNameLower && typeof data.cardName === 'string' && data.cardName.length > 0) {
      toFix.push(docSnap);
    }
  }

  const upToDate = snapshot.size - toDelete.length - toFix.length;
  console.log(`${toFix.length} docs missing cardNameLower (sale/trade, will be fixed).`);
  console.log(`${toDelete.length} docs with an illegitimate status (not sale/trade — will be DELETED).`);
  console.log(`${upToDate} docs already up to date.\n`);

  if (!apply) {
    for (const docSnap of toFix.slice(0, 20)) {
      const data = docSnap.data();
      console.log(`[dry-run fix]    ${docSnap.id}: cardName="${data.cardName}" -> cardNameLower="${data.cardName.toLowerCase()}"`);
    }
    if (toFix.length > 20) console.log(`... and ${toFix.length - 20} more fixes`);

    for (const docSnap of toDelete.slice(0, 20)) {
      const data = docSnap.data();
      console.log(`[dry-run delete] ${docSnap.id}: status="${data.status}" userId="${data.userId}" cardName="${data.cardName}"`);
    }
    if (toDelete.length > 20) console.log(`... and ${toDelete.length - 20} more deletes`);

    console.log('\nRe-run with --apply to perform writes.');
    process.exit(0);
  }

  const actions = [
    ...toFix.map(docSnap => ({ type: 'fix', docSnap })),
    ...toDelete.map(docSnap => ({ type: 'delete', docSnap })),
  ];

  let fixed = 0;
  let deleted = 0;
  for (let i = 0; i < actions.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = actions.slice(i, i + BATCH_SIZE);
    for (const action of chunk) {
      if (action.type === 'fix') {
        const cardName = action.docSnap.data().cardName;
        batch.update(action.docSnap.ref, { cardNameLower: cardName.toLowerCase() });
        fixed += 1;
      } else {
        batch.delete(action.docSnap.ref);
        deleted += 1;
      }
    }
    await batch.commit();
    console.log(`  Progress: ${fixed}/${toFix.length} fixed, ${deleted}/${toDelete.length} deleted`);
  }

  console.log(`\n=== Done === Fixed ${fixed} docs, deleted ${deleted} illegitimate docs.`);
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
