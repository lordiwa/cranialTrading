import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' }, 'x'+Date.now());
const db = getFirestore(app);
const ref = db.collection('users').doc('Rt5DOfZXBtPZkEpK4N5pW6a5FXs1');
const idx = await ref.collection('card_index').get();
const rezagadas = [], tipos = {}, chunkDe = {};
for (const c of idx.docs) for (const e of (c.data().cards ?? [])) {
  if (typeof e.t === 'string' && /\bLand\b/i.test(e.t) && e.st === 'sale') {
    rezagadas.push(e);
    tipos[e.t] = (tipos[e.t] ?? 0) + 1;
    chunkDe[c.id] = (chunkDe[c.id] ?? 0) + 1;
  }
}
console.log('TIERRAS QUE QUEDARON EN VENTA:', rezagadas.length);
console.log('\npor TIPO:'); for (const [t,n] of Object.entries(tipos).sort((a,b)=>b[1]-a[1])) console.log('  ', n, '\u00d7', t);
console.log('\npor CHUNK del indice:', JSON.stringify(chunkDe));
console.log('\nprimeras 12 por nombre:'); rezagadas.slice(0,12).forEach(e=>console.log('  ', e.n, '|', e.t, '| df(doble cara)=', e.df, '| id', e.i));
// Comparo con las que SI cambiaron, para ver si el tipo las distingue
const tiposOk = {};
for (const c of idx.docs) for (const e of (c.data().cards ?? [])) {
  if (typeof e.t === 'string' && /\bLand\b/i.test(e.t) && e.st === 'collection') tiposOk[e.t] = (tiposOk[e.t] ?? 0) + 1;
}
console.log('\nTIPOS de las que SI cambiaron (top 8):');
Object.entries(tiposOk).sort((a,b)=>b[1]-a[1]).slice(0,8).forEach(([t,n])=>console.log('  ', n, '\u00d7', t));
