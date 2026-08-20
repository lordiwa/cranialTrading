// SOLO LECTURA. Mide el hueco de setCode en public_cards y si scryfall_cache lo puede cubrir.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT });
const db = getFirestore();
const snap = await db.collection('public_cards').select('userId', 'setCode', 'scryfallId').get();
const porUser = new Map();
const idsSinSet = new Set();
let total = 0, sinSetCode = 0;
for (const d of snap.docs) {
  const x = d.data(); total++;
  const u = x.userId || '(none)';
  if (!porUser.has(u)) porUser.set(u, { total: 0, sin: 0 });
  porUser.get(u).total++;
  if (!x.setCode) { sinSetCode++; porUser.get(u).sin++; if (x.scryfallId) idsSinSet.add(x.scryfallId); }
}
console.log(JSON.stringify({ total, sinSetCode, pct: +(100 * sinSetCode / total).toFixed(1), idsUnicosSinSetCode: idsSinSet.size }));
for (const [u, v] of porUser) console.log(JSON.stringify({ uid: u.slice(0, 8), ...v }));

const ids = [...idsSinSet];
let cacheSi = 0, cacheConSet = 0, cacheSinDoc = 0;
for (let i = 0; i < ids.length; i += 300) {
  const refs = ids.slice(i, i + 300).map((id) => db.collection('scryfall_cache').doc(id));
  const docs = await db.getAll(...refs);
  for (const d of docs) {
    if (!d.exists) { cacheSinDoc++; continue; }
    cacheSi++;
    if (d.data().set) cacheConSet++;
  }
}
console.log(JSON.stringify({ idsSinSetCode: ids.length, conDocEnCache: cacheSi, deEsosConCampoSet: cacheConSet, sinDocEnCache: cacheSinDoc }));
process.exit(0);
