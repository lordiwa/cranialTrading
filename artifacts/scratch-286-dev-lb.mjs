import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'lb'+Date.now());
const db = getFirestore(app);
const ref = db.collection('users').doc('90PkdmyFKrVm1RLDXjInJdlYXy73');
for (const n of ['Lightning Bolt','Counterspell','Llanowar Elves']) {
  const q = await ref.collection('cards').where('name','==',n).get();
  console.log(`${n}: ${q.size} doc(s)`, q.docs.map(d=>`${d.id}[${d.get('setCode')}] creada=${d.get('createdAt')?.toDate?.().toISOString()}`).join(' | '));
}
const cards = await ref.collection('cards').count().get();
const idx = await ref.collection('card_index').get();
let n=0; for (const c of idx.docs) n += (c.data().cards ?? []).length;
console.log('TOTAL docs:', cards.data().count, '| entradas indice:', n, '| divergencia:', cards.data().count - n);
const decks = await ref.collection('decks').get();
console.log('mazos:', decks.docs.map(d=>d.get('name')).join(', '));
