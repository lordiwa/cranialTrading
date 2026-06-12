#!/usr/bin/env node
/**
 * SCRUM-73 / UNIQ-05 — READ-ONLY duplicate-username audit (D-14).
 * Performs NO writes. Groups /users by normalized username, reports every group
 * with >1 member and which doc would be canonical (pickCanonical).
 *
 * Usage (D-17 rollout step 2 dev / step 4 prod — run manually by an operator):
 *   gcloud auth application-default login   # or export GOOGLE_APPLICATION_CREDENTIALS
 *   FIREBASE_PROJECT=cranial-trading-dev node scripts/audit-usernames.mjs
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { mkdir, writeFile } from 'node:fs/promises';
import { normalizeUsername, pickCanonical } from './usernameMigration.mjs';

const projectId = process.env.FIREBASE_PROJECT || 'cranial-trading-dev';
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

async function countCards(uid) {
  // Prefer card_index chunk count (cheap), fall back to cards collection size.
  const idx = await db.collection(`users/${uid}/card_index`).count().get();
  if (idx.data().count > 0) return idx.data().count;
  const cards = await db.collection(`users/${uid}/cards`).count().get();
  return cards.data().count;
}

async function main() {
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

  const dups = [...groups.entries()].filter(([, members]) => members.length > 1);
  console.log(`Project: ${projectId}`);
  console.log(`Total users: ${snap.size}, distinct normalized usernames: ${groups.size}, duplicate groups: ${dups.length}`);
  for (const [norm, members] of dups) {
    const canonical = pickCanonical(members);
    console.log(`\n@${norm} (${members.length} docs) — canonical: ${canonical.uid}`);
    for (const m of members) {
      console.log(`  ${m.uid === canonical.uid ? '*' : ' '} uid=${m.uid} raw="${m.username}" cards=${m.cardCount} createdAt=${m.createdAt}`);
    }
  }

  await mkdir('scripts/reports', { recursive: true });
  const ts = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const report = dups.map(([norm, members]) => ({ norm, canonicalUid: pickCanonical(members).uid, members }));
  await writeFile(`scripts/reports/username-audit-${projectId}-${ts}.json`, JSON.stringify(report, null, 2));
  console.log(`\nReport written. NO writes performed (read-only audit).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
