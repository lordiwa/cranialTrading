import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' }, 'rb'+Date.now());
const db = getFirestore(app);
const ref = db.collection('users').doc('Rt5DOfZXBtPZkEpK4N5pW6a5FXs1');
const idx = await ref.collection('card_index').get();
console.log('CHUNKS:', idx.size);
for (const c of idx.docs) {
  const d = c.data();
  const n = (d.cards ?? []).length;
  const conT = (d.cards ?? []).filter(e => e.t).length;
  console.log(` ${c.id}: entradas=${n} | version=${JSON.stringify(d.version)} | con type_line=${conT} | updatedAt=${d.updatedAt?.toDate?.().toISOString() ?? JSON.stringify(d.updatedAt)}`);
}
const cards = await ref.collection('cards').count().get();
console.log('DOCS de carta:', cards.data().count);
