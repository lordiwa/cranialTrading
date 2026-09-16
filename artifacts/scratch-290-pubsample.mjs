import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'pubsample');
const db = getFirestore(app);
const uid = '90PkdmyFKrVm1RLDXjInJdlYXy73';
const snap = await db.collection('public_cards').where('userId','==',uid).limit(3).get();
for (const d of snap.docs) {
  console.log(d.id, JSON.stringify(d.data()));
}
// check id pattern consistency for ALL 400
const all = await db.collection('public_cards').where('userId','==',uid).get();
const cardsSnap = await db.collection('users').doc(uid).collection('cards').get();
const cardIds = new Set(cardsSnap.docs.map(c=>c.id));
let matchPattern = 0, orphan = 0;
for (const d of all.docs) {
  const expected = uid + '_' + d.data().cardId;
  if (d.id === expected) matchPattern++; else console.log('MISMATCH id vs expected', d.id, expected);
  if (!cardIds.has(d.data().cardId)) { orphan++; console.log('ORPHAN cardId not in cards:', d.data().cardId); }
}
console.log('matchPattern', matchPattern, 'of', all.size, 'orphan', orphan);
process.exit(0);
