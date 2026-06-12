#!/usr/bin/env node
/**
 * SCRUM-73 / UNIQ-05 — dedup duplicate usernames + backfill the /usernames index (D-15).
 * DRY-RUN by default. Only `--apply` performs writes. Idempotent.
 *
 * Usage (D-17 rollout — run manually, human-gated; review dry-run before --apply):
 *   gcloud auth application-default login   # or export GOOGLE_APPLICATION_CREDENTIALS
 *   FIREBASE_PROJECT=cranial-trading-dev node scripts/dedup-backfill-usernames.mjs           # dry-run
 *   FIREBASE_PROJECT=cranial-trading-dev node scripts/dedup-backfill-usernames.mjs --apply   # writes
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { buildPlan, normalizeUsername } from './usernameMigration.mjs';

const projectId = process.env.FIREBASE_PROJECT || 'cranial-trading-dev';
const APPLY = process.argv.includes('--apply');
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

async function countCards(uid) {
  const idx = await db.collection(`users/${uid}/card_index`).count().get();
  if (idx.data().count > 0) return idx.data().count;
  const cards = await db.collection(`users/${uid}/cards`).count().get();
  return cards.data().count;
}

async function main() {
  console.log(`Project: ${projectId} — mode: ${APPLY ? 'APPLY (WRITES)' : 'DRY-RUN (no writes)'}`);
  const snap = await db.collection('users').get();
  const groups = new Map();
  for (const d of snap.docs) {
    const data = d.data();
    const norm = normalizeUsername(data.username);
    if (!norm) continue;
    const createdAt = data.createdAt?.toMillis?.() ?? 0;
    const cardCount = await countCards(d.id);
    if (!groups.has(norm)) groups.set(norm, []);
    groups.get(norm).push({ uid: d.id, username: data.username, cardCount, createdAt });
  }

  const { renames, indexWrites } = buildPlan(groups);

  for (const r of renames) {
    console.log(`[rename] ${r.uid}: "${r.from}" -> "${r.to}"`);
    if (APPLY) await db.doc(`users/${r.uid}`).update({ username: r.to });
  }

  let written = 0;
  for (const w of indexWrites) {
    const ref = db.doc(`usernames/${w.norm}`);
    const existing = await ref.get();
    if (existing.exists && existing.data().uid === w.uid) {
      continue; // idempotent skip
    }
    console.log(`[index] usernames/${w.norm} -> ${w.uid}${existing.exists ? ' (overwrite conflicting)' : ''}`);
    if (APPLY) { await ref.set({ uid: w.uid, createdAt: FieldValue.serverTimestamp() }); written += 1; }
  }

  console.log(`\nSummary: ${renames.length} renames, ${indexWrites.length} index targets (${APPLY ? `${written} written` : 'dry-run'}).`);
  if (!APPLY) console.log('Re-run with --apply to perform writes. Review this output first (D-17).');
}

main().catch((e) => { console.error(e); process.exit(1); });
