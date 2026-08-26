import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' }, 'ri');
const db = getFirestore(app);
const ref = db.collection('users').doc('Rt5DOfZXBtPZkEpK4N5pW6a5FXs1');
const idx = await ref.collection('card_index').get();
const st = {}, cond = {}; let pub = 0, foil = 0, conPrecio = 0, total = 0, sinId = 0;
for (const c of idx.docs) for (const e of (c.data().cards ?? [])) {
  total++;
  st[e.st ?? '?'] = (st[e.st ?? '?'] ?? 0) + 1;
  cond[e.cn ?? '?'] = (cond[e.cn ?? '?'] ?? 0) + 1;
  if (e.pb) pub++; if (e.f) foil++; if (e.p > 0) conPrecio++; if (!e.s) sinId++;
}
console.log('TOTAL entradas:', total);
console.log('por ESTADO:', JSON.stringify(st));
console.log('por CONDICION:', JSON.stringify(cond));
console.log('publicas:', pub, '| foil:', foil, '| con precio > 0:', conPrecio, '| SIN scryfallId:', sinId);
const decks = await ref.collection('decks').get();
const binders = await ref.collection('binders').get();
let alloc = 0;
for (const d of [...decks.docs, ...binders.docs]) {
  const a = d.get('allocations'); if (a) alloc += (typeof a === 'string' ? a.split(';').length : Object.keys(a).length);
}
console.log('MAZOS:', decks.size, '| CARPETAS:', binders.size, '| asignaciones aprox:', alloc);
process.exit(0);
