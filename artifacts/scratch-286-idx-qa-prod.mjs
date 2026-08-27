import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' }, 'iq'+Date.now());
const db = getFirestore(app);
const ref = db.collection('users').doc('DzcVxjNKI9VbeZv8NNnCYyPfBfO2');
const cards = await ref.collection('cards').get();
const ids = new Set(cards.docs.map(d=>d.id));
const idx = await ref.collection('card_index').get();
let total=0; const fantasmas=[];
for (const c of idx.docs) for (const e of (c.data().cards ?? [])) { total++; if (!ids.has(String(e.i))) fantasmas.push(`${e.i} ${e.n}`); }
console.log('docs:', ids.size, '| entradas indice:', total, '| FANTASMAS:', fantasmas.length, fantasmas.join(', '));
