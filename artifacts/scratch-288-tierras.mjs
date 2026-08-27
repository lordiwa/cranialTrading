import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' }, 't'+Date.now());
const db = getFirestore(app);
const ref = db.collection('users').doc('Rt5DOfZXBtPZkEpK4N5pW6a5FXs1');
const idx = await ref.collection('card_index').get();
let total=0, tierras=0, sinTipo=0;
const porEstado = {}, tierrasPorEstado = {};
for (const c of idx.docs) for (const e of (c.data().cards ?? [])) {
  total++;
  porEstado[e.st] = (porEstado[e.st] ?? 0) + 1;
  if (!e.t) sinTipo++;
  if (typeof e.t === 'string' && /\bLand\b/i.test(e.t)) {
    tierras++;
    tierrasPorEstado[e.st] = (tierrasPorEstado[e.st] ?? 0) + 1;
  }
}
console.log('ENTRADAS:', total, '| sin type_line:', sinTipo);
console.log('por estado (todo):', JSON.stringify(porEstado));
console.log('TIERRAS:', tierras, '| por estado:', JSON.stringify(tierrasPorEstado));
const cards = await ref.collection('cards').count().get();
console.log('DOCS de carta:', cards.data().count);
