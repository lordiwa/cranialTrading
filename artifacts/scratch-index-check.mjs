import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'ic');
const db = getFirestore(app);
const QA = '90PkdmyFKrVm1RLDXjInJdlYXy73';
const doomed = new Set(['6eeOJUGGc30w4q3IbJ3y', 'ybwMo29QyYUJ0OMw0M5w']);
const chunks = await db.collection('users').doc(QA).collection('card_index').get();
console.log('chunks:', chunks.size);
let total = 0, hits = [];
for (const c of chunks.docs) {
  const cards = c.data().cards;
  if (!Array.isArray(cards)) { console.log(' chunk', c.id, 'sin array cards'); continue; }
  total += cards.length;
  console.log(' chunk', c.id, '| entradas:', cards.length, '| campo count:', c.data().count);
  for (const e of cards) if (doomed.has(String(e?.i))) hits.push({ chunk: c.id, i: e.i, q: e.q });
}
console.log('total de entradas en el indice:', total, '| documentos de cartas: 1880');
console.log('entradas de las 2 cartas a borrar:', JSON.stringify(hits));
process.exit(0);
